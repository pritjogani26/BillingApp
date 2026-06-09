# invoices_serializer.py
from rest_framework import serializers


class InvoiceItemSerializer(serializers.Serializer):
    item_id         = serializers.IntegerField(required=False)
    invoice_id      = serializers.IntegerField(required=False)
    company_id      = serializers.IntegerField(required=False)
    product_id      = serializers.IntegerField(required=False, allow_null=True)
    product_name    = serializers.CharField(required=True)
    hsn_code        = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    description     = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    quantity   = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0.01)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0.00)
    gst_percentage  = serializers.DecimalField(max_digits=5,  decimal_places=2, required=False, default=0.00)
    taxable_amount  = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    cgst_amount     = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    sgst_amount     = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    igst_amount     = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    total_amount    = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    status          = serializers.CharField(max_length=1, required=False)
    created_at      = serializers.DateTimeField(required=False, allow_null=True)


class InvoiceSerializer(serializers.Serializer):
    invoice_id      = serializers.IntegerField(required=False)
    company_id      = serializers.IntegerField(required=False)
    customer_id     = serializers.IntegerField(required=True)
    invoice_number  = serializers.CharField(max_length=50,  required=False)
    invoice_type    = serializers.ChoiceField(choices=['TAX', 'RETAIL'], default='TAX')
    invoice_date    = serializers.DateField(required=True)
    financial_year  = serializers.CharField(max_length=10,  required=False)
    due_date        = serializers.DateField(required=False,  allow_null=True)
    subtotal        = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    cgst_amount     = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    sgst_amount     = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    igst_amount     = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0.00)
    round_off       = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    grand_total     = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    due_amount      = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    payment_status = serializers.ChoiceField(choices=['PENDING', 'PAID', 'PARTIAL'], required=False, default='PENDING')
    status          = serializers.CharField(max_length=1,   required=False)
    notes           = serializers.CharField(required=False,  allow_null=True, allow_blank=True)
    created_at      = serializers.DateTimeField(required=False, allow_null=True)
    created_by      = serializers.IntegerField(required=False, allow_null=True)
    updated_at      = serializers.DateTimeField(required=False, allow_null=True)
    updated_by      = serializers.IntegerField(required=False, allow_null=True)

    # Joined fields from customers table
    customer_name    = serializers.CharField(required=False, allow_null=True)
    customer_mobile  = serializers.CharField(required=False, allow_null=True)
    contact_person   = serializers.CharField(required=False, allow_null=True)
    customer_address = serializers.CharField(required=False, allow_null=True)
    customer_city    = serializers.CharField(required=False, allow_null=True)
    customer_state   = serializers.CharField(required=False, allow_null=True)
    customer_gstin   = serializers.CharField(required=False, allow_null=True)
    customer_email   = serializers.CharField(required=False, allow_null=True)

    items = InvoiceItemSerializer(many=True, required=False)
    
    def validate(self, data):
        subtotal = data.get('subtotal')
        if subtotal is None:
            items = data.get('items', [])
            subtotal = sum((item.get('quantity', 0) * item.get('unit_price', 0)) for item in items)
        else:
            subtotal = subtotal or 0

        discount = data.get('discount_amount', 0) or 0
        if discount > subtotal:
            raise serializers.ValidationError(
                {"discount_amount": "Discount cannot exceed subtotal."}
            )
        if data.get('due_date') and data['due_date'] < data['invoice_date']:
            raise serializers.ValidationError(
                {"due_date": "Due date cannot be before invoice date."}
            )
        return data


class DashboardStatsSerializer(serializers.Serializer):
    total_invoices  = serializers.IntegerField()
    total_billed    = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_pending   = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_collected = serializers.DecimalField(max_digits=12, decimal_places=2)
    pending_count   = serializers.IntegerField()