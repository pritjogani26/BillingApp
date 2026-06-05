from django.urls import path
# from billing.views import (
#     auth_view, company_view, customers_view,
#     products_view, invoices_view, payments_view,
#     ledger_view, reports_view
# )

urlpatterns = [
    # ── auth ────────────────────────────────────────────────────────────────
    # path("auth/health/", auth_view.HealthView.as_view(), name="health"),
    # path("auth/login/",            auth_view.LoginView.as_view(),          name="login"),
    # path("auth/me/", auth_view.MeView.as_view(), name="me"),
    # path("auth/change-password/",  auth_view.ChangePasswordView.as_view(), name="change_password"),

    # # ── company ─────────────────────────────────────────────────────────────
    # path('company/profile/',        company_view.CompanyProfileView.as_view(), name='company_profile'),
    # path('company/profile/update/', company_view.CompanyProfileView.as_view(), name='company_update'),

    # # ── customers ───────────────────────────────────────────────────────────
    # path('customers/',                           customers_view.CustomerListView.as_view(),           name='customer_list'),
    # path('customers/<int:customer_id>/',         customers_view.CustomerDetailView.as_view(),         name='customer_detail'),
    # path('customers/<int:customer_id>/summary/', customers_view.CustomerLedgerSummaryView.as_view(), name='customer_summary'),

    # # ── products ────────────────────────────────────────────────────────────
    # path('products/',                  products_view.ProductListView.as_view(),   name='product_list'),
    # path('products/<int:product_id>/', products_view.ProductDetailView.as_view(), name='product_detail'),

    # # ── invoices ─────────────────────────────────────────────────────────────
    # path('invoices/dashboard/',                    invoices_view.DashboardStatsView.as_view(),    name='dashboard'),       # ✅ Fixed: moved before <int:>
    # path('invoices/',                              invoices_view.InvoiceListView.as_view(),       name='invoice_list'),
    # path('invoices/<int:invoice_id>/',             invoices_view.InvoiceDetailView.as_view(),     name='invoice_detail'),
    # path('invoices/<int:invoice_id>/download/',    invoices_view.InvoiceDownloadView.as_view(),   name='invoice_download'),

    # # ── payments ────────────────────────────────────────────────────────────
    # path('payments/',                  payments_view.PaymentListView.as_view(),   name='payment_list'),
    # path('payments/<int:payment_id>/', payments_view.PaymentDetailView.as_view(), name='payment_detail'),

    # # ── ledger ──────────────────────────────────────────────────────────────
    # path('ledger/outstanding/',           ledger_view.OutstandingReportView.as_view(), name='outstanding'),
    # path('ledger/<int:customer_id>/',     ledger_view.LedgerEntriesView.as_view(),     name='ledger_entries'),

    # # ── reports ─────────────────────────────────────────────────────────────
    # path('reports/gst-summary/',   reports_view.GSTSummaryView.as_view(),   name='gst_summary'),
    # path('reports/gstr1/',         reports_view.GSTR1View.as_view(),          name='gstr1'),
    # path('reports/hsn-summary/',   reports_view.HSNSummaryView.as_view(),    name='hsn_summary'),
    # path('reports/monthly-sales/', reports_view.MonthlySalesView.as_view(),  name='monthly_sales'),
]