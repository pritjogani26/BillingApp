import jwt
from datetime import datetime, timedelta, timezone

from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from accounts.common.db import query_one


def _secret():
    return settings.JWT_SECRET


def create_token(user_id: int, company_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        'user_id':    user_id,
        'company_id': company_id,
        'role':       role,
        'exp':        now + timedelta(hours=settings.JWT_EXPIRY_HOURS),
        'iat':        now,
    }
    return jwt.encode(payload, _secret(), algorithm='HS256')


def decode_token(token: str) -> dict:
    return jwt.decode(token, _secret(), algorithms=['HS256'])


class JWTUser:
    def __init__(self, payload: dict):
        self.user_id          = payload['user_id']
        self.company_id       = payload['company_id']
        self.role             = payload['role']
        self.is_authenticated = True


class JWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header.startswith('Bearer '):
            return None

        token = auth_header.split(' ', 1)[1]
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed('Token expired')
        except jwt.InvalidTokenError:
            raise AuthenticationFailed('Invalid token')

        user = query_one(
            "SELECT status FROM users WHERE user_id = %s",
            (payload['user_id'],)
        )
        if not user or user['status'] != 'A':
            raise AuthenticationFailed('User inactive or not found')

        return (JWTUser(payload), token)

    def authenticate_header(self, request):
        return 'Bearer'