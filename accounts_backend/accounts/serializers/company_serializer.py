# company_serializer.py
from rest_framework import serializers


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