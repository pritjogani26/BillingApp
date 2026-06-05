# billing/views/auth_view.py

import hashlib
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.http import HttpRequest
from django.contrib.auth.hashers import make_password, check_password
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated

from billing.serializers.auth_serializer import LoginSerializer, ChangePasswordSerializer, MeSerializer
from billing.helper.db import query_one, execute
from billing.helper.auth import create_token, require_auth, JWTAuthentication
from billing.helper.common_response import CommonResponse


class HealthView(generics.GenericAPIView):
    authentication_classes = []
    permission_classes     = [AllowAny]

    def get(self, request):
        return CommonResponse.success(
            message="Server is healthy",
            data={'status': 'ok'}
        )


class LoginView(generics.GenericAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    serializer_class = LoginSerializer

    def post(self, request: HttpRequest):
        data = self.get_serializer(data=request.data)
        if not data.is_valid():
            return CommonResponse.error(message="Invalid input", status_code=status.HTTP_400_BAD_REQUEST)

        username = data.validated_data.get('username', '').strip()
        password = data.validated_data.get('password', '')

        if not username or not password:
            return CommonResponse.error(message="Username and password required", status_code=status.HTTP_400_BAD_REQUEST)

        user = query_one(
            """
            SELECT u.user_id, u.company_id, u.username, u.full_name,
                r.role AS role, u.status, u.password
            FROM   users u
            LEFT JOIN roles r ON r.role_id = u.role
            WHERE  u.username = %s
            """,
            (username,)
        )

        if not user or user['status'] != 'A':
            return CommonResponse.error(message="Invalid credentials", status_code=status.HTTP_401_UNAUTHORIZED)

        if not check_password(password, user['password']):
            return CommonResponse.error(message="Invalid credentials", status_code=status.HTTP_401_UNAUTHORIZED)

        token = create_token(user['user_id'], user['company_id'], user['role'])

        return CommonResponse.success(
            message="Login successful",
            data={
                'token': token,
                'user': {
                    'user_id':    user['user_id'],
                    'company_id': user['company_id'],
                    'username':   user['username'],
                    'full_name':  user['full_name'],
                    'role':       user['role'],
                }
            }
        )


class ChangePasswordView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = ChangePasswordSerializer

    def post(self, request: HttpRequest):
        data = self.get_serializer(data=request.data)
        if not data.is_valid():
            return CommonResponse.error(
                message="Invalid input",
                errors=data.errors,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        old_password = data.validated_data.get('old_password', '')
        new_password = data.validated_data.get('new_password', '')

        user_id = request.user.user_id

        if not old_password or not new_password:
            return CommonResponse.error(
                message="Both passwords are required",
                status_code=status.HTTP_400_BAD_REQUEST
            )

        user = query_one(
            "SELECT password FROM users WHERE user_id = %s",
            (user_id,)
        )

        if not user:
            return CommonResponse.error(message="User not found", status_code=status.HTTP_404_NOT_FOUND)

        if not check_password(old_password, user['password']):
            return CommonResponse.error(message="Old password incorrect", status_code=status.HTTP_400_BAD_REQUEST)

        execute(
            """
            UPDATE users
            SET password = %s, updated_at = NOW(), updated_by = %s
            WHERE user_id = %s
            """,
            (make_password(new_password), user_id, user_id)
        )

        return CommonResponse.success(message="Password updated successfully")

class MeView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = MeSerializer

    def get(self, request):
        user = query_one(
            """
            SELECT u.user_id, u.company_id, u.username, u.full_name, r.role AS role,
                   c.company_name, c.gstin
            FROM   users u
            JOIN   company_profile c ON c.company_id = u.company_id
            LEFT JOIN roles r ON r.role_id = u.role
            WHERE  u.user_id = %s
            """,
            (request.user.user_id,)
        )

        if not user:
            return CommonResponse.error(
                message="User not found",
                status_code=status.HTTP_404_NOT_FOUND
            )

        serializer = self.get_serializer(data=user)
        serializer.is_valid(raise_exception=True)

        return CommonResponse.success(
            message="User fetched successfully",
            data=serializer.validated_data
        )