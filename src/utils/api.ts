// src/utils/api.ts
/**
 * @file src/utils/api.ts
 * @description
 * Thin compatibility wrapper around your existing `fetchWithTimeout` that:
 *  - Resolves relative URLs against CONFIG.API_BASE
 *  - Uses plain object headers (Record<string, string>)
 *  - Stringifies JSON / URLSearchParams bodies
 *  - Supports legacy call shapes:
 *      fetchWithAuth(url, init)
 *      fetchWithAuth(url, init, wallet)
 *      fetchWithAuth(url, init, wallet, timeoutMs)
 *    and the same for fetchJsonWithAuth
 *
 * @version 1.3.0 (2025-09-07)
 */

import { fetchWithTimeout } from "./general";
import { CONFIG } from "./constants";
import type { WalletClient } from "@bsv/sdk";

type HeaderMap = Record<string, string>;

export interface ApiInit {
  method?: string;
  headers?: HeaderMap;
  body?: unknown;
  /** Per-request timeout; default 30000ms */
  timeoutMs?: number;
}

/** Module-level default wallet for 2-arg legacy calls. */
let DEFAULT_WALLET: WalletClient | undefined;

/**
 * Set the default wallet to use when callers omit the `wallet` argument.
 * Call this once after you’ve connected/authenticated the wallet.
 */
export function setApiDefaultWallet(wallet: WalletClient) {
  DEFAULT_WALLET = wallet;
}

/** Internal: resolve relative paths against CONFIG.API_BASE. */
export function resolveApiUrl(pathOrUrl: string): string {
  const base = (CONFIG.API_BASE ?? "").replace(/\/+$/, "");
  const isAbs = /^https?:\/\//i.test(pathOrUrl);
  if (isAbs) return pathOrUrl;
  const needsSlash = pathOrUrl.startsWith("/") ? "" : "/";
  return `${base}${needsSlash}${pathOrUrl}`;
}

/** Internal: ensure we have a wallet, or throw with a helpful message. */
function requireWallet(wallet?: WalletClient): WalletClient {
  const w = wallet ?? DEFAULT_WALLET;
  if (w == null) {
    throw new Error(
      "No wallet provided. Pass a wallet as the 3rd argument or call setApiDefaultWallet(wallet) once after connecting.",
    );
  }
  return w;
}

/** Internal: normalize headers/body for fetchWithTimeout’s typing. */
function normalizeRequest(init: ApiInit = {}): {
  headers: HeaderMap;
  body?: string;
  method: string;
  timeoutMs: number;
} {
  const headers: HeaderMap = { ...(init.headers ?? {}) };

  let bodyStr: string | undefined;
  if (init.body == null) {
    bodyStr = undefined;
  } else if (typeof init.body === "string") {
    bodyStr = init.body;
  } else if (init.body instanceof URLSearchParams) {
    bodyStr = init.body.toString();
    if (!headers["Content-Type"]) {
      headers["Content-Type"] =
        "application/x-www-form-urlencoded;charset=UTF-8";
    }
  } else {
    bodyStr = JSON.stringify(init.body);
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  return {
    headers,
    body: bodyStr,
    method: init.method ?? "GET",
    timeoutMs: init.timeoutMs ?? 30000,
  };
}

/* =========================================================
 * Core helpers (modern names)
 * ========================================================= */

/** Core fetch: returns native Response. */
export async function apiFetch(
  pathOrUrl: string,
  init: ApiInit = {},
  wallet?: WalletClient,
): Promise<Response> {
  const url = resolveApiUrl(pathOrUrl);
  const { headers, body, method, timeoutMs } = normalizeRequest(init);
  const w = requireWallet(wallet);
  return await fetchWithTimeout(url, { method, headers, body }, w, timeoutMs);
}

/** JSON convenience: throws on !ok, returns parsed JSON (empty body -> {}). */
export async function apiJson<T = unknown>(
  pathOrUrl: string,
  init: ApiInit = {},
  wallet?: WalletClient,
): Promise<T> {
  const res = await apiFetch(pathOrUrl, init, wallet);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
    throw new Error(`${msg} (Status: ${res.status})`);
  }
  return data as T;
}

/* =========================================================
 * Back-compat (legacy names + call shapes)
 * ========================================================= */

/**
 * Legacy wrapper with overloads to match existing call sites:
 *   fetchWithAuth(url, init)
 *   fetchWithAuth(url, init, wallet)
 *   fetchWithAuth(url, init, wallet, timeoutMs)
 */
export function fetchWithAuth(
  pathOrUrl: string,
  init: ApiInit,
): Promise<Response>;
export function fetchWithAuth(
  pathOrUrl: string,
  init: ApiInit,
  wallet: WalletClient,
): Promise<Response>;
export function fetchWithAuth(
  pathOrUrl: string,
  init: ApiInit,
  wallet: WalletClient,
  timeoutMs: number,
): Promise<Response>;
export async function fetchWithAuth(
  pathOrUrl: string,
  init: ApiInit = {},
  walletOrTimeout?: WalletClient | number,
  maybeTimeout?: number,
): Promise<Response> {
  let wallet: WalletClient | undefined;
  let timeoutOverride: number | undefined;

  if (typeof walletOrTimeout === "number") {
    timeoutOverride = walletOrTimeout;
  } else {
    wallet = walletOrTimeout;
  }
  if (typeof maybeTimeout === "number") {
    timeoutOverride = maybeTimeout;
  }

  const effInit: ApiInit = { ...init };
  if (typeof timeoutOverride === "number") {
    effInit.timeoutMs = timeoutOverride;
  }
  return await apiFetch(pathOrUrl, effInit, wallet);
}

/**
 * Legacy JSON wrapper with the same overloads:
 *   fetchJsonWithAuth(url, init)
 *   fetchJsonWithAuth(url, init, wallet)
 *   fetchJsonWithAuth(url, init, wallet, timeoutMs)
 */
export function fetchJsonWithAuth<T = unknown>(
  pathOrUrl: string,
  init: ApiInit,
): Promise<T>;
export function fetchJsonWithAuth<T = unknown>(
  pathOrUrl: string,
  init: ApiInit,
  wallet: WalletClient,
): Promise<T>;
export function fetchJsonWithAuth<T = unknown>(
  pathOrUrl: string,
  init: ApiInit,
  wallet: WalletClient,
  timeoutMs: number,
): Promise<T>;
export async function fetchJsonWithAuth<T = unknown>(
  pathOrUrl: string,
  init: ApiInit = {},
  walletOrTimeout?: WalletClient | number,
  maybeTimeout?: number,
): Promise<T> {
  let wallet: WalletClient | undefined;
  let timeoutOverride: number | undefined;

  if (typeof walletOrTimeout === "number") {
    timeoutOverride = walletOrTimeout;
  } else {
    wallet = walletOrTimeout;
  }
  if (typeof maybeTimeout === "number") {
    timeoutOverride = maybeTimeout;
  }

  const effInit: ApiInit = { ...init };
  if (typeof timeoutOverride === "number") {
    effInit.timeoutMs = timeoutOverride;
  }
  return await apiJson<T>(pathOrUrl, effInit, wallet);
}
