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
 * - Supports variable amount buttons with user input (data-variable="true").
 * - Prevents payment flow triggering on variable input field clicks with stopPropagation on multiple events.
 *
 * Version: v2.5 (Updated 13Aug2025_0240 BST to include buttonId in pay request)
 * Change Log:
 * - 04Aug2025_2345 BST (v2.0): Initial version, using paymentId exclusively instead of buttonId, reflecting database schema change.
 * - 05Aug2025_0610 BST (v2.1): Fixed paymentId propagation in payPayload to ensure invoice.transaction_id is used correctly, resolving undefined paymentId issue in /api/pay requests.
 * - 05Aug2025_0645 BST (v2.2): Added lockingScript to payPayload to allow server validation without re-derivation, restoring pre-transaction_id change behavior.
 * - 10Aug2025_0130 BST (v2.3): Added comprehensive logging to diagnose payment failures.
 * - 13Aug2025_0240 BST (v2.5): Added buttonId to pay request to align with server validation of pre-created IDs.
 */
import React, { useState, useRef, useEffect, ReactElement } from 'react';
import { WalletClient, AuthFetch, Transaction, Utils, CreateActionOutput } from '@bsv/sdk';
import { CONFIG, MAX_PAYMENT_SATS } from '../../utils/constants';
const F = 'components/PayButton';

export interface ListOutputsResult {
  totalOutputs: number;
  BEEF?: any;
  outputs: WalletOutput[];
}

interface WalletOutput {
  satoshis: number;
  // Add other WalletOutput properties as needed (e.g., script, txid) based on @bsv/sdk docs
}

interface ListOutputsArgs {
  basket?: string;
  limit?: number;
  // Add other ListOutputsArgs properties as needed based on @bsv/sdk docs
}

export interface PayButtonProps {
  text?: string; // Templated text with {amount} placeholder (default "Pay Now {amount} Sats")
  amount: number; // Amount in sats (integer, 0 for variable)
  merchant: string;
  paymentId: string; // Pre-created ID referencing ids.id with type='payment'
  buttonId: string;  // Pre-created ID referencing ids.id with type='button'
  currency?: string;
  server: string;
  loadingtext?: string;
  variable?: boolean; // Optional flag for variable-amount buttons
  [key: string]: string | number | boolean | undefined;
}

interface InvoiceResponse {
  status: string;
  message?: string;
  transaction_id: string; // Updated to match invoice.ts v2.3 response
  outputs: CreateActionOutput[] | undefined;
}

interface PayResponse {
  status: string;
  message?: string;
  txid: string;
}

/**
 * Reusable payment component.
 *
 * @param text Button label template (default "Pay Now {amount} Sats")
 * @param amount Amount in sats (integer, 0 for variable)
 * @param merchant Merchant identity key (string)
 * @param paymentId Pre-created payment ID (string, referencing ids.id with type='payment')
 * @param buttonId Pre-created button ID (string, referencing ids.id with type='button')
 * @param currency "BSV" | "USD" | … (used for display or server compatibility)
 * @param server Gateway back-end URL (e.g. "http://localhost:3000")
 * @param loadingtext Text while awaiting invoice / payment
 */
const PayButton = ({
  text = 'Pay Now {amount} Sats',
  amount,
  merchant,
  paymentId,
  buttonId,
  currency = 'BSV',
  server,
  loadingtext = 'Loading, please wait…',
  variable = false
}: PayButtonProps): ReactElement => {
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);
  const [txid, setTxid] = useState<string | null>(null);
  const [variableAmount, setVariableAmount] = useState<string>('1'); // Default to 1 for variable buttons
  const nodeTextRef = useRef<HTMLDivElement>(null);

  // Construct dynamic button label for variable buttons
  const buttonLabel = variable
    ? `${text.split('{amount}')[0]}${variableAmount} ${text.split('{amount}')[1] || 'Sats'}`
    : text.replace('{amount}', amount.toString());
  console.log(`[${new Date().toISOString()}] [${F}] 🔍 Button label:`, buttonLabel);

  const handleVariableAmountChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const input = event.target.value.replace(/[^0-9]/g, ''); // Strip non-digits
    const satValue = Math.max(1, Math.min(MAX_PAYMENT_SATS, Number(input) || 1));
    setVariableAmount(satValue.toString());
    console.log(`[${new Date().toISOString()}] [${F}] 🔍 Variable amount updated:`, satValue.toString());
  };

  const handleClick = async (e: React.MouseEvent<HTMLDivElement>): Promise<void> => {
    if (loading) return;
    // Safely check if click originated from input field using nativeEvent
    const target = e.nativeEvent.target as HTMLElement | null;
    if (target && target.tagName === 'INPUT') {
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Click on input field ignored`);
      return;
    }
    console.log(`[${new Date().toISOString()}] [${F}] 🔍 Button click received, target:`, target?.tagName || 'unknown');
    setLoading(true);
    try {
      // Use variableAmount if variable, else props.amount
      const effectiveAmount = variable ? Number(variableAmount) : amount;
      // Validate effectiveAmount
      if (!Number.isInteger(effectiveAmount) || effectiveAmount <= 0 || effectiveAmount > MAX_PAYMENT_SATS) {
        throw new Error(`❌ Invalid amount: must be a positive integer between 1 and ${MAX_PAYMENT_SATS}`);
      }
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 [Step 1] Client requested amount (sats):`, effectiveAmount);
      const WALLET_ORIGIN = CONFIG.WALLET_ORIGIN;
      const wallet = new WalletClient('auto', WALLET_ORIGIN);
      const authFetch = new AuthFetch(wallet);
      // Debug wallet connection and funds with retry
      let walletOutputs: ListOutputsResult | null = null;
      const substrates = [
        { type: 'HTTPWalletJSON', substrate: 'json-api', skip: false },
        { type: 'HTTPWalletWire', substrate: 'Cicada', skip: false },
        {
          type: 'WindowCWISubstrate',
          substrate: 'window.CWI',
          skip: typeof window === 'undefined' || !(window as any).CWI
        },
        { type: 'XDMSubstrate', substrate: 'XDM', skip: false },
        { type: 'ReactNativeWebView', substrate: 'react-native', skip: false }
      ];
      for (const { type, substrate, skip } of substrates) {
        if (skip) {
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 Skipping ${type} substrate (not available)`);
          continue;
        }
        try {
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 Attempting wallet connection with ${type} on ${WALLET_ORIGIN}`);
          const instance = new WalletClient(
            substrate as 'auto' | 'Cicada' | 'XDM' | 'window.CWI' | 'json-api' | 'react-native',
            WALLET_ORIGIN
          );
          const versionPromise = instance.getVersion({});
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`❌ Timeout on ${type}`)), 2000)
          );
          await Promise.race([versionPromise, timeoutPromise]);
          console.log(`[${new Date().toISOString()}] [${F}] ✅ Wallet version retrieved with ${type}`);
          walletOutputs = await instance.listOutputs({ basket: paymentId }); // Use paymentId as basket
          console.log(`[${new Date().toISOString()}] [${F}] ✅ Wallet connected with ${type} on ${WALLET_ORIGIN}`, walletOutputs);
          wallet.substrate = instance.substrate; // Set successful substrate
          break;
        } catch (walletErr) {
          console.error(`[${new Date().toISOString()}] [${F}] ❌ Wallet connection failed with ${type} on ${WALLET_ORIGIN}:`, walletErr);
        }
      }
      if (!walletOutputs) throw new Error('❌ All wallet connection attempts failed');
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Wallet outputs for basket:`, paymentId, walletOutputs);
      // Skip basket-specific check if empty, rely on createAction
      if (walletOutputs.outputs.length > 0 && walletOutputs.outputs[0].satoshis < effectiveAmount + 1) {
        console.log(`[${new Date().toISOString()}] [${F}] ⚠️ Warning: Insufficient funds in basket:`, paymentId, 'Need:', effectiveAmount + 1, 'sats, Got:', walletOutputs.outputs[0].satoshis);
        throw new Error(`❌ Insufficient funds in basket: need at least ${effectiveAmount + 1} sats`);
      }
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Wallet selected inputs:`, walletOutputs);
      const resStatus = await authFetch.fetch(`${server}/api/getStatus`, { method: 'GET' });
      const status = await resStatus.json();
      if (status.status !== 'success') throw new Error('❌ Cannot reach server');
      console.log(`[${new Date().toISOString()}] [${F}] ✅ Server status checked:`, status);
      // Fetch additional data (optional, adjust if needed)
      let fetchedPaymentId = paymentId; // Default to paymentId
      try {
        const buttonCodeResponse = await fetch(`${server}/api/buttonCode/${paymentId}`, {
          headers: { Accept: 'application/json' }
        });
        if (!buttonCodeResponse.ok) throw new Error(`❌ HTTP error! status: ${buttonCodeResponse.status}`);
        const buttonCodeData = await buttonCodeResponse.json();
        if (buttonCodeData.status === 'success' && buttonCodeData.payment_id) {
          fetchedPaymentId = buttonCodeData.payment_id;
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 [client] Fetched paymentId:`, fetchedPaymentId);
        } else {
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 [client] Failed to fetch paymentId, using provided paymentId:`, paymentId, 'Response:', buttonCodeData);
        }
      } catch (fetchError) {
        console.error(`[${new Date().toISOString()}] [${F}] ❌ [client] Button code fetch error:`, fetchError, 'Status:', fetchError instanceof Error && (fetchError as any).status);
      }
      // Send amount in BSV to server
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 [Step 2] Requesting invoice from server:`, server);
      const invoiceUrl = `${server}/api/invoice`;
      console.log('components/PayButton', '🔍 [Step 2] Sending invoice request to:', invoiceUrl, { paymentId: fetchedPaymentId, amount: effectiveAmount });
      const resInv = await authFetch.fetch(`${server}/api/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: merchant,
          buttonId, // Ensure this matches the payment_buttons table
          paymentId: fetchedPaymentId,
          currency,
          amount: effectiveAmount
        })
      });
      console.log('components/PayButton', '🔍 [Step 2] Received invoice response:', { status: resInv.status, url: invoiceUrl });
      const invoice: InvoiceResponse = await resInv.json();
      if (invoice.status !== 'success') throw new Error(`❌ ${invoice.message ?? 'Invoice creation failed'}`);
      console.log(`[${new Date().toISOString()}] [${F}] ✅ [Step 3] Invoice received:`, invoice);
      // Verify outputs match requested amount, with fallback for variable buttons
      let outputsWithSats = invoice.outputs?.map(output => ({
        ...output,
        satoshis: Math.round(output.satoshis)
      })) || [];
      if (variable && outputsWithSats.length && outputsWithSats[0].satoshis === 0) {
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Server returned zero satoshis for variable button, using effectiveAmount:`, effectiveAmount);
        outputsWithSats[0].satoshis = effectiveAmount;
      }
      if (outputsWithSats.length && outputsWithSats[0].satoshis !== effectiveAmount) {
        console.log(`[${new Date().toISOString()}] [${F}] ⚠️ Warning: Output satoshis mismatch:`, outputsWithSats[0].satoshis, 'vs expected:', effectiveAmount);
      }
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 [Step 4] Client received outputs (sats):`, outputsWithSats);
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 [Step 5] Creating action with wallet`);
      const tx = await wallet.createAction({
        description: paymentId,
        outputs: outputsWithSats
      });
      if (tx.tx == null || !Array.isArray(tx.tx)) {
        console.log(`[${new Date().toISOString()}] [${F}] ❌ Invalid transaction: tx.tx is undefined or not an array`);
        throw new Error('❌ Invalid transaction: tx.tx is undefined or not an array');
      }
      console.log(`[${new Date().toISOString()}] [${F}] ✅ [Step 6] Action created:`, tx);
      // Log detailed transaction details before sending
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Transaction details before pay:`, {
        paymentId,
        buttonId,
        tx: tx.tx,
        outputs: outputsWithSats,
        totalSatoshis: outputsWithSats.reduce((sum, output) => sum + (output.satoshis || 0), 0),
        lockingScript: outputsWithSats[0]?.lockingScript // Include lockingScript for validation
      });
      let transaction, atomicBeefTx, txid;
      try {
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 [Step 7] Serializing transaction`);
        transaction = Transaction.fromAtomicBEEF(tx.tx);
        txid = transaction.id('hex');
        atomicBeefTx = Utils.toHex(tx.tx);
        console.log(`[${new Date().toISOString()}] [${F}] ✅ [Step 8] Transaction serialized:`, { txid, atomicBeefTx });
      } catch (e) {
        console.error(`[${new Date().toISOString()}] [${F}] ❌ Transaction serialization failed:`, e);
        throw new Error('❌ Failed to serialize transaction');
      }
      const payPayload = {
        paymentId,
        buttonId,
        transaction: { txid, atomicBeefTx },
        lockingScript: outputsWithSats[0]?.lockingScript // Add lockingScript to payload
      };
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 [Step 9] Sending pay request to server:`, server, payPayload);
      const resPay = await authFetch.fetch(`${server}/api/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payPayload)
      });
      const pay: PayResponse = await resPay.json();
      if (pay.status !== 'success') throw new Error(`❌ ${pay.message ?? 'Payment processing failed'}`);
      console.log(`[${new Date().toISOString()}] [${F}] ✅ [Step 10] Payment processed by server:`, pay);
      setPaid(true);
      setTxid(pay.txid);
      console.log(`[${new Date().toISOString()}] [${F}] ✅ Payment successful:`, pay);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '❌ Unexpected error';
      console.error(`[${new Date().toISOString()}] [${F}] ❌ Payment flow error:`, {
        message: errorMessage,
        stack: err instanceof Error ? err.stack : '❌ No stack trace',
        details: err
      });
      alert(`❌ ${errorMessage}`);
    } finally {
      setLoading(false);
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Payment flow completed, loading set to false`);
    }
  };

  useEffect(() => {
    const container = nodeTextRef.current?.parentElement;
    if (container) {
      container.style.display = 'flex';
      container.style.justifyContent = 'center';
      container.style.alignItems = 'center';
      container.style.width = 'fit-content';
      container.setAttribute('data-disabled', loading.toString());
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Applied container styles and events`);
    }
  }, [loading, paid]); // Re-apply on state changes

  if (!paid) {
    if (variable) {
      return (
        <div ref={nodeTextRef} className="nodeText" onClick={handleClick}>
          {text.split('{amount}')[0]}
          <input
            type="number"
            value={variableAmount}
            onChange={handleVariableAmountChange}
            onClick={e => e.stopPropagation()} // Stop click bubbling
            onMouseDown={e => e.stopPropagation()} // Stop mouse down bubbling
            onKeyDown={e => e.stopPropagation()} // Stop key down bubbling
            min="1"
            max={`${MAX_PAYMENT_SATS}`}
            style={{
              width: '60px',
              textAlign: 'center',
              margin: '0 6px',
              padding: '3px',
              border: '2px solid #4a90e2',
              borderRadius: '0.5em',
              background: '#f9f9f9',
              color: '#333',
              fontWeight: '500',
              verticalAlign: 'middle'
            }}
            disabled={loading}
          />
          {text.split('{amount}')[1] || 'Sats'}
        </div>
      );
    }
    return (
      <div ref={nodeTextRef} className="nodeText" onClick={handleClick}>
        {loading ? loadingtext : buttonLabel}
      </div>
    );
  }
  return (
    <div>
      Payment Submitted
      <br />
      TXID:{' '}
      <code>
        <a href={`https://whatsonchain.com/tx/${txid ?? ''}`} target="_blank" rel="noopener noreferrer">
          {txid}
        </a>
      </code>
    </div>
  );
};

export default PayButton;