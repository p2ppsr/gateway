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
 * Updated with merchant button style enhancements for branding.
 * - All amounts are now handled as integer sats internally for precision.
 * - Version: v1.5 (Updated 29Jul2025_1015 BST with Sibling Hidden Div Creation)
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import PayButton, { PayButtonProps } from './components/PayButton'

// Fail when there is no window object
if (typeof window !== 'object') {
  throw new Error('❌ Window must be defined in order to use the Gateway inject script')
}

/**
 * Render a PayButton component into the specified DOM element with enhanced merchant styles.
 *
 * @param {string} elementID - The ID of the DOM element to inject the PayButton into.
 * @param {PayButtonProps} props - Props to pass to the PayButton component, typically parsed from `data-*` attributes.
 *                                - amount is in sats.
 */
;(window as any).PayButton = {}
;(window as any).PayButton.render = (elementID: string, props: PayButtonProps): void => {
  console.log('🔍 [Step 1] Inject props (sats):', props) // Log props received by inject
  const element = document.getElementById(elementID)
  if (element != null) {
    const root = createRoot(element)
    root.render(<PayButton {...props} />)
    console.log(`✅ Rendered PayButton for ID: ${elementID}`)

    // Apply enhanced merchant button styles
    requestAnimationFrame(() => {
      const buttonDiv = document.getElementById(elementID)
      if (buttonDiv && buttonDiv.innerHTML.trim()) {
        const supplementalStyle = document.createElement('style')
        supplementalStyle.textContent = `
          #${elementID}.gateway-paybutton {
            padding: 0.8em 1.2em; /* Slightly larger padding for better touch targets */
            border-radius: 2.5em; /* Softer corners for modern look */
            border: 2px solid #4a90e2; /* Merchant brand blue border */
            background-color: #ffffff; /* White background for contrast */
            color: #4a90e2; /* Blue text to match border */
            font-weight: 600; /* Bolder text for emphasis */
            box-shadow: 0 4px 6px rgba(74, 144, 226, 0.2); /* Subtle shadow for depth */
            transition: all 0.3s ease; /* Smooth transitions */
            cursor: pointer;
            display: inline-block; /* Ensure inline-block for layout */
          }
          #${elementID}.gateway-paybutton:hover {
            background-color: #4a90e2; /* Blue background on hover */
            color: #ffffff; /* White text on hover */
            box-shadow: 0 6px 12px rgba(74, 144, 226, 0.3); /* Deeper shadow on hover */
          }
          #${elementID}.gateway-paybutton[data-disabled="true"] {
            opacity: 0.6;
            background-color: #cccccc; /* Grayed out when disabled */
            border-color: #999999;
            cursor: not-allowed;
            pointer-events: none;
          }
          #${elementID}.gateway-paybutton-variable input {
            width: 60px; /* Slightly wider input for variable amounts */
            text-align: center;
            margin: 0 6px;
            padding: 3px;
            border: 2px solid #4a90e2; /* Matching border */
            border-radius: 0.5em;
            background: #f9f9f9; /* Light gray background */
            color: #333333; /* Darker text for readability */
            font-weight: 500;
            vertical-align: middle;
          }
        `
        const existingStyle = document.querySelector(`style[data-style-for="${elementID}"]`)
        if (existingStyle) document.head.removeChild(existingStyle)
        supplementalStyle.setAttribute('data-style-for', elementID)
        document.head.appendChild(supplementalStyle)
        console.log(`🔍 PayButton style applied for ID: ${elementID}`)
      } else {
        console.warn(`⚠️ Button element not ready or empty for ID: ${elementID}`)
      }
    })
  } else {
    console.error(`❌ Failed to render PayButton: Element with ID ${elementID} not found`)
  }
}

/**
 * Automatically finds and injects PayButton components into all elements with `class="gateway-paybutton"`.
 * Props are extracted from each element’s `data-*` attributes.
 * - amount is interpreted as sats.
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

    const props: PayButtonProps = { amount: 0, merchant: '', button: '', server: '', variable: false }
    const dataAttrs: { [key: string]: string } = {}
    if (button.hasAttributes()) {
      const attrs = button.attributes
      for (let j = attrs.length - 1; j >= 0; j--) { // Reverse to avoid index issues on removal
        if (!attrs[j].name.startsWith('data-')) {
          continue
        }
        const propName = attrs[j].name.substring(5)
        const value = attrs[j].value
        props[propName] = propName === 'amount' ? Number(value) : value
        dataAttrs[propName] = value
        button.removeAttribute(attrs[j].name) // Remove data-* from visible div
      }
    }

    console.log('🔍 [Step 2] Parsed props (sats):', props) // Log parsed props

    // Create and insert sibling hidden data div
    const hiddenDiv = document.createElement('div')
    hiddenDiv.className = 'gateway-paybutton-fixed' // Use -fixed for now; can conditional on props.variable later
    hiddenDiv.id = `pay-hidden-${Math.floor(Math.random() * 100000)}`
    hiddenDiv.style.display = 'none'
    for (const [key, value] of Object.entries(dataAttrs)) {
      hiddenDiv.setAttribute(`data-${key}`, value)
    }
    if (button.parentNode) {
      button.parentNode.insertBefore(hiddenDiv, button)
      console.log('🔍 Created and inserted sibling hidden div:', hiddenDiv.outerHTML)
    } else {
      console.warn('⚠️ No parent node for button; skipping hidden div insertion')
    }

    ;(window as any).PayButton.render(buttonID, props)
  }
}

window.addEventListener('load', bootstrapPayButtons)