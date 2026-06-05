from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated

from billing.helper.db import query_all, query_one, insert_returning, execute
from billing.helper.auth import JWTAuthentication
from billing.helper.common_response import CommonResponse
from billing.serializers.products_serializer import ProductSerializer


class ProductListView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = ProductSerializer

    def get(self, request):
        company_id = request.user.company_id
        search = request.query_params.get('search', '')
        rows = query_all(
            """
            SELECT product_id, company_id, customer_id, product_name, hsn_code,
                   gst_percentage, height, width, price, description, status,
                   created_at, created_by, updated_at, updated_by
            FROM   products
            WHERE  company_id = %s
              AND  status != 'D'
              AND  (product_name ILIKE %s OR hsn_code ILIKE %s)
            ORDER  BY product_name
            """,
            (company_id, f'%{search}%', f'%{search}%')
        )
        serializer = self.get_serializer(data=rows, many=True)
        serializer.is_valid(raise_exception=True)
        return CommonResponse.success(
            message="Products fetched successfully",
            data={
                'products': serializer.validated_data,
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
            INSERT INTO products
                (company_id, customer_id, product_name, hsn_code, gst_percentage,
                 height, width, price, description,
                 status, created_at, created_by, updated_at, updated_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'A',NOW(),%s,NOW(),%s)
            RETURNING product_id, company_id, customer_id, product_name, hsn_code,
                      gst_percentage, height, width, price, description, status,
                      created_at, created_by, updated_at, updated_by
            """,
            (
                company_id,
                d.get('customer_id'),
                d.get('product_name'), d.get('hsn_code'),
                d.get('gst_percentage', 18.00),
                d.get('height', 0.00), d.get('width', 0.00),
                d.get('price', 0.00), d.get('description', ''),
                user_id, user_id,
            )
        )

        out_serializer = self.get_serializer(data=row)
        out_serializer.is_valid(raise_exception=True)

        return CommonResponse.success(
            message="Product created successfully",
            data=out_serializer.validated_data,
            status_code=status.HTTP_201_CREATED
        )


class ProductDetailView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = ProductSerializer

    def get(self, request, product_id):
        company_id = request.user.company_id
        row = query_one(
            """
            SELECT product_id, company_id, customer_id, product_name, hsn_code,
                   gst_percentage, height, width, price, description, status,
                   created_at, created_by, updated_at, updated_by
            FROM   products
            WHERE  product_id = %s AND company_id = %s AND status != 'D'
            """,
            (product_id, company_id)
        )
        if not row:
            return CommonResponse.error(
                message="Product not found",
                status_code=status.HTTP_404_NOT_FOUND
            )
        serializer = self.get_serializer(data=row)
        serializer.is_valid(raise_exception=True)
        return CommonResponse.success(
            message="Product fetched successfully",
            data=serializer.validated_data
        )

    def put(self, request, product_id):
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
            UPDATE products SET
                customer_id    = %s,
                product_name   = %s, hsn_code       = %s,
                gst_percentage = %s, height         = %s,
                width          = %s, price          = %s,
                description    = %s, updated_at     = NOW(),
                updated_by     = %s
            WHERE product_id = %s AND company_id = %s AND status != 'D'
            """,
            (
                d.get('customer_id'),
                d.get('product_name'), d.get('hsn_code'),
                d.get('gst_percentage', 18.00),
                d.get('height', 0.00), d.get('width', 0.00),
                d.get('price', 0.00), d.get('description', ''),
                user_id, product_id, company_id,
            )
        )
        if rows_updated == 0:
            return CommonResponse.error(
                message="Product not found",
                status_code=status.HTTP_404_NOT_FOUND
            )
        return CommonResponse.success(message="Product updated successfully")

    def delete(self, request, product_id):
        company_id = request.user.company_id
        user_id    = request.user.user_id

        rows_updated = execute(
            """
            UPDATE products SET status = 'D', updated_at = NOW(), updated_by = %s
            WHERE product_id = %s AND company_id = %s AND status != 'D'
            """,
            (user_id, product_id, company_id)
        )
        if rows_updated == 0:
            return CommonResponse.error(
                message="Product not found",
                status_code=status.HTTP_404_NOT_FOUND
            )
        return CommonResponse.success(message="Product deleted successfully")