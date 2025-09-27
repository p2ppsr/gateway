# Gateway API

**Updated:** 18Sep2025_1338 UTC  
**Base URL (default dev):** `http://localhost:3001/api`  
All requests/returns are **JSON** unless noted.

> **Security defaults**
>
> - **Rate limit:** 100 requests / 15 minutes / IP
> - **CORS:** locked to `ALLOWED_ORIGIN` (env; defaults to `http://localhost:3000`)
> - **Max payment cap:** any request that carries an amount **> 10,000 sats** is rejected
> - **Migrations:** schema is applied on boot via Knex; schema errors return structured JSON

Authentication uses `@bsv/auth-express-middleware`. Unauthenticated calls are allowed where appropriate, but the client SDK (e.g., `AuthFetch` from `@bsv/sdk`) will attach wallet context and identity when available.

---

## Setup and Dependencies

The Gateway API uses MySQL configured from `.env` (see `src/setup.js` and `knexfile.ts`). Required variables:

- `SQL_DATABASE_HOST`, `SQL_DATABASE_PORT`, `SQL_DATABASE_USER`, `SQL_DATABASE_PASSWORD`, `SQL_DATABASE_DB_NAME` — MySQL connection
- `HTTP_PORT` — API server port (default: `3001`)
- `HOSTING_DOMAIN` — public domain (default: `http://localhost:3000`)
- `BSV_NETWORK` — blockchain network (`mainnet` or `testnet`)
- `SPAWN_NGINX` — whether to spawn NGINX (`yes`/`no`, default `no`)

Run the bootstrap (`scripts/startup.sh` / `scripts/startup.js`) to create/update `.env`, install deps, and apply **migrations only**. Ensure MySQL is running and reachable.

---

## Conventions

- All endpoints are prefixed with **`/api`** (configurable via `ROUTING_PREFIX`).
- Amounts are **satoshis (integer)**. For variable-amount buttons, the client sets the final value at pay time.
- Timestamps are ISO-8601 UTC strings.
- Pagination uses `limit` (default **10**, max **1000**) and `offset` (default **0**).

---

## Health

### `GET /getStatus`

Returns basic server health/environment.

**Response**

```json
{ "status": "success", "network": "mainnet", "isAdmin": false }
```

---

## ID Reservation

### `POST /initializeIds`

Reserve unique IDs with duplicate protection and retries (`src/routes/initializeIds.ts`).  
Use this to pre-allocate a **buttonId** or **paymentId** owned by a merchant.

**Body shape**

```ts
interface Ids {
  buttonId?: string
  paymentId?: string
  merchantId: string
  description: string // required, max 80 chars
}
```

**Example A — reserve a new `buttonId`** (server generates the id)

```json
{
  "merchantId": "03abc...def",
  "description": "T-shirt"
}
```

**Example B — reserve a specific `buttonId`** (you provide it)

```json
{
  "merchantId": "03abc...def",
  "buttonId": "7gAt6eG5a4he",
  "description": "T-shirt"
}
```

**Example C — reserve a `paymentId` for an existing `buttonId`**

```json
{
  "merchantId": "03abc...def",
  "buttonId": "7gAt6eG5a4he",
  "paymentId": "hjvrfMJ7fNBs",
  "description": "Order #1234"
}
```

**Response (all cases)**

```json
{ "status": "success", "id": "hjvrfMJ7fNBs" }
```

**Notes**

- Validates `merchantId` (wallet identity key) and requires it to match the authenticated caller.
- Detects duplicates & retries on transient DB errors (up to 3 attempts).
- When reserving a `paymentId` and supplying `buttonId`, the server verifies that `buttonId` already exists in `ids`.
- The `ids` table is the source of truth. Downstream tables (`payment_buttons`, `payments`) must reference these tokens.

---

## Buttons

### `POST /createButton`

Create a button record and seed its first payment record (`src/routes/createButton.ts`). Requires IDs to be **pre-reserved** via `/initializeIds`.

**Body**

```json
{
  "amount": 5000,
  "variableAmount": false,
  "multiUse": true,
  "description": "Pay 5k sats",
  "htmlCode": "<div>Pay Now</div>",
  "paymentId": "hjvrfMJ7fNBs",
  "buttonId": "7gAt6eG5a4he"
}
```

- `amount`: integer sats. For variable buttons, pass `0` and set `"variableAmount": true`.
- `multiUse`: `true` for reusable buttons; `false`/omitted for single-use.
- `description`: optional spending description shown to the payer’s wallet (stored on `payments`).

**Response**

```json
{
  "status": "success",
  "message": "Payment button and payment created successfully",
  "paymentId": "hjvrfMJ7fNBs",
  "buttonId": "7gAt6eG5a4he"
}
```

**Notes**

- The HTML snippet you pass (`htmlCode`) is stored and later returned by `/buttonCode/:paymentId`.
- The server also creates/merges an initial `payments` row for the given `paymentId` and `buttonId`.

---

### `GET /buttonCode/:paymentId`

Look up the embeddable snippet for a payment and its button (`src/routes/buttonCode.ts`).  
Used by client sites to render the button and include `pay.js`.

**Response**

```json
{
  "status": "success",
  "payment_id": "hjvrfMJ7fNBs",
  "button_id": "7gAt6eG5a4he",
  "multi_use": true,
  "used": false,
  "code": "<style>…</style><div id=\"7gAt6eG5a4he\" class=\"gateway-paybutton\" data-paymentId=\"hjvrfMJ7fNBs\" data-buttonId=\"7gAt6eG5a4he\" data-amount=\"5000\" data-variable=\"false\">Pay Now 5000 Sats</div><script src=\"https://YOUR_DOMAIN/pay.js\"></script>"
}
```

---

## Invoicing & Payments (BRC-29 compatible)

### `POST /invoice`

Create an invoice for a specific button/payment and amount (`src/routes/invoice.ts`).  
Returns a locking script and **outputs** for the wallet to fulfill.

**Body**

```json
{
  "merchantId": "03abc...def",
  "buttonId": "7gAt6eG5a4he",
  "paymentId": "hjvrfMJ7fNBs",
  "amount": 5000,
  "description": "Payment using paymentId: hjvrfMJ7fNBs"
}
```

**Response**

```json
{
  "status": "success",
  "message": "Invoice created successfully",
  "paymentId": "hjvrfMJ7fNBs",
  "outputs": [
    {
      "lockingScript": "76a914...88ac",
      "customInstructions": "{\"derivationPrefix\":\"<hex>\",\"derivationSuffix\":\"<hex>\",\"payee\":\"03abc...def\"}",
      "satoshis": 5000,
      "outputDescription": "Payment using paymentId: hjvrfMJ7fNBs",
      "merchantId": "03abc...def"
    }
  ]
}
```

**Rules**

- Server enforces `amount` to be a positive integer **≤ 10,000** (cap).
- For variable buttons, the client sets the desired amount before requesting the invoice.
- For **multi-use** buttons, the server may generate a **new `paymentId`** for each invoice.

---

### `POST /pay`

Submit a signed transaction for the invoice (`src/routes/pay.ts`). The server validates the transaction, verifies the derived locking script, records the result, and returns the final `txid`.

**Body**

```json
{
  "paymentId": "hjvrfMJ7fNBs",
  "buttonId": "7gAt6eG5a4he",
  "transaction": {
    "txid": "36321...03065",
    "atomicBeefTx": "..." // Atomic BEEF hex
  },
  "lockingScript": "76a914...88ac",
  "amount": 5000
}
```

**Response**

```json
{
  "status": "success",
  "message": "Payment completed successfully",
  "txid": "36321...03065"
}
```

**Notes**

- Single-use buttons are marked `used` after a successful payment.
- The server rejects if `lockingScript` doesn’t match the server-derived script or output amount doesn’t match the invoice.

---

## Listing & Admin

### `GET /listPayments`

List payments for the authenticated merchant (`src/routes/listPayments.ts`).

**Query params**

- `status` (`all` | `completed` | `new`, default **all**)
- `limit` (default **10**, max **1000**)
- `offset` (default **0**)

**Response**

```json
{
  "status": "success",
  "data": [
    {
      "payment_id": "hjvrfMJ7fNBs",
      "txid": "36321...03065",
      "payer_id": "03abc...def",
      "amount": 5000,
      "completed": true,
      "is_new": false,
      "created_at": "2025-09-03T01:07:19Z",
      "button_id": "7gAt6eG5a4he",
      "description": "Payment using paymentId: hjvrfMJ7fNBs"
    }
  ],
  "total": 178
}
```

---

### `GET /listButtons`

List buttons for the merchant with usage/status flags (`src/routes/listButtons.ts`).

**Query params**

- `usage` (`used` | `unused`, optional; default **all**)
- `excludeSingleUse` (`true` | `false`, default **false**)
- `limit` (default **10**, max **1000**)
- `offset` (default **0**)
- `sort` (`asc` | `desc`, default **desc**)

**Response**

```json
{
  "status": "success",
  "data": [
    {
      "buttonId": "7gAt6eG5a4he",
      "merchantId": "03abc...def",
      "paymentId": "hjvrfMJ7fNBs",
      "amount": 5000,
      "htmlCode": "<div>Pay Now</div>",
      "variableAmount": false,
      "multiUse": true,
      "used": true,
      "calculated_total": 10000,
      "createdAt": "2025-09-03T01:05:41Z",
      "updatedAt": "2025-09-03T01:05:41Z",
      "payments": [
        {
          "paymentId": "hjvrfMJ7fNBs",
          "derivationPrefix": "…",
          "derivationSuffix": "…",
          "amount": 5000,
          "txid": "36321...03065",
          "completed": true,
          "createdAt": "2025-09-03T01:06:00Z",
          "description": "Payment using paymentId: hjvrfMJ7fNBs"
        }
      ]
    }
  ],
  "total": 182
}
```

---

### `POST /acknowledgePayment`

Mark a payment as seen (`is_new = false`; `src/routes/acknowledgePayment.ts`).

**Body**

```json
{ "paymentId": "hjvrfMJ7fNBs" }
```

**Response**

```json
{ "status": "success", "message": "Payment acknowledged successfully" }
```

---

## Errors

**Common HTTP status codes**

- **200 OK** — success
- **400 Bad Request** — missing/invalid parameters (e.g., `"Invalid amount: must be a positive integer"`)
- **401 Unauthorized** — missing/invalid identity
- **403 Forbidden** — authenticated identity does not own the resource
- **404 Not Found** — resource doesn’t exist (e.g., `"Button not found"`)
- **409 Conflict** — duplicate or single-use already used (e.g., `"This single-use button has already been used"`)
- **429 Too Many Requests** — rate limited
- **500 Internal Server Error** — unhandled server error

**Error shape**

```json
{ "status": "error", "message": "Explanation of the error…" }
```

---

## Embedding (merchant sites)

Buttons generated by the UI include a snippet like (`src/components/PayButton/index.tsx`):

```html
<style>
  /* … styles … */
</style>
<div
  class="gateway-paybutton gateway-paybutton-fixed"
  data-merchant="03abc...def"
  data-buttonId="7gAt6eG5a4he"
  data-paymentId="hjvrfMJ7fNBs"
  data-amount="5000"
  data-text="Pay Now 5000 Sats"
  data-variable="false"
  data-multiUse="true"
  data-server="https://YOUR_DOMAIN"
>
  Pay Now 5000 Sats
</div>
<script src="https://YOUR_DOMAIN/pay.js"></script>
```
