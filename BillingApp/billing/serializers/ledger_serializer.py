from rest_framework import serializers


class LedgerEntrySerializer(serializers.Serializer):
    entry_id                  = serializers.IntegerField(required=False)
    company_id                = serializers.IntegerField(required=False)
    customer_id               = serializers.IntegerField(required=False)
    transaction_type          = serializers.CharField(max_length=20)
    reference_type            = serializers.CharField(max_length=50)
    reference_id              = serializers.IntegerField()
    transaction_date          = serializers.DateField()
    debit_amount              = serializers.DecimalField(max_digits=12, decimal_places=2)
    credit_amount             = serializers.DecimalField(max_digits=12, decimal_places=2)
    balance_after_transaction = serializers.DecimalField(max_digits=12, decimal_places=2)
    remarks                   = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    created_at                = serializers.DateTimeField(required=False)


class OutstandingReportSerializer(serializers.Serializer):
    customer_id      = serializers.IntegerField()
    company_name     = serializers.CharField()
    mobile           = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    outstanding      = serializers.DecimalField(max_digits=12, decimal_places=2)
    pending_invoices = serializers.IntegerField()
