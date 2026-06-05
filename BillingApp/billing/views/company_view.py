from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated

from billing.helper.db              import query_one, execute
from billing.helper.auth            import JWTAuthentication
from billing.helper.common_response import CommonResponse
from billing.serializers.company_serializer import CompanyProfileSerializer


class CompanyProfileView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]
    serializer_class       = CompanyProfileSerializer

    def get(self, request):
        company_id = request.user.company_id

        row = query_one(
            """
            SELECT company_id, company_name, gstin, pan_number, address,
                   city, state, pincode, phone, email,
                   bank_name, account_number, ifsc_code,
                   logo_path, invoice_prefix,
                   created_at, updated_at
            FROM   company_profile
            WHERE  company_id = %s
            """,
            (company_id,)
        )

        if not row:
            return CommonResponse.error(
                message="Company not found",
                status_code=status.HTTP_404_NOT_FOUND
            )

        serializer = self.get_serializer(data=row)
        serializer.is_valid(raise_exception=True)

        return CommonResponse.success(
            message="Company profile fetched successfully",
            data=serializer.validated_data
        )

    def put(self, request):
        company_id = request.user.company_id
        user_id    = request.user.user_id

        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return CommonResponse.error(
                message="Invalid input",
                errors=serializer.errors,
                status_code=status.HTTP_400_BAD_REQUEST
            )

        d = serializer.validated_data

        rows_updated = execute(
            """
            UPDATE company_profile
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
                   invoice_prefix = %s,
                   updated_at     = NOW(),
                   updated_by     = %s
            WHERE  company_id = %s
            """,
            (
                d.get('company_name'), d.get('gstin'),
                d.get('pan_number'),   d.get('address'),
                d.get('city'),         d.get('state'),
                d.get('pincode'),      d.get('phone'),
                d.get('email'),        d.get('bank_name'),
                d.get('account_number'), d.get('ifsc_code'),
                d.get('invoice_prefix'),
                user_id, company_id,
            )
        )

        if rows_updated == 0:
            return CommonResponse.error(
                message="Company not found",
                status_code=status.HTTP_404_NOT_FOUND
            )

        return CommonResponse.success(message="Profile updated successfully")