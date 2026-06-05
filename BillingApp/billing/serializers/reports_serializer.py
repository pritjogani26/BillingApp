from rest_framework import serializers


class GSTSummarySerializer(serializers.Serializer):
    invoice_count  = serializers.IntegerField()
    taxable_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_cgst     = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_sgst     = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_igst     = serializers.DecimalField(max_digits=12, decimal_places=2)
    grand_total    = serializers.DecimalField(max_digits=12, decimal_places=2)


class GSTR1Serializer(serializers.Serializer):
    invoice_number  = serializers.CharField()
    invoice_date    = serializers.DateField()
    company_name    = serializers.CharField()
    customer_gstin  = serializers.CharField(required=False, allow_null=True)
    customer_state  = serializers.CharField(required=False, allow_null=True)
    taxable_value   = serializers.DecimalField(max_digits=12, decimal_places=2)
    cgst_amount     = serializers.DecimalField(max_digits=12, decimal_places=2)
    sgst_amount     = serializers.DecimalField(max_digits=12, decimal_places=2)
    igst_amount     = serializers.DecimalField(max_digits=12, decimal_places=2)
    grand_total     = serializers.DecimalField(max_digits=12, decimal_places=2)


class HSNSummarySerializer(serializers.Serializer):
    hsn_code       = serializers.CharField(required=False, allow_null=True)
    product_name   = serializers.CharField()
    total_qty      = serializers.DecimalField(max_digits=12, decimal_places=2)
    taxable_value  = serializers.DecimalField(max_digits=12, decimal_places=2)
    cgst           = serializers.DecimalField(max_digits=12, decimal_places=2)
    sgst           = serializers.DecimalField(max_digits=12, decimal_places=2)
    igst           = serializers.DecimalField(max_digits=12, decimal_places=2)
    total          = serializers.DecimalField(max_digits=12, decimal_places=2)


class MonthlySalesSerializer(serializers.Serializer):
    month_label   = serializers.CharField()
    yr            = serializers.IntegerField()
    mo            = serializers.IntegerField()
    total_sales   = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_tax     = serializers.DecimalField(max_digits=12, decimal_places=2)
    invoice_count = serializers.IntegerField()
