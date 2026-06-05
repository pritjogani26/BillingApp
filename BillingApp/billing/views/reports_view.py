from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated

from billing.helper.db import query_all, query_one
from billing.helper.auth import JWTAuthentication
from billing.helper.common_response import CommonResponse
from billing.serializers.reports_serializer import (
    GSTSummarySerializer,
    GSTR1Serializer,
    HSNSummarySerializer,
    MonthlySalesSerializer
)


class GSTSummaryView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = GSTSummarySerializer

    def get(self, request):
        company_id = request.user.company_id
        month      = request.query_params.get('month')
        year       = request.query_params.get('year')

        if not month or not year:
            return CommonResponse.error(
                message="month and year required",
                status_code=status.HTTP_400_BAD_REQUEST
            )

        row = query_one(
            """
            SELECT
                COUNT(*)::int                                 AS invoice_count,
                COALESCE(SUM(subtotal), 0.00)                 AS taxable_amount,
                COALESCE(SUM(cgst_amount), 0.00)              AS total_cgst,
                COALESCE(SUM(sgst_amount), 0.00)              AS total_sgst,
                COALESCE(SUM(igst_amount), 0.00)              AS total_igst,
                COALESCE(SUM(grand_total), 0.00)              AS grand_total
            FROM   invoices
            WHERE  company_id    = %s
              AND  invoice_type  = 'GST'
              AND  EXTRACT(MONTH FROM invoice_date) = %s
              AND  EXTRACT(YEAR  FROM invoice_date) = %s
            """,
            (company_id, month, year)
        )
        serializer = self.get_serializer(data=row or {
            'invoice_count': 0, 'taxable_amount': 0.00,
            'total_cgst': 0.00, 'total_sgst': 0.00, 'total_igst': 0.00, 'grand_total': 0.00
        })
        serializer.is_valid(raise_exception=True)
        return CommonResponse.success(
            message="GST summary fetched successfully",
            data=serializer.validated_data
        )


class GSTR1View(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = GSTR1Serializer

    def get(self, request):
        company_id = request.user.company_id
        month      = request.query_params.get('month')
        year       = request.query_params.get('year')

        if not month or not year:
            return CommonResponse.error(
                message="month and year required",
                status_code=status.HTTP_400_BAD_REQUEST
            )

        rows = query_all(
            """
            SELECT
                i.invoice_number, i.invoice_date,
                c.company_name, c.gstin AS customer_gstin,
                c.state AS customer_state,
                i.subtotal AS taxable_value,
                i.cgst_amount, i.sgst_amount, i.igst_amount,
                i.grand_total
            FROM   invoices i
            JOIN   customers c ON c.customer_id = i.customer_id
            WHERE  i.company_id   = %s
              AND  i.invoice_type = 'GST'
              AND  EXTRACT(MONTH FROM i.invoice_date) = %s
              AND  EXTRACT(YEAR  FROM i.invoice_date) = %s
            ORDER  BY i.invoice_date, i.invoice_number
            """,
            (company_id, month, year)
        )
        serializer = self.get_serializer(data=rows, many=True)
        serializer.is_valid(raise_exception=True)
        return CommonResponse.success(
            message="GSTR-1 report fetched successfully",
            data={
                'gstr1': serializer.validated_data,
                'count': len(serializer.validated_data)
            }
        )


class HSNSummaryView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = HSNSummarySerializer

    def get(self, request):
        company_id = request.user.company_id
        month      = request.query_params.get('month')
        year       = request.query_params.get('year')

        if not month or not year:
            return CommonResponse.error(
                message="month and year required",
                status_code=status.HTTP_400_BAD_REQUEST
            )

        rows = query_all(
            """
            SELECT
                COALESCE(p.hsn_code, 'N/A')                    AS hsn_code,
                COALESCE(p.product_name, ii.product_name, '')   AS product_name,
                SUM(ii.quantity)       AS total_qty,
                SUM(ii.taxable_amount) AS taxable_value,
                SUM(ii.cgst_amount)    AS cgst,
                SUM(ii.sgst_amount)    AS sgst,
                SUM(ii.igst_amount)    AS igst,
                SUM(ii.total_amount)   AS total
            FROM   invoice_items ii
            JOIN   invoices i ON i.invoice_id = ii.invoice_id
            LEFT   JOIN products p ON p.product_id = ii.product_id
            WHERE  i.company_id   = %s
              AND  i.invoice_type = 'GST'
              AND  EXTRACT(MONTH FROM i.invoice_date) = %s
              AND  EXTRACT(YEAR  FROM i.invoice_date) = %s
            GROUP  BY COALESCE(p.hsn_code, 'N/A'),
                      COALESCE(p.product_name, ii.product_name, '')
            ORDER  BY taxable_value DESC
            """,
            (company_id, month, year)
        )
        serializer = self.get_serializer(data=rows, many=True)
        serializer.is_valid(raise_exception=True)
        return CommonResponse.success(
            message="HSN summary fetched successfully",
            data={
                'hsn_summary': serializer.validated_data
            }
        )


class MonthlySalesView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = MonthlySalesSerializer

    def get(self, request):
        company_id = request.user.company_id
        rows = query_all(
            """
            SELECT
                TO_CHAR(invoice_date, 'Mon YYYY')     AS month_label,
                EXTRACT(YEAR  FROM invoice_date)::int AS yr,
                EXTRACT(MONTH FROM invoice_date)::int AS mo,
                COALESCE(SUM(grand_total), 0.00)         AS total_sales,
                COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0.00) AS total_tax,
                COUNT(*)::int                              AS invoice_count
            FROM   invoices
            WHERE  company_id   = %s
              AND  invoice_date >= CURRENT_DATE - INTERVAL '12 months'
            GROUP  BY month_label, yr, mo
            ORDER  BY yr, mo
            """,
            (company_id,)
        )
        serializer = self.get_serializer(data=rows, many=True)
        serializer.is_valid(raise_exception=True)
        return CommonResponse.success(
            message="Monthly sales trend fetched successfully",
            data={
                'monthly_sales': serializer.validated_data
            }
        )