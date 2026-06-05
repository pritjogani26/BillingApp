from decimal import Decimal
from django.db import transaction
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated

from billing.helper.db import query_all, query_one, insert_returning, execute
from billing.helper.auth import JWTAuthentication
from billing.helper.common_response import CommonResponse
from billing.serializers.payments_serializer import PaymentSerializer


def _post_ledger(company_id, customer_id, ref_type, ref_id, date,
                 debit, credit, remarks, user_id):
    last = query_one(
        """
        SELECT balance_after_transaction FROM ledger_entries
        WHERE  company_id = %s AND customer_id = %s
        ORDER  BY entry_id DESC LIMIT 1
        """,
        (company_id, customer_id)
    )
    prev = Decimal(str(last['balance_after_transaction'])) if last else Decimal('0.00')
    new_balance = prev + Decimal(str(debit)) - Decimal(str(credit))

    insert_returning(
        """
        INSERT INTO ledger_entries
            (company_id, customer_id, transaction_type, reference_type,
             reference_id, transaction_date, debit_amount, credit_amount,
             balance_after_transaction, remarks, created_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
        RETURNING entry_id
        """,
        (company_id, customer_id,
         'DEBIT' if debit > 0 else 'CREDIT',
         ref_type, ref_id, date, debit, credit,
         new_balance, remarks)
     )


class PaymentListView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = PaymentSerializer

    def get(self, request):
        company_id = request.user.company_id
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
                   p.payment_date, p.payment_method, p.reference_number, p.amount,
                   p.notes, p.created_at, p.created_by, p.updated_by, p.updated_at,
                   i.invoice_number,
                   c.company_name AS customer_name
            FROM   payments p
            JOIN   invoices  i ON i.invoice_id  = p.invoice_id
            JOIN   customers c ON c.customer_id = p.customer_id
            WHERE  {' AND '.join(where)}
            ORDER  BY p.payment_date DESC, p.payment_id DESC
            """,
            tuple(params)
        )
        serializer = self.get_serializer(data=rows, many=True)
        serializer.is_valid(raise_exception=True)
        return CommonResponse.success(
            message="Payments fetched successfully",
            data={
                'payments': serializer.validated_data,
                'count': len(serializer.validated_data)
            }
        )

    def post(self, request):
        company_id = request.user.company_id
        user_id    = request.user.user_id

        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return CommonResponse.error(
                message="Invalid input",
                errors=serializer.errors,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        d = serializer.validated_data
        invoice_id = d.get('invoice_id')

        try:
            with transaction.atomic():
                invoice = query_one(
                    """
                    SELECT invoice_id, customer_id, due_amount, grand_total,
                           invoice_number, payment_status
                    FROM   invoices
                    WHERE  invoice_id = %s AND company_id = %s
                    """,
                    (invoice_id, company_id)
                )
                if not invoice:
                    return CommonResponse.error(
                        message="Invoice not found",
                        status_code=status.HTTP_404_NOT_FOUND
                    )

                amount = Decimal(str(d.get('amount', 0)))
                due    = Decimal(str(invoice['due_amount']))
                if amount <= 0:
                    return CommonResponse.error(
                        message="Amount must be > 0",
                        status_code=status.HTTP_400_BAD_REQUEST
                    )
                if amount > due:
                    return CommonResponse.error(
                        message=f"Amount exceeds due {due}",
                        status_code=status.HTTP_400_BAD_REQUEST
                    )

                payment = insert_returning(
                    """
                    INSERT INTO payments
                        (invoice_id, company_id, customer_id, payment_date,
                         payment_method, reference_number, amount, notes, created_at,
                         created_by, updated_by, updated_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NOW(),%s,%s,NOW())
                    RETURNING *
                    """,
                    (
                        invoice['invoice_id'], company_id, invoice['customer_id'],
                        d.get('payment_date'), d.get('payment_method', 'CASH'),
                        d.get('reference_number', ''), amount,
                        d.get('notes', ''), user_id, user_id,
                    )
                )

                # Bug #10: clamp sub-penny residuals to zero to prevent
                # invoices being stuck in PARTIAL when visually at ₹0.00.
                new_due = due - amount
                if new_due < Decimal('0.01'):
                    new_due = Decimal('0.00')
                new_status = 'PAID' if new_due == Decimal('0.00') else 'PARTIAL'
                execute(
                    """
                    UPDATE invoices
                    SET due_amount = %s, payment_status = %s,
                        updated_at = NOW(), updated_by = %s
                    WHERE invoice_id = %s
                    """,
                    (new_due, new_status, user_id, invoice['invoice_id'])
                )

                _post_ledger(
                    company_id, invoice['customer_id'],
                    'PAYMENT', payment['payment_id'],
                    d.get('payment_date'),
                    Decimal('0.00'), amount,
                    f"Payment received for {invoice['invoice_number']}",
                    user_id,
                )
        except Exception as e:
            return CommonResponse.error(
                message=f"Failed to record payment: {str(e)}",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Retrieve extra fields for formatting output nicely
        full_payment = query_one(
            """
            SELECT p.*, i.invoice_number, c.company_name
            FROM   payments p
            JOIN   invoices  i ON i.invoice_id  = p.invoice_id
            JOIN   customers c ON c.customer_id = p.customer_id
            WHERE  p.payment_id = %s
            """,
            (payment['payment_id'],)
        )

        out_serializer = self.get_serializer(data=full_payment)
        out_serializer.is_valid(raise_exception=True)

        return CommonResponse.success(
            message="Payment recorded successfully",
            data=out_serializer.validated_data,
            status_code=status.HTTP_201_CREATED
        )


class PaymentDetailView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = PaymentSerializer

    def get(self, request, payment_id):
        company_id = request.user.company_id
        row = query_one(
            """
            SELECT p.*, i.invoice_number, c.company_name
            FROM   payments p
            JOIN   invoices  i ON i.invoice_id  = p.invoice_id
            JOIN   customers c ON c.customer_id = p.customer_id
            WHERE  p.payment_id = %s AND p.company_id = %s
            """,
            (payment_id, company_id)
        )
        if not row:
            return CommonResponse.error(
                message="Payment not found",
                status_code=status.HTTP_404_NOT_FOUND
            )
        serializer = self.get_serializer(data=row)
        serializer.is_valid(raise_exception=True)
        return CommonResponse.success(
            message="Payment details fetched successfully",
            data=serializer.validated_data
        )