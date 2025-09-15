import React, { createContext, useContext } from 'react'
import type { ClientConfig } from '../utils/clientConfig'
import { CONFIG, PORTS } from '../utils/constants'

const defaultClientConfig: ClientConfig = {
  walletLocalPorts: [PORTS.WALLET_PRIMARY],
  apiBase: '', // empty = use same-origin + dev proxy
  routingPrefix: '/',
  //****** NEEDED FOR PROD ****
  wellKnownPath: '/.well-known/auth',
  serverIdentityKey: CONFIG.SERVER_IDENTITY_KEY,
  walletBase: ''
}

export const ClientConfigContext = createContext<ClientConfig>(defaultClientConfig)

export const ClientConfigProvider: React.FC<
  React.PropsWithChildren<{ value: ClientConfig }>
> = ({ value, children }) => (
  <ClientConfigContext.Provider value={value ?? defaultClientConfig}>
    {children}
  </ClientConfigContext.Provider>
)

export const useClientConfig = () => useContext(ClientConfigContext)
