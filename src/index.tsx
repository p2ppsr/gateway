// src/index.tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

import { loadClientConfig } from './utils/clientConfig'
import { ClientConfigProvider } from './contexts/ClientConfigContext'
import { findWalletOrigin } from './utils/checkForMetanetclient'
import { CONFIG, PORTS } from './utils/constants'

// Minimal context to expose the discovered wallet origin app-wide
export const WalletRuntimeContext = React.createContext<{
  walletOrigin: string | null
}>({
  walletOrigin: null
})

const container = document.getElementById('root')!
const root = createRoot(container)

// light loading shell while we fetch config + probe wallet
root.render(
  <div style={{ padding: 16, fontFamily: 'system-ui' }}>Loading…</div>
)

// No top-level await: use a promise chain
loadClientConfig()
  .then(
    async cfg =>
      await findWalletOrigin(cfg.walletLocalPorts).then(walletOrigin => {
        if (!walletOrigin) {
          console.warn(
            'Wallet not detected on any configured port:',
            cfg.walletLocalPorts
          )
        }
        ;(window as any).__WALLET_ORIGIN = walletOrigin

        root.render(
          <BrowserRouter>
            <ClientConfigProvider value={cfg}>
              <WalletRuntimeContext.Provider value={{ walletOrigin }}>
                <App />
              </WalletRuntimeContext.Provider>
            </ClientConfigProvider>
          </BrowserRouter>
        )
      })
  )
  .catch(err => {
    console.error('Failed to bootstrap client config:', err)
    // Fall back to rendering app with defaults
    root.render(
      <BrowserRouter>
        <ClientConfigProvider
          value={{
            walletLocalPorts: [PORTS.WALLET_PRIMARY],
            apiBase: '',
            routingPrefix: '/api',
            wellKnownPath: '/.well-known/auth',
            serverIdentityKey: CONFIG.SERVER_IDENTITY_KEY,
            walletBase: ''
          }}
        >
          <WalletRuntimeContext.Provider value={{ walletOrigin: null }}>
            <App />
          </WalletRuntimeContext.Provider>
        </ClientConfigProvider>
      </BrowserRouter>
    )
  })
