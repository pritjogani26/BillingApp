# ledger_view.py
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request

from accounts.common.db               import query_all, query_one
from accounts.common.auth             import JWTAuthentication
from accounts.common.responses        import common_response, StatusCode
from accounts.common.messages         import get_message
from accounts.serializers.ledger_serializer    import LedgerEntrySerializer, OutstandingReportSerializer
from accounts.serializers.customers_serializer import CustomerSerializer


class LedgerEntriesView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = LedgerEntrySerializer

    def get(self, request: Request, customer_id: int):
        company_id = request.user.company_id
        from_date  = request.query_params.get('from_date')
        to_date    = request.query_params.get('to_date')

        customer = query_one(
            """
            SELECT customer_id, company_id, customer_name, contact_person,
                   gstin, address, city, state,
                   pincode, mobile, email, default_rate, status,
                   created_at, created_by, updated_at, updated_by
            FROM   customers
            WHERE  customer_id = %s AND company_id = %s AND status != 'D'
            """,
            (customer_id, company_id)
        )
        if not customer:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Customer")
            )

        # Opening balance — last running_balance before the from_date window
        opening_balance = 0.00
        if from_date:
            ob_row = query_one(
                """
                SELECT running_balance
                FROM   ledger_entries
                WHERE  company_id = %s AND customer_id = %s
                  AND  transaction_date < %s
                ORDER  BY transaction_date DESC, entry_id DESC
                LIMIT  1
                """,
                (company_id, customer_id, from_date)
            )
            if ob_row:
                opening_balance = float(ob_row['running_balance'])

        where  = ["le.company_id = %s", "le.customer_id = %s"]
        params = [company_id, customer_id]

        if from_date:
            where.append("le.transaction_date >= %s"); params.append(from_date)
        if to_date:
            where.append("le.transaction_date <= %s"); params.append(to_date)

        entries = query_all(
            f"""
            SELECT le.entry_id, le.company_id, le.customer_id,
                   le.transaction_type, le.reference_type, le.reference_id,
                   le.transaction_date, le.debit_amount, le.credit_amount,
                   le.running_balance, le.remarks, le.created_at
            FROM   ledger_entries le
            WHERE  {' AND '.join(where)}
            ORDER  BY le.transaction_date ASC, le.entry_id ASC
            """,
            tuple(params)
        )

        return common_response(
            StatusCode.OK.value,
            "Ledger entries fetched successfully",
            {
                'customer':        CustomerSerializer(customer).data,
                'opening_balance': opening_balance,
                'entries':         self.get_serializer(entries, many=True).data,
            }
        )


class OutstandingReportView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = OutstandingReportSerializer

    def get(self, request: Request):
        company_id = request.user.company_id

        rows = query_all(
            """
            SELECT c.customer_id, c.customer_name, c.mobile,
                   COALESCE(le.running_balance, 0.00) AS outstanding,
                   0::int                             AS pending_invoices
            FROM   customers c
            LEFT JOIN LATERAL (
                SELECT running_balance
                FROM   ledger_entries
                WHERE  customer_id = c.customer_id AND company_id = %s
                ORDER  BY entry_id DESC
                LIMIT  1
            ) le ON TRUE
            WHERE  c.company_id = %s AND c.status = 'A'
              AND  COALESCE(le.running_balance, 0.00) > 0
            ORDER  BY outstanding DESC
            """,
            (company_id, company_id)
        )

        serializer = self.get_serializer(rows, many=True)
        return common_response(
            StatusCode.OK.value,
            "Outstanding report fetched successfully",
            {
                'count':       len(serializer.data),
                'outstanding': serializer.data,
            }
        )