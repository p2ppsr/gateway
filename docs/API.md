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
- `accepts` (enum): Type of payment accepted ('BSV', 'fiat', 'both').

**Example Request:**
```json
{
  "amount": 50.00,
  "currency": "USD",
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
  "buttonId": "btn_123456789"
}
```

### POST `/invoice`

**Function:** Generates an invoice for a payment button, specifying a merchant, amount, and currency.

**Parameters:**
- `paymentButtonId` (string): ID of the payment button.
- `merchantId` (string): Merchant's ID.
- `currency` (string): Currency code.
- `amount` (float): Payment amount.

**Example Request:**
```json
{
  "paymentButtonId": "btn_123456789",
  "merchantId": "merchant1",
  "currency": "USD",
  "amount": 25.00
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

### GET `/listPayments`

**Function:** Lists all payments for a given merchant, with optional filtering by button ID.

**Parameters:**
- `buttonId` (string, optional): Filter payments by button ID.
- `limit` (int, optional): Number of payments per page.
- `offset` (int, optional): Pagination offset.
- `sort` (string, optional): Sort order ('asc' or 'desc').

**Example Request:**
`/listPayments?buttonId=btn_123456789&limit=10&offset=0&sort=desc`

**Example Response:**
```json
{
  "status": "success",
  "data": [
    {
      "payment_id": "pay_987654321",
      "merchant_id": "merchant1",
      "amount": 25.00,
      "currency": "USD",
      "completed": false,
      "is_new": true
    }
  ],
  "message": "Payments fetched successfully"
}
```

### GET `/listButtons`

**Function:** Lists all payment buttons for a merchant, with options to exclude single-use buttons and filter by usage.

**Parameters:**
- `excludeSingleUse` (string, optional): Exclude single-use buttons ('true' or 'false').
- `usage` (string, optional): Filter buttons by usage ('used', 'unused', 'all').
- `limit` (int, optional): Number of buttons per page.
- `offset` (int, optional): Pagination offset.
- `sort` (string, optional): Sort order ('asc' or 'desc').

**Example Request:**
`/listButtons?excludeSingleUse=true&usage=unused&limit=10&offset=0&sort=desc`

**Example Response:**
```json
{
  "status": "success",
  "data": [
    {
      "button_id": "btn_123456789",
      "amount": 50.00,
      "currency": "USD",
      "variable_amount": false,
      "multi_use": true,
      "used": false,
      "accepts": "BSV"
    }
  ],
  "message": "Payment buttons fetched successfully"
}
```

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

## Errors

The API uses standard HTTP status codes to indicate the success or failure of requests. Common responses include:

- `200 OK`: The request was successful, and the server responded with the requested data.
- `400 Bad Request`: The server could not understand the request due to invalid syntax.
- `404 Not Found`: The server could not find the requested resource. For example, a non-existent payment ID or button ID.
- `500 Internal Server Error`: The server encountered an unexpected condition that prevented it from fulfilling the request.

**Example Error Response:**
```json
{
  "status": "error",
  "message": "Explanation of the error here..."
}
```
