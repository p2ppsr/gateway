// src/routes/acknowledgePayment.ts
/**
 * @file src/routes/acknowledgePayment.ts
 * @description POST route to acknowledge a payment after it has been paid,
 * then internalize it into the merchant’s MNC wallet (BRC-29 style).
 * @version 3.2.0
 */
import knex, { Knex } from 'knex'
import knexConfig from '../knexfile'
import { Request, Response } from 'express'
import { logWithTimestamp } from '../utils/logging'
import { walletPromise } from '../server' // already used elsewhere
import { InternalizeActionArgs, PrivateKey, Transaction, Utils } from '@bsv/sdk'
import { ScriptTemplateBRC29, ScriptTemplateParamsBRC29 } from '@bsv/wallet-toolbox'

const F = 'routes/acknowledgePayment'
const db: Knex = knex(knexConfig)

export type AuthRequest = Request & {
  auth?: { identityKey?: string }
}

export default {
  type: 'post' as const,
  path: '/acknowledgePayment',
func: async (req: AuthRequest, res: Response): Promise<void> => {
  logWithTimestamp(F, '🔥 [acknowledgePayment] Incoming body:', req.body)
  const { paymentId } = req.body as { paymentId: string; atomicBeefTx?: string; transaction?: any }

  // --- Merchant-only authorization (strict) ---
  let senderIdentityKey: string | null = req.auth?.identityKey || null
  if (!senderIdentityKey || senderIdentityKey === 'unknown') senderIdentityKey = null

  // Load payment with ALL fields we actually use below
  const payment = await db('payments')
    .select(
      'payment_id',
      'merchant_id',
      'is_new',
      'blockchain_transaction',
      'derivation_prefix',
      'derivation_suffix',
      'txid',
      'amount'
    )
    .where({ payment_id: paymentId })
    .first()

  if (!payment) {
    res.status(404).json({ status: 'error', message: 'Payment not found' })
    return
  }

  const merchantId: string = payment.merchant_id

  logWithTimestamp(F, '🔍 [acknowledgePayment] [Auth] merchant-only check', {
    senderIdentityKey,
    merchantId
  })

  if (senderIdentityKey !== merchantId) {
    logWithTimestamp(F, '❌ Only the merchant may acknowledge this payment', {
      senderIdentityKey,
      merchantId
    })
    res.status(403).json({
      status: 'error',
      message: 'Only the merchant that owns this payment may acknowledge it'
    })
    return
  }

  logWithTimestamp(F, '✅ Merchant authorized to acknowledge', { merchantId })

  try {
    // If it’s already acknowledged, return idempotently
    const isNew = payment.is_new === 1 || payment.is_new === true
    if (!isNew) {
      res.status(200).json({
        status: 'success',
        message: 'Payment already acknowledged',
        paymentId,
        txid: payment.txid
      })
      return
    }

    // === Find an atomicBeefTx (body → DB fallback; support multiple shapes) ===
    let atomicBeefTx: string | undefined =
      req.body.atomicBeefTx || req.body.transaction?.atomicBeefTx

    if (!atomicBeefTx && payment.blockchain_transaction) {
      try {
        const stored =
          typeof payment.blockchain_transaction === 'string'
            ? JSON.parse(payment.blockchain_transaction)
            : payment.blockchain_transaction

        if (typeof stored === 'string') {
          // direct hex string case
          if (/^[0-9a-fA-F]+$/.test(stored)) atomicBeefTx = stored
        } else if (stored?.atomicBeefTx) {
          atomicBeefTx = stored.atomicBeefTx
        } else if (stored?.transaction?.atomicBeefTx) {
          atomicBeefTx = stored.transaction.atomicBeefTx
        }
      } catch (e) {
        logWithTimestamp(F, '⚠️ Failed to parse blockchain_transaction JSON', {
          message: e instanceof Error ? e.message : String(e)
        })
      }
    }

    if (!atomicBeefTx) {
      const msg = `Payment ${paymentId} missing atomicBeefTx (send {atomicBeefTx} in body or ensure /pay stored blockchain_transaction).`
      logWithTimestamp(F, '❌ ' + msg)
      res.status(400).json({ status: 'error', message: msg })
      return
    }

    // === (Optional) Decode to log outputs count; keep consistent with other routes ===
    try {
      const txBytes = Utils.toArray(atomicBeefTx, 'hex')
      const tx = Transaction.fromAtomicBEEF(txBytes)
      logWithTimestamp(F, '🔍 Decoded TX from atomicBeefTx', { outputs: tx.outputs.length })
    } catch (e) {
      logWithTimestamp(F, '⚠️ Failed to decode atomicBeefTx', {
        message: e instanceof Error ? e.message : String(e)
      })
      // Not fatal for acknowledging, we still proceed
    }

    // === Build expected BRC29 locking script (same as invoice/pay) ===
    const wallet = await walletPromise
    const brcParams: ScriptTemplateParamsBRC29 = {
      derivationPrefix: payment.derivation_prefix,
      derivationSuffix: payment.derivation_suffix,
      keyDeriver: wallet.keyDeriver
    }
    logWithTimestamp(F, '🔍 BRC29 params', brcParams)

    const BRC29 = new ScriptTemplateBRC29(brcParams)
    const fixedPriv = PrivateKey.fromHex('1'.padStart(64, '0')) // 0x01
    const expectedLockingScriptHex = BRC29.lock(fixedPriv.toString(), merchantId).toHex()
    logWithTimestamp(F, '🔍 Generated full BRC29 expectedLockingScriptHex=', expectedLockingScriptHex)

    // === Mark as acknowledged/internalized (idempotent) ===
    await db('payments')
      .where({ payment_id: paymentId })
      .update({ is_new: 0, updated_at: db.fn.now() })

    res.status(200).json({
      status: 'success',
      message: 'Payment acknowledged',
      paymentId,
      txid: payment.txid || null,
      atomicBeefTx,
      derivationPrefix: payment.derivation_prefix,
      derivationSuffix: payment.derivation_suffix,
      merchant_id: merchantId,
      expectedLockingScriptHex
    })
  } catch (error) {
    logWithTimestamp(F, '❌ Error acknowledging/internalizing payment:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : '❌ No stack trace'
    })
    res.status(500).json({ status: 'error', message: String(error) })
  }
}
}
