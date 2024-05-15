import React, { useState, useEffect } from 'react'
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import Theme from './components/Theme'
import Authrite from './utils/Authrite'
import { getNetwork } from '@babbage/sdk-ts'

import Navbar from './components/Navbar'

import Create from './pages/Create'
import Buttons from './pages/Buttons'
import Payments from './pages/Payments'
import Actions from './pages/Actions'
import Money from './pages/Money'
import Home from './pages/Home'

const App = () => {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        // const statusResponse = await Authrite.request(
        //   `${location.protocol}//${location.host}/api/getStatus`, {
        //   method: 'GET'
        // })
        // const status = JSON.parse(
        //   new TextDecoder().decode(statusResponse.body)
        // )
        // setIsAdmin(status.isAdmin)
        // const metanetNetwork = await getNetwork()
        // if (status.network !== metanetNetwork) {
        //   alert(`WARNING! Your MetaNet Client is using ${metanetNetwork} but the payment server is using ${status.network}!\n\nPlease be aware of which network you are using.`)
        // }
      } catch (e) {
        console.error(e)
      }
    })()
  }, [])

  return (
    <Theme>
      <ToastContainer position="top-center" containerId="alertToast" autoClose={5000} />
      <Router>
        <Navbar isAdmin={isAdmin} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<Create />} />
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
