/**
 * @file src/inject.tsx
 * @description
 * Injects Gateway payment buttons into third-party websites. Exposes a global
 * `window.PayButton.render()` for programmatic rendering, and on `window.load` scans for
 * `.gateway-paybutton` elements to mount automatically. Includes a portable API-base resolver
 * so `pay.js` works when hosted from any origin.
 * @version 1.0.0
 * @author xAI (Grok 3)
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import PayButton, { PayButtonProps } from './components/PayButton'
import { logWithTimestamp } from './utils/logging'
import { initializeIds } from './utils/initializeIds'
import { fetchWithTimeout, isBase58 } from './utils/general'
import { WalletClient } from '@bsv/sdk'
import { CONFIG } from './utils/constants'
import { getScriptOrigin } from './utils/scriptOrigin'

const F = 'inject'
logWithTimestamp(F, '🔍 INJECT')
declare const SERVER_IDENTITY_KEY: string
const serverIdentityKey = SERVER_IDENTITY_KEY

// -------------------------------------------------------------------------------------------------
// Utilities
// -------------------------------------------------------------------------------------------------

/**
 * Normalizes any thrown value into an `Error` for consistent logging.
 * @param {unknown} e - Any thrown value.
 * @returns {Error} A normalized Error instance.
 */
const toError = (e: unknown): Error =>
  e instanceof Error ? e : new Error(typeof e === 'string' ? e : JSON.stringify(e))

/**
 * Additional props accepted via `data-*` attributes during auto-mount that the React component
 * may not strictly require but the injector can use.
 *
 * @typedef {Object} ExtraInjectProps
 * @property {string} [htmlCode] - Optional inline CSS used in server-created HTML.
 * @property {string} [text] - Optional button text.
 * @property {string} [buttonId] - Optional historical ID for server compatibility.
 * @property {string} [paymentId] - Preferred client/server payment identifier.
 * @property {string} [merchant] - Merchant public key/id override.
 * @property {string} [description] - Description to use when creating a server button.
 * @property {boolean} [variable=false] - Whether variable amount entry is allowed.
 * @property {number} [amount=0] - Fixed amount in sats (ignored if variable=true).
 */
interface ExtraInjectProps {
  htmlCode?: string
  text?: string
  buttonId?: string
  paymentId?: string
  merchant?: string
  description?: string
  variable?: boolean
  amount?: number
}

const wallet = new WalletClient('auto', CONFIG.WALLET_ORIGIN) // Global wallet instance

// -------------------------------------------------------------------------------------------------
// Global render API
// -------------------------------------------------------------------------------------------------

declare global {
  interface Window {
    /**
     * Gateway global namespace.
     * @property {(elementID: string, props: PayButtonProps) => void} render - Renders a PayButton into a DOM element.
     */
    PayButton?: {
      render: (elementID: string, props: PayButtonProps) => void
    }
  }
}

/**
 * Ensures the global namespace exists (loose typing to avoid collision with other scripts).
 * @type {{ render?: (elementID: string, props: PayButtonProps) => void }}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).PayButton = (window as any).PayButton || {}

/**
 * Programmatically render a PayButton into a specific DOM node.
 *
 * @function window.PayButton.render
 * @param {string} elementID - The ID of the container element to render into.
 * @param {PayButtonProps} props - The PayButton props.
 * @returns {void}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).PayButton.render = (elementID: string, props: PayButtonProps): void => {
  logWithTimestamp(F, '🔍 [render] incoming props:', props)

  const element = document.getElementById(elementID)
  if (element == null) {
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
 * Creates/ensures a button exists server-side so the `paymentId` is recognized by the backend.
 * Best-effort: the UI will still render even if this fails.
 *
 * @async
 * @function createButton
 * @param {Partial<PayButtonProps & ExtraInjectProps>} props - Props gathered from data-attributes (and defaults).
 * @param {WalletClient} walletClient - A WalletClient instance used for authenticated fetches.
 * @returns {Promise<void>} Resolves when the attempt completes (success or failure is logged).
 */
const createButton = async (
  props: Partial<PayButtonProps & ExtraInjectProps>,
  walletClient: WalletClient
): Promise<void> => {
  try {
    const htmlCode =
      `<style>${(props.htmlCode as string) || '.gateway-paybutton { background: #8484FA; color: white; }'}</style>` +
      `<div>${props.text || 'Pay'}</div>`

    const payload = {
      merchantId: props.merchant || '0282f7effd932d9d2a3774c287eacb9ace3728a753a0339e2f16998153e5d65963',
      amount: props.variable ? undefined : props.amount,
      variableAmount: !!props.variable,
      multiUse: true,
      description: (props.description as string) || `Payment using paymentId: ${String(props.paymentId ?? '')}`,
      htmlCode,
      paymentId: props.paymentId || '',
      buttonId: props.buttonId || ''
    }
    const base = getScriptOrigin()
    const url = `${base}/api/createButton`
    const res = await (fetchWithTimeout as any)(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bsv-server': serverIdentityKey
        },
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

      // Prefer server-confirmed paymentId if the caller didn’t provide one
      if (!props.paymentId && data.paymentId) {
        props.paymentId = String(data.paymentId)
      }
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

/**
 * Scans the page for `.gateway-paybutton` elements and renders a PayButton into each.
 * Performs light data-attribute mapping, optional ID initialization, and best-effort
 * server button creation before mounting each React component.
 *
 * Supported `data-*` attributes (kebab or camel case):
 * - data-paymentId
 * - data-buttonId
 * - data-merchant
 * - data-description
 * - data-text
 * - data-custom-css
 * - data-variable (true|false|1|0|yes|no)
 * - data-amount (integer sats)
 *
 * @async
 * @function bootstrapPayButtons
 * @returns {Promise<void>} Resolves after attempting to mount all discovered elements.
 */
const bootstrapPayButtons = async (): Promise<void> => {
  const nodes = document.getElementsByClassName('gateway-paybutton')
  logWithTimestamp(F, '🔍 Found', nodes.length, nodes.length === 1 ? 'PayButton' : 'PayButtons', 'on this page.')

  for (let i = 0; i < nodes.length; i++) {
    const el = nodes.item(i)
    if (el == null) continue

    // Ensure an id so we can mount a React root here
    const domElementId = `pay-${Math.floor(Math.random() * 100000)}`
    ;(el as HTMLElement).id = domElementId

    /** @type {Partial<PayButtonProps & ExtraInjectProps>} */
    const props: Partial<PayButtonProps & ExtraInjectProps> = {
      amount: 0,
      merchant: '',
      variable: false,
      paymentId: ''
    }

    // Map data-* attributes to props
    if (el.hasAttributes()) {
      const attrs = el.attributes
      for (let j = 0; j < attrs.length; j++) {
        const attr = attrs.item(j)
        if (attr == null) continue
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
          // Minimal sanity check example (e.g., 12-char Base58)
          const isLikelyBase58 = /^[A-HJ-NP-Za-km-z1-9]{12}$/.test(raw)
          props.buttonId = isLikelyBase58 ? raw : ''
          logWithTimestamp(F, '🔧 mapped buttonId:', props.buttonId || '(invalid/ignored)')
          continue
        }

        // Convert kebab-case to camelCase (e.g., custom-css -> htmlCode)
        key = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

        // Typed coercions for known fields
        if (key === 'amount') {
          const n = Number(raw)
          if (!Number.isNaN(n)) props.amount = n
        } else if (key === 'variable') {
          props.variable = raw === 'true' || raw === '1' || raw === 'yes'
        } else if (key === 'merchant' || key === 'description' || key === 'text' || key === 'htmlCode') {
          // Assign as-is to supported string fields
          ;(props as any)[key] = raw
        } else {
          // Any other unknown data-* will be passed through as string
          ;(props as any)[key] = raw
        }
      }

      logWithTimestamp(F, '🔍 props after data-* mapping:', { ...props })
    }

    // Always initialize IDs – but skip first usage if server already gave a paymentId
    try {
      let resp

      // If props.paymentId is a valid Base58 (first use), skip initializeIds
      const isPreassignedPaymentId = props.paymentId && isBase58(props.paymentId, 12)

      if (isPreassignedPaymentId) {
        // First use: just accept server-provided paymentId
        logWithTimestamp(F, 'ℹ️ skipping initializeIds — using preassigned paymentId:', props.paymentId)
        resp = { status: 'success', id: props.paymentId }
      } else {
        // Second+ use or no paymentId provided: request a new one from server
        resp = await (initializeIds as any)(
          'payment',
          wallet,
          props.paymentId ? String(props.paymentId) : null,
          String(props.merchant || ''),
          undefined, // setId callback
          undefined, // fixed description cb
          undefined, // variable description cb
          undefined, // buttonId
          false, // force = false
          props.description
        )
      }

      if (resp?.status === 'success' && (resp?.id || props.paymentId)) {
        props.paymentId = String(resp.id || props.paymentId)
        logWithTimestamp(F, '✅ initialized paymentId:', props.paymentId)
      } else {
        throw new Error(`initializeIds failed: ${String(resp?.message || 'unknown error')}`)
      }
    } catch (err) {
      const e = toError(err)
      logWithTimestamp(F, '❌ initialization failed, skipping element:', {
        message: e.message
      })
      console.error('❌ [inject] Initialization failed:', e)
      // Skip rendering this element if we cannot guarantee a usable paymentId
      continue
    }

    // Create/ ensure the button exists
    await createButton(props, wallet)

    // Build the final props for the React component with sensible fallbacks
    const finalProps: PayButtonProps = {
      amount: typeof props.amount === 'number' && !Number.isNaN(props.amount) ? props.amount : 5,
      merchant: props.merchant || '',
      variable: !!props.variable,
      buttonId: props.buttonId || '',
      paymentId: props.paymentId || '',
      text: props.text || 'Pay'
    }

    logWithTimestamp(F, '🚀 rendering PayButton with props:', finalProps)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).PayButton.render(domElementId, finalProps)
  }
}

/**
 * Boots the injector after the page finishes loading.
 * Logs and continues on individual failures.
 *
 * @listens window#load
 */
window.addEventListener('load', () => {
  bootstrapPayButtons().catch(err => {
    const e = toError(err)
    console.error('❌ Error bootstrapping pay buttons:', e)
    logWithTimestamp(F, '❌ Error bootstrapping pay buttons:', {
      message: e.message
    })
  })
})

export {}
