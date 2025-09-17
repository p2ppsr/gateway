/**
 * @file src/utils/initializeIds.ts
 * Validate/register an ID with:
 *  1) native GET /getStatus (no auth)
 *  2) auth GET /getStatus (signed; allowed to fail)
 *  3) auth POST /initializeIds (signed)
 */

import { logWithTimestamp } from './logging'
import { generateBase58, isBase58 } from './general'
import { toast } from 'react-toastify'
import { WalletClient, AuthFetch } from '@bsv/sdk'
import type { Dispatch, SetStateAction } from 'react'
// import { loadClientConfig } from './clientConfig';
// import type { ClientConfig } from './clientConfig';
import { CONFIG } from './constants'

const F = 'utils/initializeIds'

export interface InitializeIdsResponse {
  status: 'success' | 'error'
  message?: string
  id?: string
}

type MaybeSetter = Dispatch<SetStateAction<string>> | undefined

function setDescriptionsIfPayment (
  type: 'payment' | 'button',
  desc: string,
  setSpendingDescription_fixed?: MaybeSetter,
  setSpendingDescription_variable?: MaybeSetter
) {
  if (
    type === 'payment' &&
    (setSpendingDescription_fixed != null) &&
    (setSpendingDescription_variable != null)
  ) {
    setSpendingDescription_fixed(desc)
    setSpendingDescription_variable(desc)
    logWithTimestamp(
      F,
      `initializeIds: Updated spending descriptions: "${desc}"`
    )
  }
}

async function ensureWalletSubstrate (wallet: WalletClient) {
  const candidates: ReadonlyArray<{
    name:
    | 'HTTPWalletJSON'
    | 'HTTPWalletWire'
    | 'WindowCWISubstrate'
    | 'XDMSubstrate'
    | 'ReactNativeWebView'
    arg: 'json-api' | 'Cicada' | 'window.CWI' | 'XDM' | 'react-native'
    onlyIf?: () => any
  }> = [
    { name: 'HTTPWalletJSON', arg: 'json-api' },
    { name: 'HTTPWalletWire', arg: 'Cicada' },
    {
      name: 'WindowCWISubstrate',
      arg: 'window.CWI',
      onlyIf: () => typeof window !== 'undefined' && (window as any)?.CWI
    },
    { name: 'XDMSubstrate', arg: 'XDM' },
    { name: 'ReactNativeWebView', arg: 'react-native' }
  ]

  for (const c of candidates) {
    if ((c.onlyIf != null) && !c.onlyIf()) continue
    try {
      logWithTimestamp(F, `initializeIds: probing substrate ${c.name}`)
      const ProbeCtor: any = (wallet as any).constructor
      const probe = new ProbeCtor(c.arg, (wallet as any).origin)
      await Promise.race([
        probe.getVersion({}),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout on ${c.name}`)), 2000)
        )
      ]);
      (wallet as any).substrate = probe.substrate
      logWithTimestamp(F, `initializeIds: selected substrate ${c.name}`)
      return
    } catch (e: any) {
      logWithTimestamp(
        F,
        `initializeIds: substrate ${c.name} failed: ${e?.message ?? e}`
      )
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
  force: boolean = true
): Promise<InitializeIdsResponse> => {
  // Validate type + inputs
  if (type !== 'payment' && type !== 'button') {
    const msg = `Invalid type: ${type}. Must be 'payment' or 'button'`
    logWithTimestamp(F, msg)
    toast.error(msg)
    return { status: 'error', message: msg }
  }
  if (type === 'payment' && buttonId && !isBase58(buttonId, 12)) {
    const msg = 'Invalid 12-character Base58 buttonId provided'
    logWithTimestamp(F, msg)
    toast.error(msg)
    return { status: 'error', message: msg }
  }

  // Merchant identity
  let effectiveMerchantId: string
  try {
    effectiveMerchantId =
      merchantId ||
      (await wallet.getPublicKey({ identityKey: true })).publicKey
    if (!effectiveMerchantId) throw new Error('Merchant ID is undefined')
  } catch (e: any) {
    const msg = `Failed to get merchant ID: ${e?.message ?? e}`
    logWithTimestamp(F, msg)
    toast.error(msg)
    return { status: 'error', message: msg }
  }

  // Cache check
  const isInitializedKey = `idsInitialized${type}_${effectiveMerchantId}`
  const storedIdKey = `${type === 'button' ? 'buttonId' : 'paymentId'}_${effectiveMerchantId}`
  const cachedInitialized = localStorage.getItem(isInitializedKey)
  const cachedId = localStorage.getItem(storedIdKey)
  logWithTimestamp(
    F,
    `initializeIds: cache check for ${type}Id / merchant ${effectiveMerchantId} → isInitialized=${!!cachedInitialized}, cachedId=${cachedId}, force=${force}, inputId=${id}`
  )

  if (!force && cachedInitialized && cachedId) {
    if (setId != null) setId(cachedId)
    const desc = `Payment using ${type}Id: ${cachedId}`
    setDescriptionsIfPayment(
      type,
      desc,
      setSpendingDescription_fixed,
      setSpendingDescription_variable
    )
    return { status: 'success', id: cachedId }
  }

  // Generate/repair ID
  let currentId = id
  if (!force && cachedInitialized && !cachedId) {
    localStorage.removeItem(isInitializedKey)
    currentId = generateBase58(12)
  } else if (!id || !isBase58(id, 12)) {
    currentId = generateBase58(12)
  }

  const INIT_URL = `${CONFIG.API_BASE}/initializeIds`
  logWithTimestamp(F, `INIT_URL= ${INIT_URL}`)

  // Ensure working substrate
  await ensureWalletSubstrate(wallet)

  // 2) Auth GET (signed). Some servers may reject auth headers on this route; log & continue.
  const authFetch = new AuthFetch(wallet)
  const subName = (wallet as any)?.substrate?.name ?? 'unknown'
  const walletOrigin = (wallet as any)?.origin ?? 'n/a'
  logWithTimestamp(
    F,
    `AuthFetch ready. substrate=${subName}, wallet.origin=${walletOrigin}`
  )

  const serverIdentityKey = CONFIG.SERVER_IDENTITY_KEY
  logWithTimestamp(F, `serverIdentityKey=${serverIdentityKey}`)

  if (!serverIdentityKey) {
    const msg =
      'Missing serverIdentityKey in client config; cannot send signed POST.'
    logWithTimestamp(F, msg)
    toast.error(msg)
    return { status: 'error', message: msg }
  }

  // 3) Auth POST to initializeIds
  const currentKey = type === 'payment' ? 'paymentId' : 'buttonId'
  const body = {
    [currentKey]: currentId,
    merchantId: effectiveMerchantId,
    ...(type === 'payment' && buttonId ? { buttonId } : {}),
    description:
      type === 'payment'
        ? `Payment using paymentId: ${currentId}`
        : `Payment using buttonId: ${currentId}`
  }
  const bodyPreview = JSON.stringify(body).slice(0, 200)
  logWithTimestamp(F, `POST (auth) → ${INIT_URL}`)
  logWithTimestamp(F, `POST (auth) body (first 200): ${bodyPreview}`)

  const res = await authFetch.fetch(INIT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bsv-server': serverIdentityKey
    },
    body: JSON.stringify(body)
  })
  logWithTimestamp(F, `POST (auth) status: ok=${res.ok} http=${res.status}`)
  const text = await res.text()
  logWithTimestamp(F, `POST (auth) body (first 400): ${text.slice(0, 400)}`)

  const data: any = text ? JSON.parse(text) : {}
  if (res.status === 200 && data.status === 'success') {
    const validatedId: string = data.id || currentId!
    if (setId != null) setId(validatedId)
    localStorage.setItem(isInitializedKey, 'true')
    localStorage.setItem(storedIdKey, validatedId)
    logWithTimestamp(
      F,
      `✅ initializeIds success: id=${validatedId}, type=${type}`
    )
    const desc = `Payment using ${type}Id: ${validatedId}`
    setDescriptionsIfPayment(
      type,
      desc,
      setSpendingDescription_fixed,
      setSpendingDescription_variable
    )
    return { status: 'success', id: validatedId }
  }

  const errMsg = data?.message
    ? `Failed to validate ${type}Id: ${data.message} (HTTP ${res.status})`
    : `Failed to validate ${type}Id: HTTP ${res.status}`
  logWithTimestamp(F, errMsg)
  toast.error(errMsg)
  return { status: 'error', message: errMsg }
}
