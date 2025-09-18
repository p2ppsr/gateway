# Database Schema (Gateway)

**Updated:** 18 Sep 2025 14:05 UTC • Source of truth: `migrations/202508210900_initial.ts`

Gateway stores **satoshi-denominated** payments and embeddable “pay button” definitions.
Identifiers for buttons and payments are **12-char tokens** reserved in the `ids` table
and then referenced by `payment_buttons` and `payments`.

---

## Conventions

- **Units:** all monetary amounts are **satoshis** (`BIGINT UNSIGNED`). No fiat columns are stored.
- **Time:** `created_at` / `updated_at` are server-side timestamps (`DEFAULT NOW()`).
- **IDs:**
  - `merchant_id` and `admin_id` are compressed public keys (up to **66 chars**).
  - `button_id` / `payment_id` are **12-char** tokens created in `ids`.
- **Auth:** rows are owned by a merchant via `merchant_id` FKs with `ON DELETE CASCADE`.
- **Derivations:** BRC-29 data is stored on `payments` as `derivation_prefix` / `derivation_suffix`.

---

## Tables

### 1) `admins`

Created in `202508210900_initial.ts`.

| Column       | Type        | Null | Default | Notes  |
| ------------ | ----------- | ---- | ------- | ------ |
| `admin_id`   | VARCHAR(66) | NO   | —       | **PK** |
| `created_at` | TIMESTAMP   | YES  | `NOW()` |        |
| `updated_at` | TIMESTAMP   | YES  | `NOW()` |        |

---

### 2) `merchants`

Created in `202508210900_initial.ts`.

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

Created in `202508210900_initial.ts`.

| Column        | Type                     | Null | Default | Notes                                        |
| ------------- | ------------------------ | ---- | ------- | -------------------------------------------- |
| `id`          | CHAR(12)                 | NO   | —       | **PK** – reserved token (button or payment)  |
| `merchant_id` | VARCHAR(66)              | NO   | —       | **FK** → `merchants.merchant_id` (`CASCADE`) |
| `type`        | ENUM('payment','button') | NO   | —       | Resource kind                                |
| `timestamp`   | TIMESTAMP                | YES  | `NOW()` | Reservation time                             |

Usage: Clients first call the ID-reservation API; subsequent records in `payment_buttons` / `payments` must point to these tokens.

---

### 4) `payment_buttons`

Created in `202508210900_initial.ts`.

| Column            | Type            | Null | Default                | Notes                                                                                   |
| ----------------- | --------------- | ---- | ---------------------- | --------------------------------------------------------------------------------------- |
| `button_id`       | CHAR(12)        | NO   | —                      | **PK**, **FK** → `ids.id` (`CASCADE`)                                                   |
| `merchant_id`     | VARCHAR(66)     | NO   | —                      | **FK** → `merchants.merchant_id` (`CASCADE`)                                            |
| `payment_id`      | CHAR(12)        | YES  | `NULL`                 | Optional **FK** → `ids.id` (`CASCADE`) – last/seed payment token (single-use workflows) |
| `amount`          | BIGINT UNSIGNED | NO   | `0`                    | Default `0` for variable-amount buttons                                                 |
| `html_code`       | TEXT            | NO   | `'<div>Pay Now</div>'` | Embeddable code snippet                                                                 |
| `variable_amount` | BOOLEAN         | NO   | `false`                | Allows payer to enter amount                                                            |
| `multi_use`       | BOOLEAN         | NO   | `false`                | Button can be used repeatedly                                                           |
| `used`            | BOOLEAN         | NO   | `false`                | Server/UI mark for single-use buttons after success                                     |
| `created_at`      | TIMESTAMP       | YES  | `NOW()`                |                                                                                         |
| `updated_at`      | TIMESTAMP       | YES  | `NOW()`                |                                                                                         |

---

### 5) `payments`

Created in `202508210900_initial.ts`.

| Column                   | Type            | Null | Default | Notes                                               |
| ------------------------ | --------------- | ---- | ------- | --------------------------------------------------- |
| `payment_id`             | CHAR(12)        | NO   | —       | **PK**, **FK** → `ids.id` (`CASCADE`)               |
| `merchant_id`            | VARCHAR(66)     | NO   | —       | **FK** → `merchants.merchant_id` (`CASCADE`)        |
| `button_id`              | CHAR(12)        | NO   | —       | **FK** → `payment_buttons.button_id` (`CASCADE`)    |
| `derivation_prefix`      | VARCHAR(64)     | NO   | —       | BRC-29 prefix                                       |
| `derivation_suffix`      | VARCHAR(64)     | YES  | `NULL`  | BRC-29 suffix                                       |
| `amount`                 | BIGINT UNSIGNED | NO   | `0`     | Satoshis                                            |
| `payer_id`               | VARCHAR(255)    | YES  | `NULL`  | Optional payer identifier                           |
| `txid`                   | VARCHAR(64)     | YES  | `NULL`  | Network transaction id                              |
| `completed`              | BOOLEAN         | NO   | `false` | Server-side completion marker                       |
| `is_new`                 | BOOLEAN         | NO   | `true`  | For inbox/ack flow                                  |
| `blockchain_transaction` | LONGTEXT        | YES  | `NULL`  | Raw/atomic (e.g., BEEF)                             |
| `description`            | VARCHAR(80)     | NO   | `''`    | Short human label                                   |
| `created_at`             | TIMESTAMP       | YES  | `NOW()` |                                                     |
| `updated_at`             | TIMESTAMP       | YES  | `NOW()` |                                                     |

---

### 6) `server_settings`

Created in `202508210900_initial.ts`.

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

## Suggested Indexes (beyond PK/FKs)

- `payments (merchant_id, is_new, created_at DESC)`
- `payments (button_id, created_at DESC)`
- `payment_buttons (merchant_id, created_at DESC)`

MySQL creates indexes to satisfy FKs, but the above compound indexes help listing endpoints.

---

## DDL Snapshot (pseudo-SQL)

> This is illustrative; exact SQL is generated by Knex during migrations.

```sql
CREATE TABLE admins (...);
CREATE TABLE merchants (...);
CREATE TABLE ids (...);
CREATE TABLE payment_buttons (...);
CREATE TABLE payments (...);
CREATE TABLE server_settings (...);
```
