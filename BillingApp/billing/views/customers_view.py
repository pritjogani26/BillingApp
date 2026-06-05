from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated

from billing.helper.db import query_all, query_one, insert_returning, execute
from billing.helper.auth import JWTAuthentication
from billing.helper.common_response import CommonResponse
from billing.serializers.customers_serializer import CustomerSerializer, CustomerLedgerSummarySerializer


class CustomerListView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = CustomerSerializer

    def get(self, request):
        company_id = request.user.company_id
        search = request.query_params.get('search', '')
        rows = query_all(
            """
            SELECT customer_id, company_id, company_name, contact_person,
                   gstin, pan_number, address, city, state,
                   pincode, mobile, email, rate, status,
                   created_at, created_by, updated_at, updated_by
            FROM   customers
            WHERE  company_id = %s
              AND  status != 'D'
              AND  (company_name ILIKE %s OR mobile ILIKE %s OR gstin ILIKE %s)
            ORDER  BY company_name
            """,
            (company_id, f'%{search}%', f'%{search}%', f'%{search}%')
        )
        serializer = self.get_serializer(data=rows, many=True)
        serializer.is_valid(raise_exception=True)
        return CommonResponse.success(
            message="Customers fetched successfully",
            data={
                'customers': serializer.validated_data,
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
        row = insert_returning(
            """
            INSERT INTO customers
                (company_id, company_name, contact_person, gstin, pan_number,
                 address, city, state, pincode, mobile, email, rate,
                 status, created_at, created_by, updated_at, updated_by)
            VALUES
                (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'A',NOW(),%s,NOW(),%s)
            RETURNING customer_id, company_id, company_name, contact_person, gstin, pan_number,
                      address, city, state, pincode, mobile, email, rate, status,
                      created_at, created_by, updated_at, updated_by
            """,
            (
                company_id,
                d.get('company_name'), d.get('contact_person'),
                d.get('gstin'),        d.get('pan_number'),
                d.get('address'),      d.get('city'),
                d.get('state'),        d.get('pincode'),
                d.get('mobile'),       d.get('email'),
                d.get('rate', 0.00),
                user_id, user_id,
            )
        )
        
        out_serializer = self.get_serializer(data=row)
        out_serializer.is_valid(raise_exception=True)
        
        return CommonResponse.success(
            message="Customer created successfully",
            data=out_serializer.validated_data,
            status_code=status.HTTP_201_CREATED
        )


class CustomerDetailView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = CustomerSerializer

    def get(self, request, customer_id):
        company_id = request.user.company_id
        row = query_one(
            """
            SELECT customer_id, company_id, company_name, contact_person, gstin, pan_number,
                   address, city, state, pincode, mobile, email, rate, status,
                   created_at, created_by, updated_at, updated_by
            FROM   customers
            WHERE  customer_id = %s AND company_id = %s AND status != 'D'
            """,
            (customer_id, company_id)
        )
        if not row:
            return CommonResponse.error(
                message="Customer not found",
                status_code=status.HTTP_404_NOT_FOUND
            )
        serializer = self.get_serializer(data=row)
        serializer.is_valid(raise_exception=True)
        return CommonResponse.success(
            message="Customer fetched successfully",
            data=serializer.validated_data
        )

    def put(self, request, customer_id):
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
        rows_updated = execute(
            """
            UPDATE customers SET
                company_name   = %s, contact_person = %s,
                gstin          = %s, pan_number     = %s,
                address        = %s, city           = %s,
                state          = %s, pincode        = %s,
                mobile         = %s, email          = %s,
                rate           = %s, updated_at     = NOW(),
                updated_by     = %s
            WHERE customer_id = %s AND company_id = %s AND status != 'D'
            """,
            (
                d.get('company_name'), d.get('contact_person'),
                d.get('gstin'),        d.get('pan_number'),
                d.get('address'),      d.get('city'),
                d.get('state'),        d.get('pincode'),
                d.get('mobile'),       d.get('email'),
                d.get('rate', 0.00),
                user_id, customer_id, company_id,
            )
        )
        if rows_updated == 0:
            return CommonResponse.error(
                message="Customer not found",
                status_code=status.HTTP_404_NOT_FOUND
            )
        return CommonResponse.success(message="Customer updated successfully")

    def delete(self, request, customer_id):
        company_id = request.user.company_id
        user_id    = request.user.user_id

        rows_updated = execute(
            """
            UPDATE customers
            SET status = 'D', updated_at = NOW(), updated_by = %s
            WHERE customer_id = %s AND company_id = %s AND status != 'D'
            """,
            (user_id, customer_id, company_id)
        )
        if rows_updated == 0:
            return CommonResponse.error(
                message="Customer not found",
                status_code=status.HTTP_404_NOT_FOUND
            )
        return CommonResponse.success(message="Customer deleted successfully")


class CustomerLedgerSummaryView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = CustomerLedgerSummarySerializer

    def get(self, request, customer_id):
        company_id = request.user.company_id
        row = query_one(
            """
            SELECT
                c.customer_id, c.company_name,
                COALESCE(SUM(le.debit_amount),  0) AS total_debit,
                COALESCE(SUM(le.credit_amount), 0) AS total_credit,
                COALESCE((
                    SELECT balance_after_transaction
                    FROM   ledger_entries
                    WHERE  customer_id = c.customer_id AND company_id = %s
                    ORDER  BY entry_id DESC
                    LIMIT  1
                ), 0) AS current_balance
            FROM   customers c
            LEFT   JOIN ledger_entries le
                   ON le.customer_id = c.customer_id AND le.company_id = %s
            WHERE  c.customer_id = %s AND c.company_id = %s AND c.status != 'D'
            GROUP  BY c.customer_id, c.company_name
            """,
            (company_id, company_id, customer_id, company_id)
        )
        if not row:
            return CommonResponse.error(
                message="Customer not found",
                status_code=status.HTTP_404_NOT_FOUND
            )
        serializer = self.get_serializer(data=row)
        serializer.is_valid(raise_exception=True)
        return CommonResponse.success(
            message="Customer ledger summary fetched successfully",
            data=serializer.validated_data
        )