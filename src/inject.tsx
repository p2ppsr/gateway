// src/inject.tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import PayButton from './components/PayButton'

// fail when there is no window object
if (typeof window !== 'object') {
  throw {
    message: 'Window must be defined in order to use the Gateway inject script'
  }
}

// create a local .render() function accessible from the window object
;(window as any).PayButton = {}
;(window as any).PayButton.render = (elementID: string, props: any) => {
  const element = document.getElementById(elementID)
  if (element) {
    const root = createRoot(element)
    root.render(<PayButton {...props} />)
  }
}

// this function uses the above renderer to load all buttons where
// class="gateway-paybutton" automatically
let bootstrapPayButtons = () => {
  let buttons = document.getElementsByClassName('gateway-paybutton')
  console.log('Gateway: Found', buttons.length, buttons.length === 1 ? 'PayButton' : 'PayButtons', 'on this page.')

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

    console.log('PayButton props for pay-' + props.button, props)
    ;(window as any).PayButton.render(buttonID, props)
  }
}

window.addEventListener('load', bootstrapPayButtons)
