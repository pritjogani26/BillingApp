from rest_framework import serializers


class CompanyProfileSerializer(serializers.Serializer):
    company_id     = serializers.IntegerField(required=False)
    company_name   = serializers.CharField(max_length=255)
    gstin          = serializers.CharField(max_length=20)
    pan_number     = serializers.CharField(max_length=20)
    address        = serializers.CharField()
    city           = serializers.CharField(max_length=100)
    state          = serializers.CharField(max_length=100)
    pincode        = serializers.CharField(max_length=20)
    phone          = serializers.CharField(max_length=20)
    email          = serializers.EmailField()
    bank_name      = serializers.CharField(max_length=255,  required=False, allow_null=True)
    account_number = serializers.CharField(max_length=100,  required=False, allow_null=True)
    ifsc_code      = serializers.CharField(max_length=20,   required=False, allow_null=True)
    logo_path      = serializers.CharField(                 required=False, allow_null=True)
    invoice_prefix = serializers.CharField(max_length=20,   required=False, allow_null=True)
    created_at     = serializers.DateTimeField(required=False)
    updated_at     = serializers.DateTimeField(required=False)