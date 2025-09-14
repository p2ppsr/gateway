import React, { createContext, useContext } from 'react'
import type { ClientConfig } from '../utils/clientConfig'

const defaultClientConfig: ClientConfig = {
  walletLocalPorts: [3321],
  apiBase: '', // empty = use same-origin + dev proxy
  routingPrefix: '/',
  //****** NEEDED FOR PROD ****
  //routingPrefix: '/api',
  wellKnownPath: '/.well-known/auth',
  serverIdentityKey: '3c164fce7834d831bbc96975f9717ad8af7d94d7df0d36de0b4c13e009540589'
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
