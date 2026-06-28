from django.urls import path

from accounts.views.auth_view      import LoginView, ChangePasswordView, CurrentUserView
from accounts.views.company_view   import CompanyProfileView
from accounts.views.customers_view import CustomerListView, CustomerDetailView, CustomerLedgerSummaryView
from accounts.views.products_view  import ProductListView, ProductDetailView
from accounts.views.invoices_view  import InvoiceListView, InvoiceDetailView, InvoiceDownloadView, DashboardStatsView
from accounts.views.payments_view  import PaymentListView, PaymentDetailView
from accounts.views.ledger_view    import LedgerEntriesView, OutstandingReportView
from accounts.views.reports_view   import (
    GSTSummaryView,
    GSTR1View,
    HSNSummaryView,
    MonthlySalesView,
    GSTR1ExcelDownloadView,
)
from accounts.views.backup_view import BackupDatabaseView, RestoreDatabaseView, DatabaseNameView

urlpatterns = [

    # ── Auth ─────────────────────────────────────────────────────────────────
    path("auth/login/",           LoginView.as_view(),          name="login"),
    path("auth/me/",              CurrentUserView.as_view(),     name="current_user"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="change_password"),

    # ── Company ──────────────────────────────────────────────────────────────
    path("company/profile/", CompanyProfileView.as_view(), name="company_profile"),

    # ── Customers ────────────────────────────────────────────────────────────
    path("customers/",                            CustomerListView.as_view(),           name="customer_list"),
    path("customers/<int:customer_id>/",          CustomerDetailView.as_view(),         name="customer_detail"),
    path("customers/<int:customer_id>/summary/",  CustomerLedgerSummaryView.as_view(),  name="customer_summary"),

    # ── Products ─────────────────────────────────────────────────────────────
    path("products/",                   ProductListView.as_view(),   name="product_list"),
    path("products/<int:product_id>/",  ProductDetailView.as_view(), name="product_detail"),

    # ── Invoices ─────────────────────────────────────────────────────────────
    # NOTE: static segments (dashboard) must come before <int:invoice_id>
    path("invoices/dashboard/",                 DashboardStatsView.as_view(),   name="dashboard"),
    path("invoices/",                           InvoiceListView.as_view(),      name="invoice_list"),
    path("invoices/<int:invoice_id>/",          InvoiceDetailView.as_view(),    name="invoice_detail"),
    path("invoices/<int:invoice_id>/download/", InvoiceDownloadView.as_view(),  name="invoice_download"),

    # ── Payments ─────────────────────────────────────────────────────────────
    path("payments/",                   PaymentListView.as_view(),   name="payment_list"),
    path("payments/<int:payment_id>/",  PaymentDetailView.as_view(), name="payment_detail"),

    # ── Ledger ───────────────────────────────────────────────────────────────
    # NOTE: static segment (outstanding) must come before <int:customer_id>
    path("ledger/outstanding/",          OutstandingReportView.as_view(), name="outstanding"),
    path("ledger/<int:customer_id>/",    LedgerEntriesView.as_view(),     name="ledger_entries"),

    # ── Reports ──────────────────────────────────────────────────────────────
    path("reports/gst-summary/",        GSTSummaryView.as_view(),          name="gst_summary"),
    path("reports/gstr1/",              GSTR1View.as_view(),               name="gstr1"),
    path("reports/gstr1/download/",     GSTR1ExcelDownloadView.as_view(),  name="gstr1_download"),
    path("reports/hsn-summary/",        HSNSummaryView.as_view(),          name="hsn_summary"),
    path("reports/monthly-sales/",      MonthlySalesView.as_view(),        name="monthly_sales"),
    
    # ── Backups ──────────────────────────────────────────────────────────────
    path("backups/create/",             BackupDatabaseView.as_view(),     name="create-backup"),
    path("backups/restore/",            RestoreDatabaseView.as_view(),    name="restore-backup"),
    path("backups/db-name/",            DatabaseNameView.as_view(),       name="db-name"),
]
