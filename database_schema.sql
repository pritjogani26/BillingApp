-- ============================================================
-- ROLES
-- ============================================================
CREATE TABLE roles (
    role_id     SERIAL PRIMARY KEY,
    role        VARCHAR(50)         -- e.g. 'SUPERADMIN', 'ADMIN', 'STAFF'
);

CREATE TABLE invoice_sequences (
    id SERIAL PRIMARY KEY,
    sequence_name VARCHAR(100) NOT NULL,
    next_number INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO invoice_sequences (sequence_name, next_number)
VALUES
('GST_INVOICE', 1),
('RETAIL_INVOICE', 1);

-- ============================================================
-- COMPANY PROFILE
-- ============================================================
CREATE TABLE company_profile (
    company_id      SERIAL PRIMARY KEY,
    company_name    VARCHAR(255),               -- e.g. 'Acme Pvt Ltd'
    gstin           VARCHAR(20),                -- e.g. '27AAPFU0939F1ZV'
    pan_number      VARCHAR(20),                -- e.g. 'AAPFU0939F'
    address         TEXT,                       -- e.g. '12, MG Road, Pune'
    city            VARCHAR(100),               -- e.g. 'Pune'
    state           VARCHAR(100),               -- e.g. 'Maharashtra'
    pincode         VARCHAR(20),                -- e.g. '411001'
    phone           VARCHAR(20),                -- e.g. '9876543210'
    email           VARCHAR(255),               -- e.g. 'contact@acme.com'
    bank_name       VARCHAR(255),               -- e.g. 'HDFC Bank'
    account_number  VARCHAR(100),               -- e.g. '50100123456789'
    ifsc_code       VARCHAR(20),                -- e.g. 'HDFC0001234'
    logo_path       TEXT,                       -- e.g. '/uploads/logos/acme.png'
    created_at      TIMESTAMPTZ,
    created_by      INT,                        -- e.g. 1
    updated_at      TIMESTAMPTZ,
    updated_by      INT                         -- e.g. 2
);


-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    user_id     SERIAL PRIMARY KEY,
    company_id  INT REFERENCES company_profile(company_id),     -- e.g. 1
    username    VARCHAR(100),                                    -- e.g. 'john.doe'
    password    TEXT,                                            -- hashed value
    full_name   VARCHAR(150),                                    -- e.g. 'John Doe'
    role        INT REFERENCES roles(role_id),                   -- e.g. 2  ← changed
    status      CHAR,                                            -- 'A' = Active, 'I' = Inactive, 'D' = Deleted
    created_at  TIMESTAMPTZ,
    created_by  INT,                                             -- e.g. 1
    updated_at  TIMESTAMPTZ,
    updated_by  INT                                              -- e.g. 2
);


-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
    customer_id     SERIAL PRIMARY KEY,
    company_id      INT REFERENCES company_profile(company_id), -- e.g. 1
    company_name    VARCHAR(255),               -- e.g. 'Beta Traders'
    contact_person  VARCHAR(255),               -- e.g. 'Ravi Sharma'
    gstin           VARCHAR(20),                -- e.g. '27AAPFU0939F1ZV'
    pan_number      VARCHAR(20),                -- e.g. 'AAPFU0939F'
    address         TEXT,                       -- e.g. '45, Nehru Nagar, Mumbai'
    city            VARCHAR(100),               -- e.g. 'Mumbai'
    state           VARCHAR(100),               -- e.g. 'Maharashtra'
    pincode         VARCHAR(20),                -- e.g. '400001'
    mobile          VARCHAR(20),                -- e.g. '9123456789'
    email           VARCHAR(255),               -- e.g. 'ravi@betatraders.com'
    rate            DECIMAL(10,2),              -- e.g. 1500.00 (custom pricing rate)
    status          CHAR,                       -- 'A' = Active, 'I' = Inactive, 'D' = Deleted
    created_at      TIMESTAMPTZ,
    created_by      INT,                        -- e.g. 1
    updated_at      TIMESTAMPTZ,
    updated_by      INT                         -- e.g. 2
);


-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE products (
    product_id      SERIAL PRIMARY KEY,
    company_id      INT REFERENCES company_profile(company_id), -- e.g. 1
    customer_id     INT REFERENCES customers(customer_id),      -- e.g. 5  ← added
    product_name    VARCHAR(255),                                -- e.g. 'Flex Banner 13oz'
    hsn_code        VARCHAR(20),                                 -- e.g. '4911'
    gst_percentage  DECIMAL(5,2),                                -- e.g. 18.00
    height          DECIMAL(10,2),                               -- e.g. 4.00 (in feet)
    width           DECIMAL(10,2),                               -- e.g. 6.00 (in feet)
    price           DECIMAL(12,2),                               -- e.g. 35.00 (per sq ft)
    description     TEXT,                                        -- e.g. 'Premium outdoor flex banner'
    status          CHAR,                                        -- 'A' = Active, 'I' = Inactive, 'D' = Deleted
    created_at      TIMESTAMPTZ,
    created_by      INT,                                         -- e.g. 1
    updated_at      TIMESTAMPTZ,
    updated_by      INT                                          -- e.g. 2
);


-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE invoices
 (
    invoice_id      SERIAL PRIMARY KEY,
    company_id      INT REFERENCES company_profile(company_id),         -- e.g. 1
    customer_id     INT REFERENCES customers(customer_id),              -- e.g. 5
    invoice_number  VARCHAR(100),                                        -- e.g. 'INV-2024-0001'
    invoice_type    VARCHAR(20),                                         -- 'GST' or 'NON_GST'
    invoice_date    DATE,                                                -- e.g. '2024-07-15'
    due_date        DATE,                                                -- e.g. '2024-07-15'
    subtotal        DECIMAL(12,2),                                       -- e.g. 5000.00
    cgst_amount     DECIMAL(12,2),                                       -- e.g. 450.00
    sgst_amount     DECIMAL(12,2),                                       -- e.g. 450.00
    igst_amount     DECIMAL(12,2),                                       -- e.g. 0.00
    discount_amount DECIMAL(12,2) default 0.00,                            -- e.g. 200.00
    round_off       DECIMAL(12,2),                                       -- e.g. 0.50
    grand_total     DECIMAL(12,2),                                       -- e.g. 5700.50
    due_amount      DECIMAL(12,2),                                       -- e.g. 2700.50
    payment_status  VARCHAR(20),                                         -- 'PENDING', 'PARTIAL', 'PAID'
    status          CHAR,                                                -- 'A' = Active, 'D' = Deleted  ← added
    notes           TEXT,                                                -- e.g. 'Delivery within 3 days'
    created_at      TIMESTAMPTZ,
    created_by      INT,                                                 -- e.g. 1
    updated_at      TIMESTAMPTZ,
    updated_by      INT                                                  -- e.g. 2
);



CREATE TABLE invoice_items (
    item_id         SERIAL PRIMARY KEY,
    invoice_id      INT REFERENCES invoices(invoice_id) ON DELETE CASCADE, -- e.g. 10
    company_id      INT REFERENCES company_profile(company_id),            -- e.g. 1
    product_id      INT REFERENCES products(product_id),                   -- e.g. 3
    product_name    VARCHAR(255),                               -- e.g. 'Flex Banner 13oz'  ← added
    hsn_code        VARCHAR(20), 
    quantity        DECIMAL(12,2),                              -- e.g. 24.00 (sq ft)
    unit_price      DECIMAL(12,2),                              -- e.g. 35.00
    gst_percentage  DECIMAL(5,2),                               -- e.g. 18.00
    taxable_amount  DECIMAL(12,2),                              -- e.g. 840.00
    cgst_amount     DECIMAL(12,2),                              -- e.g. 75.60
    sgst_amount     DECIMAL(12,2),                              -- e.g. 75.60
    igst_amount     DECIMAL(12,2),                              -- e.g. 0.00
    total_amount    DECIMAL(12,2),                              -- e.g. 991.20
    status          CHAR,                                       -- 'A' = Active, 'D' = Deleted  ← added
    created_at      TIMESTAMPTZ                                 -- e.g. '2024-07-15 10:30:00+05:30'  ← added
);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE payments (
    payment_id          SERIAL PRIMARY KEY,
    invoice_id          INT REFERENCES invoices(invoice_id),            -- e.g. 10
    company_id          INT REFERENCES company_profile(company_id),     -- e.g. 1
    customer_id         INT REFERENCES customers(customer_id),          -- e.g. 5
    payment_date        DATE,                                            -- e.g. '2024-07-20'
    payment_method      VARCHAR(50),                                     -- 'CASH', 'BANK', 'UPI', 'CHEQUE'
    reference_number    VARCHAR(255),                                    -- e.g. 'TXN123456789'
    amount              DECIMAL(12,2),                                   -- e.g. 3000.00
    notes               TEXT,                                            -- e.g. 'Partial payment received'
    created_at          TIMESTAMPTZ,
    created_by          INT,                                             -- e.g. 1  ← added
    updated_at          TIMESTAMPTZ,                                     -- ← added
    updated_by          INT                                              -- e.g. 2  ← added
);



-- ============================================================
-- LEDGER ENTRIES
-- ============================================================
CREATE TABLE ledger_entries (
    entry_id                    SERIAL PRIMARY KEY,
    company_id                  INT REFERENCES company_profile(company_id),  -- e.g. 1
    customer_id                 INT REFERENCES customers(customer_id),       -- e.g. 5
    transaction_type            VARCHAR(20),    -- 'DEBIT' or 'CREDIT'
    reference_type              VARCHAR(50),    -- 'INVOICE' or 'PAYMENT'
    reference_id                INT,            -- e.g. 10 (invoice_id or payment_id)
    transaction_date            DATE,           -- e.g. '2024-07-15'
    debit_amount                DECIMAL(12,2),  -- e.g. 5700.50
    credit_amount               DECIMAL(12,2),  -- e.g. 0.00
    balance_after_transaction   DECIMAL(12,2),  -- e.g. 8700.50
    remarks                     TEXT,           -- e.g. 'Invoice INV-2024-0001 raised'
    created_at                  TIMESTAMPTZ
);


-- ============================================================
-- GST REPORTS
-- ============================================================
CREATE TABLE gst_reports (
    report_id               SERIAL PRIMARY KEY,
    company_id              INT REFERENCES company_profile(company_id), -- e.g. 1
    month                   INT,                                         -- e.g. 7 (July)
    year                    INT,                                         -- e.g. 2024
    total_taxable_amount    DECIMAL(12,2),                               -- e.g. 150000.00
    total_cgst              DECIMAL(12,2),                               -- e.g. 13500.00
    total_sgst              DECIMAL(12,2),                               -- e.g. 13500.00
    total_igst              DECIMAL(12,2),                               -- e.g. 2000.00
    status                  CHAR,                                        -- 'A' = Active, 'D' = Deleted  ← added
    generated_at            TIMESTAMPTZ
);


-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================

-- invoices: dashboard pending/collected, outstanding report
CREATE INDEX IF NOT EXISTS idx_invoices_company_status
    ON invoices(company_id, payment_status);

-- invoices: monthly sales trend queries
CREATE INDEX IF NOT EXISTS idx_invoices_company_date
    ON invoices(company_id, invoice_date);

-- ledger_entries: running balance lookup (ORDER BY entry_id DESC LIMIT 1)
-- and all ledger list queries
CREATE INDEX IF NOT EXISTS idx_ledger_company_customer_entry
    ON ledger_entries(company_id, customer_id, entry_id DESC);

-- customers: all customer list queries filter on company_id + status
CREATE INDEX IF NOT EXISTS idx_customers_company_status
    ON customers(company_id, status);
