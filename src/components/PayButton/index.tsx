/**
 * @file src/components/PayButton/index.tsx
 *
 * Renders a `PayButton` React component for initiating blockchain payments via the Metanet client.
 *
 * This component performs a multi-step authenticated payment flow:
 * - Verifies server availability
 * - Requests a payment invoice from the backend
 * - Uses `WalletClient.createAction()` to construct a signed atomic transaction
 * - Submits the transaction to the backend for processing
 * - Displays confirmation and transaction ID if successful
 *
 * It integrates with the Metanet client's `AuthFetch` and `WalletClient` for secure, user-controlled signing.
 */

import React, { useState } from 'react'
import { WalletClient, AuthFetch, Transaction, Utils } from '@bsv/sdk'

/**
 * Reusable payment component.
 *
 * @param text         Button label (default "Pay Now")
 * @param amount       Amount in chosen currency (number)
 * @param merchant     Merchant identity key (string)
 * @param button       Payment-button ID (string)
 * @param currency     "BSV" | "USD" | …
 * @param server       Gateway back-end URL (e.g. "http://localhost:3001")
 * @param loadingtext  Text while awaiting invoice / payment
 */
const PayButton = ({
  text = 'Pay Now',
  amount,
  merchant,
  button,
  currency = 'BSV',
  server,
  loadingtext = 'Loading, please wait…'
}: {
  text?: string
  amount: number
  merchant: string
  button: string
  currency?: string
  server: string
  loadingtext?: string
}) => {
  const [loading, setLoading] = useState(false)
  const [paid, setPaid] = useState(false)
  const [txid, setTxid] = useState<string | null>(null)

  // One AuthFetch + one WalletClient per click keeps scope tidy
  const handleClick = async () => {
    setLoading(true)
    try {
      const WALLET_ORIGIN = process.env.WALLET_ORIGIN ?? 'localhost:3321'
      const wallet = new WalletClient('auto', WALLET_ORIGIN)
      const authFetch = new AuthFetch(wallet)

      /* --------------------------- /api/getStatus ------------------------ */
      const resStatus = await authFetch.fetch(`${server}/api/getStatus`, {
        method: 'GET'
      })
      const status = await resStatus.json()
      if (status.status !== 'success') throw new Error('Cannot reach server')

      /* ----------------------------- /api/invoice ------------------------ */
      const resInv = await authFetch.fetch(`${server}/api/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: merchant,
          paymentButtonId: button,
          currency,
          amount: 0.00000005
        })
      })
      const invoice = await resInv.json()
      if (invoice.status !== 'success') throw new Error(invoice.message)

      /* --------------------------- sign & pay ---------------------------- */
      const tx = await wallet.createAction({
        description: button,
        outputs: invoice.outputs
      })
      if (!tx.tx || !Array.isArray(tx.tx)) {
        throw new Error('Invalid transaction: tx.tx is undefined or not an array')
      }
      let transaction, atomicBeefTx, txid
      try {
        transaction = Transaction.fromAtomicBEEF(tx.tx)
        txid = transaction.id('hex')
        atomicBeefTx = Utils.toHex(tx.tx!)
      } catch (e) {
        console.error('❌ Transaction serialization failed:', e)
        throw new Error('Failed to serialize transaction')
      }
      const payPayload = { paymentId: invoice.paymentId, transaction: { txid, atomicBeefTx } }
      const resPay = await authFetch.fetch(`${server}/api/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: payPayload.paymentId,
          transaction: payPayload.transaction
        })
      })
      const pay = await resPay.json()
      if (pay.status !== 'success') throw new Error(pay.message)
      setPaid(true)
      setTxid(pay.txid)
      console.log('✅ Payment successful:', pay)
    } catch (err: any) {
      console.error('❌ Payment flow error:', err)
      alert(err.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  Render                                                               */
  /* ---------------------------------------------------------------------- */
  if (!paid) {
    return (
      <button className="gateway-button-styles" onClick={handleClick} disabled={loading}>
        {loading ? loadingtext : text}
      </button>
    )
  }

  return (
    <div>
      Payment Submitted
      <br />
      TXID:{' '}
      <code>
        <a href={`https://whatsonchain.com/tx/${txid}`} target="_blank" rel="noopener noreferrer">
          {txid}
        </a>
      </code>
    </div>
  )
}

export default PayButton
