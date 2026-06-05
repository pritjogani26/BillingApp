# billing/helper/auth.py

import jwt
import json
from functools import wraps
from datetime import datetime, timedelta, timezone

from django.conf import settings
from django.http import JsonResponse

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from billing.helper.db import query_one


def _secret():
    return settings.JWT_SECRET


def create_token(user_id: int, company_id: int, role: str) -> str:
    payload = {
        'user_id':    user_id,
        'company_id': company_id,
        'role':       role,
        'exp': datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRY_HOURS),
        'iat': datetime.now(timezone.utc),
    }
    return jwt.encode(payload, _secret(), algorithm='HS256')


def decode_token(token: str) -> dict:
    return jwt.decode(token, _secret(), algorithms=['HS256'])


# ✅ New: DRF-compatible authentication class used by CBVs (e.g. ChangePasswordView)
class JWTUser:
    """Lightweight user object attached to request.user by JWTAuthentication."""
    def __init__(self, payload: dict):
        self.user_id    = payload['user_id']
        self.company_id = payload['company_id']
        self.role       = payload['role']
        self.is_authenticated = True   # required by IsAuthenticated


class JWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header.startswith('Bearer '):
            return None  # Let DRF handle as anonymous

        token = auth_header.split(' ', 1)[1]
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed('Token expired')
        except jwt.InvalidTokenError:
            raise AuthenticationFailed('Invalid token')

        user = query_one(
            "SELECT user_id, company_id, role, status FROM users WHERE user_id = %s",
            (payload['user_id'],)
        )
        if not user or user['status'] != 'A':
            raise AuthenticationFailed('User inactive or not found')

        return (JWTUser(payload), token)  # (user, auth) tuple required by DRF

    def authenticate_header(self, request):
        return 'Bearer'



# ── Decorator for function-based views (me, etc.) ──────────────────────────

def require_auth(view_func):
    """Decorator — validates Bearer token and injects request.user_payload."""
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header.startswith('Bearer '):
            return JsonResponse({'error': 'Unauthorized'}, status=401)
        token = auth_header.split(' ', 1)[1]
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            return JsonResponse({'error': 'Token expired'}, status=401)
        except jwt.InvalidTokenError:
            return JsonResponse({'error': 'Invalid token'}, status=401)

        user = query_one(
            "SELECT user_id, company_id, role, status FROM users WHERE user_id = %s",
            (payload['user_id'],)
        )
        if not user or user['status'] != 'A':
            return JsonResponse({'error': 'User inactive or not found'}, status=401)

        request.user_payload = payload
        return view_func(request, *args, **kwargs)
    return wrapper


def json_body(request) -> dict:
    try:
        return json.loads(request.body)
    except (json.JSONDecodeError, Exception):
        return {}