/**
 * @file src/routes/pay.ts
 * @description
 * POST route to complete a payment by submitting a transaction,
 * validating paymentId and buttonId, transaction format, and locking script,
 * then updating the payments table.
 * @version 1.0.0
 * @author xAI (Grok 3)
 */

import knex, { Knex } from 'knex'
import knexConfig from '../knexfile'
import { Request, Response } from 'express'
import { createHash, createHmac } from 'crypto'
import { logWithTimestamp } from '../utils/logging'
import { walletPromise } from '../server'
//import { brc29ProtocolID, ScriptTemplateBRC29 } from '@bsv/wallet-toolbox'
import { PublicKey, Utils, P2PKH, Transaction as BsvTx, PrivateKey, Beef } from '@bsv/sdk'
import { brc29ProtocolID, ScriptTemplateBRC29 } from '@bsv/wallet-toolbox'

const F = 'routes/pay'
const db: Knex = knex(knexConfig)

interface Payment {
  payment_id: string
  button_id: string
  payer_id: string | null
  merchant_id: string
  amount: number
  completed: boolean
  derivation_prefix: string
  derivation_suffix: string
  txid: string | null
}
interface RequestBody {
  paymentId: string
  buttonId: string
  transaction: {
    txid: string
    atomicBeefTx: string
  }
  lockingScript?: string
  amount?: number
}
export type AuthRequest = Request & {
  auth?: {
    identityKey?: string
  }
}

export default {
  type: 'post' as const,
  path: '/pay',
  func: async (req: AuthRequest, res: Response): Promise<void> => {
    logWithTimestamp(F, '🔥 [pay] Incoming body:', req.body)
    const { paymentId, buttonId, transaction, lockingScript, amount }: RequestBody = req.body

    try {
      // Validate DB records
      const paymentRec = (await db('payments')
        .where({ payment_id: paymentId, button_id: buttonId, completed: false })
        .first()) as Payment | undefined
      if (!paymentRec) {
        res.status(404).json({
          status: 'error',
          message: 'Payment not found or already completed'
        })
        return
      }

      // --- Auth handling (do NOT require caller === merchant) ---
      const allowFallback = (process.env.ALLOW_UNAUTH_FALLBACK ?? '').toLowerCase() === 'yes'

      // Optional server identity (accepted if header matches, but not required)
      const serverIdentityKey =
        process.env.SERVER_IDENTITY_KEY || (req.app.get('config')?.SERVER_IDENTITY_KEY as string) || ''

      let senderIdentityKey: string | null = (req as any).auth?.identityKey || null
      if (!senderIdentityKey || senderIdentityKey === 'unknown') senderIdentityKey = null

      const headerServerKey = req.headers['x-bsv-server']
      if (typeof headerServerKey === 'string' && headerServerKey === serverIdentityKey) {
        senderIdentityKey = serverIdentityKey
        logWithTimestamp(F, '🔑 [pay] Accepted server identity via header', {
          senderIdentityKey
        })
      }

      logWithTimestamp(F, '🔍 [pay] [Step 1] Auth context check:', {
        senderIdentityKey,
        resolvedMerchantId: paymentRec.merchant_id, // source of truth is DB/payment record
        headers: req.headers,
        allowFallback
      })

      // Allow unauth fallback if configured (still not tying to merchant)
      if (!senderIdentityKey && allowFallback) {
        senderIdentityKey = '0282f7effd932d9d2a3774c287eacb9ace3728a753a0339e2f16998153e5d65963'
      }

      logWithTimestamp(F, '✅ [pay] Caller accepted; resolved merchant', {
        senderIdentityKey,
        resolvedMerchantId: paymentRec.merchant_id,
        serverIdentityKey,
        allowFallback
      })

      // Load wallet
      const wallet = await walletPromise
      logWithTimestamp(F, '🔍 [pay] [Step 2] Loaded walletPromise')

      // ✅ Parse transaction object safely
      const txEnvelope = typeof transaction === 'string' ? JSON.parse(transaction) : transaction

      // ✅ Decode Atomic BEEF to Beef instance
      const beef = Beef.fromString(txEnvelope.atomicBeefTx, 'hex')

      // ✅ Take the last transaction (Atomic BEEF puts it last)
      const lastTx = beef.txs[beef.txs.length - 1]

      // ✅ Build rawTxHex safely
      let rawTxHex: string
      if (lastTx?.tx) {
        rawTxHex = lastTx.tx.toHex()
      } else if (lastTx?.rawTx && lastTx.rawTx.length > 0) {
        rawTxHex = Buffer.from(lastTx.rawTx).toString('hex')
      } else {
        throw new Error('No transaction data found in BeefTx')
      }

      // ✅ Build Transaction instance from raw hex
      const bsvtx = BsvTx.fromHex(rawTxHex)

      // 🔹 Build BRC29 locking script identically to invoice.ts
      const brcParams = {
        derivationPrefix: paymentRec.derivation_prefix,
        derivationSuffix: paymentRec.derivation_suffix,
        keyDeriver: wallet.keyDeriver // exactly as invoice.ts
      }
      const BRC29 = new ScriptTemplateBRC29(brcParams)

      // Fixed private key = 0x01
      const fixedPriv = PrivateKey.fromHex('1'.padStart(64, '0'))

      // merchant_id is the unlocker
      const expectedLockingScript = BRC29.lock(fixedPriv.toString(), paymentRec.merchant_id).toHex()

      // 🔹 Compare with transaction outputs
      const expectedAmount = amount ?? paymentRec.amount
      const txMatches = bsvtx.outputs.some(
        (x: any) =>
          x.lockingScript.toHex() === expectedLockingScript && Math.abs((x.satoshis ?? 0) - expectedAmount) <= 1
      )

      if (!txMatches) {
        logWithTimestamp(F, '❌ [pay] TX does not satisfy invoice', {
          expectedLockingScript,
          expectedAmount
        })
        res.status(400).json({
          status: 'error',
          message: 'The transaction does not satisfy the invoice (BRC29)'
        })
        return
      }

      // Continue DB updates
      await db('payments')
        .where({ payment_id: paymentId, button_id: buttonId })
        .update({
          completed: true,
          blockchain_transaction: JSON.stringify(transaction),
          txid: transaction.txid,
          amount: amount ?? paymentRec.amount,
          updated_at: db.fn.now()
        })
      logWithTimestamp(F, `✅ [pay] Payment completed. TXID: ${transaction.txid}`)
      res.status(200).json({ status: 'success', txid: transaction.txid })
    } catch (err) {
      logWithTimestamp(F, '❌ [pay] Error in /pay:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : '❌ No stack'
      })
      res.status(500).json({ status: 'error', message: String(err) })
    }
  }
}
