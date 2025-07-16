// src/auth/authFetch.ts
import { WalletClient, AuthFetch } from '@bsv/sdk'

// 1 · create or detect the wallet adapter
const WALLET_ORIGIN = process.env.WALLET_ORIGIN ?? 'localhost:3321'
const wallet = new WalletClient('auto', WALLET_ORIGIN)
//const wallet = new WalletClient('auto', 'localhost');

// 2 · pass ONLY the wallet
export const authFetch = new AuthFetch(wallet)
