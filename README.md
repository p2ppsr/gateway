# Gateway — Simple Bitcoin Payments (BSV)

A secure, full-stack payment server and embeddable **Pay** button system for the **Bitcoin SV (BSV)** network.

- **Create & customize** fixed or variable-amount payment buttons with a live CSS preview (WYSIWYG).
- **Embed anywhere** via a single script (`public/pay.js`) that contains React + the button runtime.
- **BRC-29** derivations (prefix/suffix) for trustless invoice generation & validation.
- **List & manage** buttons and payments with fast, paginated tables.
- **Acknowledge** new payments from the UI (sets `is_new=false`).
- **Field persistence:** form/editor values persist across pages via `localStorage`, with a **Reset** button.
- **Security-hardened server:** Helmet, rate limiting, CORS, and a **max payment cap**.
- **Interactive logging:** per-file log toggles with HMR via `src/utils/logging.config.ts`.

---

## Contents

- [Quick Start](#quick-start)
- [Why `startup.sh`?](#why-startupsh)
- [Architecture & Workflow](#architecture--workflow)
- [What You Get](#what-you-get)
- [Security Hardening](#security-hardening)
- [Interactive Logging (per-file, HMR)](#interactive-logging-per-file-hmr)
- [Configuration](#configuration)
- [Key API Routes](#key-api-routes)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Roadmap / TODO](#roadmap--todo)
- [API & DB Docs](#api--db-docs)
- [License](#license)

---

## Introduction

The Gateway project is a secure, blockchain-based payment processing application designed to facilitate merchant payments using the Bitcoin SV (BSV) network. It provides a full-stack solution for creating and managing merchant buttons, handling payments, and ensuring secure transaction validation. The application integrates backend routes for ID initialization, payment acknowledgment, and transaction completion with frontend components for dynamic button display and editing.

Key features include: Displays fixed and variable merchant buttons with dynamic CSS updating using the edit box to drive changes: The frontend (e.g., src/pages/Create/index.tsx) allows merchants to create and edit fixed-amount or variable-amount buttons, with an edit box that dynamically updates the button's CSS styles in real-time, providing a WYSIWYG experience for customization. Uses secure BRC 29 for payments: The payment processing uses BRC 29 (Bitcoin Request for Comment 29) for secure, trustless invoice generation and validation. This ensures that payments are cryptographically verified using derivation prefixes and suffixes, preventing tampering and guaranteeing authenticity.

<img width="963" height="834" alt="349C6717-B066-4864-8269-E256EF28B972" src="https://github.com/user-attachments/assets/91c92c13-4e9e-4e4c-8a30-537b4ffad739" />

<img width="1535" height="768" alt="43B7C450-D9F9-4C52-AF17-33794250A183" src="https://github.com/user-attachments/assets/7b6b98fa-cdc3-417f-a51a-0b610370b808" />

<img width="1532" height="762" alt="E5942EB6-7922-470D-972A-B6A3058A950F" src="https://github.com/user-attachments/assets/d426393a-f2d2-40c2-b855-c31b8e8f2070" />

## Quick Start

> Requirements: **Docker**, **Node 18+**, **npm**. One command spins up MySQL in Docker, writes `.env`, installs deps, and runs **migrations only** (no seeds).

```bash
# 1) Clone & enter the repo
git clone https://github.com/your-org/gateway.git
cd gateway

# 2) Start DB + migrations (MySQL 8 on port 3307 by default)
./scripts/startup.sh                 # use: ./scripts/startup.sh --port 3310  to change DB port

# 3) Run server(s)
npm run start                        # Backend http://localhost:3001

# 4) Run dev server(s)
npm run dev                          # Frontend http://localhost:3000

# 5) Build the embeddable script (pay.js)
npm run build:inject                 # produces/serves public/pay.js used by merchant sites
```

### Why `startup.sh`?

It’s a cross-platform bootstrapper (Node under the hood) that creates/starts MySQL, ensures DB/user/grants, updates `.env`, installs npm deps, and applies **migrations only** (no seeds).

---

## Architecture & Workflow

### Embedding on a merchant site

1. The UI widget lives at **`src/components/PayButton/index.tsx`**.
2. During build, it’s **transpiled and injected** into a standalone bundle **`public/pay.js`** (includes React and everything needed).
3. Merchants paste the HTML snippet (generated in the UI) on their site and include the script:

```html
<!-- Example (dev) -->
<script src="http://localhost:3000/pay.js"></script>
```

4. The snippet includes data attributes (merchant, buttonId, paymentId, `variable`/single-use, etc.). The **PayButton** client:

- Verifies server availability (`/api/getStatus`)
- Requests an **invoice** (`/api/invoice`) with BRC-29 `derivation_prefix` / `derivation_suffix`
- Signs the transaction in the wallet
- Submits **pay** (`/api/pay`)
- Updates UI (e.g., disables single-use buttons after success)

---

## What You Get

### Frontend

- **Create a Button** — live CSS preview + copyable code panel.
- **Your Buttons** — sortable/paginated table, one-click copy, expandable sub-tables for multi-use buttons.
- **Payments** — paginated list with **Acknowledge** action (sets `is_new=false`).
- **Field Persistence** — forms/editors persist via `localStorage` with a **Reset** control.

### Backend

- **ID Reservation** (`/api/initializeIds`) — reserves button/payment IDs with locking + retry to avoid duplicates.
- **Acknowledge Payment** (`/api/acknowledgePayment`) — marks `is_new=false` for a `payment_id`.
- **Create/List Buttons & Payments**, **Invoice/Pay**, **Status** checks.
- **Clean schema** — BRC-29 derivations tracked (prefix/suffix).

---

## Security Hardening

Implemented in [`src/server.ts`](src/server.ts):

- **Helmet** HTTP headers.
- **Rate limiting**: 100 requests / 15 minutes / IP.
- **CORS**: restricted to `ALLOWED_ORIGIN` (default `http://localhost:3000`).
- **Body size limit**: JSON up to `1gb` (tunable).
- **Auth middleware**: wallet-based (`@bsv/auth-express-middleware`).
- **Payment guard**: rejects any payment **> `MAX_PAYMENT_SATS` (10,000 sats)** early.
- **Migrations on boot**: `db.migrate.latest()` at startup.
- **Robust error handling** + 404 logging; optional NGINX spawn for production.

---

## Interactive Logging (per-file, HMR)

Gateway ships with a colorized, elapsed-time logger you can **toggle per module** without restarting dev servers.

- Config: `src/utils/logging.config.ts`
- Logger: `src/utils/logging.ts`
- Usage:

```ts
import { logWithTimestamp as log } from '@/utils/logging'

const F = 'pages/Buttons'
log(F, 'Rendering Buttons table…', { rows: data.length })
```

**Enable/disable** logs by file key (hot-reloaded in dev):

```ts
// src/utils/logging.config.ts
const defaultLogging = false

const loggingConfig: { [file: string]: boolean } = {
  default: defaultLogging,
  'pages/Create': true,
  'pages/Buttons': true,
  'pages/Payments': true,
  'routes/createButton': true,
  'routes/buttonCode': true,
  'routes/initializeIds': true,
  'routes/invoice': true,
  'routes/pay': true,
  'routes/listButtons': true,
  'routes/listPayments': true,
  'utils/initializeIds': true,
  index: true,
  inject: true,
  server: true
}

export default loggingConfig
```

---

## Configuration

The bootstrap writes a minimal `.env`. Common variables:

```ini
# written by scripts/startup.js
SQL_DATABASE_HOST=127.0.0.1
SQL_DATABASE_PORT=3307
SQL_DATABASE_USER=gateway
SQL_DATABASE_PASSWORD=gateway123
SQL_DATABASE_DB_NAME=gateway

# app/server
HTTP_PORT=3001
ROUTING_PREFIX=/api
ALLOWED_ORIGIN=http://localhost:3000
WALLET_STORAGE_URL=
SERVER_PRIVATE_KEY=0000000000000000000000000000000000000000000000000000000000000000
SPAWN_NGINX=no
```

> **Important:** set a real 64-hex `SERVER_PRIVATE_KEY` before running in production.

---

## Key API Routes

Mounted under `ROUTING_PREFIX` (default `/api`). See `docs/API_UPDATED.md` & `docs/SCHEMA.md` for full details.

- `POST /initializeIds` — Reserve a **button** or **payment** ID (locks, retries, duplicate detection).
- `POST /acknowledgePayment` — Mark a payment as not new (`is_new=false`).
- `GET  /listButtons` — Paginated/sortable buttons.
- `GET  /listPayments` — Paginated payments with status fields.
- `POST /createButton` — Create a button definition and code.
- `POST /invoice` / `POST /pay` / `GET /getStatus` — Payment lifecycle.
- `GET  /buttonCode/:paymentId` — Embed metadata for a given payment/button.

---

## Development Workflow

### Tests

```bash
npm test
# or
npx jest
```

### Useful scripts

- `scripts/startup.sh` — DB + `.env` + migrations bootstrap (seedless).
- `scripts/teardown-gateway-docker.sh` — remove local containers/volumes.
- `scripts/watch-pay.sh` — dev watcher for payment logs.

### Patches (undo/redo)

Patches in `patches/` are sequential for simple rollback/forward:

```bash
git apply patches/0001*.patch
git apply -R patches/0001*.patch   # revert
```

**Database ops**:

```bash
npx knex migrate:latest
npx knex seed:run              # optional; startup does not run seeds
```

---

## Project Structure

````text
.
├── docker-compose.yml
├── Dockerfile
├── docs/
│   ├── API.md
│   └── SCHEMA.md
├── gateway-api.yaml
├── jest.config.js
├── knexfile.ts
├── logs/
│   └── watch-pay.log
├── migrations/
│   ├── 202508210900_initial.ts
│   ├── 202508211200_add_description_to_payments.ts
│   ├── 202508231620_optimize_schema_types.ts
│   ├── 202508241000_fix_payments_button_id_fk.ts
│   ├── 202508241218_make_payment_buttons_description_nullable.ts
│   ├── 20250827_schema_updates.ts
│   └── 202508311200_replace_transaction_id_with_derivation.ts
├── nginx.conf
├── patches/
├── public/
│   ├── pay.js
│   ├── button.html
│   ├── fixedMult.html
│   ├── fixedSingle.html
│   ├── variableMult.html
│   ├── variableSingle.html
│   ├── index.html
│   ├── favicon.ico
│   └── manifest.json
├── scripts/
│   ├── startup.js
│   ├── startup.sh
│   ├── setup-gateway-docker.sh
│   ├── teardown-gateway-docker.sh
│   ├── patch-completion.bash
│   ├── mkenv.sh
│   ├── do
│   ├── undo
│   ├── watch-pay.sh
│   └── watch-pay-org.sh
├── seeds/
│   └── seed.js
├── src/
│   ├── __tests__/
│   │   ├── routes/
│   │   │   ├── acknowledgePayment.test.ts
│   │   │   └── initializeIds.test.ts
│   │   └── utils/...
│   ├── components/
│   │   └── PayButton/index.tsx
│   ├── pages/ (Create, Buttons, Payments, Actions, Money)
│   ├── routes/ (invoice, pay, list*, acknowledgePayment, initializeIds, ...)
│   ├── utils/
│   │   ├── logging.config.ts
│   │   ├── logging.ts
│   │   └── *
│   ├── inject.tsx
│   ├── server.ts
│   └── *
├── webpack.common.ts
├── webpack.dev.ts
├── webpack.inject.ts
├── webpack.prod.ts
├── webpack.site.ts
└── tsconfig.json```

## Roadmap / TODO

- [x] Express server + MySQL (Knex)
- [x] Create buttons (fixed/variable) with live CSS preview
- [x] Payment submission + listings
- [x] JavaScript embed (**public/pay.js**) for any website
- [x] Field persistence via `localStorage` + Reset control
- [ ] Client-side callbacks & pluggable actions (email/webhooks)
- [ ] Admin dashboard (keys, hooks, fees, delegates)
- [ ] Additional UI polish & themes
````
