# customers_serializer.py
from rest_framework import serializers
import re


class CustomerSerializer(serializers.Serializer):
    customer_id    = serializers.IntegerField(required=False)
    company_id     = serializers.IntegerField(required=False)
    customer_name  = serializers.CharField(max_length=255)
    contact_person = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    gstin          = serializers.CharField(max_length=15,  required=False, allow_null=True, allow_blank=True)
    address        = serializers.CharField(                required=False, allow_null=True, allow_blank=True)
    city           = serializers.CharField(max_length=100, required=False, allow_null=True, allow_blank=True)
    state          = serializers.CharField(max_length=100, required=False, allow_null=True, allow_blank=True)
    pincode        = serializers.CharField(max_length=10,  required=False, allow_null=True, allow_blank=True)
    mobile         = serializers.CharField(max_length=20,  required=False, allow_null=True, allow_blank=True)
    email          = serializers.EmailField(               required=False, allow_null=True, allow_blank=True)
    default_rate   = serializers.DecimalField(max_digits=12, decimal_places=4, required=False, default=0.0000)
    status         = serializers.CharField(max_length=1,   required=False)
    created_at     = serializers.DateTimeField(required=False, allow_null=True)
    created_by     = serializers.IntegerField(required=False, allow_null=True)
    updated_at     = serializers.DateTimeField(required=False, allow_null=True)
    updated_by     = serializers.IntegerField(required=False, allow_null=True)

    # def validate_gstin(self, value):
    #     if value and not re.match(r'^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$', value):
    #         raise serializers.ValidationError("Invalid GSTIN format.")
    #     return value


    # def validate_mobile(self, value):
    #     if value and not re.match(r'^[6-9]\d{9}$', value):
    #         raise serializers.ValidationError("Enter a valid 10-digit mobile number.")
    #     return value


class CustomerLedgerSummarySerializer(serializers.Serializer):
    customer_id     = serializers.IntegerField()
    customer_name   = serializers.CharField()
    total_debit     = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_credit    = serializers.DecimalField(max_digits=12, decimal_places=2)
    current_balance = serializers.DecimalField(max_digits=12, decimal_places=2)