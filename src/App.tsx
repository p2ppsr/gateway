// src/App.tsx
import React, { useState, useEffect } from 'react'
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import Theme from './components/Theme'
import Navbar from './components/Navbar'
import Create from './pages/Create'
import Buttons from './pages/Buttons'
import Payments from './pages/Payments'
import Actions from './pages/Actions'
import Money from './pages/Money'
import checkForMetaNetclient from './utils/checkForMetanetclient'
import { CssBaseline } from '@mui/material'
import { WalletClient, AuthFetch } from '@bsv/sdk'
import useAsyncEffect from 'use-async-effect'
import MetanetclientMissingModal from './components/MetanetclientMissingModal'

/* -------------------------------------------------------------------------- */
/*  AuthFetch – constructed once per session                                  */
/* -------------------------------------------------------------------------- */

const WALLET_ORIGIN = process.env.WALLET_ORIGIN ?? 'localhost:3301'
const wallet = new WalletClient('auto', WALLET_ORIGIN)
const authFetch = new AuthFetch(wallet)

const API_BASE =
  process.env.API_BASE ??
  `${window.location.protocol}//${window.location.hostname}:${process.env.API_PORT ?? process.env.HTTP_PORT ?? 3001}`

const App = () => {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isMncMissing, setIsMncMissing] = useState(false)

  // Run a 10s interval for checking if MNC is running
  useAsyncEffect(async () => {
    const intervalId = setInterval(async () => {
      const hasMNC = await checkForMetaNetclient(WALLET_ORIGIN)
      setIsMncMissing(hasMNC === 0)
    }, 2000)

    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await authFetch.fetch(`${API_BASE}/api/getStatus`, {
          method: 'GET'
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const { isAdmin } = await res.json()
        setIsAdmin(isAdmin)
      } catch (err) {
        console.error('getStatus failed:', err)
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
          <Route path="/" element={<Create />} />
          <Route path="/buttons" element={<Buttons />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/actions" element={<Actions />} />
          <Route path="/money" element={<Money />} />
        </Routes>
      </Router>
    </Theme>
  )
}

export default App
