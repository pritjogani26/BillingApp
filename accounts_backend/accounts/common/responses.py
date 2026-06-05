# accounts\common\responses.py
from enum import Enum

from rest_framework import status
from rest_framework.response import Response

class StatusCode(Enum):
    CONTINUE = status.HTTP_100_CONTINUE
    PROCESSING = status.HTTP_102_PROCESSING

    OK = status.HTTP_200_OK
    CREATED = status.HTTP_201_CREATED
    ACCEPTED = status.HTTP_202_ACCEPTED
    DELETED = status.HTTP_204_NO_CONTENT
    UPDATED = status.HTTP_205_RESET_CONTENT

    NOT_MODIFIED = status.HTTP_304_NOT_MODIFIED

    BAD_REQUEST = status.HTTP_400_BAD_REQUEST
    UNAUTHORIZED = status.HTTP_401_UNAUTHORIZED
    NOT_FOUND = status.HTTP_404_NOT_FOUND
    CONFLICT = status.HTTP_409_CONFLICT
    UNPROCESSABLE_ENTITY = status.HTTP_422_UNPROCESSABLE_ENTITY

    INTERNAL_SERVER_ERROR = status.HTTP_500_INTERNAL_SERVER_ERROR
    BAD_GATEWAY = status.HTTP_502_BAD_GATEWAY
    GATEWAY_TIMEOUT = status.HTTP_504_GATEWAY_TIMEOUT


def common_response(
    status_code=status.HTTP_200_OK,
    message=None,
    data=None,
):
    """
    Standard API response format used across the application.
    """

    response_data = {
        "message": message,
        "data": data,
    }

    return Response(response_data, status=status_code)