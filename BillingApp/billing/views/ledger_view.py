from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated

from billing.helper.db import query_all, query_one
from billing.helper.auth import JWTAuthentication
from billing.helper.common_response import CommonResponse
from billing.serializers.ledger_serializer import LedgerEntrySerializer, OutstandingReportSerializer
from billing.serializers.customers_serializer import CustomerSerializer


class LedgerEntriesView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = LedgerEntrySerializer

    def get(self, request, customer_id):
        company_id = request.user.company_id
        from_date  = request.query_params.get('from_date')
        to_date    = request.query_params.get('to_date')

        where  = ["le.company_id = %s", "le.customer_id = %s"]
        params = [company_id, customer_id]

        if from_date:
            where.append("le.transaction_date >= %s"); params.append(from_date)
        if to_date:
            where.append("le.transaction_date <= %s"); params.append(to_date)

        customer = query_one(
            """
            SELECT customer_id, company_id, company_name, contact_person,
                   gstin, pan_number, address, city, state,
                   pincode, mobile, email, rate, status,
                   created_at, created_by, updated_at, updated_by
            FROM   customers WHERE customer_id = %s AND company_id = %s AND status != 'D'
            """,
            (customer_id, company_id)
        )
        if not customer:
            return CommonResponse.error(
                message="Customer not found",
                status_code=status.HTTP_404_NOT_FOUND
            )

        entries = query_all(
            f"""
            SELECT le.entry_id, le.company_id, le.customer_id, le.transaction_type,
                   le.reference_type, le.reference_id, le.transaction_date,
                   le.debit_amount, le.credit_amount, le.balance_after_transaction,
                   le.remarks, le.created_at
            FROM   ledger_entries le
            WHERE  {' AND '.join(where)}
            ORDER  BY le.transaction_date ASC, le.entry_id ASC
            """,
            tuple(params)
        )

        customer_serializer = CustomerSerializer(data=customer)
        customer_serializer.is_valid(raise_exception=True)

        entries_serializer = self.get_serializer(data=entries, many=True)
        entries_serializer.is_valid(raise_exception=True)

        return CommonResponse.success(
            message="Ledger entries fetched successfully",
            data={
                'customer':        customer_serializer.validated_data,
                'entries':         entries_serializer.validated_data,
                'opening_balance': 0.00,
            }
        )


class OutstandingReportView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = OutstandingReportSerializer

    def get(self, request):
        company_id = request.user.company_id
        rows = query_all(
            """
            SELECT c.customer_id, c.company_name, c.mobile,
                   COALESCE(SUM(i.due_amount), 0.00)   AS outstanding,
                   COUNT(CASE WHEN i.payment_status = 'PENDING'
                              THEN 1 END)::int          AS pending_invoices
            FROM   customers c
            LEFT   JOIN invoices i
                   ON  i.customer_id = c.customer_id
                   AND i.company_id  = %s
                   AND i.payment_status IN ('PENDING','PARTIAL')
            WHERE  c.company_id = %s AND c.status = 'A'
            GROUP  BY c.customer_id, c.company_name, c.mobile
            HAVING COALESCE(SUM(i.due_amount), 0.00) > 0
            ORDER  BY outstanding DESC
            """,
            (company_id, company_id)
        )
        serializer = self.get_serializer(data=rows, many=True)
        serializer.is_valid(raise_exception=True)
        return CommonResponse.success(
            message="Outstanding report fetched successfully",
            data={
                'outstanding': serializer.validated_data,
                'count': len(serializer.validated_data)
            }
        )