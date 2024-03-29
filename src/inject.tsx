import React from 'react'
import ReactDOM from 'react-dom'
import PayButton from './components/PayButton'

// fail when there is no window object
if (typeof window !== 'object') {
    throw {
        message: 'Window must be defined in order to use the Gateway inject script'
    }
}

// create a local .render() function accessible from the window object
(window as any).PayButton = {};

(window as any).PayButton.render = (elementID: string, props: any) => {
    // first, we clear anything that might be in the element
    ReactDOM.render(
        <div />,
        document.getElementById(elementID),
        () => {
            // then, we render the actual PayButton
            ReactDOM.render(
                <PayButton {...props} />,
                document.getElementById(elementID)
            )
        }
    )
}

// this function uses the above renderer to load all buttons where
// class="payButton" automatically
let bootstrapPayButtons = () => {
    // query the DOM and console-log however many buttons we found
    let buttons = document.getElementsByClassName('gateway-paybutton')
    console.log(
        'Gateway: Found',
        buttons.length,
        buttons.length === 1 ? 'PayButton' : 'PayButtons',
        'on this page.'
    )

    // for each of those buttons, use the renderer to display the button
    for (let i = 0; i < buttons.length; i++) {
        let button = buttons.item(i)
        if (!button) {
            continue
        }

        // set a random ID for the button so we can keep track of it
        let buttonID = 'pay-' + Math.floor(Math.random() * 100000)
        button.id = buttonID
        button.setAttribute('id', buttonID)

        // store all element attributes in a JSON object
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

        console.log(props);
        // render the button
        (window as any).PayButton.render(buttonID, props)
    }
}

// on page load, call the automatic button loader defined above
window.addEventListener('load', bootstrapPayButtons)