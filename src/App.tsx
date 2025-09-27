/**
 * @file src/App.tsx
 *
 * The main entry point for the React application.
 * It sets up global theme, routes, and continuously checks for the presence of the Metanet client.
 *
 * Fixes applied:
 * - Added explicit return type for `App` to satisfy `@typescript-eslint/explicit-function-return-type`.
 * - Rewrote `setInterval` to avoid misused Promise warning.
 * - Prefixed IIFE in `useEffect` with `void` to prevent floating promise warning.
 * - Replaced process.env with utils/constants.ts for configuration.
 * - Removed nested BrowserRouter to fix "You cannot render a <Router> inside another <Router>" error (20Aug2025_2223 BST).
 *
 * Version: v1.1 (Updated 20Aug2025_2223 BST)
 */
import React, { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Theme from './components/Theme'
import Navbar from './components/Navbar'
import Create from './pages/Create'
import Buttons from './pages/Buttons'
import Payments from './pages/Payments'
import Actions from './pages/Actions'
import Money from './pages/Money'
import checkForMetanetclient from './utils/checkForMetanetclient'
import { CssBaseline } from '@mui/material'
import useAsyncEffect from 'use-async-effect'
import MetanetclientMissingModal from './components/MetanetclientMissingModal'
import { CONFIG } from './utils/constants'
import { logWithTimestamp } from './utils/logging'
const F = 'App'

logWithTimestamp(F, `CONFIG: ${JSON.stringify(CONFIG)}`)

/**
 * The main React component for the application.
 *
 * - Applies global MUI theming.
 * - Loads admin status using `/getStatus`.
 * - Checks every 2 seconds whether the Metanet client is running and sets `isMncMissing` accordingly.
 * - Displays a modal if Metanet client is not detected.
 * - Defines all app routes using React Router.
 *
 * @component
 * @returns {JSX.Element} The rendered application component.
 */
const App: React.FC = () => {
  const [isAdmin] = useState(false)
  const [isMncMissing, setIsMncMissing] = useState(false)

  // Run a periodic check for Metanet client
  useAsyncEffect(() => {
    const intervalId = setInterval(() => {
      void (async () => {
        const hasMNC = await checkForMetanetclient(CONFIG.WALLET_ORIGIN)
        setIsMncMissing(hasMNC === 0)
      })()
    }, 2000)
    return () => clearInterval(intervalId)
  }, [])

  return (
    <Theme>
      <CssBaseline />
      <MetanetclientMissingModal open={isMncMissing} />
      <Navbar isAdmin={isAdmin} />
      <Routes>
        <Route path="/" element={<Create />} />
        <Route path="/buttons" element={<Buttons />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/actions" element={<Actions />} />
        <Route path="/money" element={<Money />} />
      </Routes>
    </Theme>
  )
}

export default App
