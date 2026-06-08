# products_view.py
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request

from accounts.common.db               import query_all, query_one, insert_returning, execute
from accounts.common.auth             import JWTAuthentication
from accounts.common.responses        import common_response, StatusCode
from accounts.common.messages         import get_message
from accounts.serializers.products_serializer import ProductSerializer


class ProductListView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = ProductSerializer

    def get(self, request: Request):
        company_id = request.user.company_id
        search     = request.query_params.get('search', '')

        rows = query_all(
            """
            SELECT product_id, company_id, customer_id, product_name, hsn_code,
                   gst_percentage, height, width, unit_price, description, status,
                   created_at, created_by, updated_at, updated_by
            FROM   products
            WHERE  company_id = %s
              AND  status != 'D'
              AND  (product_name ILIKE %s OR hsn_code ILIKE %s)
            ORDER  BY product_name
            """,
            (company_id, f'%{search}%', f'%{search}%')
        )

        serializer = self.get_serializer(rows, many=True)
        return common_response(
            StatusCode.OK.value,
            "Products fetched successfully",
            {
                'count':    len(serializer.data),
                'products': serializer.data,
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
            INSERT INTO products
                (company_id, customer_id, product_name, hsn_code, gst_percentage,
                 height, width, unit_price, description,
                 status, created_at, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'A',NOW(),%s)
            RETURNING product_id, company_id, customer_id, product_name, hsn_code,
                      gst_percentage, height, width, unit_price, description, status,
                      created_at, created_by, updated_at, updated_by
            """,
            (
                company_id,
                d.get('customer_id'),
                d['product_name'],        d.get('hsn_code'),
                d.get('gst_percentage', 0.00),
                d.get('height'),          d.get('width'),
                d.get('unit_price'),      d.get('description', ''),
                user_id,
            )
        )

        return common_response(
            StatusCode.CREATED.value,
            get_message("CREATED", "Product"),
            self.get_serializer(row).data
        )


class ProductDetailView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = ProductSerializer

    def get(self, request: Request, product_id: int):
        company_id = request.user.company_id

        row = query_one(
            """
            SELECT product_id, company_id, customer_id, product_name, hsn_code,
                   gst_percentage, height, width, unit_price, description, status,
                   created_at, created_by, updated_at, updated_by
            FROM   products
            WHERE  product_id = %s AND company_id = %s AND status != 'D'
            """,
            (product_id, company_id)
        )
        if not row:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Product")
            )

        return common_response(
            StatusCode.OK.value,
            "Product fetched successfully",
            self.get_serializer(row).data
        )

    def put(self, request: Request, product_id: int):
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
            UPDATE products SET
                customer_id    = %s,
                product_name   = %s, hsn_code       = %s,
                gst_percentage = %s, height         = %s,
                width          = %s, unit_price     = %s,
                description    = %s, updated_at     = NOW(),
                updated_by     = %s
            WHERE product_id = %s AND company_id = %s AND status != 'D'
            """,
            (
                d.get('customer_id'),
                d['product_name'],          d.get('hsn_code'),
                d.get('gst_percentage', 0.00),
                d.get('height'),            d.get('width'),
                d.get('unit_price'),        d.get('description', ''),
                user_id, product_id, company_id,
            )
        )

        if rows_updated == 0:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Product")
            )

        return common_response(
            StatusCode.OK.value,
            get_message("UPDATED", "Product")
        )

    def delete(self, request: Request, product_id: int):
        company_id = request.user.company_id
        user_id    = request.user.user_id

        rows_updated = execute(
            """
            UPDATE products
            SET    status = 'D', updated_at = NOW(), updated_by = %s
            WHERE  product_id = %s AND company_id = %s AND status != 'D'
            """,
            (user_id, product_id, company_id)
        )

        if rows_updated == 0:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Product")
            )

        return common_response(
            StatusCode.OK.value,
            get_message("REMOVED", "Product")
        )