# company_serializer.py
from rest_framework import serializers
import re


class CompanyProfileSerializer(serializers.Serializer):
    company_id     = serializers.IntegerField(required=False)
    company_name   = serializers.CharField(max_length=255)
    gstin          = serializers.CharField(max_length=15,  required=False, allow_null=True)
    pan_number     = serializers.CharField(max_length=10,  required=False, allow_null=True)
    address        = serializers.CharField(               required=False, allow_null=True)
    city           = serializers.CharField(max_length=100, required=False, allow_null=True)
    state          = serializers.CharField(max_length=100, required=False, allow_null=True)
    pincode        = serializers.CharField(max_length=10,  required=False, allow_null=True)
    phone          = serializers.CharField(max_length=20,  required=False, allow_null=True)
    email          = serializers.EmailField(               required=False, allow_null=True)
    bank_name      = serializers.CharField(max_length=255, required=False, allow_null=True)
    account_number = serializers.CharField(max_length=100, required=False, allow_null=True)
    ifsc_code      = serializers.CharField(max_length=20,  required=False, allow_null=True)
    logo_path      = serializers.CharField(               required=False, allow_null=True)
    created_at     = serializers.DateTimeField(required=False, allow_null=True)
    updated_at     = serializers.DateTimeField(required=False, allow_null=True)
    
    # def validate_gstin(self, value):
    #     if value and not re.match(r'^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$', value):
    #         raise serializers.ValidationError("Invalid GSTIN format.")
    #     return value

    # def validate_pan_number(self, value):
    #     if value and not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]{1}$', value):
    #         raise serializers.ValidationError("Invalid PAN format.")
    #     return value
    
    # def validate_phone(self, value):
    #     if value and not re.match(r'^[6-9]\d{9}$', value):
    #         raise serializers.ValidationError("Enter a valid 10-digit mobile number.")
    #     return value