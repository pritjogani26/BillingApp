from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request

from accounts.common.db               import query_one, execute
from accounts.common.auth             import JWTAuthentication
from accounts.common.responses        import common_response, StatusCode
from accounts.common.messages         import get_message
from accounts.serializers.company_serializer import CompanyProfileSerializer


class CompanyProfileView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = CompanyProfileSerializer

    def get(self, request: Request):
        company_id = request.user.company_id

        row = query_one(
            """
            SELECT company_id, company_name, gstin, pan_number,
                   address, city, state, pincode,
                   phone, email,
                   bank_name, account_number, ifsc_code,
                   logo_path, created_at, updated_at
            FROM   company
            WHERE  company_id = %s
            """,
            (company_id,)
        )

        if not row:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Company")
            )

        serializer = self.get_serializer(data=row)
        serializer.is_valid(raise_exception=True)

        return common_response(
            StatusCode.OK.value,
            get_message("SAVED", "Company"),
            serializer.data
        )

    def put(self, request: Request):
        company_id = request.user.company_id
        user_id    = request.user.user_id

        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return common_response(
                StatusCode.BAD_REQUEST.value,
                get_message("INVALID_REQUEST"),
                serializer.errors
            )

        d = serializer.validated_data

        rows_updated = execute(
            """
            UPDATE company
            SET    company_name   = %s,
                   gstin          = %s,
                   pan_number     = %s,
                   address        = %s,
                   city           = %s,
                   state          = %s,
                   pincode        = %s,
                   phone          = %s,
                   email          = %s,
                   bank_name      = %s,
                   account_number = %s,
                   ifsc_code      = %s,
                   updated_at     = NOW(),
                   updated_by     = %s
            WHERE  company_id = %s
            """,
            (
                d['company_name'], d['gstin'],
                d['pan_number'],   d['address'],
                d['city'],         d['state'],
                d['pincode'],      d['phone'],
                d['email'],        d['bank_name'],
                d['account_number'], d['ifsc_code'],
                user_id, company_id,
            )
        )

        if rows_updated == 0:
            return common_response(
                StatusCode.NOT_FOUND.value,
                get_message("NOT_FOUND", "Company")
            )

        return common_response(
            StatusCode.OK.value,
            get_message("UPDATED", "Company")
        )