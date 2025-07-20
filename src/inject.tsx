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

// Fail fast if window is not defined (e.g., running in a non-browser environment)
if (typeof window !== 'object') {
  throw {
    message: 'Window must be defined in order to use the Gateway inject script'
  }
}

// Expose a global PayButton render method
;(window as any).PayButton = {}

/**
 * Render a PayButton component into the specified DOM element.
 *
 * @param {string} elementID - The ID of the DOM element to inject the PayButton into.
 * @param {any} props - Props to pass to the PayButton component, typically parsed from `data-*` attributes.
 */
;(window as any).PayButton.render = (elementID: string, props: any) => {
  const element = document.getElementById(elementID)
  if (element) {
    const root = createRoot(element)
    root.render(<PayButton {...props} />)
  }
}

/**
 * Automatically finds and injects PayButton components into all elements with `class="gateway-paybutton"`.
 * Props are extracted from each element’s `data-*` attributes.
 */
let bootstrapPayButtons = () => {
  let buttons = document.getElementsByClassName('gateway-paybutton')
  for (let i = 0; i < buttons.length; i++) {
    let button = buttons.item(i)
    if (!button) {
      continue
    }

    let buttonID = 'pay-' + Math.floor(Math.random() * 100000)
    button.id = buttonID
    button.setAttribute('id', buttonID)

    let props: Record<string, any> = {}
    if (button.hasAttributes()) {
      let attrs = button.attributes
      for (let j = 0; j < attrs.length; j++) {
        if (!attrs[j].name.startsWith('data-')) {
          continue
        }
        props[attrs[j].name.substring(5)] = attrs[j].value
      }
    }
    ;(window as any).PayButton.render(buttonID, props)
  }
}

window.addEventListener('load', bootstrapPayButtons)
