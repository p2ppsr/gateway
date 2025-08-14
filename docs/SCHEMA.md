# Database Schema Documentation

This document outlines the structure of the database for the application. It describes the tables, their fields, and the significance of each field. The database is structured into five main tables: `merchants`, `payment_buttons`, `payments`, `admins`, and `server_settings`. Below is a detailed description of each.

## `merchants`

This table stores information about merchants.

- `merchant_id` (string, primary key): Unique identifier for the merchant.
- `custom_fee_rate` (float): Custom fee rate for transactions, expressed as a percentage from 0 to 100.
- `welcomed` (boolean): Indicates whether the merchant has been introduced to the service with a tutorial (true) or not (false).
- `custom_fee` (boolean): Indicates whether the merchant receives a custom fee rate (true) or the default rate (false).
- `created_at` (timestamp): The date and time when the merchant record was created.
- `updated_at` (timestamp): The date and time when the merchant record was last updated.

## `payment_buttons`

This table stores information about payment buttons.

- `button_id` (string, primary key): Unique identifier for the payment button.
- `amount` (float): The fixed amount that the button is set to collect. This field is ignored if `variable_amount` is true.
- `currency` (string): Currency code (e.g., USD, EUR) for the payment button.
- `variable_amount` (boolean): Indicates whether the button accepts variable payment amounts (true) or only the fixed amount specified (false).
- `merchant_id` (string): References `merchant_id` in the `merchants` table. Indicates the owner of the payment button.
- `multi_use` (boolean): Indicates whether the button can be used multiple times (true) or is one-time use (false).
- `used` (boolean): Indicates whether the button has been used at least once (true) or not (false).
- `total_paid` (float): The total amount paid through this button.
- `accepts` (enum): Specifies the payment type accepted by the button - 'BSV', 'fiat', or 'both'.
- `created_at` (timestamp): The date and time when the payment button record was created.
- `updated_at` (timestamp): The date and time when the payment button record was last updated.

## `payments`

This table records payment transactions.

- `id` (increments, primary key): Unique identifier for the payment.
- `merchant_id` (string): References `merchant_id` in the `merchants` table. Specifies the recipient of the payment.
- `completed` (boolean): Indicates whether the payment was completed successfully (true) or not (false).
- `transaction_info` (longtext): Detailed transaction information or metadata.
- `amount` (float): The amount of the payment.
- `currency` (string): Currency code (e.g., USD, EUR) of the payment.
- `exchange_rate` (float): The exchange rate applied to the payment at the time of transaction.
- `payment_button_id` (string): References `button_id` in the `payment_buttons` table. Specifies the payment button used for the transaction.
- `created_at` (timestamp): The date and time when the payment record was created.
- `updated_at` (timestamp): The date and time when the payment record was last updated.

## `admins`

This table stores information about administrators.

- `admin_id` (string, primary key): Unique identifier for the administrator.
- `created_at` (timestamp): The date and time when the admin record was created.
- `updated_at` (timestamp): The date and time when the admin record was last updated.

## `server_settings`

This table contains settings related to the server and third-party integrations.

- `id` (increments, primary key): Unique identifier for the setting record.
- `stripe_api_key` (string): The Stripe API key used for processing payments.
- `sendgrid_credentials` (text): Credentials for SendGrid used for sending emails.
- `default_fee_rate` (float): The default fee rate for transactions, expressed as a percentage from 0 to 100.
- `setup_complete` (boolean): Indicates whether the initial server setup has been completed (true) or not (false).
- `created_at` (timestamp): The date and time when the server setting record was created.
- `updated_at` (timestamp): The date and time when the server setting record was last updated.


# Revised Justification Table for payment_buttons Fields

Below is the updated table, ordered as follows:

Primary Key: button_id  
Foreign Keys: merchant_id, payment_id  
Non-Nullable Attributes: amount, description, html_code, variable_amount, multi_use, used  
Nullable Attributes: total_paid  
Timestamps: created_at, updated_at  

| Field Name | Data Type | Nullability | Default Value | Constraints | Justification |
|------------|-----------|-------------|---------------|-------------|---------------|
| button_id | string(12) | Not Nullable | None | Primary Key, References ids.id with onDelete('CASCADE') | The button_id serves as the unique identifier for each payment button, acting as the primary key. It is a 12-character string referencing the ids table to ensure uniqueness and traceability to a merchant-generated ID. The notNullable constraint is essential as every button must have a valid ID upon creation. The onDelete('CASCADE') ensures that if the associated ID is deleted, all related buttons are removed, maintaining data integrity. |
| merchant_id | string(255) | Not Nullable | None | References merchants.merchant_id with onDelete('CASCADE') | This field links each payment button to its merchant, ensuring every button is associated with a valid merchant. The 255-character length provides flexibility for merchant identifiers, and notNullable is required as a button cannot exist without a merchant. The onDelete('CASCADE') ensures that deleting a merchant cascades to remove all its buttons, preserving referential integrity. |
| payment_id | string(12) | Nullable | None | References ids.id with onDelete('CASCADE') | The payment_id optionally links a button to a specific payment, set after the button is used (e.g., for single-use buttons). Its nullability reflects that not all buttons will have an associated payment immediately or ever (e.g., multi-use buttons). The reference to ids.id with onDelete('CASCADE') ensures that if the payment ID is deleted, the button’s reference is cleared, avoiding orphaned data. |
| amount | bigInteger(unsigned) | Not Nullable | 0 | None | The amount represents the initial configured payment amount for the button, mandatory at creation. A default of 0 is set to accommodate variable-amount buttons, where the payer determines the amount, while fixed-amount buttons use a specified value. The notNullable constraint ensures every button has a base value, and unsigned prevents negative amounts. It is not updated post-insert for variable buttons; actual paid amounts are tracked in total_paid or payments, avoiding merchant confusion as discussed, with a UI note clarifying this for variable buttons. |
| description | text | Not Nullable | 'No description' | None | The description provides context for the payment’s purpose, making it mandatory to ensure customers understand the transaction. Set at button generation, it defaults to 'No description' if not specified, satisfying the non-nullable rule. Its text type allows for flexible length, and the requirement aligns with the need for clarity, preventing optional omission post-creation as agreed. |
| html_code | text | Not Nullable | `&lt;div&gt;Pay Now&lt;/div&gt;` | None | The html_code defines the button’s display HTML, mandatory to ensure every button has a visible representation. Set at generation, it defaults to a basic `&lt;div&gt;Pay Now&lt;/div&gt;` if not customized, adhering to the non-nullable rule. The text type supports complex HTML, and its mandatory nature guarantees usability, with no post-insert updates expected as discussed. |
| variable_amount | boolean | Not Nullable | false | None | This flag indicates if the button allows variable amounts, set at creation. The notNullable constraint with a default of false ensures every button has a defined behavior, aligning with the rule that fields set on insert need not be nullable. It is not updated post-insert, simplifying the schema. |
| multi_use | boolean | Not Nullable | false | None | The multi_use flag determines if the button can be used multiple times, set at creation. The notNullable constraint with a default of false ensures a clear initial state, consistent with the non-nullable rule for insert-only fields. |
| used | boolean | Not Nullable | false | None | The used flag tracks if the button has been used, defaulting to false at creation. While it may be updated to true post-insert, the notNullable constraint with a default ensures a valid initial state, fitting the rule as it’s set on insert with potential updates. |
| total_paid | bigInteger(unsigned) | Nullable | None | None | The total_paid field accumulates the total amount paid through the button, updated after each payment. Its nullability reflects that no payments may have occurred initially, aligning with the rule for fields updated post-insert. The unsigned constraint prevents negative totals. |
| created_at | timestamp | Not Nullable | knex.fn.now() | None | The created_at timestamp records the button’s creation time, automatically set on insert. The notNullable constraint with a default ensures every record has a creation date, consistent with audit field placement. |
| updated_at | timestamp | Not Nullable | knex.fn.now() | None | The updated_at timestamp records the last update time, automatically set on insert and updated on modification. The notNullable constraint with a default ensures every record has an update date, serving as an audit field. |



