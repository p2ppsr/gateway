/**
 * @file src/utils/initializeIds.ts
 * Validate/register an ID with:
 *  1) native GET /getStatus (no auth)
 *  2) auth GET /getStatus (signed; allowed to fail)
 *  3) auth POST /initializeIds (signed)
 */

import { logWithTimestamp } from './logging';
import { generateBase58, isBase58 } from './general';
import { toast } from 'react-toastify';
import { WalletClient, AuthFetch } from '@bsv/sdk';
import type { Dispatch, SetStateAction } from 'react';
import { loadClientConfig } from './clientConfig';
import type { ClientConfig } from './clientConfig';

const F = 'utils/initializeIds';

export type InitializeIdsResponse = {
  status: 'success' | 'error';
  message?: string;
  id?: string;
};

type MaybeSetter = Dispatch<SetStateAction<string>> | undefined;

function setDescriptionsIfPayment(
  type: 'payment' | 'button',
  desc: string,
  setSpendingDescription_fixed?: MaybeSetter,
  setSpendingDescription_variable?: MaybeSetter
) {
  if (type === 'payment' && setSpendingDescription_fixed && setSpendingDescription_variable) {
    setSpendingDescription_fixed(desc);
    setSpendingDescription_variable(desc);
    logWithTimestamp(F, `initializeIds: Updated spending descriptions: "${desc}"`);
  }
}

async function ensureWalletSubstrate(wallet: WalletClient) {
  const candidates: ReadonlyArray<{
    name: 'HTTPWalletJSON' | 'HTTPWalletWire' | 'WindowCWISubstrate' | 'XDMSubstrate' | 'ReactNativeWebView';
    arg: 'json-api' | 'Cicada' | 'window.CWI' | 'XDM' | 'react-native';
    onlyIf?: () => any;
  }> = [
    { name: 'HTTPWalletJSON', arg: 'json-api' },
    { name: 'HTTPWalletWire', arg: 'Cicada' },
    { name: 'WindowCWISubstrate', arg: 'window.CWI', onlyIf: () => typeof window !== 'undefined' && (window as any)?.CWI },
    { name: 'XDMSubstrate', arg: 'XDM' },
    { name: 'ReactNativeWebView', arg: 'react-native' }
  ];

  for (const c of candidates) {
    if (c.onlyIf && !c.onlyIf()) continue;
    try {
      logWithTimestamp(F, `initializeIds: probing substrate ${c.name}`);
      const ProbeCtor: any = (wallet as any).constructor;
      const probe = new ProbeCtor(c.arg, (wallet as any).origin);
      await Promise.race([
        probe.getVersion({}),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout on ${c.name}`)), 2000))
      ]);
      (wallet as any).substrate = probe.substrate;
      logWithTimestamp(F, `initializeIds: selected substrate ${c.name}`);
      return;
    } catch (e: any) {
      logWithTimestamp(F, `initializeIds: substrate ${c.name} failed: ${e?.message ?? e}`);
    }
  }
}

export const initializeIds = async (
  type: 'payment' | 'button',
  wallet: WalletClient,
  id?: string,
  merchantId?: string,
  setId?: Dispatch<SetStateAction<string>>,
  setSpendingDescription_fixed?: Dispatch<SetStateAction<string>>,
  setSpendingDescription_variable?: Dispatch<SetStateAction<string>>,
  buttonId?: string,
  force: boolean = true,
  configOverride?: ClientConfig
): Promise<InitializeIdsResponse> => {
  const config: ClientConfig = configOverride ?? (await loadClientConfig());

  // Validate type + inputs
  if (type !== 'payment' && type !== 'button') {
    const msg = `Invalid type: ${type}. Must be 'payment' or 'button'`;
    logWithTimestamp(F, msg);
    toast.error(msg);
    return { status: 'error', message: msg };
  }
  if (type === 'payment' && buttonId && !isBase58(buttonId, 12)) {
    const msg = 'Invalid 12-character Base58 buttonId provided';
    logWithTimestamp(F, msg);
    toast.error(msg);
    return { status: 'error', message: msg };
  }

  // Merchant identity
  let effectiveMerchantId: string;
  try {
    effectiveMerchantId = merchantId || (await wallet.getPublicKey({ identityKey: true })).publicKey;
    if (!effectiveMerchantId) throw new Error('Merchant ID is undefined');
  } catch (e: any) {
    const msg = `Failed to get merchant ID: ${e?.message ?? e}`;
    logWithTimestamp(F, msg);
    toast.error(msg);
    return { status: 'error', message: msg };
  }

  // Cache check
  const isInitializedKey = `idsInitialized${type}_${effectiveMerchantId}`;
  const storedIdKey = `${type === 'button' ? 'buttonId' : 'paymentId'}_${effectiveMerchantId}`;
  const cachedInitialized = localStorage.getItem(isInitializedKey);
  const cachedId = localStorage.getItem(storedIdKey);
  logWithTimestamp(
    F,
    `initializeIds: cache check for ${type}Id / merchant ${effectiveMerchantId} → isInitialized=${!!cachedInitialized}, cachedId=${cachedId}, force=${force}, inputId=${id}`
  );

  if (!force && cachedInitialized && cachedId) {
    if (setId) setId(cachedId);
    const desc = `Payment using ${type}Id: ${cachedId}`;
    setDescriptionsIfPayment(type, desc, setSpendingDescription_fixed, setSpendingDescription_variable);
    return { status: 'success', id: cachedId };
  }

  // Generate/repair ID
  let currentId = id;
  if (!force && cachedInitialized && !cachedId) {
    localStorage.removeItem(isInitializedKey);
    currentId = generateBase58(12);
  } else if (!id || !isBase58(id, 12)) {
    currentId = generateBase58(12);
  }

  // Derived config + URLs
  const prefix = config.routingPrefix || '/api';
  logWithTimestamp(F, `cfg.routingPrefix = ${prefix}`);

  const apiBaseCfg = config.apiBase ?? '';
  logWithTimestamp(F, `cfg.apiBase      = ${JSON.stringify(apiBaseCfg)}`);

  const originGuess = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
  logWithTimestamp(F, `originGuess      = ${originGuess}`);

  const base = (apiBaseCfg && /^https?:\/\//.test(apiBaseCfg) ? apiBaseCfg : '') || originGuess;
  logWithTimestamp(F, `resolvedBase     = ${base}`);

  const GET_STATUS_URL = `${base}${prefix}/getStatus`;
  const INIT_URL = `${base}${prefix}/initializeIds`;
  logWithTimestamp(F, `GET_STATUS_URL   = ${GET_STATUS_URL}`);
  logWithTimestamp(F, `INIT_URL         = ${INIT_URL}`);

  // Ensure working substrate
  await ensureWalletSubstrate(wallet);

  // 1) Native GET (no auth)
  logWithTimestamp(F, `GET (native) → ${GET_STATUS_URL}`);
  const nativeRes = await fetch(GET_STATUS_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    credentials: 'omit',
    mode: 'cors'
  });
  logWithTimestamp(F, `GET (native) status: ok=${nativeRes.ok} http=${nativeRes.status}`);
  const nativeText = await nativeRes.text();
  logWithTimestamp(F, `GET (native) body (first 300): ${nativeText.slice(0, 300)}`);
  if (!nativeRes.ok) {
    const msg = `Server status check failed (native GET): HTTP ${nativeRes.status}`;
    logWithTimestamp(F, msg);
    toast.error(msg);
    return { status: 'error', message: msg };
  }

  // 2) Auth GET (signed). Some servers may reject auth headers on this route; log & continue.
  const authFetch = new AuthFetch(wallet);
  const subName = (wallet as any)?.substrate?.name ?? 'unknown';
  const walletOrigin = (wallet as any)?.origin ?? 'n/a';
  logWithTimestamp(F, `AuthFetch ready. substrate=${subName}, wallet.origin=${walletOrigin}`);
  logWithTimestamp(F, `GET (auth) → ${GET_STATUS_URL}`);
  try {
    const resAuthGet = await authFetch.fetch(GET_STATUS_URL, { method: 'GET' });
    logWithTimestamp(F, `GET (auth) status: ok=${resAuthGet.ok} http=${resAuthGet.status}`);
    const t = await resAuthGet.text();
    logWithTimestamp(F, `GET (auth) body (first 300): ${t.slice(0, 300)}`);
    // No hard requirement to succeed; this is diagnostic
  } catch (e: any) {
    logWithTimestamp(F, `GET (auth) failed (non-fatal): ${e?.message ?? e}`);
  }

  const serverIdentityKey = (config as any).serverIdentityKey;
logWithTimestamp(F, `serverIdentityKey (cfg) = ${serverIdentityKey?.slice(0, 10) ?? 'missing'}…`);

if (!serverIdentityKey) {
  const msg = 'Missing serverIdentityKey in client config; cannot send signed POST.';
  logWithTimestamp(F, msg);
  toast.error(msg);
  return { status: 'error', message: msg };
}

  // 3) Auth POST to initializeIds
  const currentKey = type === 'payment' ? 'paymentId' : 'buttonId';
  const body = {
    [currentKey]: currentId,
    merchantId: effectiveMerchantId,
    ...(type === 'payment' && buttonId ? { buttonId } : {}),
    description: type === 'payment'
      ? `Payment using paymentId: ${currentId}`
      : `Payment using buttonId: ${currentId}`
  };
  const bodyPreview = JSON.stringify(body).slice(0, 200);
  logWithTimestamp(F, `POST (auth) → ${INIT_URL}`);
  logWithTimestamp(F, `POST (auth) body (first 200): ${bodyPreview}`);

  const res = await authFetch.fetch(INIT_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
       'x-bsv-server': serverIdentityKey
    },
    body: JSON.stringify(body)
  });
  logWithTimestamp(F, `POST (auth) status: ok=${res.ok} http=${res.status}`);
  const text = await res.text();
  logWithTimestamp(F, `POST (auth) body (first 400): ${text.slice(0, 400)}`);

  const data: any = text ? JSON.parse(text) : {};
  if (res.status === 200 && data.status === 'success') {
    const validatedId: string = data.id || currentId!;
    if (setId) setId(validatedId);
    localStorage.setItem(isInitializedKey, 'true');
    localStorage.setItem(storedIdKey, validatedId);
    logWithTimestamp(F, `✅ initializeIds success: id=${validatedId}, type=${type}`);
    const desc = `Payment using ${type}Id: ${validatedId}`;
    setDescriptionsIfPayment(type, desc, setSpendingDescription_fixed, setSpendingDescription_variable);
    return { status: 'success', id: validatedId };
  }

  const errMsg = data?.message
    ? `Failed to validate ${type}Id: ${data.message} (HTTP ${res.status})`
    : `Failed to validate ${type}Id: HTTP ${res.status}`;
  logWithTimestamp(F, errMsg);
  toast.error(errMsg);
  return { status: 'error', message: errMsg };
};
