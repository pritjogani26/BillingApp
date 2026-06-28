-- ============================================================
-- SQL Migration: Update Payment Module & Ledger schema
-- ============================================================

-- 1. Drop index referencing invoice_id in payments table
DROP INDEX IF EXISTS idx_payments_invoice;

-- 2. Drop invoice_id column from payments table
ALTER TABLE payments DROP COLUMN IF EXISTS invoice_id;

-- 3. Drop index referencing payment_status in invoices table
DROP INDEX IF EXISTS idx_invoices_company_payment_status;

-- 4. Drop due_amount and payment_status from invoices table
ALTER TABLE invoices DROP COLUMN IF EXISTS due_amount;
ALTER TABLE invoices DROP COLUMN IF EXISTS payment_status;
