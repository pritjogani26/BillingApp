# reports_view.py
import calendar
import io

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from django.http import HttpResponse
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from accounts.common.db        import query_all, query_one
from accounts.common.auth      import JWTAuthentication
from accounts.common.responses import common_response, StatusCode
from accounts.common.messages  import get_message
from accounts.serializers.reports_serializer import (
    GSTSummarySerializer,
    GSTR1Serializer,
    HSNSummarySerializer,
    MonthlySalesSerializer,
)


# ── Shared queries ────────────────────────────────────────────────────────────

def _fetch_gstr1(company_id: int, month: int, year: int) -> list:
    return query_all(
        """
        SELECT
            i.invoice_number,
            i.invoice_date,
            c.customer_name,
            c.gstin  AS customer_gstin,
            c.state  AS customer_state,
            i.subtotal      AS taxable_value,
            i.cgst_amount,
            i.sgst_amount,
            i.igst_amount,
            i.grand_total
        FROM   invoices i
        JOIN   customers c ON c.customer_id = i.customer_id
        WHERE  i.company_id   = %s
          AND  i.invoice_type = 'TAX'
          AND  i.status       = 'A'
          AND  EXTRACT(MONTH FROM i.invoice_date) = %s
          AND  EXTRACT(YEAR  FROM i.invoice_date) = %s
        ORDER  BY i.invoice_date, i.invoice_number
        """,
        (company_id, month, year)
    )


def _fetch_hsn_summary(company_id: int, month: int, year: int) -> list:
    return query_all(
        """
        SELECT
            COALESCE(ii.hsn_code, p.hsn_code, 'N/A') AS hsn_code,
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
          AND  i.invoice_type = 'TAX'
          AND  i.status       = 'A'
          AND  EXTRACT(MONTH FROM i.invoice_date) = %s
          AND  EXTRACT(YEAR  FROM i.invoice_date) = %s
        GROUP  BY COALESCE(ii.hsn_code, p.hsn_code, 'N/A')
        ORDER  BY taxable_value DESC
        """,
        (company_id, month, year)
    )


def _validate_month_year(request: Request):
    """Returns (month, year, error_response). error_response is None if valid."""
    month = request.query_params.get('month')
    year  = request.query_params.get('year')
    if not month or not year:
        return None, None, common_response(
            StatusCode.BAD_REQUEST.value,
            "month and year are required."
        )
    try:
        return int(month), int(year), None
    except ValueError:
        return None, None, common_response(
            StatusCode.BAD_REQUEST.value,
            "month and year must be integers."
        )


# ── Views ─────────────────────────────────────────────────────────────────────

class GSTSummaryView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = GSTSummarySerializer

    def get(self, request: Request):
        month, year, err = _validate_month_year(request)
        if err:
            return err

        company_id = request.user.company_id
        row = query_one(
            """
            SELECT
                COUNT(*)::int                    AS invoice_count,
                COALESCE(SUM(subtotal),      0)  AS taxable_amount,
                COALESCE(SUM(cgst_amount),   0)  AS total_cgst,
                COALESCE(SUM(sgst_amount),   0)  AS total_sgst,
                COALESCE(SUM(igst_amount),   0)  AS total_igst,
                COALESCE(SUM(grand_total),   0)  AS grand_total
            FROM   invoices
            WHERE  company_id   = %s
              AND  invoice_type = 'TAX'
              AND  status       = 'A'
              AND  EXTRACT(MONTH FROM invoice_date) = %s
              AND  EXTRACT(YEAR  FROM invoice_date) = %s
            """,
            (company_id, month, year)
        )

        return common_response(
            StatusCode.OK.value,
            get_message("GST summary fetched successfully"),
            self.get_serializer(row).data
        )


class GSTR1View(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = GSTR1Serializer

    def get(self, request: Request):
        month, year, err = _validate_month_year(request)
        if err:
            return err

        rows = _fetch_gstr1(request.user.company_id, month, year)
        serializer = self.get_serializer(rows, many=True)
        return common_response(
            StatusCode.OK.value,
            get_message("GSTR-1 report fetched successfully"),
            {
                'count': len(serializer.data),
                'gstr1': serializer.data,
            }
        )


class HSNSummaryView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = HSNSummarySerializer

    def get(self, request: Request):
        month, year, err = _validate_month_year(request)
        if err:
            return err

        rows = _fetch_hsn_summary(request.user.company_id, month, year)
        serializer = self.get_serializer(rows, many=True)
        return common_response(
            StatusCode.OK.value,
            get_message("HSN summary fetched successfully"),
            {'hsn_summary': serializer.data}
        )


class MonthlySalesView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = MonthlySalesSerializer

    def get(self, request: Request):
        company_id = request.user.company_id
        rows = query_all(
            """
            SELECT
                TO_CHAR(invoice_date, 'Mon YYYY')      AS month_label,
                EXTRACT(YEAR  FROM invoice_date)::int  AS yr,
                EXTRACT(MONTH FROM invoice_date)::int  AS mo,
                COALESCE(SUM(grand_total), 0)          AS total_sales,
                COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0) AS total_tax,
                COUNT(*)::int                          AS invoice_count
            FROM   invoices
            WHERE  company_id = %s
              AND  status     = 'A'
              AND  invoice_date >= CURRENT_DATE - INTERVAL '12 months'
            GROUP  BY month_label, yr, mo
            ORDER  BY yr, mo
            """,
            (company_id,)
        )
        serializer = self.get_serializer(rows, many=True)
        return common_response(
            StatusCode.OK.value,
            get_message("Monthly sales trend fetched successfully"),
            {'monthly_sales': serializer.data}
        )


class GSTR1ExcelDownloadView(APIView):
    """
    GET /reports/gstr1/download/?month=6&year=2026
    Returns a downloadable .xlsx with two sheets:
      Sheet 1 — Invoice-wise GSTR-1 detail
      Sheet 2 — HSN-wise summary
    """
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]

    # ── Style constants ───────────────────────────────────────────────────────
    _HEADER_FILL   = PatternFill("solid", fgColor="1F4E79")
    _SECTION_FILL  = PatternFill("solid", fgColor="2E75B6")
    _TOTAL_FILL    = PatternFill("solid", fgColor="D6E4F0")
    _HEADER_FONT   = Font(bold=True, color="FFFFFF", size=10)
    _SECTION_FONT  = Font(bold=True, color="FFFFFF", size=10)
    _TOTAL_FONT    = Font(bold=True, size=10)
    _LABEL_FONT    = Font(bold=True, size=10)
    _CENTER        = Alignment(horizontal="center", vertical="center")
    _RIGHT         = Alignment(horizontal="right",  vertical="center")

    def get(self, request: Request):
        month, year, err = _validate_month_year(request)
        if err:
            return err

        company_id = request.user.company_id

        company = query_one(
            "SELECT company_name, gstin FROM company WHERE company_id = %s",
            (company_id,)
        ) or {}

        gstr1_rows = _fetch_gstr1(company_id, month, year)
        hsn_rows   = _fetch_hsn_summary(company_id, month, year)

        wb = openpyxl.Workbook()

        self._build_gstr1_sheet(wb.active, gstr1_rows, company, month, year)
        hsn_ws = wb.create_sheet("HSN Summary")
        self._build_hsn_sheet(hsn_ws, hsn_rows, company, month, year)

        # ── Stream to response ────────────────────────────────────────────────
        month_name = calendar.month_abbr[month].upper()
        filename   = f"GSTR1_{month_name}_{year}.xlsx"

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        response = HttpResponse(
            buffer.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Content-Length"]      = buffer.getbuffer().nbytes
        return response

    # ── Sheet builders ────────────────────────────────────────────────────────

    def _build_gstr1_sheet(self, ws, rows, company, month, year):
        ws.title = "GSTR-1 Detail"
        month_label = f"{calendar.month_name[month]} {year}"

        # ── Title block ───────────────────────────────────────────────────────
        ws.merge_cells("A1:J1")
        ws["A1"] = company.get("company_name", "").upper()
        ws["A1"].font      = Font(bold=True, size=13)
        ws["A1"].alignment = self._CENTER

        ws.merge_cells("A2:J2")
        ws["A2"] = f"GSTIN: {company.get('gstin', 'N/A')}"
        ws["A2"].font      = Font(size=10)
        ws["A2"].alignment = self._CENTER

        ws.merge_cells("A3:J3")
        ws["A3"] = f"GSTR-1 — {month_label}"
        ws["A3"].font      = self._SECTION_FONT
        ws["A3"].fill      = self._SECTION_FILL
        ws["A3"].alignment = self._CENTER

        ws.append([])  # blank row 4

        # ── Headers ───────────────────────────────────────────────────────────
        headers = [
            "Invoice No.", "Invoice Date", "Customer Name",
            "Customer GSTIN", "State",
            "Taxable Value", "CGST", "SGST", "IGST", "Grand Total",
        ]
        ws.append(headers)
        for cell in ws[5]:
            cell.font      = self._HEADER_FONT
            cell.fill      = self._HEADER_FILL
            cell.alignment = self._CENTER

        # ── Data rows ─────────────────────────────────────────────────────────
        for row in rows:
            ws.append([
                row.get("invoice_number"),
                str(row.get("invoice_date", "")),
                row.get("customer_name"),
                row.get("customer_gstin") or "Unregistered",
                row.get("customer_state"),
                float(row.get("taxable_value") or 0),
                float(row.get("cgst_amount")   or 0),
                float(row.get("sgst_amount")   or 0),
                float(row.get("igst_amount")   or 0),
                float(row.get("grand_total")   or 0),
            ])
            for cell in ws[ws.max_row]:
                cell.alignment = self._CENTER
            for col in (6, 7, 8, 9, 10):
                ws.cell(ws.max_row, col).number_format = "#,##0.00"
                ws.cell(ws.max_row, col).alignment     = self._RIGHT

        # ── Totals row ────────────────────────────────────────────────────────
        if rows:
            total_row = ws.max_row + 1
            ws.cell(total_row, 1, "TOTAL")
            ws.cell(total_row, 1).font = self._TOTAL_FONT
            for col_idx, key in enumerate(
                ["taxable_value", "cgst_amount", "sgst_amount", "igst_amount", "grand_total"],
                start=6
            ):
                val = sum(float(r.get(key) or 0) for r in rows)
                cell = ws.cell(total_row, col_idx, val)
                cell.font          = self._TOTAL_FONT
                cell.fill          = self._TOTAL_FILL
                cell.number_format = "#,##0.00"
                cell.alignment     = self._RIGHT

        # ── Column widths ─────────────────────────────────────────────────────
        for col, width in zip("ABCDEFGHIJ", [16, 14, 28, 20, 14, 14, 12, 12, 12, 14]):
            ws.column_dimensions[col].width = width

    def _build_hsn_sheet(self, ws, rows, company, month, year):
        month_label = f"{calendar.month_name[month]} {year}"

        # ── Title block ───────────────────────────────────────────────────────
        ws.merge_cells("A1:G1")
        ws["A1"] = company.get("company_name", "").upper()
        ws["A1"].font      = Font(bold=True, size=13)
        ws["A1"].alignment = self._CENTER

        ws.merge_cells("A2:G2")
        ws["A2"] = f"GSTIN: {company.get('gstin', 'N/A')}"
        ws["A2"].font      = Font(size=10)
        ws["A2"].alignment = self._CENTER

        ws.merge_cells("A3:G3")
        ws["A3"] = f"HSN Summary — {month_label}"
        ws["A3"].font      = self._SECTION_FONT
        ws["A3"].fill      = self._SECTION_FILL
        ws["A3"].alignment = self._CENTER

        ws.append([])  # blank row 4

        # ── Headers ───────────────────────────────────────────────────────────
        headers = [
            "HSN Code", "Total Qty",
            "Taxable Value", "CGST", "SGST", "IGST", "Total",
        ]
        ws.append(headers)
        for cell in ws[5]:
            cell.font      = self._HEADER_FONT
            cell.fill      = self._HEADER_FILL
            cell.alignment = self._CENTER

        # ── Data rows ─────────────────────────────────────────────────────────
        for row in rows:
            ws.append([
                row.get("hsn_code") or "N/A",
                float(row.get("total_qty")     or 0),
                float(row.get("taxable_value") or 0),
                float(row.get("cgst")          or 0),
                float(row.get("sgst")          or 0),
                float(row.get("igst")          or 0),
                float(row.get("total")         or 0),
            ])
            for cell in ws[ws.max_row]:
                cell.alignment = self._CENTER
            for col in range(2, 8):
                ws.cell(ws.max_row, col).number_format = "#,##0.00"
                ws.cell(ws.max_row, col).alignment     = self._RIGHT

        # ── Totals row ────────────────────────────────────────────────────────
        if rows:
            total_row = ws.max_row + 1
            ws.cell(total_row, 1, "TOTAL")
            ws.cell(total_row, 1).font = self._TOTAL_FONT
            for col_idx, key in enumerate(
                ["total_qty", "taxable_value", "cgst", "sgst", "igst", "total"],
                start=2
            ):
                val = sum(float(r.get(key) or 0) for r in rows)
                cell = ws.cell(total_row, col_idx, val)
                cell.font          = self._TOTAL_FONT
                cell.fill          = self._TOTAL_FILL
                cell.number_format = "#,##0.00"
                cell.alignment     = self._RIGHT

        # ── Column widths ─────────────────────────────────────────────────────
        for col, width in zip("ABCDEFG", [14, 12, 16, 12, 12, 12, 14]):
            ws.column_dimensions[col].width = width