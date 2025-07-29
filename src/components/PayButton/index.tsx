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
 * - All amounts are handled as BSV decimals internally (to match current DB schema), converted from sats input.
 *
 * Version: v1.3 (Updated 29Jul2025_0240 BST with Corrected Sibling Layout)
 */

import React, { useState, useRef, ReactElement } from 'react'
import { WalletClient, AuthFetch, Transaction, Utils, CreateActionOutput } from '@bsv/sdk'

// Define interfaces based on @bsv/sdk
export interface ListOutputsResult {
  totalOutputs: number
  BEEF?: any
  outputs: WalletOutput[]
}

interface WalletOutput {
  satoshis: number
  // Add other WalletOutput properties as needed (e.g., script, txid) based on @bsv/sdk docs
}

interface ListOutputsArgs {
  basket?: string
  limit?: number
  // Add other ListOutputsArgs properties as needed based on @bsv/sdk docs
}

// Define props interface with sats as integer
export interface PayButtonProps {
  text?: string // Templated text with {amount} placeholder (default "Pay Now {amount} Sats")
  amount: number // Amount in sats (integer, required)
  merchant: string
  button: string
  currency?: string
  server: string
  loadingtext?: string
  variable?: boolean // Optional flag for variable-amount buttons
  [key: string]: string | number | boolean | undefined
}

interface InvoiceResponse {
  status: string
  message?: string
  paymentId: string
  outputs: CreateActionOutput[] | undefined
}

interface PayResponse {
  status: string
  message?: string
  txid: string
}

/**
 * Reusable payment component.
 *
 * @param text         Button label template (default "Pay Now {amount} Sats")
 * @param amount       Amount in sats (integer)
 * @param merchant     Merchant identity key (string)
 * @param button       Payment-button ID (string)
 * @param currency     "BSV" | "USD" | … (used for display or server compatibility)
 * @param server       Gateway back-end URL (e.g. "http://localhost:3001")
 * @param loadingtext  Text while awaiting invoice / payment
 */
const PayButton = ({
  text = 'Pay Now {amount} Sats',
  amount,
  merchant,
  button,
  currency = 'BSV',
  server,
  loadingtext = 'Loading, please wait…'
}: PayButtonProps): ReactElement => {
  const [loading, setLoading] = useState(false)
  const [paid, setPaid] = useState(false)
  const [txid, setTxid] = useState<string | null>(null)
  const buttonRef = useRef<HTMLDivElement>(null)

  // Construct dynamic button label by replacing {amount} placeholder
  const buttonLabel = text.replace('{amount}', amount.toString());

  const handleClick = async (event: React.MouseEvent<HTMLDivElement>): Promise<void> => {
    // Prevent event from bubbling up if clicking outside text
    event.stopPropagation();
    setLoading(true)
    try {
      const WALLET_ORIGIN = 'localhost:3301' // Matches Metanet client port
      const wallet = new WalletClient('auto', WALLET_ORIGIN)
      const authFetch = new AuthFetch(wallet)

      // Validate sats as integer and within safe range
      if (!Number.isInteger(amount) || amount <= 0 || amount > 1000000) {
        throw new Error('❌ Invalid amount: must be a positive integer up to 1,000,000 sats')
      }
      console.log('🔍 [Step 1] Client requested amount (sats):', amount) // Log client amount

      // Debug wallet connection and funds
      try {
        const walletOutputs = await wallet.listOutputs({ basket: '' }) // Use empty basket as confirmed
        console.log('🔍 Wallet outputs:', walletOutputs)
        if (walletOutputs.outputs.length && walletOutputs.outputs[0].satoshis < amount + 1) {
          throw new Error('❌ Insufficient funds: need at least ' + (amount + 1) + ' sats')
        }
        console.log('🔍 Wallet selected inputs:', await wallet.listOutputs({ basket: '' })) // Updated with empty basket
      } catch (walletErr) {
        console.error('❌ Wallet connection or funds failed:', walletErr)
      }

      const resStatus = await authFetch.fetch(`${server}/api/getStatus`, {
        method: 'GET'
      })
      const status = await resStatus.json()
      if (status.status !== 'success') throw new Error('❌ Cannot reach server')

      // Convert sats to BSV for server request (reason: server expects BSV)
      const amountInBSV = amount / 100000000
      console.log('🔍 [Step 2] Converted amount to BSV:', amountInBSV)

      // Send amount in BSV to server
      const resInv = await authFetch.fetch(`${server}/api/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: merchant,
          paymentButtonId: button,
          currency,
          amount: amountInBSV // Amount in BSV
        })
      })
      const invoice: InvoiceResponse = await resInv.json()
      if (invoice.status !== 'success') throw new Error(`❌ ${invoice.message ?? 'Invoice creation failed'}`)

      // Verify outputs match requested amount
      const outputsWithSats = invoice.outputs?.map(output => ({
        ...output,
        satoshis: Math.round(output.satoshis) // Ensure integer sats
      })) || []
      if (outputsWithSats.length && outputsWithSats[0].satoshis !== amount) {
        console.warn('❌ Output satoshis mismatch:', outputsWithSats[0].satoshis, 'vs expected', amount)
      }
      console.log('🔍 [Step 3] Client received outputs (sats):', outputsWithSats) // Log received outputs

      const tx = await wallet.createAction({
        description: button,
        outputs: outputsWithSats
      })
      if ((tx.tx == null) || !Array.isArray(tx.tx)) {
        throw new Error('❌ Invalid transaction: tx.tx is undefined or not an array')
      }

      // Log detailed transaction details before sending
      console.log('🔍 Transaction details before pay:', {
        paymentId: invoice.paymentId,
        tx: tx.tx,
        outputs: outputsWithSats,
        totalSatoshis: outputsWithSats.reduce((sum, output) => sum + (output.satoshis || 0), 0)
      })

      let transaction, atomicBeefTx, txid
      try {
        transaction = Transaction.fromAtomicBEEF(tx.tx)
        txid = transaction.id('hex')
        atomicBeefTx = Utils.toHex(tx.tx)
      } catch (e) {
        console.error('❌ Transaction serialization failed:', e)
        throw new Error('❌ Failed to serialize transaction')
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
      const pay: PayResponse = await resPay.json()
      if (pay.status !== 'success') throw new Error(`❌ ${pay.message ?? 'Payment processing failed'}`)
      setPaid(true)
      setTxid(pay.txid)
      console.log('✅ Payment successful:', pay)
    } catch (err: unknown) {
      console.error('❌ Payment flow error:', {
        message: err instanceof Error ? err.message : 'Unexpected error',
        stack: err instanceof Error ? err.stack : 'No stack trace'
      })
      const message = err instanceof Error ? err.message : 'Unexpected error'
      alert(message)
    } finally {
      setLoading(false)
      if (buttonRef.current) {
        buttonRef.current.setAttribute('data-disabled', loading.toString())
      }
    }
  }

  const buttonDataStyle: React.CSSProperties = {
    display: 'none', // Hide data div from view
  };

  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center', // Center the text
    alignItems: 'center',
    width: 'fit-content',
  };

  if (!paid) {
    return (
      <>
        <div
          ref={buttonRef}
          className="gateway-paybutton-fixed"
          style={buttonDataStyle} // Data div hidden
          data-merchant={merchant}
          data-button={button}
          data-amount={amount}
          data-currency={currency}
          data-server={server}
          id={`pay-${Math.random().toString(36).substr(2, 5)}`} // Generate unique ID
        />
        <div
          className="gateway-paybutton"
          style={buttonStyle} // Apply centered styling
          onClick={handleClick} // Ensure entire div is clickable
          data-disabled={loading.toString()}
        >
          <div className="nodeText">{loading ? loadingtext : buttonLabel}</div>
        </div>
      </>
    )
  }

  return (
    <div>
      Payment Submitted
      <br />
      TXID:{' '}
      <code>
        <a
          href={`https://whatsonchain.com/tx/${txid ?? ''}`}
          target='_blank'
          rel='noopener noreferrer'
        >
          {txid}
        </a>
      </code>
    </div>
  )
}

export default PayButton