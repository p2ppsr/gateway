// src/components/PayButton/index.tsx
import React, { useState } from 'react'
import { WalletClient, AuthFetch } from '@bsv/sdk'

/**
 * Reusable payment component.
 *
 * @param text         Button label (default "Pay Now")
 * @param amount       Amount in chosen currency (number)
 * @param merchant     Merchant identity key (string)
 * @param button       Payment‑button ID (string)
 * @param currency     "BSV" | "USD" | …
 * @param server       Gateway back‑end URL (e.g. "http://localhost:3001")
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

  /* ---------------------------------------------------------------------- */
  /*  One AuthFetch + one WalletClient per click keeps scope tidy           */
  /* ---------------------------------------------------------------------- */
  const handleClick = async () => {
    setLoading(true)
    try {
      const WALLET_ORIGIN = process.env.WALLET_ORIGIN ?? 'localhost:3321'
      const wallet = new WalletClient('auto', WALLET_ORIGIN)
      //const wallet = new WalletClient('auto', 'localhost')
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
          amount
        })
      })
      const invoice = await resInv.json()
      if (invoice.status !== 'success') throw new Error(invoice.message)

      /* --------------------------- sign & pay ---------------------------- */
      const tx = await wallet.createAction({
        description: button,
        outputs: invoice.outputs
      })

      const resPay = await authFetch.fetch(`${server}/api/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: invoice.paymentId,
          transaction: JSON.stringify(tx)
        })
      })
      const pay = await resPay.json()
      if (pay.status !== 'success') throw new Error(pay.message)

      setPaid(true)
      console.log('✅ Payment successful:', pay)
    } catch (err: any) {
      console.error('Payment flow error:', err)
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

  return <div>Payment Submitted</div>
}

export default PayButton
