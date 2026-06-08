# customers_view.py
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request

from accounts.common.db               import query_all, query_one, insert_returning, execute
from accounts.common.auth             import JWTAuthentication
from accounts.common.responses        import common_response, StatusCode
from accounts.common.messages         import get_message
from accounts.serializers.customers_serializer import CustomerSerializer, CustomerLedgerSummarySerializer


class CustomerListView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = CustomerSerializer

    def get(self, request: Request):
        company_id = request.user.company_id
        search     = request.query_params.get('search', '')

        rows = query_all(
            """
            SELECT customer_id, company_id, customer_name, contact_person,
                   gstin, pan_number, address, city, state,
                   pincode, mobile, email, default_rate, status,
                   created_at, created_by, updated_at, updated_by
            FROM   customers
            WHERE  company_id = %s
              AND  status != 'D'
              AND  (customer_name ILIKE %s OR mobile ILIKE %s OR gstin ILIKE %s)
            ORDER  BY customer_name
            """,
            (company_id, f'%{search}%', f'%{search}%', f'%{search}%')
        )

        serializer = self.get_serializer(rows, many=True)
        return common_response(
            StatusCode.OK.value,
            "Customers fetched successfully",
            {
                'count':     len(serializer.data),
                'customers': serializer.data,
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

        d = serializer.validated_data
        row = insert_returning(
            """
            INSERT INTO customers
                (company_id, customer_name, contact_person, gstin, pan_number,
                 address, city, state, pincode, mobile, email, default_rate,
                 status, created_at, created_by)
            VALUES
                (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'A',NOW(),%s)
            RETURNING customer_id, company_id, customer_name, contact_person,
                      gstin, pan_number, address, city, state,
                      pincode, mobile, email, default_rate, status,
                      created_at, created_by, updated_at, updated_by
            """,
            (
                company_id,
                d['customer_name'],  d.get('contact_person'),
                d.get('gstin'),      d.get('pan_number'),
                d.get('address'),    d.get('city'),
                d.get('state'),      d.get('pincode'),
                d.get('mobile'),     d.get('email'),
                d.get('default_rate', 0.00),
                user_id,
            )
        )

        return common_response(
            StatusCode.CREATED.value,
            get_message("CREATED", "Customer"),
            self.get_serializer(row).data
        )


class CustomerDetailView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = CustomerSerializer

    def get(self, request: Request, customer_id: int):
        company_id = request.user.company_id

        row = query_one(
            """
            SELECT customer_id, company_id, customer_name, contact_person,
                   gstin, pan_number, address, city, state,
                   pincode, mobile, email, default_rate, status,
                   created_at, created_by, updated_at, updated_by
            FROM   customers
            WHERE  customer_id = %s AND company_id = %s AND status != 'D'
            """,
            (customer_id, company_id)
        )

        if not row:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Customer")
            )

        return common_response(
            StatusCode.OK.value,
            "Customer fetched successfully",
            self.get_serializer(row).data
        )

    def put(self, request: Request, customer_id: int):
        company_id = request.user.company_id
        user_id    = request.user.user_id

        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return common_response(
                StatusCode.BAD_REQUEST.value,
                get_message("INVALID_REQUEST"),
                serializer.errors
            )

        d = serializer.validated_data
        rows_updated = execute(
            """
            UPDATE customers SET
                customer_name  = %s, contact_person = %s,
                gstin          = %s, pan_number     = %s,
                address        = %s, city           = %s,
                state          = %s, pincode        = %s,
                mobile         = %s, email          = %s,
                default_rate   = %s, updated_at     = NOW(),
                updated_by     = %s
            WHERE customer_id = %s AND company_id = %s AND status != 'D'
            """,
            (
                d['customer_name'],  d.get('contact_person'),
                d.get('gstin'),      d.get('pan_number'),
                d.get('address'),    d.get('city'),
                d.get('state'),      d.get('pincode'),
                d.get('mobile'),     d.get('email'),
                d.get('default_rate', 0.00),
                user_id, customer_id, company_id,
            )
        )

        if rows_updated == 0:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Customer")
            )

        return common_response(
            StatusCode.OK.value,
            get_message("UPDATED", "Customer")
        )

    def delete(self, request: Request, customer_id: int):
        company_id = request.user.company_id
        user_id    = request.user.user_id

        rows_updated = execute(
            """
            UPDATE customers
            SET    status = 'D', updated_at = NOW(), updated_by = %s
            WHERE  customer_id = %s AND company_id = %s AND status != 'D'
            """,
            (user_id, customer_id, company_id)
        )

        if rows_updated == 0:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Customer")
            )

        return common_response(
            StatusCode.OK.value,
            get_message("REMOVED", "Customer")
        )


class CustomerLedgerSummaryView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = CustomerLedgerSummarySerializer

    def get(self, request: Request, customer_id: int):
        company_id = request.user.company_id

        row = query_one(
            """
            SELECT
                c.customer_id,
                c.customer_name,
                COALESCE(SUM(le.debit_amount),  0) AS total_debit,
                COALESCE(SUM(le.credit_amount), 0) AS total_credit,
                COALESCE((
                    SELECT running_balance
                    FROM   ledger_entries
                    WHERE  customer_id = c.customer_id AND company_id = %s
                    ORDER  BY entry_id DESC
                    LIMIT  1
                ), 0) AS current_balance
            FROM   customers c
            LEFT   JOIN ledger_entries le
                   ON  le.customer_id = c.customer_id
                   AND le.company_id  = %s
            WHERE  c.customer_id = %s AND c.company_id = %s AND c.status != 'D'
            GROUP  BY c.customer_id, c.customer_name
            """,
            (company_id, company_id, customer_id, company_id)
        )

        if not row:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Customer")
            )

        return common_response(
            StatusCode.OK.value,
            "Customer ledger summary fetched successfully",
            self.get_serializer(row).data
        )