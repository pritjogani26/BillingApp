-- ============================================================
-- ROLES
-- ============================================================
CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO roles (role_name)
VALUES
('SUPERADMIN'),
('ADMIN'),
('STAFF');


-- ============================================================
-- invoice sequences
-- ============================================================
CREATE TABLE invoice_sequences (
    sequence_id SERIAL PRIMARY KEY,
    sequence_name VARCHAR(100) NOT NULL UNIQUE,
    next_number INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO invoice_sequences (sequence_name, next_number)
VALUES
('TAX_INVOICE', 1),
('RETAIL_INVOICE', 1);


-- ============================================================
-- COMPANY PROFILE
-- ============================================================
CREATE TABLE company (
    company_id      SERIAL PRIMARY KEY,
    company_name    VARCHAR(255) NOT NULL,
    gstin           VARCHAR(15) UNIQUE,
    pan_number      VARCHAR(10),

    address         TEXT,
    city            VARCHAR(100),
    state           VARCHAR(100),
    pincode         VARCHAR(10),

    phone           VARCHAR(20),
    email           VARCHAR(255),

    bank_name       VARCHAR(255),
    account_number  VARCHAR(100),
    ifsc_code       VARCHAR(20),

    logo_path       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      INT,
    updated_at      TIMESTAMPTZ,
    updated_by      INT
);

CREATE INDEX idx_company_name
ON company(company_name);


-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    user_id         SERIAL PRIMARY KEY,
    company_id      INT NOT NULL REFERENCES company(company_id),
    username        VARCHAR(100) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    full_name       VARCHAR(150) NOT NULL,
    role_id         INT NOT NULL REFERENCES roles(role_id),
    status          CHAR(1) NOT NULL DEFAULT 'A',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      INT,
    updated_at      TIMESTAMPTZ,
    updated_by      INT
);

CREATE INDEX idx_users_company_status
ON users(company_id, status);


-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
    customer_id         SERIAL PRIMARY KEY,
    company_id          INT NOT NULL REFERENCES company(company_id),
    customer_name       VARCHAR(255) NOT NULL,
    contact_person      VARCHAR(255),

    gstin               VARCHAR(15),
    pan_number          VARCHAR(10),

    address             TEXT,
    city                VARCHAR(100),
    state               VARCHAR(100),
    pincode             VARCHAR(10),

    mobile              VARCHAR(20),
    email               VARCHAR(255),

    default_rate        DECIMAL(10,2) DEFAULT 0,
    status              CHAR(1) NOT NULL DEFAULT 'A',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          INT,
    updated_at          TIMESTAMPTZ,
    updated_by          INT,

    CONSTRAINT uq_customers_company_name
        UNIQUE(company_id, customer_name)
);

CREATE INDEX idx_customers_company_status
ON customers(company_id, status);

CREATE INDEX idx_customers_company_name
ON customers(company_id, customer_name);


-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE products (
    product_id          SERIAL PRIMARY KEY,
    company_id          INT NOT NULL REFERENCES company(company_id),
    customer_id         INT REFERENCES customers(customer_id), -- Just Reference, not mandatory
    product_name        VARCHAR(255) NOT NULL,
    hsn_code            VARCHAR(20),
    gst_percentage DECIMAL(5,2) DEFAULT 0,
    height              DECIMAL(10,2),
    width               DECIMAL(10,2),
    unit_price          DECIMAL(12,2),
    description         TEXT,
    status              CHAR(1) NOT NULL DEFAULT 'A',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          INT,
    updated_at          TIMESTAMPTZ,
    updated_by          INT,

    CONSTRAINT uq_products_company_name
        UNIQUE(company_id, customer_id, product_name)
);

CREATE INDEX idx_products_company_status
ON products(company_id, status);

CREATE INDEX idx_products_company_name
ON products(company_id, product_name);


-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE invoices (
    invoice_id          SERIAL PRIMARY KEY,
    company_id          INT NOT NULL REFERENCES company(company_id),
    customer_id         INT NOT NULL REFERENCES customers(customer_id),
    invoice_number      VARCHAR(50) NOT NULL,
    invoice_type VARCHAR(20) NOT NULL CHECK (invoice_type IN ('TAX', 'RETAIL')),
    invoice_date DATE NOT NULL,
    financial_year VARCHAR(10) NOT NULL,
    due_date DATE,
    subtotal            DECIMAL(12,2) NOT NULL,
    cgst_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
    sgst_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
    igst_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount     DECIMAL(12,2) NOT NULL DEFAULT 0,
    round_off           DECIMAL(12,2) NOT NULL DEFAULT 0,
    grand_total         DECIMAL(12,2) NOT NULL,
    due_amount          DECIMAL(12,2) NOT NULL,
    payment_status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    status              CHAR(1) NOT NULL DEFAULT 'A',
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          INT,
    updated_at          TIMESTAMPTZ,
    updated_by          INT,

    CONSTRAINT uq_invoices_company_invoice_no
        UNIQUE(company_id, invoice_number)
);
CREATE INDEX idx_invoices_company_date
ON invoices(company_id, invoice_date);

CREATE INDEX idx_invoices_company_payment_status
ON invoices(company_id, payment_status);

CREATE INDEX idx_invoices_customer_date
ON invoices(customer_id, invoice_date DESC);


-- ============================================================
-- INVOICE ITEMS
-- ============================================================
CREATE TABLE invoice_items (
    item_id             SERIAL PRIMARY KEY,
    invoice_id          INT NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
    company_id          INT NOT NULL REFERENCES company(company_id),
    product_id          INT REFERENCES products(product_id),
    product_name        VARCHAR(255) NOT NULL,
    hsn_code            VARCHAR(20),
    quantity            DECIMAL(12,2) NOT NULL,
    unit_price          DECIMAL(12,2) NOT NULL,
    gst_percentage      DECIMAL(5,2) NOT NULL DEFAULT 0,
    taxable_amount      DECIMAL(12,2) NOT NULL,
    cgst_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
    sgst_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
    igst_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount        DECIMAL(12,2) NOT NULL,
    status              CHAR(1) NOT NULL DEFAULT 'A',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_items_invoice
ON invoice_items(invoice_id);

CREATE INDEX idx_invoice_items_company
ON invoice_items(company_id);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE payments (
    payment_id          SERIAL PRIMARY KEY,
    company_id          INT NOT NULL REFERENCES company(company_id),
    customer_id         INT NOT NULL REFERENCES customers(customer_id),
    invoice_id          INT REFERENCES invoices(invoice_id),
    payment_date        DATE NOT NULL,
    payment_method      VARCHAR(50) NOT NULL,
    reference_number    VARCHAR(255),
    amount              DECIMAL(12,2) NOT NULL,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          INT,
    updated_at          TIMESTAMPTZ,
    updated_by          INT
);

CREATE INDEX idx_payments_customer_date
ON payments(customer_id, payment_date DESC);

CREATE INDEX idx_payments_company_date
ON payments(company_id, payment_date);

CREATE INDEX idx_payments_invoice
ON payments(invoice_id);



-- ============================================================
-- LEDGER ENTRIES
-- ============================================================
CREATE TABLE ledger_entries (
    entry_id                    SERIAL PRIMARY KEY,
    company_id                  INT NOT NULL REFERENCES company(company_id),
    customer_id                 INT NOT NULL REFERENCES customers(customer_id),
    transaction_type            VARCHAR(20) NOT NULL,
    reference_type              VARCHAR(20) NOT NULL,
    reference_id                INT NOT NULL,
    transaction_date            DATE NOT NULL,
    debit_amount                DECIMAL(12,2) NOT NULL DEFAULT 0,
    credit_amount               DECIMAL(12,2) NOT NULL DEFAULT 0,
    running_balance             DECIMAL(12,2) NOT NULL,
    remarks                     TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_customer_date
ON ledger_entries(customer_id, transaction_date);

CREATE INDEX idx_ledger_company_customer
ON ledger_entries(company_id, customer_id);

CREATE INDEX idx_ledger_reference
ON ledger_entries(reference_type, reference_id);