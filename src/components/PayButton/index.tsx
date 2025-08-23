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
 * - All amounts are handled as BSV satoshis internally (to match current DB schema).
 * - Supports variable amount buttons with user input (data-variable="true").
 * - Prevents payment flow triggering on variable input field clicks with stopPropagation on multiple events.
 *
 * Version: v2.57 (Updated 22Aug2025_2315 BST to combine v2.46 single-use with v2.56 fit-content)
 * Change Log:
 * - 04Aug2025_2345 BST (v2.0): Initial version, using paymentId exclusively instead of buttonId.
 * - 05Aug2025_0610 BST (v2.1): Fixed paymentId propagation in payPayload.
 * - 05Aug2025_0645 BST (v2.2): Added lockingScript to payPayload.
 * - 10Aug2025_0130 BST (v2.3): Added comprehensive logging.
 * - 13Aug2025_0240 BST (v2.5): Added buttonId to pay request.
 * - 14Aug2025_0015 BST (v2.6): Removed currency from props.
 * - 17Aug2025_1545 BST (v2.27): Fixed TS errors and supported dynamic ID generation.
 * - 20Aug2025_1903 BST (v2.28): Updated handleClick to use invoice.paymentId.
 * - 22Aug2025_0203 BST (v2.29): Fixed TS null and read-only errors.
 * - 22Aug2025_0210 BST (v2.30): Enforced immediate DOM class control.
 * - 22Aug2025_0217 BST (v2.31): Used useLayoutEffect for DOM control.
 * - 22Aug2025_0935 BST (v2.32): Fixed syntax errors from corrupted update.
 * - 22Aug2025_0954 BST (v2.33): Enhanced MutationObserver.
 * - 22Aug2025_1042 BST (v2.34): Added pre-render class check.
 * - 22Aug2025_1055 BST (v2.35): Added post-render correction.
 * - 22Aug2025_1120 BST (v2.36): Expanded MutationObserver scope.
 * - 22Aug2025_1140 BST (v2.37): Adjusted delayed check to 300ms.
 * - 22Aug2025_1200 BST (v2.38): Added click test.
 * - 22Aug2025_1230 BST (v2.39): Enhanced interaction test.
 * - 22Aug2025_1300 BST (v2.40): Enforced persistent DOM correction.
 * - 22Aug2025_1300 BST (v2.41): Improved script detection.
 * - 22Aug2025_1300 BST (v2.42): Used correct pay.js URL.
 * - 22Aug2025_1321 BST (v2.43): Restored nested div structure.
 * - 22Aug2025_1410 BST (v2.44): Fixed TypeScript errors and restored syntax.
 * - 22Aug2025_1447 BST (v2.46): Ensured hook compliance and stability.
 * - 22Aug2025_2040 BST (v2.52): Restored v2.28 fit-content behavior.
 * - 22Aug2025_2130 BST (v2.54): Fixed single-use button initialization.
 * - 22Aug2025_2145 BST (v2.55): Fixed TypeScript errors for buttonLabel state.
 * - 22Aug2025_2200 BST (v2.56): Fixed single-use button state update.
 * - 22Aug2025_2315 BST (v2.57): Combined v2.46 single-use with v2.56 fit-content.
 */
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, ReactElement } from 'react';
import { toast } from 'react-toastify';
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
}
interface ListOutputsArgs {
  basket?: string;
  limit?: number;
}
export interface PayButtonProps {
  text?: string;
  amount: number;
  merchant: string;
  paymentId: string;
  buttonId: string;
  server: string;
  loadingtext?: string;
  variable?: boolean;
  width?: string; // Added to support fit-content
  [key: string]: string | number | boolean | undefined;
}
interface InvoiceResponse {
  status: string;
  message?: string;
  transaction_id: string;
  paymentId: string;
  outputs: CreateActionOutput[] | undefined;
}
interface PayResponse {
  status: string;
  message?: string;
  txid: string;
}
interface ButtonCodeResponse {
  status: string;
  button_id: string;
  payment_id: string;
  multi_use?: boolean;
  used?: boolean;
}

const PayButton = ({
  text,
  amount,
  merchant,
  paymentId,
  buttonId,
  server,
  loadingtext = 'Loading, please wait…',
  variable = false,
  width = 'fit-content', // Default to fit-content
}: PayButtonProps): ReactElement => {
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);
  const [txid, setTxid] = useState<string | null>(null);
  const [variableAmount, setVariableAmount] = useState<string>('1');
  const [disabled, setDisabled] = useState(false);
  const [parentDataText, setParentDataText] = useState<string | undefined>(undefined);
  const [parentOriginalText, setParentOriginalText] = useState<string | undefined>(undefined);
  const [buttonLabel, setButtonLabel] = useState<string>(text || 'Pay Now 0 Sats');
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeTextRef = useRef<HTMLDivElement>(null);

  // Define checkAndCorrectClass at the top level with useCallback
  const checkAndCorrectClass = useCallback((textNode: HTMLDivElement, container: HTMLDivElement, parentContainer: HTMLElement | null) => {
    if (textNode.className.includes('disabled') && !disabled) {
      textNode.className = `nodeText ${disabled ? 'disabled' : ''}`;
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Corrected text class due to disabled override`);
    }
    if (container.className.includes('disabled') && !disabled) {
      container.className = `gateway-paybutton gateway-paybutton-fixed ${disabled ? 'disabled' : ''}`;
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Corrected container class due to disabled override`);
    }
    if (parentContainer && parentContainer.className.includes('disabled') && !disabled) {
      parentContainer.className = parentContainer.className.replace('disabled', '').trim();
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Corrected parent class due to disabled override`);
    }
  }, [disabled]);

  // Validate required props and log for debugging
  useEffect(() => {
    console.log(`[${new Date().toISOString()}] [${F}] 🔍 Received props at component mount:`, {
      text,
      textDefined: text !== undefined,
      amount,
      merchant,
      paymentId,
      buttonId,
      server,
      variable,
      width,
    });
    if (!paymentId || !buttonId || !merchant || !server || (!variable && amount <= 0)) {
      const errors = [];
      if (!paymentId) errors.push('Missing data-paymentId attribute.');
      if (!buttonId) errors.push('Missing data-buttonId attribute.');
      if (!merchant) errors.push('Missing data-merchant attribute.');
      if (!server) errors.push('Missing data-server attribute.');
      if (!variable && amount <= 0) errors.push('Missing valid data-amount attribute.');
      errors.forEach(error => toast.error(error));
      setDisabled(true);
    }
  }, [paymentId, buttonId, merchant, server, amount, variable, width]);

  // Fetch button status to check if single-use and used
  useEffect(() => {
    if (!paymentId || disabled) return;
    const fetchButtonStatus = async (): Promise<void> => {
      try {
        const response = await fetch(`${server}/api/buttonCode/${paymentId}`, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data: ButtonCodeResponse = await response.json();
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Fetched button status:`, data);
        if (data.status === 'success') {
          const isMultiUse = data.multi_use ?? false;
          const isUsed = data.used ?? false;
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 Button status resolved:`, { isMultiUse, isUsed, disabled: !isMultiUse && isUsed });
          if (!isMultiUse && isUsed) {
            setDisabled(true);
            console.log(`[${new Date().toISOString()}] [${F}] ✅ Button disabled: single-use and already used`);
            toast.error('This button is single-use and has been used.');
          }
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] [${F}] ❌ Error fetching button status:`, error);
        if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
          console.log(`[${new Date().toISOString()}] [${F}] ⚠️ Proxy server at ${server} unavailable`);
          setDisabled(true);
          toast.error('Button disabled due to server unavailability.');
        }
      }
    };
    fetchButtonStatus();
  }, [server, paymentId, disabled]);

  // Cache parent dataset
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      const parent = el.parentElement;
      const ds = parent?.dataset;
      if (ds) {
        setParentDataText(ds.text);
        setParentOriginalText(ds.originalText);
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Cached parent dataset:`, { text: ds.text, originalText: ds.originalText });
      }
    }
  }, []);

  // Compute dynamic button label
  useEffect(() => {
    const label = text || parentDataText || parentOriginalText || `Pay Now ${amount || variableAmount} Sats`;
    setButtonLabel(label);
    console.log(`[${new Date().toISOString()}] [${F}] 🔍 Button label computed:`, {
      buttonLabel: label,
      dataText: parentDataText,
      propsText: text,
      datasetText: parentOriginalText,
      fallback: `Pay Now ${amount || variableAmount} Sats`
    });
  }, [text, amount, variableAmount, parentDataText, parentOriginalText]);

  // Apply styles with fit-content
  useEffect(() => {
    const container = containerRef.current?.parentElement; // Apply to parent of containerRef
    if (container) {
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Initial parent div state at mount:`, {
        datasetText: container.dataset.text,
        textContent: container.textContent?.trim(),
        datasetOriginalText: container.dataset.originalText,
        propsText: text,
        phase: 'mount',
        initialDisabled: container.className.includes('disabled')
      });
      const originalText = text || containerRef.current?.parentElement?.dataset.text || container.dataset.originalText || container.textContent?.trim() || `Pay Now ${amount || variableAmount} Sats`;
      container.dataset.originalText = originalText;
      container.style.display = 'flex';
      container.style.justifyContent = 'center';
      container.style.alignItems = 'center';
      container.style.width = width || 'fit-content'; // Use width prop or default to fit-content
      container.setAttribute('data-disabled', (loading || disabled).toString());
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Applied container styles and events:`, {
        originalText: container.dataset.originalText,
        finalTextContent: container.textContent?.trim(),
        phase: 'after',
        width: container.style.width
      });
    }
  }, [loading, paid, disabled, text, amount, variableAmount, width]);

  // Initial DOM class control
  useLayoutEffect(() => {
    if (!containerRef.current || !nodeTextRef.current) return;
    const container = containerRef.current;
    const parentContainer = container.parentElement;
    const textNode = nodeTextRef.current;
    console.log(`[${new Date().toISOString()}] [${F}] 🔍 Received props at component mount (useLayoutEffect):`, {
      text,
      textDefined: text !== undefined,
      amount,
      merchant,
      paymentId,
      buttonId,
      server,
      variable,
    });
    if (!paymentId || !buttonId || !merchant || !server || (!variable && amount <= 0)) {
      const errors = [];
      if (!paymentId) errors.push('Missing data-paymentId attribute.');
      if (!buttonId) errors.push('Missing data-buttonId attribute.');
      if (!merchant) errors.push('Missing data-merchant attribute.');
      if (!server) errors.push('Missing data-server attribute.');
      if (!variable && amount <= 0) errors.push('Missing valid data-amount attribute.');
      errors.forEach(error => toast.error(error));
      setDisabled(true);
    }
    container.className = `gateway-paybutton gateway-paybutton-fixed ${disabled ? 'disabled' : ''}`;
    textNode.className = `nodeText ${disabled ? 'disabled' : ''}`;
    if (parentContainer && parentContainer.className.includes('disabled') && !disabled) {
      parentContainer.className = parentContainer.className.replace('disabled', '').trim();
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Corrected parent class:`, { newClass: parentContainer.className, disabled });
    }
    const forceUpdate = () => {
      if (textNode.className.includes('disabled') && !disabled) {
        textNode.className = `nodeText ${disabled ? 'disabled' : ''}`;
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Forced DOM update:`, { newClass: textNode.className, disabled });
      }
      if (container.className.includes('disabled') && !disabled) {
        container.className = `gateway-paybutton gateway-paybutton-fixed ${disabled ? 'disabled' : ''}`;
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Forced container update:`, { newClass: container.className, disabled });
      }
      if (parentContainer && parentContainer.className.includes('disabled') && !disabled) {
        parentContainer.className = parentContainer.className.replace('disabled', '').trim();
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Forced parent update:`, { newClass: parentContainer.className, disabled });
      }
    };
    forceUpdate();
    setTimeout(forceUpdate, 100);
    console.log(`[${new Date().toISOString()}] [${F}] 🔍 Updated DOM class on mount (useLayoutEffect):`, {
      containerClass: container.className,
      textClass: textNode.className,
      disabled,
      disabledAttr: textNode.hasAttribute('disabled'),
      style: textNode.style.cssText,
    });
  }, [paymentId, buttonId, merchant, server, amount, variable, disabled]);

  // Handle pay.js and DOM mutations
  useEffect(() => {
    if (!containerRef.current || !nodeTextRef.current) return;
    const container = containerRef.current;
    const textNode = nodeTextRef.current;
    const parentContainer = container.parentElement;
    if (!parentContainer) return;
    checkAndCorrectClass(textNode, container, parentContainer);
    const scripts = document.getElementsByTagName('script');
    let payScript = null;
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].getAttribute('src');
      if (src && src.includes('http://localhost:3000/pay.js')) {
        payScript = scripts[i];
        break;
      }
    }
    if (payScript) {
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 pay.js script detected:`, payScript.getAttribute('src'));
      const originalScript = payScript.outerHTML;
      if (payScript.getAttribute('src') && document.querySelector(`script[src="${payScript.getAttribute('src')}"]`)) {
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 pay.js already loaded, original state:`, originalScript);
        checkAndCorrectClass(textNode, container, parentContainer);
      } else {
        payScript.addEventListener('load', () => {
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 pay.js loaded, original state:`, originalScript);
          checkAndCorrectClass(textNode, container, parentContainer);
        });
      }
    } else {
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 No pay.js script found`);
    }
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.target === parentContainer) {
          checkAndCorrectClass(textNode, container, parentContainer);
        } else if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
          checkAndCorrectClass(textNode, container, parentContainer);
        }
      });
    });
    observer.observe(parentContainer, { attributes: true, childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, [disabled, containerRef, nodeTextRef, checkAndCorrectClass]);

  const handleVariableAmountChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const input = event.target.value.replace(/[^0-9]/g, '');
    const satValue = Math.max(1, Math.min(MAX_PAYMENT_SATS, Number(input) || 1));
    setVariableAmount(satValue.toString());
    console.log(`[${new Date().toISOString()}] [${F}] 🔍 Variable amount updated:`, satValue.toString());
  };

  const handleClick = async (e: React.MouseEvent<HTMLDivElement>): Promise<void> => {
    console.log(`[${new Date().toISOString()}] [${F}] 🔍 Button clicked, target:`, e.target, 'class:', (e.target as HTMLElement).className, 'interactive:', !disabled && !loading);
    if (loading || disabled) {
      if (disabled) {
        toast.error('This button is disabled. Check required attributes or button status.');
      }
      return;
    }
    const target = e.nativeEvent.target as HTMLElement | null;
    if (target && target.tagName === 'INPUT') {
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Click on input field ignored`);
      return;
    }
    setLoading(true);
    try {
      const effectiveAmount = variable ? Number(variableAmount) : amount;
      if (!Number.isInteger(effectiveAmount) || effectiveAmount <= 0 || effectiveAmount > MAX_PAYMENT_SATS) {
        throw new Error(`Invalid amount: must be a positive integer between 1 and ${MAX_PAYMENT_SATS}`);
      }
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 [Step 1] Client requested amount (sats):`, effectiveAmount);
      const wallet = new WalletClient('auto', CONFIG.WALLET_ORIGIN);
      const authFetch = new AuthFetch(wallet);
      let walletOutputs: ListOutputsResult | null = null;
      const substrates = [
        { type: 'HTTPWalletJSON', substrate: 'json-api', skip: false },
        { type: 'HTTPWalletWire', substrate: 'Cicada', skip: false },
        { type: 'WindowCWISubstrate', substrate: 'window.CWI', skip: typeof window === 'undefined' || !(window as any).CWI },
        { type: 'XDMSubstrate', substrate: 'XDM', skip: false },
        { type: 'ReactNativeWebView', substrate: 'react-native', skip: false },
      ];
      for (const { type, substrate, skip } of substrates) {
        if (skip) {
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 Skipping ${type} substrate (not available)`);
          continue;
        }
        try {
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 Attempting wallet connection with ${type} on ${CONFIG.WALLET_ORIGIN}`);
          const instance = new WalletClient(substrate as any, CONFIG.WALLET_ORIGIN);
          await Promise.race([instance.getVersion({}), new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout on ${type}`)), 2000))]);
          console.log(`[${new Date().toISOString()}] [${F}] ✅ Wallet version retrieved with ${type}`);
          wallet.substrate = instance.substrate;
          break;
        } catch (walletErr) {
          console.error(`[${new Date().toISOString()}] [${F}] ❌ Wallet connection failed with ${type}:`, walletErr);
        }
      }
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Wallet selected inputs:`, walletOutputs);
      const resStatus = await authFetch.fetch(`${server}/api/getStatus`, { method: 'GET' });
      const status = await resStatus.json();
      if (status.status !== 'success') throw new Error('Cannot reach server');
      console.log(`[${new Date().toISOString()}] [${F}] ✅ Server status checked:`, status);
      let fetchedPaymentId = paymentId;
      try {
        const buttonCodeResponse = await fetch(`${server}/api/buttonCode/${paymentId}`, { headers: { Accept: 'application/json' } });
        if (!buttonCodeResponse.ok) throw new Error(`HTTP error: ${buttonCodeResponse.status}`);
        const buttonCodeData = await buttonCodeResponse.json();
        if (buttonCodeData.status === 'success' && buttonCodeData.payment_id) {
          fetchedPaymentId = buttonCodeData.payment_id;
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 [client] Fetched paymentId:`, fetchedPaymentId);
        }
      } catch (fetchError) {
        console.error(`[${new Date().toISOString()}] [${F}] ❌ [client] Button code fetch error:`, fetchError);
      }
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 [Step 2] Requesting invoice from server:`, server);
      const resInv = await authFetch.fetch(`${server}/api/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId: merchant, buttonId, paymentId: fetchedPaymentId, amount: effectiveAmount }),
      });
      const invoice: InvoiceResponse = await resInv.json();
      if (invoice.status !== 'success') {
        if (invoice.message?.includes('This single-use button has already been used')) {
          setDisabled(true);
          toast.error('This button is single-use and has been used.');
        }
        throw new Error(`Invoice creation failed: ${invoice.message ?? ''}`);
      }
      console.log(`[${new Date().toISOString()}] [${F}] ✅ [Step 3] Invoice received:`, invoice);
      let outputsWithSats = invoice.outputs?.map(output => ({ ...output, satoshis: Math.round(output.satoshis) })) || [];
      if (variable && outputsWithSats.length && outputsWithSats[0].satoshis === 0) {
        outputsWithSats[0].satoshis = effectiveAmount;
      }
      if (outputsWithSats.length && outputsWithSats[0].satoshis !== effectiveAmount) {
        console.log(`[${new Date().toISOString()}] [${F}] ⚠️ Output satoshis mismatch:`, outputsWithSats[0].satoshis, 'vs expected:', effectiveAmount);
      }
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 [Step 4] Client received outputs (sats):`, outputsWithSats);
      const tx = await wallet.createAction({ description: fetchedPaymentId, outputs: outputsWithSats });
      if (tx.tx == null || !Array.isArray(tx.tx)) {
        throw new Error('Invalid transaction: tx.tx is undefined or not an array');
      }
      console.log(`[${new Date().toISOString()}] [${F}] ✅ [Step 6] Action created:`, tx);
      let transaction, atomicBeefTx, txid;
      try {
        transaction = Transaction.fromAtomicBEEF(tx.tx);
        txid = transaction.id('hex');
        atomicBeefTx = Utils.toHex(tx.tx);
        console.log(`[${new Date().toISOString()}] [${F}] ✅ [Step 8] Transaction serialized:`, { txid, atomicBeefTx });
      } catch (e) {
        throw new Error('Failed to serialize transaction');
      }
      const payPayload = { paymentId: invoice.paymentId, buttonId, transaction: { txid, atomicBeefTx }, lockingScript: outputsWithSats[0]?.lockingScript };
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 [Step 9] Sending pay request to server:`, server, payPayload);
      const resPay = await authFetch.fetch(`${server}/api/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payPayload),
      });
      const pay: PayResponse = await resPay.json();
      if (pay.status !== 'success') throw new Error(`Payment processing failed: ${pay.message ?? ''}`);
      console.log(`[${new Date().toISOString()}] [${F}] ✅ [Step 10] Payment processed by server:`, pay);
      setPaid(true);
      setTxid(pay.txid);
      console.log(`[${new Date().toISOString()}] [${F}] ✅ Payment successful:`, pay);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unexpected error';
      console.error(`[${new Date().toISOString()}] [${F}] ❌ Payment flow error:`, { message: errorMessage, stack: err instanceof Error ? err.stack : 'No stack trace' });
      toast.error(`Payment failed: ${errorMessage}`);
    } finally {
      setLoading(false);
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Payment flow completed, loading set to false`);
    }
  };

  if (!paid) {
    if (variable) {
      const left = text?.split('{amount}')[0] || parentDataText?.split('{amount}')[0] || parentOriginalText?.split('{amount}')[0] || '';
      const right = text?.split('{amount}')[1] || parentDataText?.split('{amount}')[1] || parentOriginalText?.split('{amount}')[1] || 'Sats';
      return (
        <div ref={containerRef} className={`gateway-paybutton gateway-paybutton-fixed ${disabled ? 'disabled' : ''}`} onClick={handleClick}>
          <div ref={nodeTextRef} className={`nodeText ${disabled ? 'disabled' : ''}`}>
            {left}
            <input
              type="number"
              value={variableAmount}
              onChange={handleVariableAmountChange}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
              min="1"
              max={`${MAX_PAYMENT_SATS}`}
              style={{ width: '60px', textAlign: 'center', margin: '0 6px', padding: '3px', border: '2px solid #4a90e2', borderRadius: '0.5em', background: '#f9f9f9', color: '#333', fontWeight: '500', verticalAlign: 'middle' }}
              disabled={loading || disabled}
            />
            {right}
          </div>
        </div>
      );
    }
    return (
      <div ref={containerRef} className={`gateway-paybutton gateway-paybutton-fixed ${disabled ? 'disabled' : ''}`} onClick={handleClick}>
        <div ref={nodeTextRef} className={`nodeText ${disabled ? 'disabled' : ''}`}>
          {loading ? loadingtext : buttonLabel}
        </div>
      </div>
    );
  }
  return (
    <div>
      Payment Submitted
      <br />
      TXID:{' '}
      <code>
        <a href={`https://whatsonchain.com/tx/${txid || ''}`} target="_blank" rel="noopener noreferrer">
          {txid || ''}
        </a>
      </code>
    </div>
  );
};

export default PayButton;
