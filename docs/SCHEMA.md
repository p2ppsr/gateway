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
