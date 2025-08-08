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
 *
 * Version: v2.27 (Updated 05Aug2025_0340 BST to improve paymentId logging clarity)
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import PayButton, { PayButtonProps } from './components/PayButton'
import console from 'console-browserify'

interface ButtonCodeResponse {
  status: string
  payment_id: string
  code: string
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
  console.log('🔍 [Step 1] Inject props (sats):', { props })
  const element = document.getElementById(elementID)
  if (!element) {
    console.error(`❌ Failed to render PayButton: Element with ID ${elementID} not found`)
    return
  }
  const root = createRoot(element)
  root.render(<PayButton {...props} />)
  console.log(`✅ Rendered PayButton for ID: ${elementID}`)
}

const bootstrapPayButtons = async (): Promise<void> => {
  const buttons = document.getElementsByClassName('gateway-paybutton')
  console.log('🔍 Gateway: Found', buttons.length, buttons.length === 1 ? 'PayButton' : 'PayButtons', 'on this page.')

  for (let i = 0; i < buttons.length; i++) {
    const button = buttons.item(i)
    if (!button) continue
    const buttonID = `pay-${Math.floor(Math.random() * 100000)}`
    button.id = buttonID
    button.setAttribute('id', buttonID)
    const props: Partial<PayButtonProps> = { amount: 0, merchant: '', server: '', variable: false, paymentId: '' }
    console.log('🔍 [inject] Initial props:', { ...props }) // Debug initial state
    if (button.hasAttributes()) {
      const attrs = button.attributes
      for (let j = attrs.length - 1; j >= 0; j--) {
        if (!attrs[j].name.startsWith('data-')) continue
        let propName = attrs[j].name.substring(5) // Extract as-is
        const value = attrs[j].value
        console.log('🔍 [inject] Processing attribute (raw):', { propName: attrs[j].name, value }) // Log raw attribute name
        // Explicitly handle paymentId case
        if (propName.toLowerCase() === 'paymentid' || propName.toLowerCase() === 'paymentId') {
          propName = 'paymentId' // Force camelCase
          props[propName] = value
          console.log('🔍 [inject] Assigned paymentId:', value) // Debug paymentId assignment
        } else if (propName === 'amount') {
          props[propName] = Number(value)
        } else {
          // Convert other hyphenated names to camelCase
          propName = propName.replace(/-(.)/g, (_, char) => char.toUpperCase())
          props[propName] = value
        }
      }
      console.log('🔍 [inject] Props after mapping:', { ...props }) // Debug final props
    }
    const paymentId = props.paymentId || ''
    if (!paymentId) {
      console.warn('🔍 [inject] No paymentId found, skipping button:', button.outerHTML)
      continue
    }

    if (paymentId && props.server) {
      try {
        const response = await fetch(`${props.server}/api/buttonCode/${paymentId}`, {
          headers: { Accept: 'application/json' }
        })
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
        const fetchedProps = await response.json()
        console.log('🔍 [inject] Fetched props for paymentId:', paymentId, 'Data:', fetchedProps)
        if (fetchedProps.status === 'success' && fetchedProps.payment_id) {
          props.paymentId = fetchedProps.payment_id // Update if server provides a different paymentId
        } else {
          console.warn('🔍 [inject] Invalid button code response, using existing paymentId:', paymentId, fetchedProps)
        }
      } catch (err) {
        console.error('❌ [inject] Failed to fetch button code for', paymentId, 'Error:', err)
      }
    } else {
      console.log('🔍 [Step 2] Using static props (sats):', props)
    }
    // Ensure all required props are present before rendering
    const finalProps: PayButtonProps = {
      ...props,
      paymentId: props.paymentId || '',
      amount: props.amount || 5,
      merchant: props.merchant || '',
      server: props.server || 'http://localhost:3000'
    }
    window.PayButton.render(buttonID, finalProps)
  }
}

window.addEventListener('load', () => {
  bootstrapPayButtons().catch(err => console.error('❌ Error bootstrapping pay buttons:', err))
})

export {}
