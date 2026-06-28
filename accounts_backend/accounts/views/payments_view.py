# payments_view.py
from decimal import Decimal

from django.db import transaction
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request

from accounts.common.db               import query_all, query_one, insert_returning, execute
from accounts.common.auth             import JWTAuthentication
from accounts.common.responses        import common_response, StatusCode
from accounts.common.messages         import get_message
from accounts.serializers.payments_serializer import PaymentSerializer


def _post_ledger(company_id, customer_id, ref_type, ref_id,
                 date, debit, credit, remarks):
    """Compute running balance and insert a ledger entry."""
    last = query_one(
        """
        SELECT running_balance FROM ledger_entries
        WHERE  company_id = %s AND customer_id = %s
        ORDER  BY entry_id DESC LIMIT 1
        """,
        (company_id, customer_id)
    )
    prev        = Decimal(str(last['running_balance'])) if last else Decimal('0.00')
    new_balance = prev + Decimal(str(debit)) - Decimal(str(credit))

    insert_returning(
        """
        INSERT INTO ledger_entries
            (company_id, customer_id, transaction_type, reference_type,
             reference_id, transaction_date, debit_amount, credit_amount,
             running_balance, remarks, created_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
        RETURNING entry_id
        """,
        (
            company_id, customer_id,
            'DEBIT' if debit > 0 else 'CREDIT',
            ref_type, ref_id, date,
            debit, credit, new_balance, remarks,
        )
    )


class PaymentListView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = PaymentSerializer

    def get(self, request: Request):
        company_id  = request.user.company_id
        customer_id = request.query_params.get('customer_id')
        from_date   = request.query_params.get('from_date')
        to_date     = request.query_params.get('to_date')

        where  = ["p.company_id = %s"]
        params = [company_id]

        if customer_id:
            where.append("p.customer_id = %s"); params.append(customer_id)
        if from_date:
            where.append("p.payment_date >= %s"); params.append(from_date)
        if to_date:
            where.append("p.payment_date <= %s"); params.append(to_date)

        rows = query_all(
            f"""
            SELECT p.payment_id, p.company_id, p.customer_id,
                   p.payment_date, p.payment_method, p.reference_number,
                   p.amount, p.notes,
                   p.created_at, p.created_by, p.updated_at, p.updated_by,
                   c.customer_name
            FROM   payments p
            JOIN   customers c ON c.customer_id = p.customer_id
            WHERE  {' AND '.join(where)}
            ORDER  BY p.payment_date DESC, p.payment_id DESC
            """,
            tuple(params)
        )

        serializer = self.get_serializer(rows, many=True)
        return common_response(
            StatusCode.OK.value,
            "Payments fetched successfully",
            {
                'count':    len(serializer.data),
                'payments': serializer.data,
            }
        )

    def post(self, request: Request):
        company_id = request.user.company_id
        user_id    = request.user.user_id

        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return common_response(
                StatusCode.BAD_REQUEST.value,
                get_message("INVALID_REQUEST"),
                serializer.errors
            )

        d           = serializer.validated_data
        customer_id = d['customer_id']
        amount      = Decimal(str(d['amount']))

        if amount <= 0:
            return common_response(
                StatusCode.BAD_REQUEST.value,
                "Amount must be greater than 0."
            )

        try:
            from accounts.views.invoices_view import recompute_customer_ledger
            with transaction.atomic():
                customer = query_one(
                    """
                    SELECT customer_id, customer_name
                    FROM   customers
                    WHERE  customer_id = %s AND company_id = %s AND status = 'A'
                    """,
                    (customer_id, company_id)
                )
                if not customer:
                    return common_response(
                        StatusCode.NOT_FOUND.value,
                        get_message("NOT_FOUND", "Customer")
                    )

                payment = insert_returning(
                    """
                    INSERT INTO payments
                        (company_id, customer_id, payment_date,
                         payment_method, reference_number, amount, notes,
                         created_at, created_by)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,NOW(),%s)
                    RETURNING *
                    """,
                    (
                        company_id, customer_id,
                        d['payment_date'],     d['payment_method'],
                        d.get('reference_number', ''),
                        amount,                d.get('notes', ''),
                        user_id,
                    )
                )

                _post_ledger(
                    company_id,          customer_id,
                    'PAYMENT',           payment['payment_id'],
                    d['payment_date'],
                    Decimal('0.00'),     amount,
                    "Payment received",
                )
                
                # Recompute customer ledger running balance chronologically
                recompute_customer_ledger(company_id, customer_id)

        except Exception as e:
            return common_response(
                StatusCode.INTERNAL_SERVER_ERROR.value,
                f"Failed to record payment: {str(e)}"
            )

        full_payment = query_one(
            """
            SELECT p.*,
                   c.customer_name
            FROM   payments p
            JOIN   customers c ON c.customer_id = p.customer_id
            WHERE  p.payment_id = %s
            """,
            (payment['payment_id'],)
        )

        return common_response(
            StatusCode.CREATED.value,
            get_message("CREATED", "Payment"),
            self.get_serializer(full_payment).data
        )


class PaymentDetailView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = PaymentSerializer

    def get(self, request: Request, payment_id: int):
        company_id = request.user.company_id

        row = query_one(
            """
            SELECT p.*,
                   c.customer_name
            FROM   payments p
            JOIN   customers c ON c.customer_id = p.customer_id
            WHERE  p.payment_id = %s AND p.company_id = %s
            """,
            (payment_id, company_id)
        )
        if not row:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Payment")
            )

        return common_response(
            StatusCode.OK.value,
            "Payment fetched successfully",
            self.get_serializer(row).data
        )

    def put(self, request: Request, payment_id: int):
        company_id = request.user.company_id
        user_id    = request.user.user_id

        # ── 1. Fetch existing payment ─────────────────────────────────────────
        existing_payment = query_one(
            """
            SELECT payment_id, customer_id, amount
            FROM   payments
            WHERE  payment_id = %s AND company_id = %s
            """,
            (payment_id, company_id)
        )
        if not existing_payment:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Payment")
            )

        # ── 2. Validate request payload ────────────────────────────────────────
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return common_response(
                StatusCode.BAD_REQUEST.value,
                get_message("INVALID_REQUEST"),
                serializer.errors
            )

        d           = serializer.validated_data
        new_customer_id = d['customer_id']
        amount      = Decimal(str(d['amount']))

        if amount <= 0:
            return common_response(
                StatusCode.BAD_REQUEST.value,
                "Amount must be greater than 0."
            )

        try:
            from accounts.views.invoices_view import recompute_customer_ledger
            with transaction.atomic():
                # ── 3. Validate customer exists ───────────────────────────────────
                customer = query_one(
                    """
                    SELECT customer_id, customer_name
                    FROM   customers
                    WHERE  customer_id = %s AND company_id = %s AND status = 'A'
                    """,
                    (new_customer_id, company_id)
                )
                if not customer:
                    return common_response(
                        StatusCode.NOT_FOUND.value,
                        get_message("NOT_FOUND", "Customer")
                    )

                # ── 4. Update payments table ──────────────────────────────────────
                execute(
                    """
                    UPDATE payments
                    SET    customer_id = %s,
                           payment_date = %s,
                           payment_method = %s,
                           reference_number = %s,
                           amount = %s,
                           notes = %s,
                           updated_at = NOW(),
                           updated_by = %s
                    WHERE  payment_id = %s AND company_id = %s
                    """,
                    (
                        new_customer_id,
                        d['payment_date'],
                        d['payment_method'],
                        d.get('reference_number', ''),
                        amount,
                        d.get('notes', ''),
                        user_id,
                        payment_id,
                        company_id,
                    )
                )

                # ── 5. Update ledger entry ────────────────────────────────────
                ledger_entry = query_one(
                    """
                    SELECT entry_id, customer_id
                    FROM   ledger_entries
                    WHERE  reference_type = 'PAYMENT' AND reference_id = %s AND company_id = %s
                    """,
                    (payment_id, company_id)
                )

                if ledger_entry:
                    if ledger_entry['customer_id'] != new_customer_id:
                        # Customer changed: delete old ledger entry, insert new one
                        execute("DELETE FROM ledger_entries WHERE entry_id = %s", (ledger_entry['entry_id'],))
                        insert_returning(
                            """
                            INSERT INTO ledger_entries
                                (company_id, customer_id, transaction_type, reference_type,
                                 reference_id, transaction_date, debit_amount, credit_amount,
                                 running_balance, remarks, created_at)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                            RETURNING entry_id
                            """,
                            (
                                company_id, new_customer_id,
                                'CREDIT', 'PAYMENT', payment_id, d['payment_date'],
                                Decimal('0.00'), amount,
                                Decimal('0.00'), "Payment received",
                            )
                        )
                        # Recompute both ledgers
                        recompute_customer_ledger(company_id, ledger_entry['customer_id'])
                        recompute_customer_ledger(company_id, new_customer_id)
                    else:
                        # Customer didn't change: update existing ledger entry
                        execute(
                            """
                            UPDATE ledger_entries
                            SET    transaction_date = %s,
                                   credit_amount = %s,
                                   remarks = %s
                            WHERE  entry_id = %s
                            """,
                            (
                                d['payment_date'],
                                amount,
                                "Payment received",
                                ledger_entry['entry_id']
                            )
                        )
                        recompute_customer_ledger(company_id, new_customer_id)
                else:
                    # In case ledger entry doesn't exist, create it
                    insert_returning(
                        """
                        INSERT INTO ledger_entries
                            (company_id, customer_id, transaction_type, reference_type,
                             reference_id, transaction_date, debit_amount, credit_amount,
                             running_balance, remarks, created_at)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                        RETURNING entry_id
                        """,
                        (
                            company_id, new_customer_id,
                            'CREDIT', 'PAYMENT', payment_id, d['payment_date'],
                            Decimal('0.00'), amount,
                            Decimal('0.00'), "Payment received",
                        )
                    )
                    recompute_customer_ledger(company_id, new_customer_id)

        except Exception as e:
            return common_response(
                StatusCode.INTERNAL_SERVER_ERROR.value,
                f"Failed to update payment: {str(e)}"
            )

        # ── 6. Return updated payment data ───────────────────────────────────
        full_payment = query_one(
            """
            SELECT p.*,
                   c.customer_name
            FROM   payments p
            JOIN   customers c ON c.customer_id = p.customer_id
            WHERE  p.payment_id = %s AND p.company_id = %s
            """,
            (payment_id, company_id)
        )

        return common_response(
            StatusCode.OK.value,
            get_message("UPDATED", "Payment"),
            self.get_serializer(full_payment).data
        )