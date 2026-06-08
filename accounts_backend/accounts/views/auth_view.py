# accounts\views\auth_view.py
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.http import HttpRequest
from django.contrib.auth.hashers import make_password, check_password
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request

from accounts.serializers.auth_serializer import ChangePasswordSerializer, LoginSerializer, CurrentUserSerializer
from accounts.common.db import query_one, execute
from accounts.common.auth import create_token, JWTAuthentication
from accounts.common.responses import common_response, StatusCode
from accounts.common.messages import get_message


class LoginView(generics.GenericAPIView):
    authentication_classes = []
    permission_classes     = [AllowAny]
    serializer_class       = LoginSerializer

    def post(self, request: Request):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return common_response(
                StatusCode.BAD_REQUEST.value,
                get_message("INVALID_REQUEST"),
                serializer.errors
            )

        username = serializer.validated_data['username'].strip()
        password = serializer.validated_data['password']

        user = query_one(
            """
            SELECT
                u.user_id,
                u.company_id,
                u.username,
                u.full_name,
                r.role_name AS role,
                u.password_hash
            FROM users u
            JOIN roles r ON r.role_id = u.role_id
            WHERE LOWER(u.username) = LOWER(%s)
              AND u.status = 'A'
            """,
            (username,)
        )

        if not user or not check_password(password, user['password_hash']):
            return common_response(
                StatusCode.UNAUTHORIZED.value,
                get_message("INVALID_CREDENTIALS")
            )

        token = create_token(user['user_id'], user['company_id'], user['role'])
        return common_response(
            StatusCode.OK.value,
            "Login successful.",
            {
                "token": token,
                "user": {
                    "user_id":   user['user_id'],
                    "username":  user['username'],
                    "full_name": user['full_name'],
                    "role":      user['role'],
                }
            }
        )
        
        
class ChangePasswordView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = ChangePasswordSerializer

    def post(self, request: Request):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return common_response(
                StatusCode.BAD_REQUEST.value,
                get_message("INVALID_REQUEST"),
                serializer.errors
            )

        old_password = serializer.validated_data['old_password']
        new_password = serializer.validated_data['new_password']
        user_id      = request.user.user_id

        user = query_one(
            "SELECT password_hash FROM users WHERE user_id = %s",
            (user_id,)
        )
        if not user:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "User")
            )

        if not check_password(old_password, user['password_hash']):
            return common_response(
                StatusCode.UNAUTHORIZED.value,
                get_message("INVALID_PASSWORD")
            )

        execute(
            """
            UPDATE users
            SET password_hash = %s, updated_at = NOW(), updated_by = %s
            WHERE user_id = %s
            """,
            (make_password(new_password), user_id, user_id)
        )

        return common_response(
            StatusCode.OK.value,
            get_message("UPDATED", "Password")
        )
        
        
class CurrentUserView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = CurrentUserSerializer

    def get(self, request: Request):
        user = query_one(
            """
            SELECT
                u.user_id,
                u.company_id,
                u.username,
                u.full_name,
                r.role_name     AS role,
                c.company_name,
                c.gstin,
                u.created_at,
                u.updated_at
            FROM   users u
            JOIN   roles r   ON r.role_id   = u.role_id
            JOIN   company c ON c.company_id = u.company_id
            WHERE  u.user_id = %s
            """,
            (request.user.user_id,)
        )

        if not user:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "User")
            )

        serializer = self.get_serializer(data=user)
        serializer.is_valid(raise_exception=True)

        return common_response(
            StatusCode.OK.value,
            get_message("SAVED", "User"),
            serializer.data
        )