/**
 * @file main.tsx
 *
 * React application entry point.
 * This file bootstraps the React app by rendering the root component `<App />`
 * inside a `<React.StrictMode>` wrapper, targeting the `#root` DOM element.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

// Create a root container and render the main application
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
