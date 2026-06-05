# auth_serializer.py
from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(
        required=True,
        write_only=True,
        style={"input_type": "password"}
    )


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, min_length=8)


class CurrentUserSerializer(serializers.Serializer):
    user_id      = serializers.IntegerField()
    company_id   = serializers.IntegerField()
    username     = serializers.CharField()
    full_name    = serializers.CharField()
    role         = serializers.CharField()
    company_name = serializers.CharField()
    gstin        = serializers.CharField(required=False, allow_null=True)
    created_at   = serializers.DateTimeField()
    updated_at   = serializers.DateTimeField(required=False, allow_null=True)