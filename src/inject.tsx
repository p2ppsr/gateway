/**
 * @file src/inject.tsx
 *
 * Injects Gateway payment buttons into third-party websites.
 *
 * This script does two main things:
 * 1. Defines a global `window.PayButton.render()` method to render a single payment button inside a given DOM element.
 * 2. Automatically scans the page on `window.load` for any element with `class="gateway-paybutton"` and renders a button into it
 *    using any `data-*` attributes as props.
 *
 * This file is intended to be included via a `<script>` tag on external sites.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import PayButton from './components/PayButton'

// Define props interface for PayButton, matching the PayButton component's expected props
interface PayButtonProps {
  text?: string
  amount: number
  merchant: string
  button: string
  currency?: string
  server: string
  loadingtext?: string
  [key: string]: string | number | undefined
}

// fail when there is no window object
if (typeof window !== 'object') {
  throw new Error('❌ Window must be defined in order to use the Gateway inject script')
}

/**
 * Render a PayButton component into the specified DOM element.
 *
 * @param {string} elementID - The ID of the DOM element to inject the PayButton into.
 * @param {PayButtonProps} props - Props to pass to the PayButton component, typically parsed from `data-*` attributes.
 */
;(window as any).PayButton = {}
;(window as any).PayButton.render = (elementID: string, props: PayButtonProps): void => {
  const element = document.getElementById(elementID)
  if (element != null) {
    const root = createRoot(element)
    root.render(<PayButton {...props} />)
    console.log(`✅ Rendered PayButton for ID: ${elementID}`)
  } else {
    console.error(`❌ Failed to render PayButton: Element with ID ${elementID} not found`)
  }
}

/**
 * Automatically finds and injects PayButton components into all elements with `class="gateway-paybutton"`.
 * Props are extracted from each element’s `data-*` attributes.
 */
const bootstrapPayButtons = (): void => {
  const buttons = document.getElementsByClassName('gateway-paybutton')
  console.log('🔍 Gateway: Found', buttons.length, buttons.length === 1 ? 'PayButton' : 'PayButtons', 'on this page.')

  for (let i = 0; i < buttons.length; i++) {
    const button = buttons.item(i)
    if (button == null) {
      continue
    }

    const buttonID = `pay-${Math.floor(Math.random() * 100000)}`
    button.id = buttonID
    button.setAttribute('id', buttonID)

    const props: PayButtonProps = { amount: 0, merchant: '', button: '', server: '' }
    if (button.hasAttributes()) {
      const attrs = button.attributes
      for (let j = 0; j < attrs.length; j++) {
        if (!attrs[j].name.startsWith('data-')) {
          continue
        }
        const propName = attrs[j].name.substring(5)
        // Convert 'amount' to number, others remain strings
        props[propName] = propName === 'amount' ? Number(attrs[j].value) : attrs[j].value
      }
    }

    console.log('🔍 PayButton props for pay-', props.button ?? 'unknown', props)
    ;(window as any).PayButton.render(buttonID, props)
  }
}

window.addEventListener('load', bootstrapPayButtons)
