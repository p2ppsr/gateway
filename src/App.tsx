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
 */

import React, { useState, useEffect } from 'react'
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import Theme from './components/Theme'
import Navbar from './components/Navbar'
import Create from './pages/Create'
import Buttons from './pages/Buttons'
import Payments from './pages/Payments'
import Actions from './pages/Actions'
import Money from './pages/Money'
import checkForMetanetclient from './utils/checkForMetanetclient'
import { CssBaseline } from '@mui/material'
import { WalletClient, AuthFetch } from '@bsv/sdk'
import useAsyncEffect from 'use-async-effect'
import MetanetclientMissingModal from './components/MetanetclientMissingModal'

// AuthFetch – constructed once per session
const WALLET_ORIGIN = process.env.WALLET_ORIGIN ?? 'localhost'
const wallet = new WalletClient('auto', WALLET_ORIGIN)
const authFetch = new AuthFetch(wallet)

const API_BASE =
  process.env.API_BASE ??
  `${window.location.protocol}//${window.location.hostname}:${process.env.API_PORT ?? process.env.HTTP_PORT ?? 3001}`

/**
 * The main React component for the application.
 *
 * - Applies global MUI theming.
 * - Loads admin status using `/api/getStatus`.
 * - Checks every 2 seconds whether the Metanet client is running and sets `isMncMissing` accordingly.
 * - Displays a modal if Metanet client is not detected.
 * - Defines all app routes using React Router.
 *
 * @component
 * @returns {JSX.Element} The rendered application component.
 */
const App: React.FC = () => {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isMncMissing, setIsMncMissing] = useState(false)

  // Run a periodic check for Metanet client
  useAsyncEffect(() => {
    const intervalId = setInterval(() => {
      void (async () => {
        const hasMNC = await checkForMetanetclient(WALLET_ORIGIN)
        setIsMncMissing(hasMNC === 0)
      })()
    }, 2000)

    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const res = await authFetch.fetch(`${API_BASE}/api/getStatus`, {
          method: 'GET'
        })
        if (!res.ok) throw new Error(`❌ HTTP ${res.status}`)
        const { isAdmin } = await res.json()
        setIsAdmin(isAdmin)
      } catch (err) {
        console.error('❌ getStatus failed:', err)
      }
    })()
  }, [])

  return (
    <Theme>
      <CssBaseline />
      <MetanetclientMissingModal open={isMncMissing} />
      <Router>
        <Navbar isAdmin={isAdmin} />
        <Routes>
          <Route path='/' element={<Create />} />
          <Route path='/buttons' element={<Buttons />} />
          <Route path='/payments' element={<Payments />} />
          <Route path='/actions' element={<Actions />} />
          <Route path='/money' element={<Money />} />
        </Routes>
      </Router>
    </Theme>
  )
}

export default App
