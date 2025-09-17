# Gateway API

**Updated:** 03Sep2025_1728 BST  
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

Returns basic server health.

**Response**

```json
{ "status": "success", "server": "ok" }
```

---

## ID Reservation

### `POST /initializeIds`

Reserve unique IDs with duplicate protection and retries (`src/routes/initializeIds.ts`). Used by the UI to pre-allocate identifiers for **buttons** or **payments** owned by a merchant.

**Body (examples)**

Reserve a **button** id

```json
{
  "merchantId": "0282f...65963",
  "resource": "button",
  "description": "T-shirt"
}
```

Reserve a **payment** id referencing an existing button

```json
{
  "merchantId": "0282f...65963",
  "resource": "payment",
  "buttonId": "7gAt6eG5a4he",
  "description": "Order #1234"
}
```

**Responses**

```json
{ "status": "success", "id": "hjvrfMJ7fNBs" }
```

or (when both are explicitly returned)

```json
{ "status": "success", "buttonId": "7gAt6eG5a4he", "paymentId": "hjvrfMJ7fNBs" }
```

**Notes**

- Validates `merchantId` (wallet identity key)
- Detects duplicates & retries on transient DB errors
- Enforces referential integrity when creating a `paymentId` for an existing `buttonId`

---

## Buttons

### `POST /createButton`

Create a button record and return an embed snippet (`src/routes/createButton.ts`).

**Body**

```json
{
  "merchantId": "0282f...65963",
  "amount": 5,
  "variable": false,
  "multiUse": true,
  "description": "Pay 5 Sats"
}
```

- `amount`: integer sats. For variable buttons, pass `0` and set `"variable": true`.
- `multiUse`: `true` for reusable buttons; `false`/omitted for single-use.
- `description`: optional spending description shown to the payer’s wallet.

**Response**

```json
{
  "status": "success",
  "button_id": "7gAt6eG5a4he",
  "payment_id": "hjvrfMJ7fNBs",
  "html": "<style>…</style><div class=\"gateway-paybutton\" …>Pay Now 5 Sats</div>",
  "script": "<script src=\"https://YOUR_DOMAIN/pay.js\"></script>"
}
```

**Notes**

- The `script` points to `public/pay.js`.
- The HTML uses `data-multiUse`, which maps to the `multiUse` prop in `PayButton` (`src/components/PayButton/index.tsx`).

---

### `GET /buttonCode/:paymentId`

Look up button metadata for a payment (used client-side to detect single-use buttons already used; `src/routes/buttonCode.ts`).

**Response**

```json
{
  "status": "success",
  "button_id": "7gAt6eG5a4he",
  "payment_id": "hjvrfMJ7fNBs",
  "multi_use": true,
  "used": false
}
```

---

## Invoicing & Payments (BRC-29)

### `POST /invoice`

Create an invoice for a specific button/payment and amount (`src/routes/invoice.ts`). Returns BRC-29 derivations and an output template for the wallet to sign.

**Body**

```json
{
  "merchantId": "0282f...65963",
  "buttonId": "7gAt6eG5a4he",
  "paymentId": "hjvrfMJ7fNBs",
  "amount": 5,
  "description": "Payment using paymentId: hjvrfMJ7fNBs"
}
```

- `description` optional (defaults to `"Default Description"`).

**Response**

```json
{
  "status": "success",
  "paymentId": "7D3bm2d9E8yQ",
  "derivation_prefix": "brc29:prefix:...",
  "derivation_suffix": "brc29:suffix:...",
  "outputs": [{ "lockingScript": "76a914…88ac", "satoshis": 5 }]
}
```

**Rules**

- `amount` must be a positive integer **≤ 10,000** (server cap).
- For variable buttons, the client sets the desired amount before requesting the invoice.
- The server may return a **new `paymentId`** to use for the pay step.

---

### `POST /pay`

Submit a signed transaction for the invoice (`src/routes/pay.ts`). The server validates, records, and returns the final `txid`.

**Body**

```json
{
  "paymentId": "7D3bm2d9E8yQ",
  "buttonId": "7gAt6eG5a4he",
  "transaction": {
    "txid": "36321...03065",
    "atomicBeefTx": "..." // Atomic BEEF hex
  },
  "lockingScript": "76a914…88ac",
  "amount": 5
}
```

**Response**

```json
{ "status": "success", "txid": "36321...03065" }
```

**Notes**

- Single-use buttons reject further attempts after a successful payment.
- Amounts over the configured cap are rejected.

---

## Listing & Admin

### `GET /listPayments`

List payments for the authenticated merchant (or the API key’s merchant), with optional filtering (`src/routes/listPayments.ts`).

**Query params**

- `buttonId` (optional)
- `isNew` (`true` | `false`, optional)
- `limit` (default **10**, max **1000**)
- `offset` (default **0**)
- `sort` (`asc` | `desc`, default **desc**)

**Response**

```json
{
  "status": "success",
  "data": [
    {
      "timestamp": "2025-09-03T01:07:19Z",
      "txid": "36321...03065",
      "payment_id": "7D3bm2d9E8yQ",
      "button_id": "7gAt6eG5a4he",
      "payer_id": "0282f...65963",
      "sats": 5,
      "description": "Payment using paymentId: 7D3bm2d9E8yQ",
      "complete": true,
      "is_new": false
    }
  ],
  "total": 178
}
```

---

### `GET /listButtons`

List buttons for the merchant with usage/status flags (`src/routes/listButtons.ts`). `total_paid` is the sum of sats from all linked payments.

**Query params**

- `usage` (`used` | `unused` | `all`, default **all**)
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
      "timestamp": "2025-09-03T01:05:41Z",
      "button_id": "7gAt6eG5a4he",
      "payment_id": "hjvrfMJ7fNBs",
      "sats": 5,
      "variable": false,
      "multi_use": true,
      "used": true,
      "total_paid": 10,
      "description": "Pay Now 5 Sats",
      "html": "<style>…</style><div class=\"gateway-paybutton\" …>…</div>"
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
{ "paymentId": "7D3bm2d9E8yQ" }
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
- **404 Not Found** — resource doesn’t exist (e.g., `"Button not found"`)
- **409 Conflict** — duplicate or single-use already used (e.g., `"This single-use button has already been used"`)
- **429 Too Many Requests** — rate limited
- **500 Internal Server Error** — unhandled server error (e.g., `"Database connection failed"`, `"Invalid transaction signature"`)

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
  data-merchant="0282f...65963"
  data-buttonId="7gAt6eG5a4he"
  data-paymentId="hjvrfMJ7fNBs"
  data-amount="5"
  data-text="Pay Now 5 Sats"
  data-variable="false"
  data-multiUse="true"
  data-server="https://YOUR_DOMAIN"
>
  Pay Now 5 Sats
</div>
<script src="https://YOUR_DOMAIN/pay.js"></script>
```

The client script (`public/pay.js`) verifies server availability, requests an invoice, signs, then calls **`/pay`**. The `PayButton` component maps `data-multiUse` to the `multiUse` prop internally. For **single-use** buttons, the UI disables the button after a successful payment.
