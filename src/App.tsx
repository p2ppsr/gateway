// frontend/src/App.tsx
import React, { useState, useEffect } from 'react'
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import Theme from './components/Theme'
import Navbar from './components/Navbar'
import Create from './pages/Create'
import Buttons from './pages/Buttons'
import Payments from './pages/Payments'
import Actions from './pages/Actions'
import Money from './pages/Money'
import useAsyncEffect from 'use-async-effect'
import { CssBaseline } from '@mui/material'
import { WalletClient, AuthFetch } from '@bsv/sdk'

const wallet = new WalletClient('auto', 'localhost')
const authFetch = new AuthFetch(wallet)

const App = () => {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isMncMissing, setIsMncMissing] = useState(false)

  useEffect(() => {
    ;(async () => {
    ;(async () => {
      try {
        const statusResponse = await authFetch.fetch(
          `${window.location.protocol}//${window.location.host}/api/getStatus`,
          {
            method: 'GET'
          }
        )
        if (!statusResponse.ok) {
          throw new Error(`HTTP error! status: ${statusResponse.status}`)
        }
        const status = await statusResponse.json()
        setIsAdmin(status.isAdmin)
      } catch (e) {
        console.error(e)
      }
    })()
  }, [])

  return (
    <Theme>
      <ToastContainer
        position="top-center"
        containerId="alertToast"
        autoClose={5000}
      />
      <CssBaseline />
      {/* <Container maxWidth='xl' sx={{ padding: '0 !important' }}> */}
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
      {/* </Container> */}
    </Theme>
  )
}

export default App
