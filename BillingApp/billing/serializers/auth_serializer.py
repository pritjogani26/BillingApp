from rest_framework import serializers

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True, style={"input_type": "password"})


class ChangePasswordSerializer(serializers.Serializer): 
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True)

class MeSerializer(serializers.Serializer):
    user_id      = serializers.IntegerField()
    company_id   = serializers.IntegerField()
    username     = serializers.CharField()
    full_name    = serializers.CharField()
    role         = serializers.CharField()
    company_name = serializers.CharField()
    gstin        = serializers.CharField()