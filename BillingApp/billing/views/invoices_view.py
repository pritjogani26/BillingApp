from decimal import Decimal
import datetime
import math
from django.db import transaction
from django.http import HttpResponse
from django.template.loader import render_to_string
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from billing.helper.db import query_all, query_one, insert_returning, execute
from billing.helper.auth import JWTAuthentication
from billing.helper.common_response import CommonResponse
from billing.serializers.invoices_serializer import (
    InvoiceSerializer,
    DashboardStatsSerializer
)


def _next_invoice_number(company_id: int, prefix: str) -> str:
    row = query_one(
        """
        SELECT COUNT(*) AS cnt FROM invoices WHERE company_id = %s
        """,
        (company_id,)
    )
    seq = (row['cnt'] or 0) + 1
    yr = datetime.date.today().year % 100
    return f"{prefix}-{yr:02d}-{seq:04d}"


def _post_ledger(company_id, customer_id, ref_type, ref_id, date,
                 debit, credit, remarks, user_id):
    """Compute running balance and insert ledger entry."""
    last = query_one(
        """
        SELECT balance_after_transaction FROM ledger_entries
        WHERE  company_id = %s AND customer_id = %s
        ORDER  BY entry_id DESC LIMIT 1
        """,
        (company_id, customer_id)
    )
    prev_balance = Decimal(str(last['balance_after_transaction'])) if last else Decimal('0.00')
    new_balance  = prev_balance + Decimal(str(debit)) - Decimal(str(credit))

    insert_returning(
        """
        INSERT INTO ledger_entries
            (company_id, customer_id, transaction_type, reference_type,
             reference_id, transaction_date, debit_amount, credit_amount,
             balance_after_transaction, remarks, created_at)
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


class InvoiceListView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = InvoiceSerializer

    def get(self, request):
        company_id = request.user.company_id

        customer_id    = request.query_params.get('customer_id')
        payment_status = request.query_params.get('payment_status')
        invoice_type   = request.query_params.get('invoice_type')
        from_date      = request.query_params.get('from_date')
        to_date        = request.query_params.get('to_date')

        where  = ["i.company_id = %s", "1=1"]
        params = [company_id]

        if customer_id:
            where.append("i.customer_id = %s");    params.append(customer_id)
        if payment_status:
            where.append("i.payment_status = %s"); params.append(payment_status)
        if invoice_type:
            where.append("i.invoice_type = %s");   params.append(invoice_type)
        if from_date:
            where.append("i.invoice_date >= %s");  params.append(from_date)
        if to_date:
            where.append("i.invoice_date <= %s");  params.append(to_date)

        rows = query_all(
            f"""
            SELECT i.invoice_id, i.company_id, i.customer_id, i.invoice_number,
                   i.invoice_type, i.invoice_date, i.subtotal, i.cgst_amount,
                   i.sgst_amount, i.igst_amount, i.discount_amount, i.round_off,
                   i.grand_total, i.due_amount, i.payment_status, i.notes,
                   i.created_at, i.created_by, i.updated_at, i.updated_by,
                   c.company_name AS customer_name,
                   c.mobile       AS customer_mobile
            FROM   invoices i
            JOIN   customers c ON c.customer_id = i.customer_id
            WHERE  {' AND '.join(where)}
            ORDER  BY i.invoice_date DESC, i.invoice_id DESC
            """,
            tuple(params)
        )
        serializer = self.get_serializer(data=rows, many=True)
        serializer.is_valid(raise_exception=True)
        return CommonResponse.success(
            message="Invoices fetched successfully",
            data={
                'invoices': serializer.validated_data,
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
        items = request.data.get('items', [])

        if not items:
            return CommonResponse.error(
                message="Invoice must have at least one item",
                status_code=status.HTTP_400_BAD_REQUEST
            )

        company = query_one(
            "SELECT invoice_prefix FROM company_profile WHERE company_id = %s",
            (company_id,)
        )
        prefix = (company or {}).get('invoice_prefix', 'INV')

        try:
            with transaction.atomic():
                invoice_number = _next_invoice_number(company_id, prefix)
                invoice_type   = d.get('invoice_type', 'GST')
                is_gst         = invoice_type == 'GST'

                subtotal         = Decimal('0.00')
                total_cgst       = Decimal('0.00')
                total_sgst       = Decimal('0.00')
                total_igst       = Decimal('0.00')
                discount_amount  = Decimal(str(d.get('discount_amount', 0)))

                # Validate customer
                customer = query_one(
                    "SELECT customer_id, state FROM customers WHERE customer_id = %s AND company_id = %s AND status != 'D'",
                    (d.get('customer_id'), company_id)
                )
                if not customer:
                    return CommonResponse.error(
                        message="Customer not found or is inactive",
                        status_code=status.HTTP_400_BAD_REQUEST
                    )

                company_state = query_one(
                    "SELECT state FROM company_profile WHERE company_id = %s", (company_id,)
                )
                is_interstate = (customer.get('state', '').lower() !=
                                 (company_state or {}).get('state', '').lower())

                computed_items = []
                for item in items:
                    qty        = Decimal(str(item.get('quantity', 1.00)))
                    unit_price = Decimal(str(item.get('unit_price', 0.00)))
                    gst_pct    = Decimal(str(item.get('gst_percentage', 0.00))) if is_gst else Decimal('0.00')
                    taxable    = qty * unit_price
                    half_gst   = gst_pct / 2

                    if is_gst and is_interstate:
                        igst = (taxable * gst_pct / 100).quantize(Decimal('0.01'))
                        cgst = sgst = Decimal('0.00')
                    elif is_gst:
                        cgst = (taxable * half_gst / 100).quantize(Decimal('0.01'))
                        sgst = (taxable * half_gst / 100).quantize(Decimal('0.01'))
                        igst = Decimal('0.00')
                    else:
                        cgst = sgst = igst = Decimal('0.00')

                    line_total = taxable + cgst + sgst + igst
                    subtotal   += taxable
                    total_cgst += cgst
                    total_sgst += sgst
                    total_igst += igst

                    prod_name = item.get('product_name')
                    if not prod_name and item.get('product_id'):
                        prod_row = query_one("SELECT product_name FROM products WHERE product_id = %s", (item.get('product_id'),))
                        prod_name = prod_row['product_name'] if prod_row else ''

                    computed_items.append({
                        'product_id':     item.get('product_id') if item.get('product_id') else None,
                        'product_name':   prod_name,
                        'quantity':       qty,
                        'unit_price':     unit_price,
                        'gst_percentage': gst_pct,
                        'taxable_amount': taxable,
                        'cgst_amount':    cgst,
                        'sgst_amount':    sgst,
                        'igst_amount':    igst,
                        'total_amount':   line_total,
                    })

                grand_total = (subtotal + total_cgst + total_sgst + total_igst
                               - discount_amount)
                rounded     = round(grand_total)
                round_off   = Decimal(str(rounded)) - grand_total
                grand_total = grand_total + round_off

                invoice = insert_returning(
                    """
                    INSERT INTO invoices
                        (company_id, customer_id, invoice_number, invoice_type,
                         invoice_date, subtotal, cgst_amount, sgst_amount,
                         igst_amount, discount_amount, round_off,
                         grand_total, due_amount, payment_status,
                         notes, created_at, created_by, updated_at, updated_by)
                    VALUES
                        (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'PENDING',%s,NOW(),%s,NOW(),%s)
                    RETURNING *
                    """,
                    (
                        company_id, d.get('customer_id'), invoice_number,
                        invoice_type, d.get('invoice_date'),
                        subtotal, total_cgst, total_sgst, total_igst,
                        discount_amount, round_off, grand_total, grand_total,
                        d.get('notes', ''), user_id, user_id,
                    )
                )
                invoice_id = invoice['invoice_id']

                for ci in computed_items:
                    insert_returning(
                        """
                        INSERT INTO invoice_items
                            (invoice_id, company_id, product_id, product_name, quantity,
                             unit_price, gst_percentage, taxable_amount,
                             cgst_amount, sgst_amount, igst_amount, total_amount, status, created_at)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'A',NOW())
                        RETURNING item_id
                        """,
                        (
                            invoice_id, company_id, ci['product_id'],
                            ci['product_name'],    ci['quantity'],
                            ci['unit_price'],       ci['gst_percentage'],
                            ci['taxable_amount'],   ci['cgst_amount'],
                            ci['sgst_amount'],      ci['igst_amount'],
                            ci['total_amount'],
                        )
                    )

                _post_ledger(
                    company_id, d.get('customer_id'),
                    'INVOICE', invoice_id,
                    d.get('invoice_date'),
                    grand_total, Decimal('0.00'),
                    f"Invoice {invoice_number} raised",
                    user_id,
                )
        except Exception as e:
            return CommonResponse.error(
                message=f"Failed to create invoice: {str(e)}",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Retrieve full customer info to serialize back nicely
        full_inv = query_one(
            """
            SELECT i.*,
                   c.company_name AS customer_name,
                   c.mobile       AS customer_mobile
            FROM   invoices i
            JOIN   customers c ON c.customer_id = i.customer_id
            WHERE  i.invoice_id = %s
            """,
            (invoice_id,)
        )

        out_serializer = self.get_serializer(data=full_inv)
        out_serializer.is_valid(raise_exception=True)

        return CommonResponse.success(
            message="Invoice created successfully",
            data=out_serializer.validated_data,
            status_code=status.HTTP_201_CREATED
        )


class InvoiceDetailView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = InvoiceSerializer

    def get(self, request, invoice_id):
        company_id = request.user.company_id

        inv = query_one(
            """
            SELECT i.*,
                   c.company_name AS customer_name,
                   c.contact_person, c.address AS customer_address,
                   c.city AS customer_city, c.state AS customer_state,
                   c.gstin AS customer_gstin, c.mobile AS customer_mobile,
                   c.email AS customer_email
            FROM   invoices i
            JOIN   customers c ON c.customer_id = i.customer_id
            WHERE  i.invoice_id = %s AND i.company_id = %s
            """,
            (invoice_id, company_id)
        )
        if not inv:
            return CommonResponse.error(
                message="Invoice not found",
                status_code=status.HTTP_404_NOT_FOUND
            )

        items = query_all(
            """
            SELECT ii.*, p.hsn_code, p.description
            FROM   invoice_items ii
            LEFT   JOIN products p ON p.product_id = ii.product_id
            WHERE  ii.invoice_id = %s
            ORDER  BY ii.item_id
            """,
            (invoice_id,)
        )
        inv['items'] = items

        serializer = self.get_serializer(data=inv)
        serializer.is_valid(raise_exception=True)

        return CommonResponse.success(
            message="Invoice details fetched successfully",
            data=serializer.validated_data
        )


# ── Amount-in-words helpers ──────────────────────────────────────────────────
_ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
]
_tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']


def _to_words(num: int) -> str:
    if num == 0:     return 'Zero'
    if num < 20:     return _ones[num]
    if num < 100:    return _tens[num // 10] + (' ' + _ones[num % 10] if num % 10 else '')
    if num < 1000:   return _ones[num // 100] + ' Hundred' + (' ' + _to_words(num % 100) if num % 100 else '')
    if num < 100000: return _to_words(num // 1000) + ' Thousand' + (' ' + _to_words(num % 1000) if num % 1000 else '')
    if num < 10000000: return _to_words(num // 100000) + ' Lakh' + (' ' + _to_words(num % 100000) if num % 100000 else '')
    return _to_words(num // 10000000) + ' Crore' + (' ' + _to_words(num % 10000000) if num % 10000000 else '')


def _amount_in_words(amount: float) -> str:
    rupees = int(amount)
    paise  = round((amount - rupees) * 100)
    result = 'Rs. ' + _to_words(rupees)
    if paise > 0:
        result += ' And ' + _to_words(paise) + ' Paise'
    return result + ' Only'


class InvoiceDownloadView(APIView):
    """Return a PDF binary for the given invoice (generated server-side via WeasyPrint)."""
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]

    def get(self, request, invoice_id):
        company_id = request.user.company_id

        # ── Fetch invoice + items ─────────────────────────────────────────────
        inv = query_one(
            """
            SELECT i.*,
                   c.company_name AS customer_name,
                   c.contact_person, c.address AS customer_address,
                   c.city AS customer_city, c.state AS customer_state,
                   c.gstin AS customer_gstin, c.mobile AS customer_mobile,
                   c.email AS customer_email
            FROM   invoices i
            JOIN   customers c ON c.customer_id = i.customer_id
            WHERE  i.invoice_id = %s AND i.company_id = %s
            """,
            (invoice_id, company_id)
        )
        if not inv:
            return CommonResponse.error(
                message='Invoice not found',
                status_code=status.HTTP_404_NOT_FOUND
            )

        items = query_all(
            """
            SELECT ii.*, p.hsn_code
            FROM   invoice_items ii
            LEFT   JOIN products p ON p.product_id = ii.product_id
            WHERE  ii.invoice_id = %s
            ORDER  BY ii.item_id
            """,
            (invoice_id,)
        )

        # ── Fetch company profile ─────────────────────────────────────────────
        company = query_one(
            "SELECT * FROM company_profile WHERE company_id = %s",
            (company_id,)
        ) or {}

        # ── Computed values ───────────────────────────────────────────────────
        is_gst       = inv.get('invoice_type') == 'GST'
        igst_total   = float(inv.get('igst_amount') or 0)
        is_interstate = is_gst and igst_total > 0

        subtotal  = float(inv.get('subtotal')       or 0)
        cgst      = float(inv.get('cgst_amount')    or 0)
        sgst      = float(inv.get('sgst_amount')    or 0)
        igst      = float(inv.get('igst_amount')    or 0)
        discount  = float(inv.get('discount_amount')or 0)
        round_off = float(inv.get('round_off')      or 0)
        grand_total = float(inv.get('grand_total')  or 0)

        gst_pct   = float(items[0].get('gst_percentage', 0)) if items else 0
        half_pct  = gst_pct / 2

        # Build GST note
        if is_gst and is_interstate:
            gst_note = f'IGST {igst:.2f} @ {gst_pct}%  |  THANKS CUSTOMER'
        elif is_gst and (cgst > 0 or sgst > 0):
            gst_note = (f'GST {subtotal:.2f}*{half_pct}+{half_pct}%='
                        f'{cgst:.2f}SGST+{sgst:.2f}CGST,  THANKS CUSTOMER')
        else:
            gst_note = 'NON-GST INVOICE  |  THANKS CUSTOMER'

        # Format date
        raw_date = inv.get('invoice_date')
        if raw_date:
            if hasattr(raw_date, 'strftime'):
                date_fmt = raw_date.strftime('%d/%m/%Y')
            else:
                try:
                    dt = datetime.datetime.strptime(str(raw_date)[:10], '%Y-%m-%d')
                    date_fmt = dt.strftime('%d/%m/%Y')
                except Exception:
                    date_fmt = str(raw_date)
        else:
            date_fmt = ''

        # Enrich items with half_gst_pct for template
        for item in items:
            item['half_gst_pct'] = float(item.get('gst_percentage', 0)) / 2

        # Empty filler rows
        empty_count = max(0, 12 - len(items))
        empty_rows  = range(empty_count)

        context = {
            'invoice':          inv,
            'company':          company,
            'items':            items,
            'empty_rows':       empty_rows,
            'is_gst':           is_gst,
            'is_interstate':    is_interstate,
            'invoice_type_label': 'GST Invoice' if is_gst else 'Non-GST Invoice',
            'invoice_date_fmt': date_fmt,
            'subtotal':         subtotal,
            'cgst':             cgst,
            'sgst':             sgst,
            'igst':             igst,
            'discount':         discount,
            'round_off':        round_off,
            'grand_total':      grand_total,
            'gst_pct':          gst_pct,
            'half_gst_pct':     half_pct,
            'gst_note':         gst_note,
            'amount_in_words':  _amount_in_words(grand_total),
        }

        # ── Render HTML → PDF ─────────────────────────────────────────────────
        try:
            from weasyprint import HTML
            html_string = render_to_string('invoice_pdf.html', context)
            pdf_bytes   = HTML(string=html_string, base_url=request.build_absolute_uri('/')).write_pdf()
        except Exception as e:
            return CommonResponse.error(
                message=f'PDF generation failed: {str(e)}',
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        invoice_number = inv.get('invoice_number', str(invoice_id))
        filename = f'{invoice_number}.pdf'

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['Content-Length'] = len(pdf_bytes)
        return response


class DashboardStatsView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = DashboardStatsSerializer

    def get(self, request):
        company_id = request.user.company_id
        stats = query_one(
            """
            SELECT
                COUNT(*)::int                                        AS total_invoices,
                COALESCE(SUM(grand_total), 0.00)                     AS total_billed,
                COALESCE(SUM(CASE WHEN payment_status = 'PENDING'
                                  THEN due_amount END), 0.00)        AS total_pending,
                COALESCE(SUM(grand_total - due_amount), 0.00)        AS total_collected,
                COUNT(CASE WHEN payment_status = 'PENDING' THEN 1 END)::int AS pending_count
            FROM   invoices
            WHERE  company_id = %s
              AND  invoice_date >= date_trunc('month', CURRENT_DATE)
            """,
            (company_id,)
        )
        serializer = self.get_serializer(data=stats)
        serializer.is_valid(raise_exception=True)
        return CommonResponse.success(
            message="Dashboard stats fetched successfully",
            data=serializer.validated_data
        )