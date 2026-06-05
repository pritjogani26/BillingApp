# payments_serializer.py
from rest_framework import serializers


class PaymentSerializer(serializers.Serializer):
    payment_id       = serializers.IntegerField(required=False)
    invoice_id       = serializers.IntegerField(required=True)
    company_id       = serializers.IntegerField(required=False)
    customer_id      = serializers.IntegerField(required=False)
    payment_date     = serializers.DateField(required=True)
    payment_method   = serializers.CharField(max_length=50,  required=False, default='CASH')
    reference_number = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    amount           = serializers.DecimalField(max_digits=12, decimal_places=2)
    notes            = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    created_at       = serializers.DateTimeField(required=False, allow_null=True)
    created_by       = serializers.IntegerField(required=False, allow_null=True)
    updated_at       = serializers.DateTimeField(required=False, allow_null=True)
    updated_by       = serializers.IntegerField(required=False, allow_null=True)

    # Joined fields
    invoice_number   = serializers.CharField(required=False, allow_null=True)
    customer_name    = serializers.CharField(required=False, allow_null=True)