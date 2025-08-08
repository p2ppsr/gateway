# API Documentation

This document provides a comprehensive overview of the API endpoints designed for managing merchants, payment buttons, and payments. It details the purpose, parameters, and examples of requests and responses for each route, facilitating developers in integrating and utilizing the API effectively.

## Endpoints Overview

### POST `/createButton`

**Function:** Allows a merchant to create a new payment button with specified attributes.

**Parameters:**

- `amount` (float): The payment amount.
- `currency` (string): Currency code (e.g., USD, EUR).
- `variableAmount` (boolean): Whether the button accepts variable payment amounts.
- `multiUse` (boolean): Whether the button is for multiple uses.
- `accepts` (enum): Type of payment accepted (`BSV`, `fiat`, `both`).
- `spendingDescription` (string, optional): A description of the item or purpose of payment that is displayed to the user within their Wallet/Metanet client.

**Example Request:**
```json
{
  "amount": 1000,
  "currency": "BSV",
  "variableAmount": false,
  "multiUse": true,
  "accepts": "BSV"
}
```

**Example Response:**
```json
{
  "status": "success",
  "message": "Payment button created successfully",
  "buttonId": "c9fc1a237b9866d654d09798"
}
```

---

### POST `/invoice`

**Function:** Generates an invoice for a payment button, specifying a merchant, amount, and currency.

**Parameters:**

- `paymentButtonId` (string): ID of the payment button.
- `merchantId` (string): Merchant's ID.
- `currency` (string): Currency code.
- `amount` (float): Payment amount.
- `spendingDescription` (string, optional): A description of the item or purpose of payment that is displayed to the user within their Wallet/Metanet client.

**Example Request:**
```json
{
  "paymentButtonId": "btn_123456789",
  "merchantId": "merchant1",
  "currency": "USD",
  "amount": 25.0
}
```

**Example Response:**
```json
{
  "status": "success",
  "message": "Invoice created successfully",
  "paymentId": "pay_987654321"
}
```

---

### POST `/pay`

**Function:** Completes a payment for an invoice, marking it as paid.

**Parameters:**

- `paymentId` (string): ID of the payment.
- `transaction` (string): Transaction details.

**Example Request:**
```json
{
  "paymentId": "pay_987654321",
  "transaction": "Transaction details here..."
}
```

**Example Response:**
```json
{
  "status": "success",
  "message": "Payment completed successfully"
}
```

---

### GET `/listPayments`

**Function:** Lists all payments for a given merchant, with optional filtering by button ID.

**Parameters:**

- `buttonId` (string, optional): Filter payments by button ID.
- `limit` (int, optional): Number of payments per page (max 1000).
- `offset` (int, optional): Pagination offset.
- `sort` (string, optional): Sort order (`asc` or `desc`).

**Example Request:**
```
/listPayments?buttonId=btn_123456789&limit=10&offset=0&sort=desc
```

**Example Response:**
```json
{
  "status": "success",
  "data": [
    {
      "payment_id": "pay_987654321",
      "merchant_id": "merchant1",
      "amount": 25.0,
      "currency": "USD",
      "completed": false,
      "is_new": true
    }
  ],
  "total": 50,
  "message": "Payments fetched successfully"
}
```

> Note: The API supports server-side pagination with limit and offset, with a maximum limit of 1000. The `total` field is optional and, if present, indicates the total number of records available.

---

### GET `/listButtons`

**Function:** Lists all payment buttons for a merchant, with options to exclude single-use buttons and filter by usage.

**Parameters:**

- `excludeSingleUse` (string, optional): Exclude single-use buttons (`true` or `false`).
- `usage` (string, optional): Filter buttons by usage (`used`, `unused`, `all`).
- `limit` (int, optional): Number of buttons per page (max 1000).
- `offset` (int, optional): Pagination offset.
- `sort` (string, optional): Sort order (`asc` or `desc`).

**Example Request:**
```
/listButtons?excludeSingleUse=true&usage=unused&limit=10&offset=0&sort=desc
```

**Example Response:**
```json
{
  "status": "success",
  "data": [
    {
      "button_id": "btn_123456789",
      "amount": 50.0,
      "currency": "USD",
      "variable_amount": false,
      "multi_use": true,
      "used": false,
      "accepts": "BSV"
    }
  ],
  "total": 100,
  "message": "Payment buttons fetched successfully"
}
```

> Note: The API supports server-side pagination with limit and offset, with a maximum limit of 1000. The `total` field is optional and, if present, indicates the total number of records available.

---

### POST `/acknowledgePayment`

**Function:** Allows a merchant to acknowledge a payment, marking it as no longer new.

**Parameters:**

- `paymentId` (string): ID of the payment to acknowledge.

**Example Request:**
```json
{
  "paymentId": "pay_987654321"
}
```

**Example Response:**
```json
{
  "status": "success",
  "message": "Payment acknowledged successfully"
}
```

---

## Errors

The API uses standard HTTP status codes to indicate the success or failure of requests. Common responses include:

- `200 OK`: The request was successful, and the server responded with the requested data.
- `400 Bad Request`: The server could not understand the request due to invalid syntax.
- `404 Not Found`: The server could not find the requested resource.
- `500 Internal Server Error`: The server encountered an unexpected condition that prevented it from fulfilling the request.

**Example Error Response:**
```json
{
  "status": "error",
  "message": "Explanation of the error here..."
}
```
