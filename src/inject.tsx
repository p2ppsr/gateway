/**
 * @file src/inject.tsx
 *
 * Injects Gateway payment buttons into third-party websites.
 *
 * This script does two main things:
 * 1. Defines a global `window.PayButton.render()` method to render a single payment button inside a given DOM element.
 * 2. Automatically scans the page on `window.load` for any element with `class="gateway-paybutton"` and renders a button into it
 * using any `data-*` attributes as props, fetching paymentId via API for dynamic rendering or relying on <style> tag for copy-paste.
 *
 * This file is included via a <script> tag (pay.js) on external sites.
 * Updated to fix TypeScript error for dataset property.
 * - All amounts are handled as integer sats internally for precision.
 * - Updated to use paymentId exclusively instead of buttonId, aligning with database schema change (04Aug2025_2350 BST).
 * - Updated to use data-paymentId attribute instead of parsing data-description (05Aug2025_0255 BST).
 * - Fixed paymentId mapping issue to ensure data-paymentid is correctly assigned (05Aug2025_0230 BST).
 * - Added debugging to trace paymentId assignment failure (05Aug2025_0240 BST).
 * - Fixed case sensitivity issue in paymentId mapping by adjusting conversion order (05Aug2025_0300 BST).
 * - Enforced data-paymentId camelCase convention and corrected mapping logic (05Aug2025_0310 BST).
 * - Simplified attribute mapping to directly handle data-paymentId with case-insensitive check (05Aug2025_0320 BST).
 * - Updated logging to reflect intended paymentId convention (05Aug2025_0340 BST).
 * - Added support for data-button-id to pass original buttonId (10Aug2025_1640 BST).
 * - Integrated client-side ID generation and /api/initializeIds call during button creation (10Aug2025_1732 BST).
 * - Removed inline ID generation, relying on initializeIds utility for consistency (11Aug2025_1110 BST).
 * - Reordered ID initialization to prioritize buttonId before paymentId (11Aug2025_1215 BST).
 * - Fixed fetch consistency by using fetchWithTimeout with wallet, and corrected initial props definition (11Aug2025_1220 BST).
 * - Moved wallet to global scope for server calls and fixed fetchWithTimeout arguments (11Aug2025_1235 BST).
 * - Corrected import for initializeIds, added type annotations for callbacks, and fixed fetchWithTimeout syntax (11Aug2025_1240 BST).
 * - Ensured correct props for fetchWithTimeout and resolved syntax error (11Aug2025_1245 BST).
 * - Re-verified fetchWithTimeout props to ensure wallet argument is correctly passed (11Aug2025_1255 BST).
 * - Optimized initializeIds calls to only trigger when IDs are missing or invalid (12Aug2025_0255 BST).
 * - Fixed TypeScript errors for WalletClient and error handling (12Aug2025_0300 BST).
 * - Reverted to v2.40 and fixed original type errors with proper string conversion and error casting (12Aug2025_0922 BST).
 * - Fixed messaging errors with string coercion and proper error handling (12Aug2025_0928 BST).
 * - Corrected Error constructor usage to resolve overload mismatch (12Aug2025_0930 BST).
 * - Suppressed 2352 warning with type assertion (12Aug2025_0940 BST).
 * - Reverted invalid Error cast and adopted toError helper to resolve overload mismatch (12Aug2025_0945 BST).
 * - Commented out validateIds calls to avoid 404 errors (12Aug2025_1838 BST).
 * - Removed unused currency field from createButton request (13Aug2025_2350 BST).
 * - Renamed DOM id to domElementId for clarity (14Aug2025_0050 BST).
 * - Fixed TypeScript errors for initializeIds callback and added text prop to finalProps (17Aug2025_1330 BST).
 * - Fixed TypeScript error for initializeIds by adjusting callback to string argument (17Aug2025_1340 BST).
 * - Corrected initializeIds call to match signature with InitializeIdsResponse (17Aug2025_1348 BST).
 *
 * Version: v2.40.15 (Updated 17Aug2025_1348 BST to fix initializeIds TypeScript errors)
 */
const F = 'inject'
import React from 'react'
import { createRoot } from 'react-dom/client'
import PayButton, { PayButtonProps } from './components/PayButton'
import console from 'console-browserify'
import { logWithTimestamp } from './utils/logging'
import { initializeIds } from './utils/initializeIds'
import { fetchWithTimeout } from './utils/general'
import { WalletClient } from '@bsv/sdk'
import { CONFIG } from './utils/constants'

const wallet = new WalletClient('auto', CONFIG.WALLET_ORIGIN) // Global wallet instance
// Error normalization helper (safe, typed, no dodgy casts)
const toError = (e: unknown): Error =>
  e instanceof Error ? e : new Error(typeof e === 'string' ? e : JSON.stringify(e))
interface ButtonCodeResponse {
  status: string
  payment_id: string
  code: string
}
interface ValidateIdsResponse {
  status: string
  valid: boolean
  paymentId?: string
  buttonId?: string
}
if (typeof window !== 'object') {
  throw new Error('❌ Window must be defined in order to use the Gateway inject script')
}
declare global {
  interface Window {
    PayButton: {
      render: (elementID: string, props: PayButtonProps) => void
    }
  }
}
window.PayButton = window.PayButton || {}
window.PayButton.render = (elementID: string, props: PayButtonProps): void => {
  logWithTimestamp(F, '🔍 [Step 1] Inject props (sats):', { props })
  const element = document.getElementById(elementID)
  if (!element) {
    console.error(`❌ Failed to render PayButton: Element with ID ${elementID} not found`)
    return
  }
  const root = createRoot(element)
  root.render(<PayButton {...props} />)
  logWithTimestamp(F, `✅ Rendered PayButton for ID: ${elementID}`)
}
const validateIds = async (paymentId: string, buttonId: string, wallet: WalletClient): Promise<ValidateIdsResponse> => {
  try {
    const response = await fetchWithTimeout(
      'http://localhost:3001/api/validateIds',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // Let AuthFetch handle auth
        body: JSON.stringify({ paymentId, buttonId })
      },
      wallet,
      10000
    )
    if (!response.ok) throw toError(new Error(`❌ HTTP error! status: ${response.status.toString()}`))
    const data = await response.json()
    return data.status === 'success'
      ? { status: 'success', valid: data.valid, paymentId: data.paymentId, buttonId: data.buttonId }
      : { status: 'error', valid: false }
  } catch (err) {
    const e = toError(err)
    logWithTimestamp(F, '❌ [inject] Failed to validate IDs:', { error: e.message, stack: e.stack })
    return { status: 'error', valid: false }
  }
}
const createButton = async (props: Partial<PayButtonProps>, wallet: WalletClient): Promise<void> => {
  try {
    const response = await fetchWithTimeout(
      `${props.server}/api/createButton`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // Let AuthFetch handle auth
        body: JSON.stringify({
          merchantId: props.merchant || '0282f7effd932d9d2a3774c287eacb9ace3728a753a0339e2f16998153e5d65963',
          amount: props.variable ? undefined : props.amount,
          variableAmount: props.variable || false,
          multiUse: true,
          description: props.description || `Payment using paymentId: ${props.paymentId}`,
          htmlCode: `<style>${props.customCSS || '.gateway-paybutton { background: #8484FA; color: white; }'}</style><div>${props.text || 'Pay'}</div>`,
          paymentId: props.paymentId || '',
          buttonId: props.buttonId || '' // Retained for API compatibility, not passed to PayButton
        })
      },
      wallet,
      15000
    )
    if (!response.ok) throw toError(new Error(`❌ HTTP error! status: ${response.status.toString()}`))
    const createData = await response.json()
    if (createData.status === 'success') {
      logWithTimestamp(F, '✅ [inject] Button created successfully:', {
        paymentId: createData.paymentId,
        buttonId: createData.buttonId
      })
      props.paymentId = createData.paymentId // Update with server-confirmed paymentId
      // Do not update buttonId in props passed to PayButton, only use for API
    } else {
      throw toError(new Error(`❌ Failed to create button: ${createData.message || 'Unknown error'}`))
    }
  } catch (err) {
    const e = toError(err)
    console.error('❌ [inject] Failed to create button:', e.message, { stack: e.stack, details: err })
    logWithTimestamp(F, '❌ [inject] Failed to create button:', { error: e.message, stack: e.stack })
  }
}
const bootstrapPayButtons = async (): Promise<void> => {
  const buttons = document.getElementsByClassName('gateway-paybutton')
  logWithTimestamp(
    F,
    '🔍 Gateway: Found',
    buttons.length,
    buttons.length === 1 ? 'PayButton' : 'PayButtons',
    'on this page.'
  )
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons.item(i)
    if (!button) continue
    const domElementId = `pay-${Math.floor(Math.random() * 100000)}` // Renamed from buttonID for clarity
    button.id = domElementId
    button.setAttribute('id', domElementId)
    const props: Partial<PayButtonProps> = { amount: 0, merchant: '', server: '', variable: false, paymentId: '' }
    logWithTimestamp(F, '🔍 [inject] Initial props:', { ...props }) // Debug initial state
    if (button.hasAttributes()) {
      const attrs = button.attributes
      for (let j = attrs.length - 1; j >= 0; j--) {
        if (!attrs[j].name.startsWith('data-')) continue
        let propName = attrs[j].name.substring(5) // Extract as-is
        const value = String(attrs[j].value) // Convert to string to match PayButtonProps
        logWithTimestamp(F, '🔍 [inject] Processing attribute (raw):', { propName: attrs[j].name, value }) // Log raw attribute name
        if (propName.toLowerCase() === 'paymentid' || propName.toLowerCase() === 'paymentId') {
          propName = 'paymentId' // Force camelCase
          props[propName] = value // Assign directly, handle invalidity later
          logWithTimestamp(F, '🔍 [inject] Assigned paymentId:', props[propName]) // Debug final value
        } else if (propName.toLowerCase() === 'buttonid' || propName.toLowerCase() === 'buttonId') {
          propName = 'buttonId' // Force camelCase, handled internally for API
          const isValidBase58 = /^[A-HJ-NP-Za-km-z1-9]{12}$/.test(value) // 12-char Base58 check
          props[propName] = isValidBase58 ? value : '' // Use only if valid, otherwise empty
          logWithTimestamp(F, '🔍 [inject] Assigned buttonId:', props[propName]) // Debug final value
        } else if (propName === 'amount') {
          props[propName] = Number(value)
        } else {
          propName = propName.replace(/-(.)/g, (_, char) => char.toUpperCase())
          props[propName] = value
        }
      }
      logWithTimestamp(F, '🔍 [inject] Props after mapping:', { ...props }) // Debug final props
    }
    // Validate existing IDs before deciding to initialize (commented out as requested)
    let shouldInitialize = false
    //*
    /*if (props.paymentId) {
      const validation = await validateIds(props.paymentId, '', wallet);
      if (validation.status === 'error' || !validation.valid) {
        shouldInitialize = true;
        logWithTimestamp(F, '⚠️ [inject] Invalid or missing paymentId, requiring initialization:', { validation });
      }
    } else {
      shouldInitialize = true;
      logWithTimestamp(F, '⚠️ [inject] Missing paymentId, requiring initialization:', { paymentId: props.paymentId });
    }*/
    // Initialize only if validation fails or paymentId is missing (adjusted for commented validateIds)
    if (shouldInitialize) {
      if (!props.paymentId) {
        try {
          const response = await initializeIds(
            'payment',
            wallet,
            props.paymentId || '', // Use existing or empty string
            undefined, // No merchantId, use wallet's default
            undefined, // No setId callback in this context
            undefined, // No fixed description callback
            undefined, // No variable description callback
            undefined // No authToken
          )
          if (response.status === 'success') props.paymentId = props.paymentId || 'default-payment-id'
          logWithTimestamp(F, '🔍 [inject] Updated paymentId:', props.paymentId)
          // Ensure paymentId is valid before rendering
        } catch (err) {
          const e = toError(err)
          logWithTimestamp(F, '❌ [inject] Initialization failed for paymentId:', e)
          continue // Skip rendering if paymentId initialization fails
        }
      }
    }
    // Create button on the server, using buttonId internally
    await createButton(props, wallet)
    // Ensure all required props are present before rendering
    const finalProps: PayButtonProps = {
      amount: props.amount || 5,
      merchant: props.merchant || '',
      server: props.server || 'http://localhost:3000',
      variable: props.variable || false,
      buttonId: props.buttonId || '',
      paymentId: props.paymentId || '',
      text: props.text || ''
    }
    logWithTimestamp(F, '🔍 [inject] Rendering PayButton with final props:', { ...finalProps })
    window.PayButton.render(domElementId, finalProps)
  }
}
window.addEventListener('load', () => {
  bootstrapPayButtons().catch(err => {
    const e = toError(err)
    console.error('❌ Error bootstrapping pay buttons:', e)
    logWithTimestamp(F, '❌ Error bootstrapping pay buttons:', e)
  })
})
export {}