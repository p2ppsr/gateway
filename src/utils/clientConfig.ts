// src/utils/clientConfig.ts
import { PORTS } from './constants'

export interface ClientConfig {
  walletLocalPorts: number[]
  apiBase: string
  routingPrefix: string
  wellKnownPath: string
  payJsUrl?: string
  walletBase: string   // 👈 always point wallet calls to localhost
  /** Public identity key of the server wallet (printed at boot). */
  serverIdentityKey: string
}

function normalizeBase(v?: string | null): string {
  const s = (v ?? '').trim()
  return s ? s.replace(/\/+$/, '') : ''
}

function normalizePrefix(v?: string | null, fallback = '/api'): string {
  let s = (v ?? '').trim()
  if (!s) s = fallback
  if (!s.startsWith('/')) s = `/${s}`
  return s.replace(/\/+$/, '')
}

export function joinApi(base: string, prefix: string, path: string): string {
  const b = normalizeBase(base)
  const p = normalizePrefix(prefix)
  const r = path.startsWith('/') ? path : `/${path}`
  return b ? `${b}${p}${r}` : `${p}${r}`
}

export async function loadClientConfig(): Promise<ClientConfig> {
  // ✅ Switch apiBase: use localhost:3001 in dev, otherwise use HOSTING_DOMAIN or gateway.local
  const apiBase =
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:3001'
      : normalizeBase(
          (process as any)?.env?.VITE_API_BASE ??
          (process as any)?.env?.REACT_APP_API_BASE ??
          (process as any)?.env?.NEXT_PUBLIC_API_BASE ??
          process.env.HOSTING_DOMAIN ??
          'https://gateway.local'
        )

  // Always provide a serverIdentityKey (fallback for dev)
  const serverIdentityKey =
    (process as any)?.env?.SERVER_IDENTITY_KEY ??
    '03f7c1fe6aaccabb06b9897a5c1f4bfa45230556a771d5b08aec5f48b94f09b61b'

  // Wallet is always local (Metanet Client)
  const walletBase = 'http://localhost:3321'

  // Pay.js should always resolve from the API host
  const payJsUrl = `${apiBase}/pay.js`

  return {
    walletLocalPorts: [PORTS.WALLET_PRIMARY],
    apiBase,
    routingPrefix: normalizePrefix(process.env.API_ROUTING_PREFIX, '/api'),
    wellKnownPath: '/.well-known/auth',
    payJsUrl,
    walletBase,
    serverIdentityKey
  }
}
