# reports_serializer.py
from rest_framework import serializers


class GSTSummarySerializer(serializers.Serializer):
    invoice_count  = serializers.IntegerField()
    taxable_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_cgst     = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_sgst     = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_igst     = serializers.DecimalField(max_digits=12, decimal_places=2)
    grand_total    = serializers.DecimalField(max_digits=12, decimal_places=2)


class GSTR1Serializer(serializers.Serializer):
    invoice_number = serializers.CharField()
    invoice_date   = serializers.DateField()
    customer_name  = serializers.CharField()
    customer_gstin = serializers.CharField(required=False, allow_null=True)
    customer_state = serializers.CharField(required=False, allow_null=True)
    grand_total    = serializers.DecimalField(max_digits=12, decimal_places=2)
    local_central  = serializers.CharField()
    invoice_type   = serializers.CharField()
    hsn_code       = serializers.CharField(required=False, allow_null=True)
    quantity       = serializers.DecimalField(max_digits=12, decimal_places=2)
    amount         = serializers.DecimalField(max_digits=12, decimal_places=2)
    taxable_value  = serializers.DecimalField(max_digits=12, decimal_places=2)
    sgst_pct       = serializers.DecimalField(max_digits=5, decimal_places=2)
    sgst_amount    = serializers.DecimalField(max_digits=12, decimal_places=2)
    cgst_pct       = serializers.DecimalField(max_digits=5, decimal_places=2)
    cgst_amount    = serializers.DecimalField(max_digits=12, decimal_places=2)
    igst_pct       = serializers.DecimalField(max_digits=5, decimal_places=2)
    igst_amount    = serializers.DecimalField(max_digits=12, decimal_places=2)
    cess           = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_gst      = serializers.DecimalField(max_digits=12, decimal_places=2)


class HSNSummarySerializer(serializers.Serializer):
    hsn_code      = serializers.CharField(required=False, allow_null=True)
    total_qty     = serializers.DecimalField(max_digits=12, decimal_places=2)
    taxable_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    cgst          = serializers.DecimalField(max_digits=12, decimal_places=2)
    sgst          = serializers.DecimalField(max_digits=12, decimal_places=2)
    igst          = serializers.DecimalField(max_digits=12, decimal_places=2)
    total         = serializers.DecimalField(max_digits=12, decimal_places=2)


class MonthlySalesSerializer(serializers.Serializer):
    month_label   = serializers.CharField()
    yr            = serializers.IntegerField()
    mo            = serializers.IntegerField()
    total_sales   = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_tax     = serializers.DecimalField(max_digits=12, decimal_places=2)
    invoice_count = serializers.IntegerField()