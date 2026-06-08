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
        invoice_id  = request.query_params.get('invoice_id')
        customer_id = request.query_params.get('customer_id')

        where  = ["p.company_id = %s"]
        params = [company_id]

        if invoice_id:
            where.append("p.invoice_id = %s");  params.append(invoice_id)
        if customer_id:
            where.append("p.customer_id = %s"); params.append(customer_id)

        rows = query_all(
            f"""
            SELECT p.payment_id, p.invoice_id, p.company_id, p.customer_id,
                   p.payment_date, p.payment_method, p.reference_number,
                   p.amount, p.notes,
                   p.created_at, p.created_by, p.updated_at, p.updated_by,
                   i.invoice_number,
                   c.customer_name
            FROM   payments p
            LEFT   JOIN invoices  i ON i.invoice_id  = p.invoice_id
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

        d          = serializer.validated_data
        invoice_id = d['invoice_id']
        amount     = Decimal(str(d['amount']))

        if amount <= 0:
            return common_response(
                StatusCode.BAD_REQUEST.value,
                "Amount must be greater than 0."
            )

        try:
            with transaction.atomic():
                invoice = query_one(
                    """
                    SELECT invoice_id, customer_id, due_amount,
                           invoice_number, payment_status
                    FROM   invoices
                    WHERE  invoice_id = %s AND company_id = %s AND status = 'A'
                    """,
                    (invoice_id, company_id)
                )
                if not invoice:
                    return common_response(
                        StatusCode.NOT_FOUND.value,
                        get_message("NOT_FOUND", "Invoice")
                    )

                due = Decimal(str(invoice['due_amount']))
                if amount > due:
                    return common_response(
                        StatusCode.BAD_REQUEST.value,
                        f"Amount exceeds outstanding due of {due}."
                    )

                payment = insert_returning(
                    """
                    INSERT INTO payments
                        (invoice_id, company_id, customer_id, payment_date,
                         payment_method, reference_number, amount, notes,
                         created_at, created_by)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NOW(),%s)
                    RETURNING *
                    """,
                    (
                        invoice['invoice_id'], company_id, invoice['customer_id'],
                        d['payment_date'],     d['payment_method'],
                        d.get('reference_number', ''),
                        amount,                d.get('notes', ''),
                        user_id,
                    )
                )

                new_due    = due - amount
                if new_due < Decimal('0.01'):
                    new_due = Decimal('0.00')
                new_status = 'PAID' if new_due == Decimal('0.00') else 'PARTIAL'

                execute(
                    """
                    UPDATE invoices
                    SET    due_amount     = %s,
                           payment_status = %s,
                           updated_at     = NOW(),
                           updated_by     = %s
                    WHERE  invoice_id = %s
                    """,
                    (new_due, new_status, user_id, invoice['invoice_id'])
                )

                _post_ledger(
                    company_id,          invoice['customer_id'],
                    'PAYMENT',           payment['payment_id'],
                    d['payment_date'],
                    Decimal('0.00'),     amount,
                    f"Payment received for {invoice['invoice_number']}",
                )

        except Exception as e:
            return common_response(
                StatusCode.INTERNAL_SERVER_ERROR.value,
                f"Failed to record payment: {str(e)}"
            )

        full_payment = query_one(
            """
            SELECT p.*,
                   i.invoice_number,
                   c.customer_name
            FROM   payments p
            LEFT   JOIN invoices  i ON i.invoice_id  = p.invoice_id
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
                   i.invoice_number,
                   c.customer_name
            FROM   payments p
            LEFT   JOIN invoices  i ON i.invoice_id  = p.invoice_id
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