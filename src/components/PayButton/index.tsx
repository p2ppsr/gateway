import React, { useState } from 'react'
import { WalletClient, AuthFetch } from '@bsv/sdk'
import constants from '../../utils/constants' // optional, or just inline the URL

const PayButton = ({
  text = 'Pay Now',
  amount,
  merchant,
  button,
  currency = 'BSV',
  server,
  loadingtext = 'Loading, please wait...'
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

  const handleClick = async () => {
    try {
      setLoading(true)

      // const metaNetClient = await checkForMetaNetClient()
      // if (!metaNetClient) {
      //   setLoading(false)
      //   return alert(
      //     'Please download MetaNet Client\n\nhttps://projectbabbage.com/metanet-client'
      //   )
      // }

      const walletClient = new WalletClient('auto', 'localhost')
      const authFetch = new AuthFetch(walletClient)

      const statusResponse = await authFetch.fetch(`${server}/api/getStatus`)
      const status = await statusResponse.json()

      // const metanetNetwork = await getNetwork()
      // if (status.network !== metanetNetwork) {
      //   return alert(
      //     `WARNING! This payment server uses ${status.network} but your MetaNet Client is on ${metanetNetwork}!\n\nPlease make sure you are using the correct network.`
      //   )
      // }

      const invoiceResponse = await authFetch.fetch(`${server}/api/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: merchant,
          paymentButtonId: button,
          currency,
          amount
        })
      })

      const invoice = await invoiceResponse.json()
      if (invoice.status !== 'success') {
        throw new Error(invoice.message || 'Error requesting invoice')
      }

      const tx = await walletClient.createAction({
        description: button,
        outputs: invoice.outputs
      })

      const payResponse = await authFetch.fetch(`${server}/api/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: invoice.paymentId,
          transaction: JSON.stringify(tx)
        })
      })

      const pay = await payResponse.json()
      if (pay.status === 'success') {
        setPaid(true)
        console.log('✅ Payment successful:', pay)
      } else {
        throw new Error(pay.message || 'Error submitting payment')
      }
    } catch (e: any) {
      console.error(e)
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!paid) {
    return (
      <button className="gateway-button-styles" onClick={handleClick} disabled={loading}>
        {loading ? loadingtext : text}
      </button>
    )
  } else {
    return <div>Payment Submitted</div>
  }
}

export default PayButton
