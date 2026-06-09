# invoices_view.py
from decimal import Decimal
import datetime

from django.db import transaction
from django.http import HttpResponse
from django.template.loader import render_to_string
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView
import os
from django.conf import settings

from accounts.common.db               import query_all, query_one, insert_returning, execute
from accounts.common.auth             import JWTAuthentication
from accounts.common.responses        import common_response, StatusCode
from accounts.common.messages         import get_message
from accounts.serializers.invoices_serializer import (
    InvoiceSerializer,
    DashboardStatsSerializer,
)

# ── Helpers ──────────────────────────────────────────────────────────────────

def _financial_year(date: datetime.date) -> str:
    """Returns financial year string e.g. '2026-27' for any date in FY 2026-27."""
    if date.month >= 4:
        return f"{date.year}-{str(date.year + 1)[-2:]}"
    return f"{date.year - 1}-{str(date.year)[-2:]}"


def _next_invoice_number(invoice_type: str) -> str:
    """
    Atomically increments the correct sequence and returns a formatted number.
    TAX    → T-MMYY-00001
    RETAIL → R-MMYY-00001
    """
    sequence_name = 'TAX_INVOICE' if invoice_type == 'TAX' else 'RETAIL_INVOICE'
    prefix        = 'T'           if invoice_type == 'TAX' else 'R'

    row = query_one(
        """
        UPDATE invoice_sequences
        SET    next_number = next_number + 1
        WHERE  sequence_name = %s
        RETURNING next_number - 1 AS current_number
        """,
        (sequence_name,)
    )
    seq    = row['current_number']
    today  = datetime.date.today()
    mmyy   = f"{today.month:02d}{str(today.year)[-2:]}"
    return f"{prefix}-{mmyy}-{seq:05d}"


def _due_date(invoice_date: datetime.date) -> datetime.date:
    """Returns due date exactly one month after invoice date."""
    month = invoice_date.month + 1
    year  = invoice_date.year + (1 if month > 12 else 0)
    month = month if month <= 12 else 1
    # Clamp day for short months (e.g. Jan 31 → Feb 28)
    import calendar
    last_day = calendar.monthrange(year, month)[1]
    day      = min(invoice_date.day, last_day)
    return datetime.date(year, month, day)


def _is_gujarat(state: str) -> bool:
    return (state or '').strip().lower() in ('gujarat', 'gj')


def _post_ledger(company_id, customer_id, ref_type, ref_id,
                 date, debit, credit, remarks):
    """Compute running balance and insert ledger entry."""
    last = query_one(
        """
        SELECT running_balance FROM ledger_entries
        WHERE  company_id = %s AND customer_id = %s
        ORDER  BY entry_id DESC LIMIT 1
        """,
        (company_id, customer_id)
    )
    prev_balance = Decimal(str(last['running_balance'])) if last else Decimal('0.00')
    new_balance  = prev_balance + Decimal(str(debit)) - Decimal(str(credit))

    insert_returning(
        """
        INSERT INTO ledger_entries
            (company_id, customer_id, transaction_type, reference_type,
             reference_id, transaction_date, debit_amount, credit_amount,
             running_balance, remarks, created_at)
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


def recompute_customer_ledger(company_id, customer_id):
    """Recomputes running balances for all ledger entries of a specific customer chronologically."""
    entries = query_all(
        """
        SELECT entry_id, debit_amount, credit_amount
        FROM   ledger_entries
        WHERE  company_id = %s AND customer_id = %s
        ORDER  BY transaction_date ASC, entry_id ASC
        """,
        (company_id, customer_id)
    )
    running = Decimal('0.00')
    for entry in entries:
        running += Decimal(str(entry['debit_amount'])) - Decimal(str(entry['credit_amount']))
        execute(
            """
            UPDATE ledger_entries
            SET    running_balance = %s
            WHERE  entry_id = %s
            """,
            (running, entry['entry_id'])
        )



# ── Amount in words ──────────────────────────────────────────────────────────

_ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
]
_tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']


def _to_words(num: int) -> str:
    if num == 0:       return 'Zero'
    if num < 20:       return _ones[num]
    if num < 100:      return _tens[num // 10] + (' ' + _ones[num % 10] if num % 10 else '')
    if num < 1_000:    return _ones[num // 100] + ' Hundred' + (' ' + _to_words(num % 100) if num % 100 else '')
    if num < 100_000:  return _to_words(num // 1_000) + ' Thousand' + (' ' + _to_words(num % 1_000) if num % 1_000 else '')
    if num < 10_000_000: return _to_words(num // 100_000) + ' Lakh' + (' ' + _to_words(num % 100_000) if num % 100_000 else '')
    return _to_words(num // 10_000_000) + ' Crore' + (' ' + _to_words(num % 10_000_000) if num % 10_000_000 else '')


def _amount_in_words(amount: float) -> str:
    rupees = int(amount)
    paise  = round((amount - rupees) * 100)
    result = 'Rs. ' + _to_words(rupees)
    if paise:
        result += ' And ' + _to_words(paise) + ' Paise'
    return result + ' Only'


# ── Views ─────────────────────────────────────────────────────────────────────

class InvoiceListView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = InvoiceSerializer

    def get(self, request: Request):
        company_id = request.user.company_id

        customer_id    = request.query_params.get('customer_id')
        payment_status = request.query_params.get('payment_status')
        invoice_type   = request.query_params.get('invoice_type')
        from_date      = request.query_params.get('from_date')
        to_date        = request.query_params.get('to_date')

        where  = ["i.company_id = %s", "i.status = 'A'"]
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
                   i.invoice_type, i.invoice_date, i.financial_year, i.due_date,
                   i.subtotal, i.cgst_amount, i.sgst_amount, i.igst_amount,
                   i.discount_amount, i.round_off, i.grand_total, i.due_amount,
                   i.payment_status, i.status, i.notes,
                   i.created_at, i.created_by, i.updated_at, i.updated_by,
                   c.customer_name,
                   c.mobile AS customer_mobile
            FROM   invoices i
            JOIN   customers c ON c.customer_id = i.customer_id
            WHERE  {' AND '.join(where)}
            ORDER  BY i.invoice_date DESC, i.invoice_id DESC
            """,
            tuple(params)
        )

        serializer = self.get_serializer(rows, many=True)
        return common_response(
            StatusCode.OK.value,
            "Invoices fetched successfully",
            {
                'count':    len(serializer.data),
                'invoices': serializer.data,
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

        d     = serializer.validated_data
        items = request.data.get('items', [])

        if not items:
            return common_response(
                StatusCode.BAD_REQUEST.value,
                "Invoice must have at least one item."
            )

        invoice_type = d['invoice_type']           # 'TAX' or 'RETAIL'
        is_tax       = invoice_type == 'TAX'
        invoice_date = d['invoice_date']

        try:
            with transaction.atomic():

                # ── Validate customer ─────────────────────────────────────
                customer = query_one(
                    """
                    SELECT customer_id, customer_name, state
                    FROM   customers
                    WHERE  customer_id = %s AND company_id = %s AND status != 'D'
                    """,
                    (d['customer_id'], company_id)
                )
                if not customer:
                    return common_response(
                        StatusCode.BAD_REQUEST.value,
                        get_message("NOT_FOUND", "Customer")
                    )

                # ── GST logic: Gujarat → CGST+SGST, else IGST ────────────
                use_cgst_sgst = is_tax and _is_gujarat(customer['state'])
                use_igst      = is_tax and not _is_gujarat(customer['state'])

                # ── Compute line items ────────────────────────────────────
                subtotal        = Decimal('0.00')
                total_cgst      = Decimal('0.00')
                total_sgst      = Decimal('0.00')
                total_igst      = Decimal('0.00')
                discount_amount = Decimal(str(d.get('discount_amount', 0)))
                computed_items  = []

                for item in items:
                    qty        = Decimal(str(item.get('quantity',   1)))
                    unit_price = Decimal(str(item.get('unit_price', 0)))
                    gst_pct    = Decimal(str(item.get('gst_percentage', 0))) if is_tax else Decimal('0.00')
                    taxable    = qty * unit_price

                    if use_igst:
                        igst = (taxable * gst_pct / 100).quantize(Decimal('0.01'))
                        cgst = sgst = Decimal('0.00')
                    elif use_cgst_sgst:
                        half = gst_pct / 2
                        cgst = (taxable * half / 100).quantize(Decimal('0.01'))
                        sgst = (taxable * half / 100).quantize(Decimal('0.01'))
                        igst = Decimal('0.00')
                    else:
                        cgst = sgst = igst = Decimal('0.00')

                    line_total = taxable + cgst + sgst + igst
                    subtotal   += taxable
                    total_cgst += cgst
                    total_sgst += sgst
                    total_igst += igst

                    # Resolve product_name
                    prod_name = item.get('product_name', '').strip()
                    hsn_code  = item.get('hsn_code', '')
                    if not prod_name and item.get('product_id'):
                        prod_row  = query_one(
                            "SELECT product_name, hsn_code FROM products WHERE product_id = %s",
                            (item['product_id'],)
                        )
                        if prod_row:
                            prod_name = prod_row['product_name']
                            hsn_code  = hsn_code or prod_row['hsn_code']

                    computed_items.append({
                        'product_id':     item.get('product_id') or None,
                        'product_name':   prod_name,
                        'hsn_code':       hsn_code,
                        'quantity':       qty,
                        'unit_price':     unit_price,
                        'gst_percentage': gst_pct,
                        'taxable_amount': taxable,
                        'cgst_amount':    cgst,
                        'sgst_amount':    sgst,
                        'igst_amount':    igst,
                        'total_amount':   line_total,
                    })

                # ── Totals ────────────────────────────────────────────────
                pre_round   = subtotal + total_cgst + total_sgst + total_igst - discount_amount
                rounded     = Decimal(str(round(pre_round)))
                round_off   = rounded - pre_round
                grand_total = rounded

                invoice_number = _next_invoice_number(invoice_type)
                financial_year = _financial_year(invoice_date)
                due_date       = _due_date(invoice_date)

                # ── Insert invoice ────────────────────────────────────────
                invoice = insert_returning(
                    """
                    INSERT INTO invoices
                        (company_id, customer_id, invoice_number, invoice_type,
                         invoice_date, financial_year, due_date,
                         subtotal, cgst_amount, sgst_amount, igst_amount,
                         discount_amount, round_off, grand_total, due_amount,
                         payment_status, status, notes,
                         created_at, created_by)
                    VALUES
                        (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                         'PENDING','A',%s,NOW(),%s)
                    RETURNING *
                    """,
                    (
                        company_id,        d['customer_id'],
                        invoice_number,    invoice_type,
                        invoice_date,      financial_year,    due_date,
                        subtotal,          total_cgst,        total_sgst,
                        total_igst,        discount_amount,   round_off,
                        grand_total,       grand_total,
                        d.get('notes', ''), user_id,
                    )
                )
                invoice_id = invoice['invoice_id']

                # ── Insert items ──────────────────────────────────────────
                for ci in computed_items:
                    insert_returning(
                        """
                        INSERT INTO invoice_items
                            (invoice_id, company_id, product_id, product_name, hsn_code,
                             quantity, unit_price, gst_percentage, taxable_amount,
                             cgst_amount, sgst_amount, igst_amount, total_amount,
                             status, created_at)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'A',NOW())
                        RETURNING item_id
                        """,
                        (
                            invoice_id,        company_id,
                            ci['product_id'],  ci['product_name'],   ci['hsn_code'],
                            ci['quantity'],    ci['unit_price'],      ci['gst_percentage'],
                            ci['taxable_amount'], ci['cgst_amount'],  ci['sgst_amount'],
                            ci['igst_amount'], ci['total_amount'],
                        )
                    )

                # ── Ledger entry ──────────────────────────────────────────
                _post_ledger(
                    company_id,       d['customer_id'],
                    'INVOICE',        invoice_id,
                    invoice_date,
                    grand_total,      Decimal('0.00'),
                    f"Invoice {invoice_number} raised",
                )

        except Exception as e:
            return common_response(
                StatusCode.INTERNAL_SERVER_ERROR.value,
                f"Failed to create invoice: {str(e)}"
            )

        full_inv = query_one(
            """
            SELECT i.*,
                   c.customer_name,
                   c.mobile AS customer_mobile
            FROM   invoices i
            JOIN   customers c ON c.customer_id = i.customer_id
            WHERE  i.invoice_id = %s
            """,
            (invoice_id,)
        )

        return common_response(
            StatusCode.CREATED.value,
            get_message("CREATED", "Invoice"),
            self.get_serializer(full_inv).data
        )


class InvoiceDetailView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = InvoiceSerializer

    def get(self, request: Request, invoice_id: int):
        company_id = request.user.company_id

        inv = query_one(
            """
            SELECT i.*,
                   c.customer_name,
                   c.contact_person,
                   c.address   AS customer_address,
                   c.city      AS customer_city,
                   c.state     AS customer_state,
                   c.gstin     AS customer_gstin,
                   c.mobile    AS customer_mobile,
                   c.email     AS customer_email
            FROM   invoices i
            JOIN   customers c ON c.customer_id = i.customer_id
            WHERE  i.invoice_id = %s AND i.company_id = %s AND i.status = 'A'
            """,
            (invoice_id, company_id)
        )
        if not inv:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Invoice")
            )

        items = query_all(
            """
            SELECT ii.*, p.description
            FROM   invoice_items ii
            LEFT   JOIN products p ON p.product_id = ii.product_id
            WHERE  ii.invoice_id = %s
            ORDER  BY ii.item_id
            """,
            (invoice_id,)
        )
        inv['items'] = items

        return common_response(
            StatusCode.OK.value,
            "Invoice fetched successfully",
            self.get_serializer(inv).data
        )

    def put(self, request: Request, invoice_id: int):
        company_id = request.user.company_id
        user_id    = request.user.user_id

        # ── 1. Fetch existing invoice ─────────────────────────────────────────
        existing_invoice = query_one(
            """
            SELECT invoice_id, customer_id, invoice_number, due_amount, grand_total, status
            FROM   invoices
            WHERE  invoice_id = %s AND company_id = %s AND status = 'A'
            """,
            (invoice_id, company_id)
        )
        if not existing_invoice:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Invoice")
            )

        # ── 2. Validate request payload ────────────────────────────────────────
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return common_response(
                StatusCode.BAD_REQUEST.value,
                get_message("INVALID_REQUEST"),
                serializer.errors
            )

        d     = serializer.validated_data
        items = request.data.get('items', [])

        if not items:
            return common_response(
                StatusCode.BAD_REQUEST.value,
                "Invoice must have at least one item."
            )

        # ── 3. Check payments already recorded ──────────────────────────────────
        pay_row = query_one(
            """
            SELECT COALESCE(SUM(amount), 0.00) AS total_paid
            FROM   payments
            WHERE  invoice_id = %s AND company_id = %s
            """,
            (invoice_id, company_id)
        )
        total_paid = Decimal(str(pay_row['total_paid'])) if pay_row else Decimal('0.00')

        # ── 4. Customer change restriction ──────────────────────────────────────
        old_customer_id = existing_invoice['customer_id']
        new_customer_id = d['customer_id']
        if old_customer_id != new_customer_id and total_paid > 0:
            return common_response(
                StatusCode.BAD_REQUEST.value,
                f"Cannot change customer because payments (Rs. {total_paid:.2f}) have already been recorded for this invoice."
            )

        # ── 5. Validate customer exists ─────────────────────────────────────────
        customer = query_one(
            """
            SELECT customer_id, customer_name, state
            FROM   customers
            WHERE  customer_id = %s AND company_id = %s AND status != 'D'
            """,
            (new_customer_id, company_id)
        )
        if not customer:
            return common_response(
                StatusCode.BAD_REQUEST.value,
                get_message("NOT_FOUND", "Customer")
            )

        invoice_type = d['invoice_type']           # 'TAX' or 'RETAIL'
        is_tax       = invoice_type == 'TAX'
        invoice_date = d['invoice_date']

        # ── GST logic: Gujarat → CGST+SGST, else IGST ────────────
        use_cgst_sgst = is_tax and _is_gujarat(customer['state'])
        use_igst      = is_tax and not _is_gujarat(customer['state'])

        # ── 6. Compute line items ────────────────────────────────────
        subtotal        = Decimal('0.00')
        total_cgst      = Decimal('0.00')
        total_sgst      = Decimal('0.00')
        total_igst      = Decimal('0.00')
        discount_amount = Decimal(str(d.get('discount_amount', 0)))
        computed_items  = []

        for item in items:
            qty        = Decimal(str(item.get('quantity',   1)))
            unit_price = Decimal(str(item.get('unit_price', 0)))
            gst_pct    = Decimal(str(item.get('gst_percentage', 0))) if is_tax else Decimal('0.00')
            taxable    = qty * unit_price

            if use_igst:
                igst = (taxable * gst_pct / 100).quantize(Decimal('0.01'))
                cgst = sgst = Decimal('0.00')
            elif use_cgst_sgst:
                half = gst_pct / 2
                cgst = (taxable * half / 100).quantize(Decimal('0.01'))
                sgst = (taxable * half / 100).quantize(Decimal('0.01'))
                igst = Decimal('0.00')
            else:
                cgst = sgst = igst = Decimal('0.00')

            line_total = taxable + cgst + sgst + igst
            subtotal   += taxable
            total_cgst += cgst
            total_sgst += sgst
            total_igst += igst

            # Resolve product_name
            prod_name = item.get('product_name', '').strip()
            hsn_code  = item.get('hsn_code', '')
            if not prod_name and item.get('product_id'):
                prod_row  = query_one(
                    "SELECT product_name, hsn_code FROM products WHERE product_id = %s",
                    (item['product_id'],)
                )
                if prod_row:
                    prod_name = prod_row['product_name']
                    hsn_code  = hsn_code or prod_row['hsn_code']

            computed_items.append({
                'product_id':     item.get('product_id') or None,
                'product_name':   prod_name,
                'hsn_code':       hsn_code,
                'quantity':       qty,
                'unit_price':     unit_price,
                'gst_percentage': gst_pct,
                'taxable_amount': taxable,
                'cgst_amount':    cgst,
                'sgst_amount':    sgst,
                'igst_amount':    igst,
                'total_amount':   line_total,
            })

        # ── Totals ────────────────────────────────────────────────
        pre_round   = subtotal + total_cgst + total_sgst + total_igst - discount_amount
        rounded     = Decimal(str(round(pre_round)))
        round_off   = rounded - pre_round
        grand_total = rounded

        # ── 7. Verify new grand total >= payments received ────────────────────
        if grand_total < total_paid:
            return common_response(
                StatusCode.BAD_REQUEST.value,
                f"New grand total ({grand_total:.2f}) cannot be less than total payments already received ({total_paid:.2f}) for this invoice."
            )

        new_due = grand_total - total_paid
        if new_due < Decimal('0.01'):
            new_due = Decimal('0.00')
        new_status = 'PAID' if new_due == Decimal('0.00') else ('PARTIAL' if total_paid > 0 else 'PENDING')

        financial_year = _financial_year(invoice_date)
        due_date       = d.get('due_date') or _due_date(invoice_date)

        try:
            with transaction.atomic():
                # ── 8. Update invoices table ──────────────────────────────────
                execute(
                    """
                    UPDATE invoices
                    SET    customer_id = %s,
                           invoice_type = %s,
                           invoice_date = %s,
                           financial_year = %s,
                           due_date = %s,
                           subtotal = %s,
                           cgst_amount = %s,
                           sgst_amount = %s,
                           igst_amount = %s,
                           discount_amount = %s,
                           round_off = %s,
                           grand_total = %s,
                           due_amount = %s,
                           payment_status = %s,
                           notes = %s,
                           updated_at = NOW(),
                           updated_by = %s
                    WHERE  invoice_id = %s AND company_id = %s
                    """,
                    (
                        new_customer_id,
                        invoice_type,
                        invoice_date,
                        financial_year,
                        due_date,
                        subtotal,
                        total_cgst,
                        total_sgst,
                        total_igst,
                        discount_amount,
                        round_off,
                        grand_total,
                        new_due,
                        new_status,
                        d.get('notes', ''),
                        user_id,
                        invoice_id,
                        company_id,
                    )
                )

                # ── 9. Recreate line items ────────────────────────────────────
                execute("DELETE FROM invoice_items WHERE invoice_id = %s", (invoice_id,))
                for ci in computed_items:
                    insert_returning(
                        """
                        INSERT INTO invoice_items
                            (invoice_id, company_id, product_id, product_name, hsn_code,
                             quantity, unit_price, gst_percentage, taxable_amount,
                             cgst_amount, sgst_amount, igst_amount, total_amount,
                             status, created_at)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'A',NOW())
                        RETURNING item_id
                        """,
                        (
                            invoice_id,        company_id,
                            ci['product_id'],  ci['product_name'],   ci['hsn_code'],
                            ci['quantity'],    ci['unit_price'],      ci['gst_percentage'],
                            ci['taxable_amount'], ci['cgst_amount'],  ci['sgst_amount'],
                            ci['igst_amount'], ci['total_amount'],
                        )
                    )

                # ── 10. Update ledger entry ────────────────────────────────────
                ledger_entry = query_one(
                    """
                    SELECT entry_id, customer_id
                    FROM   ledger_entries
                    WHERE  reference_type = 'INVOICE' AND reference_id = %s AND company_id = %s
                    """,
                    (invoice_id, company_id)
                )

                if ledger_entry:
                    if ledger_entry['customer_id'] != new_customer_id:
                        # Customer changed: delete old ledger entry, insert new one
                        execute("DELETE FROM ledger_entries WHERE entry_id = %s", (ledger_entry['entry_id'],))
                        insert_returning(
                            """
                            INSERT INTO ledger_entries
                                (company_id, customer_id, transaction_type, reference_type,
                                 reference_id, transaction_date, debit_amount, credit_amount,
                                 running_balance, remarks, created_at)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                            RETURNING entry_id
                            """,
                            (
                                company_id, new_customer_id,
                                'DEBIT', 'INVOICE', invoice_id, invoice_date,
                                grand_total, Decimal('0.00'),
                                Decimal('0.00'), f"Invoice {existing_invoice['invoice_number']} raised",
                            )
                        )
                        # Recompute both ledgers
                        recompute_customer_ledger(company_id, ledger_entry['customer_id'])
                        recompute_customer_ledger(company_id, new_customer_id)
                    else:
                        # Customer didn't change: update existing ledger entry
                        execute(
                            """
                            UPDATE ledger_entries
                            SET    transaction_date = %s,
                                   debit_amount = %s,
                                   remarks = %s
                            WHERE  entry_id = %s
                            """,
                            (
                                invoice_date,
                                grand_total,
                                f"Invoice {existing_invoice['invoice_number']} raised",
                                ledger_entry['entry_id']
                            )
                        )
                        recompute_customer_ledger(company_id, new_customer_id)
                else:
                    # In case ledger entry doesn't exist, create it
                    insert_returning(
                        """
                        INSERT INTO ledger_entries
                            (company_id, customer_id, transaction_type, reference_type,
                             reference_id, transaction_date, debit_amount, credit_amount,
                             running_balance, remarks, created_at)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                        RETURNING entry_id
                        """,
                        (
                            company_id, new_customer_id,
                            'DEBIT', 'INVOICE', invoice_id, invoice_date,
                            grand_total, Decimal('0.00'),
                            Decimal('0.00'), f"Invoice {existing_invoice['invoice_number']} raised",
                        )
                    )
                    recompute_customer_ledger(company_id, new_customer_id)

        except Exception as e:
            return common_response(
                StatusCode.INTERNAL_SERVER_ERROR.value,
                f"Failed to update invoice: {str(e)}"
            )

        # ── 11. Return updated invoice data ───────────────────────────────────
        inv = query_one(
            """
            SELECT i.*,
                   c.customer_name,
                   c.contact_person,
                   c.address   AS customer_address,
                   c.city      AS customer_city,
                   c.state     AS customer_state,
                   c.gstin     AS customer_gstin,
                   c.mobile    AS customer_mobile,
                   c.email     AS customer_email
            FROM   invoices i
            JOIN   customers c ON c.customer_id = i.customer_id
            WHERE  i.invoice_id = %s AND i.company_id = %s AND i.status = 'A'
            """,
            (invoice_id, company_id)
        )
        items = query_all(
            """
            SELECT ii.*, p.description
            FROM   invoice_items ii
            LEFT   JOIN products p ON p.product_id = ii.product_id
            WHERE  ii.invoice_id = %s
            ORDER  BY ii.item_id
            """,
            (invoice_id,)
        )
        inv['items'] = items

        return common_response(
            StatusCode.OK.value,
            get_message("UPDATED", "Invoice"),
            self.get_serializer(inv).data
        )



# ── helpers (keep in sync with invoices_view.py) ─────────────────────────────

_ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
]
_tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
         'Sixty', 'Seventy', 'Eighty', 'Ninety']


def _to_words(num: int) -> str:
    if num == 0:           return 'Zero'
    if num < 20:           return _ones[num]
    if num < 100:          return _tens[num // 10] + (' ' + _ones[num % 10] if num % 10 else '')
    if num < 1_000:        return _ones[num // 100] + ' Hundred' + (' ' + _to_words(num % 100) if num % 100 else '')
    if num < 100_000:      return _to_words(num // 1_000) + ' Thousand' + (' ' + _to_words(num % 1_000) if num % 1_000 else '')
    if num < 10_000_000:   return _to_words(num // 100_000) + ' Lakh' + (' ' + _to_words(num % 100_000) if num % 100_000 else '')
    return _to_words(num // 10_000_000) + ' Crore' + (' ' + _to_words(num % 10_000_000) if num % 10_000_000 else '')


def _amount_in_words(amount: float) -> str:
    rupees = int(amount)
    paise  = round((amount - rupees) * 100)
    result = 'Rs. ' + _to_words(rupees)
    if paise:
        result += ' And ' + _to_words(paise) + ' Paise'
    return result + ' Only'


def _is_interstate(company_state: str, customer_state: str) -> bool:
    """Returns True when the two states differ → use IGST."""
    return (company_state or '').strip().lower() != (customer_state or '').strip().lower()


# ── View ──────────────────────────────────────────────────────────────────────

class InvoiceDownloadView(APIView):
    """
    GET /invoices/<invoice_id>/download/
    Renders invoice_pdf.html via WeasyPrint and returns a PDF attachment.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]

    def get(self, request: Request, invoice_id: int):
        company_id = request.user.company_id

        # ── 1. Fetch invoice + customer fields ───────────────────────────────
        inv = query_one(
            """
            SELECT i.*,
                   c.customer_name,
                   c.contact_person,
                   c.address   AS customer_address,
                   c.city      AS customer_city,
                   c.state     AS customer_state,
                   c.pincode   AS customer_pincode,
                   c.gstin     AS customer_gstin,
                   c.mobile    AS customer_mobile,
                   c.email     AS customer_email
            FROM   invoices i
            JOIN   customers c ON c.customer_id = i.customer_id
            WHERE  i.invoice_id = %s
              AND  i.company_id = %s
              AND  i.status     = 'A'
            """,
            (invoice_id, company_id),
        )
        if not inv:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Invoice"),
            )

        # ── 2. Fetch line items ───────────────────────────────────────────────
        items = query_all(
            """
            SELECT ii.*
            FROM   invoice_items ii
            WHERE  ii.invoice_id = %s
            ORDER  BY ii.item_id
            """,
            (invoice_id,),
        )

        # ── 3. Fetch company profile ──────────────────────────────────────────
        company = query_one(
            "SELECT * FROM company WHERE company_id = %s",
            (company_id,),
        ) or {}

        # ── 4. Derived flags & amounts ────────────────────────────────────────
        is_tax       = inv.get('invoice_type') == 'TAX'
        company_state  = (company.get('state')              or '').strip()
        customer_state = (inv.get('customer_state')         or '').strip()
        interstate     = is_tax and _is_interstate(company_state, customer_state)

        subtotal    = float(inv.get('subtotal')        or 0)
        cgst        = float(inv.get('cgst_amount')     or 0)
        sgst        = float(inv.get('sgst_amount')     or 0)
        igst        = float(inv.get('igst_amount')     or 0)
        discount    = float(inv.get('discount_amount') or 0)
        round_off   = float(inv.get('round_off')       or 0)
        grand_total = float(inv.get('grand_total')     or 0)

        gst_pct  = float(items[0].get('gst_percentage', 0)) if items else 0
        half_pct = gst_pct / 2

        # Per-item helper: half GST for CGST/SGST display
        for item in items:
            item['half_gst_pct'] = float(item.get('gst_percentage', 0)) / 2

        # ── 5. GST note line ──────────────────────────────────────────────────
        if is_tax and interstate:
            gst_note = (
                f"GST {subtotal:.2f} × {gst_pct}% = "
                f"{igst:.2f} IGST  |  THANKS CUSTOMER"
            )
        elif is_tax:
            gst_note = (
                f"GST {subtotal:.2f} × {half_pct}+{half_pct}% = "
                f"{cgst:.2f} CGST + {sgst:.2f} SGST  |  THANKS CUSTOMER"
            )
        else:
            gst_note = "NON-GST INVOICE  |  THANKS CUSTOMER"

        # ── 6. Date formatting ────────────────────────────────────────────────
        raw_date = inv.get('invoice_date')
        date_fmt = (
            raw_date.strftime('%d/%m/%Y')
            if hasattr(raw_date, 'strftime')
            else str(raw_date or '')
        )
        raw_due = inv.get('due_date')
        due_fmt = (
            raw_due.strftime('%d/%m/%Y')
            if hasattr(raw_due, 'strftime')
            else str(raw_due or '')
        )

        # ── 7. Padding rows so table always fills ~12 lines ───────────────────
        empty_rows = range(max(0, 12 - len(items)))

        # ── 8. Template context ───────────────────────────────────────────────
        base = os.path.join(settings.BASE_DIR, 'accounts', 'static', 'accounts', 'img')
        
        context = {
            # Core objects
            'invoice':  inv,
            'company':  company,
            'items':    items,

            # Flags
            'is_tax':        is_tax,
            'is_interstate': interstate,

            # Labels
            'invoice_type_label': 'TAX INVOICE' if is_tax else 'RETAIL INVOICE',

            # Formatted dates
            'invoice_date_fmt': date_fmt,
            'due_date_fmt':     due_fmt,

            # Numeric totals (plain floats for template arithmetic)
            'subtotal':    subtotal,
            'cgst':        cgst,
            'sgst':        sgst,
            'igst':        igst,
            'discount':    discount,
            'round_off':   round_off,
            'grand_total': grand_total,

            # GST display helpers
            'gst_pct':      gst_pct,
            'half_gst_pct': half_pct,
            'gst_note':     gst_note,

            # Words
            'amount_in_words': _amount_in_words(grand_total),

            # Padding
            'empty_rows': empty_rows,

            # ── Image placeholders (update paths when assets are ready) ──────
            # Place files under  <project_root>/accounts/static/accounts/img/
            'signature_img_path': os.path.join(base, 'signature.png'),   # authorised signatory
            'qr_code_img_path':   os.path.join(base, 'qr_code.png'),     # payment QR
        }

        # ── 9. Render → PDF ───────────────────────────────────────────────────
        try:
            from weasyprint import HTML, CSS
            html_string = render_to_string('invoice_pdf.html', context)
            pdf_bytes   = HTML(
                string=html_string,
                base_url=request.build_absolute_uri('/'),
            ).write_pdf()
        except Exception as exc:
            return common_response(
                StatusCode.INTERNAL_SERVER_ERROR.value,
                f"PDF generation failed: {exc}",
            )

        filename = f"{inv.get('invoice_number', invoice_id)}.pdf"
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['Content-Length']      = len(pdf_bytes)
        return response

class DashboardStatsView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = DashboardStatsSerializer

    def get(self, request: Request):
        company_id = request.user.company_id

        stats = query_one(
            """
            SELECT
                COUNT(*)::int                                              AS total_invoices,
                COALESCE(SUM(grand_total), 0.00)                           AS total_billed,
                COALESCE(SUM(CASE WHEN payment_status = 'PENDING'
                                  THEN due_amount END), 0.00)              AS total_pending,
                COALESCE(SUM(grand_total - due_amount), 0.00)              AS total_collected,
                COUNT(CASE WHEN payment_status = 'PENDING' THEN 1 END)::int AS pending_count
            FROM   invoices
            WHERE  company_id = %s
              AND  status = 'A'
              AND  invoice_date >= date_trunc('month', CURRENT_DATE)
            """,
            (company_id,)
        )

        return common_response(
            StatusCode.OK.value,
            "Dashboard stats fetched successfully",
            self.get_serializer(stats).data
        )