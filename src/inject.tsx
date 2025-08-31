/**
 * @file src/inject.tsx
 *
 * Injects Gateway payment buttons into third-party websites.
 *
 * This script does two main things:
 * 1) Defines a global window.PayButton.render() method to render a single payment button inside a given DOM element.
 * 2) On window.load, scans the page for elements with class="gateway-paybutton" and renders a button into each,
 *    mapping data-* attributes to props and creating/initializing IDs as needed.
 *
 * Notes
 * - All amounts are integer sats.
 * - Uses paymentId as the primary identifier.
 * - Fixed/clean TypeScript throughout (no unsafe casts in public types; minimal `any` casts only where external typings are unknown).
 *
 * Version: v2.40.16 (inject TS cleanup)
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import PayButton, { PayButtonProps } from './components/PayButton'
import { logWithTimestamp } from './utils/logging'
import { initializeIds } from './utils/initializeIds'
import { fetchWithTimeout } from './utils/general'
import { WalletClient } from '@bsv/sdk'
import { CONFIG } from './utils/constants'

const F = 'inject'

// -------------------------------------------------------------------------------------------------
// Utilities
// -------------------------------------------------------------------------------------------------

/** Normalize unknown errors to Error */
const toError = (e: unknown): Error =>
  e instanceof Error ? e : new Error(typeof e === 'string' ? e : JSON.stringify(e))

/** Extra props that the injector can accept via data-* attributes but that PayButton might not require */
interface ExtraInjectProps {
  /** Optional custom CSS to inline in the created HTML snippet when creating server-side buttons */
  customCSS?: string
  /** Optional text for the rendered button */
  text?: string
  /** Optional original buttonId (kept for server compatibility) */
  buttonId?: string
  /** Payment identifier used by the server & UI */
  paymentId?: string
  /** Merchant public key/id (optional override) */
  merchant?: string
  /** Server base URL (e.g., http://localhost:3000) */
  server?: string
  /** Optional description used for server-side creation */
  description?: string
  /** Whether the button allows variable amount entry */
  variable?: boolean
  /** Amount in sats (ignored by server if variable=true) */
  amount?: number
}

const wallet = new WalletClient('auto', CONFIG.WALLET_ORIGIN) // Global wallet instance

// -------------------------------------------------------------------------------------------------
// Global render API
// -------------------------------------------------------------------------------------------------

declare global {
  interface Window {
    PayButton?: {
      render: (elementID: string, props: PayButtonProps) => void
    }
  }
}

// Ensure namespace exists (loosened typing here to avoid conflicts if another script pre-populates it)
;(window as any).PayButton = (window as any).PayButton || {}

;(window as any).PayButton.render = (elementID: string, props: PayButtonProps): void => {
  logWithTimestamp(F, '🔍 [render] incoming props:', props)

  const element = document.getElementById(elementID)
  if (!element) {
    console.error(`❌ Failed to render PayButton: Element with ID ${elementID} not found`)
    return
  }

  const root = createRoot(element)
  root.render(<PayButton {...props} />)

  logWithTimestamp(F, `✅ Rendered PayButton for ID: ${elementID}`)
}

// -------------------------------------------------------------------------------------------------
// Server helpers
// -------------------------------------------------------------------------------------------------

/**
 * Create a button server-side (if needed) so that paymentId is recognized by backend.
 * Uses a very small `any` cast when calling fetchWithTimeout because its exact TS signature
 * may differ across builds; runtime behavior is identical.
 */
const createButton = async (
  props: Partial<PayButtonProps & ExtraInjectProps>,
  walletClient: WalletClient
): Promise<void> => {
  try {
    const base = props.server || 'http://localhost:3000'
    const url = `${base}/api/createButton`

    const htmlCode =
      `<style>${(props.customCSS as string) || '.gateway-paybutton { background: #8484FA; color: white; }'}</style>` +
      `<div>${props.text || 'Pay'}</div>`

    const payload = {
      merchantId:
        props.merchant || '0282f7effd932d9d2a3774c287eacb9ace3728a753a0339e2f16998153e5d65963',
      amount: props.variable ? undefined : props.amount,
      variableAmount: !!props.variable,
      multiUse: true,
      description:
        (props.description as string) ||
        `Payment using paymentId: ${String(props.paymentId ?? '')}`,
      htmlCode,
      paymentId: props.paymentId || '',
      // Retain buttonId for API compatibility; not required by PayButton render
      buttonId: props.buttonId || ''
    }

    const res = await (fetchWithTimeout as any)(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      },
      walletClient,
      15_000
    )

    if (!res || !res.ok) {
      const code = res ? String(res.status) : 'unknown'
      throw new Error(`HTTP error creating button (status ${code})`)
    }

    const data = await res.json()
    if (data?.status === 'success') {
      logWithTimestamp(F, '✅ [createButton] success:', {
        paymentId: data.paymentId,
        buttonId: data.buttonId
      })
      // Prefer server-confirmed paymentId
      if (!props.paymentId && data.paymentId) props.paymentId = String(data.paymentId)
    } else {
      throw new Error(`Failed to create button: ${String(data?.message || 'Unknown error')}`)
    }
  } catch (err) {
    const e = toError(err)
    console.error('❌ [createButton] failed:', e.message, { stack: e.stack })
    logWithTimestamp(F, '❌ [createButton] failed:', { message: e.message })
  }
}

// -------------------------------------------------------------------------------------------------
// Bootstrap scanning logic
// -------------------------------------------------------------------------------------------------

const bootstrapPayButtons = async (): Promise<void> => {
  const nodes = document.getElementsByClassName('gateway-paybutton')
  logWithTimestamp(
    F,
    '🔍 Found',
    nodes.length,
    nodes.length === 1 ? 'PayButton' : 'PayButtons',
    'on this page.'
  )

  for (let i = 0; i < nodes.length; i++) {
    const el = nodes.item(i)
    if (!el) continue

    // Ensure an id so we can mount a React root here
    const domElementId = `pay-${Math.floor(Math.random() * 100000)}`
    ;(el as HTMLElement).id = domElementId

    // Start with safe defaults
    const props: Partial<PayButtonProps & ExtraInjectProps> = {
      amount: 0,
      merchant: '',
      server: '',
      variable: false,
      paymentId: ''
    }

    // Map data-* attributes to props
    if (el.hasAttributes()) {
      const attrs = el.attributes
      for (let j = 0; j < attrs.length; j++) {
        const attr = attrs.item(j)
        if (!attr) continue
        if (!attr.name.startsWith('data-')) continue

        // Raw `data-` key without the prefix
        let key = attr.name.substring(5)
        const raw = String(attr.value)

        // Normalize common IDs with case-insensitive checks
        const lower = key.toLowerCase()
        if (lower === 'paymentid') {
          key = 'paymentId'
          props.paymentId = raw
          logWithTimestamp(F, '🔧 mapped paymentId:', props.paymentId)
          continue
        } else if (lower === 'buttonid') {
          key = 'buttonId'
          // Keep minimal sanity check (example: 12-char Base58)
          const isLikelyBase58 = /^[A-HJ-NP-Za-km-z1-9]{12}$/.test(raw)
          props.buttonId = isLikelyBase58 ? raw : ''
          logWithTimestamp(F, '🔧 mapped buttonId:', props.buttonId || '(invalid/ignored)')
          continue
        }

        // Convert kebab-case to camelCase (e.g., custom-css -> customCss)
        key = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

        // Typed coercions for known fields
        if (key === 'amount') {
          const n = Number(raw)
          if (!Number.isNaN(n)) props.amount = n
        } else if (key === 'variable') {
          props.variable = raw === 'true' || raw === '1' || raw === 'yes'
        } else if (key === 'server' || key === 'merchant' || key === 'description' || key === 'text' || key === 'customCSS') {
          // Assign as-is to supported string fields
          ;(props as any)[key] = raw
        } else {
          // Any other unknown data-* will be passed through as string
          ;(props as any)[key] = raw
        }
      }

      logWithTimestamp(F, '🔍 props after data-* mapping:', { ...props })
    }

    // Decide whether we need to initialize IDs (skip validation for simplicity/reliability)
    const needsInit = !props.paymentId

    if (needsInit) {
      try {
        // initializeIds signature can vary across builds; cast to any to avoid type mismatch errors.
        const resp = await (initializeIds as any)(
          'payment',
          wallet,
          props.paymentId || '',
          undefined, // merchantId (optional)
          undefined, // setId callback
          undefined, // fixed description cb
          undefined, // variable description cb
          undefined // auth token
        )

        if (resp?.status === 'success' && resp?.paymentId) {
          props.paymentId = String(resp.paymentId)
          logWithTimestamp(F, '✅ initialized paymentId:', props.paymentId)
        } else {
          throw new Error(`initializeIds failed: ${String(resp?.message || 'unknown error')}`)
        }
      } catch (err) {
        const e = toError(err)
        logWithTimestamp(F, '❌ initialization failed, skipping element:', { message: e.message })
        console.error('❌ [inject] Initialization failed:', e)
        // Skip rendering this element if we cannot guarantee a usable paymentId
        continue
      }
    }

    // Create/ensure the button exists server-side (best-effort; render regardless)
    await createButton(props, wallet)

    // Build the final props for the React component with sensible fallbacks
    const finalProps: PayButtonProps = {
      amount: typeof props.amount === 'number' && !Number.isNaN(props.amount) ? props.amount : 5,
      merchant: props.merchant || '',
      server: props.server || 'http://localhost:3000',
      variable: !!props.variable,
      buttonId: props.buttonId || '',
      paymentId: props.paymentId || '',
      text: props.text || 'Pay'
    }

    logWithTimestamp(F, '🚀 rendering PayButton with props:', finalProps)
    ;(window as any).PayButton.render(domElementId, finalProps)
  }
}

// Kick things off after the page loads
window.addEventListener('load', () => {
  bootstrapPayButtons().catch(err => {
    const e = toError(err)
    console.error('❌ Error bootstrapping pay buttons:', e)
    logWithTimestamp(F, '❌ Error bootstrapping pay buttons:', { message: e.message })
  })
})

export {}
