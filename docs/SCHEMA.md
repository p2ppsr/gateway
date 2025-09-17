# Database Schema (Gateway)

**Updated:** 03 Sep 2025 • Source of truth: `migrations/` (see filenames embedded below)

Gateway stores **satoshi-denominated** payments and embeddable “pay button” definitions.  
Identifiers for buttons and payments are **12-char tokens** reserved in the `ids` table and then referenced by
`payment_buttons` and `payments`.

---

## Conventions

- **Units:** all monetary amounts are **satoshis** (`BIGINT UNSIGNED`). No fiat columns are stored.
- **Time:** `created_at` / `updated_at` are server-side timestamps (`DEFAULT NOW()`).
- **IDs:**
  - `merchant_id` and `admin_id` are compressed public keys (up to **66 chars**).
  - `button_id` / `payment_id` are **12-char** tokens created in `ids`.
- **Auth:** rows are owned by a merchant via `merchant_id` FKs with `ON DELETE CASCADE`.
- **Derivations:** BRC-29 data is stored on `payments` as `derivation_prefix`/`derivation_suffix`.
- **FK cleanup / ordering / types:** see
  - `202508210900_initial.ts`
  - `202508231620_optimize_schema_types.ts`
  - `202508241018_fix_payments_button_id_fk.ts`
  - `202508241218_make_payment_buttons_description_nullable.ts`
  - `20250827_schema_updates.ts`
  - `202508311200_replace_transaction_id_with_derivation.ts`

---

## Tables

### 1) `admins`

Created in `initial.ts`, widened in `optimize_schema_types.ts`.

| Column       | Type        | Null | Default | Notes  |
| ------------ | ----------- | ---- | ------- | ------ |
| `admin_id`   | VARCHAR(66) | NO   | —       | **PK** |
| `created_at` | TIMESTAMP   | YES  | `NOW()` |        |
| `updated_at` | TIMESTAMP   | YES  | `NOW()` |        |

---

### 2) `merchants`

Created in `initial.ts`, `merchant_id` width & fee type tuned in `optimize_schema_types.ts`.

| Column            | Type          | Null | Default | Notes                  |
| ----------------- | ------------- | ---- | ------- | ---------------------- |
| `merchant_id`     | VARCHAR(66)   | NO   | —       | **PK**                 |
| `custom_fee_rate` | DECIMAL(10,6) | YES  | `0.0`   | Percentage (0–100)     |
| `welcomed`        | BOOLEAN       | NO   | `false` | Onboarding shown       |
| `custom_fee`      | BOOLEAN       | NO   | `false` | Uses `custom_fee_rate` |
| `created_at`      | TIMESTAMP     | YES  | `NOW()` |                        |
| `updated_at`      | TIMESTAMP     | YES  | `NOW()` |                        |

---

### 3) `ids`

Created in `initial.ts`; width aligned in `optimize_schema_types.ts`.

| Column        | Type                     | Null | Default | Notes                                        |
| ------------- | ------------------------ | ---- | ------- | -------------------------------------------- |
| `id`          | CHAR(12)                 | NO   | —       | **PK** – reserved token (button or payment)  |
| `merchant_id` | VARCHAR(66)              | NO   | —       | **FK** → `merchants.merchant_id` (`CASCADE`) |
| `type`        | ENUM('payment','button') | NO   | —       | Resource kind                                |
| `timestamp`   | TIMESTAMP                | YES  | `NOW()` | Reservation time                             |

> Usage: Clients first call the ID-reservation API; subsequent records in `payment_buttons` / `payments` must point to these tokens.

---

### 4) `payment_buttons`

Created in `initial.ts`; **description removed and `html_code` hardened** in `20250827_schema_updates.ts`.
`merchant_id` width aligned in `optimize_schema_types.ts`.

| Column            | Type            | Null | Default                | Notes                                                                                   |
| ----------------- | --------------- | ---- | ---------------------- | --------------------------------------------------------------------------------------- |
| `button_id`       | CHAR(12)        | NO   | —                      | **PK**, **FK** → `ids.id` (`CASCADE`)                                                   |
| `merchant_id`     | VARCHAR(66)     | NO   | —                      | **FK** → `merchants.merchant_id` (`CASCADE`)                                            |
| `payment_id`      | CHAR(12)        | YES  | `NULL`                 | Optional **FK** → `ids.id` (`CASCADE`) – last/seed payment token (single-use workflows) |
| `amount`          | BIGINT UNSIGNED | NO   | `0`                    | Default `0` for variable-amount buttons                                                 |
| `html_code`       | TEXT            | NO   | `'<div>Pay Now</div>'` | **NOT NULL** (hardened in `20250827_schema_updates.ts`)                                 |
| `variable_amount` | BOOLEAN         | NO   | `false`                | Allows payer to enter amount                                                            |
| `multi_use`       | BOOLEAN         | NO   | `false`                | Button can be used repeatedly                                                           |
| `used`            | BOOLEAN         | NO   | `false`                | Server/UI mark for single-use buttons after success                                     |
| `created_at`      | TIMESTAMP       | YES  | `NOW()`                |                                                                                         |
| `updated_at`      | TIMESTAMP       | YES  | `NOW()`                |                                                                                         |

> **Removed columns:**
>
> - `description` (made nullable in `202508241218…`, **dropped** in `20250827_schema_updates.ts`)
> - `total_paid` (**dropped** in `20250827_schema_updates.ts`)  
>   **Never existed (old doc):** `currency`, `accepts`

---

### 5) `payments`

Created in `initial.ts`, extended/fixed by subsequent migrations:

- `description` added (`202508211200…`) and constrained to `VARCHAR(80) NOT NULL DEFAULT ''` (`202508231620…`)
- `exchange_rate` **dropped** (`202508231620…`)
- `button_id` FK now points to **`payment_buttons.button_id`** (`202508241018…`)
- `transaction_id` **renamed** to **`derivation_prefix`**, and **`derivation_suffix`** added (`202508311200…`)

| Column                   | Type            | Null | Default | Notes                                               |
| ------------------------ | --------------- | ---- | ------- | --------------------------------------------------- |
| `payment_id`             | CHAR(12)        | NO   | —       | **PK**, **FK** → `ids.id` (`CASCADE`)               |
| `merchant_id`            | VARCHAR(66)     | NO   | —       | **FK** → `merchants.merchant_id` (`CASCADE`)        |
| `button_id`              | CHAR(12)        | NO   | —       | **FK** → `payment_buttons.button_id` (`CASCADE`)    |
| `derivation_prefix`      | VARCHAR(64)     | NO   | —       | Replaces `transaction_id`; BRC-29 prefix            |
| `derivation_suffix`      | VARCHAR(64)     | YES  | `NULL`  | BRC-29 suffix (populated `'1'` in migration)        |
| `amount`                 | BIGINT UNSIGNED | NO   | `0`     | Satoshis                                            |
| `payer_id`               | VARCHAR(255)    | YES  | `NULL`  | Optional payer identifier                           |
| `txid`                   | VARCHAR(64)     | YES  | `NULL`  | Network transaction id                              |
| `completed`              | BOOLEAN         | NO   | `false` | Server-side completion marker                       |
| `is_new`                 | BOOLEAN         | NO   | `true`  | For inbox/ack flow                                  |
| `blockchain_transaction` | LONGTEXT        | YES  | `NULL`  | Raw/atomic (e.g., BEEF)                             |
| `description`            | VARCHAR(80)     | NO   | `''`    | Short human label (added/constrained by migrations) |
| `created_at`             | TIMESTAMP       | YES  | `NOW()` |                                                     |
| `updated_at`             | TIMESTAMP       | YES  | `NOW()` |                                                     |

> **Removed columns:** `exchange_rate`  
> **Renamed:** `transaction_id` → `derivation_prefix`

---

### 6) `server_settings`

Created in `initial.ts`.

| Column                 | Type           | Null | Default | Notes      |
| ---------------------- | -------------- | ---- | ------- | ---------- |
| `id`                   | INT AUTO_INC   | NO   | —       | **PK**     |
| `stripe_api_key`       | VARCHAR(255)   | YES  | `NULL`  | Optional   |
| `sendgrid_credentials` | TEXT           | YES  | `NULL`  | Optional   |
| `default_fee_rate`     | DECIMAL(24,10) | YES  | `0`     | Percentage |
| `setup_complete`       | BOOLEAN        | NO   | `false` |            |
| `created_at`           | TIMESTAMP      | YES  | `NOW()` |            |
| `updated_at`           | TIMESTAMP      | YES  | `NOW()` |            |

---

## Relationships (ER Overview)

- **Merchant → IDs**: `merchants.merchant_id` (1-to-many) ← `ids.merchant_id`
- **IDs → Buttons**: `ids.id` (1-to-1) → `payment_buttons.button_id`
- **IDs → Payments**: `ids.id` (1-to-1) → `payments.payment_id`
- **Merchant → Buttons**: `merchants.merchant_id` (1-to-many) ← `payment_buttons.merchant_id`
- **Merchant → Payments**: `merchants.merchant_id` (1-to-many) ← `payments.merchant_id`
- **Button → Payments**: `payment_buttons.button_id` (1-to-many) ← `payments.button_id`

All FKs use **`ON DELETE CASCADE`**.

---

## “payment_buttons” — Field Justification (current)

> Supersedes older table that listed `description`, `total_paid`, `currency`, `accepts` (no longer present).

| Field                   | Why it exists / behavior                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `button_id`             | Stable 12-char token from `ids`; couples UI embed and ledger.                                                        |
| `merchant_id`           | Ownership & isolation; cascades on merchant deletion.                                                                |
| `payment_id`            | Optional link to a pre-reserved payment token (handy for single-use flows / deep links).                             |
| `amount`                | Default amount in sats. `0` when the button is variable and the payer will choose.                                   |
| `html_code`             | Canonical snippet rendered in the UI; hardened to **NOT NULL** with a safe default so buttons are always embeddable. |
| `variable_amount`       | Client UX toggle for variable vs fixed price.                                                                        |
| `multi_use`             | Governs whether the server/UI should allow repeated successful pays.                                                 |
| `used`                  | Single-use safety latch; prevents replay after success (enforced client & server side).                              |
| `created_at/updated_at` | Auditing / ordering.                                                                                                 |

---

## Notable Differences from the Old Document

- **Removed** from schema: `currency`, `accepts`, `total_paid`, and **button** `description`.
- **Payments** now store **BRC-29** derivations: `derivation_prefix` + `derivation_suffix`.
- **All monetary values are in sats**; `exchange_rate` was dropped.
- `merchant_id` / `admin_id` are **VARCHAR(66)** (compressed keys).
- `payments.button_id` now **references `payment_buttons.button_id`** (not `ids`).

---

## Suggested Indexes (beyond PK/FKs)

- `payments (merchant_id, is_new, created_at DESC)`
- `payments (button_id, created_at DESC)`
- `payment_buttons (merchant_id, created_at DESC)`

> MySQL creates indexes to satisfy FKs, but the above compound indexes help listing endpoints.

---

## DDL Snapshot (pseudo-SQL)

> This is illustrative; exact SQL is generated by Knex during migrations.

```sql
CREATE TABLE merchants (
  merchant_id        VARCHAR(66) PRIMARY KEY,
  custom_fee_rate    DECIMAL(10,6) UNSIGNED DEFAULT 0.0,
  welcomed           BOOLEAN NOT NULL DEFAULT FALSE,
  custom_fee         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ids (
  id             CHAR(12) PRIMARY KEY,
  merchant_id    VARCHAR(66) NOT NULL,
  type           ENUM('payment','button') NOT NULL,
  timestamp      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE payment_buttons (
  button_id        CHAR(12) PRIMARY KEY,
  merchant_id      VARCHAR(66) NOT NULL,
  payment_id       CHAR(12) NULL,
  amount           BIGINT UNSIGNED NOT NULL DEFAULT 0,
  html_code        TEXT NOT NULL DEFAULT '<div>Pay Now</div>',
  variable_amount  BOOLEAN NOT NULL DEFAULT FALSE,
  multi_use        BOOLEAN NOT NULL DEFAULT FALSE,
  used             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (button_id)  REFERENCES ids(id)         ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (payment_id) REFERENCES ids(id)         ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (merchant_id)REFERENCES merchants(merchant_id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE payments (
  payment_id            CHAR(12) PRIMARY KEY,
  merchant_id           VARCHAR(66) NOT NULL,
  button_id             CHAR(12) NOT NULL,
  derivation_prefix     VARCHAR(64) NOT NULL,
  derivation_suffix     VARCHAR(64) NULL DEFAULT NULL,
  amount                BIGINT UNSIGNED NOT NULL DEFAULT 0,
  payer_id              VARCHAR(255) NULL,
  txid                  VARCHAR(64) NULL,
  completed             BOOLEAN NOT NULL DEFAULT FALSE,
  is_new                BOOLEAN NOT NULL DEFAULT TRUE,
  blockchain_transaction LONGTEXT NULL,
  description           VARCHAR(80) NOT NULL DEFAULT '',
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchant_id) REFERENCES merchants(merchant_id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (button_id)   REFERENCES payment_buttons(button_id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (payment_id)  REFERENCES ids(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE admins (
  admin_id    VARCHAR(66) PRIMARY KEY,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE server_settings (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  stripe_api_key        VARCHAR(255) NULL,
  sendgrid_credentials  TEXT NULL,
  default_fee_rate      DECIMAL(24,10) UNSIGNED DEFAULT 0,
  setup_complete        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
