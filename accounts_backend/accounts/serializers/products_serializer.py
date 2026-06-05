# products_serializer.py
from rest_framework import serializers


class ProductSerializer(serializers.Serializer):
    product_id     = serializers.IntegerField(required=False)
    company_id     = serializers.IntegerField(required=False)
    customer_id    = serializers.IntegerField(required=False, allow_null=True)
    product_name   = serializers.CharField(max_length=255)
    hsn_code       = serializers.CharField(max_length=20,  required=False, allow_null=True, allow_blank=True)
    gst_percentage = serializers.DecimalField(max_digits=5,  decimal_places=2, required=False, default=0.00)
    height         = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    width          = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    unit_price     = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    description    = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    status         = serializers.CharField(max_length=1,   required=False)
    created_at     = serializers.DateTimeField(required=False, allow_null=True)
    created_by     = serializers.IntegerField(required=False, allow_null=True)
    updated_at     = serializers.DateTimeField(required=False, allow_null=True)
    updated_by     = serializers.IntegerField(required=False, allow_null=True)