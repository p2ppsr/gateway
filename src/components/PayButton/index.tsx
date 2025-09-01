/**
 * @file src/components/PayButton/index.tsx
 * @description Renders a PayButton component for initiating blockchain payments using the Metanet client. Executes a multi-step flow: server verification, invoice request, transaction signing, and payment submission, with support for variable amounts and single-use/multi-use buttons.
 * @version 2.58.10
 * @changelog
 * - 01Sep2025_0215 BST (v3.123): Updated to use derivation_prefix and derivation_suffix instead of transaction_id.
 * - 28Aug2025_1500 BST (v2.58.10): Added invoice failure logging in handleClick; added paid state logging to debug multi-use button disabling.
 * - 28Aug2025_1435 BST (v2.58.9): Added logging in fetchButtonStatus to diagnose incorrect disabling of multi-use buttons.
 * - 28Aug2025_1410 BST (v2.58.8): Fixed incomplete JSDoc description for clarity.
 * - Previous changes omitted for brevity...
 */
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, ReactElement } from 'react'
import { toast } from 'react-toastify'
import { WalletClient, AuthFetch, Transaction, Utils, CreateActionOutput } from '@bsv/sdk'
import { CONFIG, MAX_PAYMENT_SATS } from '../../utils/constants'

// Component logging prefix
const F = 'components/PayButton'

/**
 * Interface for wallet output results from the Metanet client.
 * @interface ListOutputsResult
 * @property {number} totalOutputs - Total number of outputs.
 * @property {any} [BEEF] - Optional BEEF data.
 * @property {WalletOutput[]} outputs - Array of wallet output objects.
 */
export interface ListOutputsResult {
  totalOutputs: number
  BEEF?: any
  outputs: WalletOutput[]
}

/**
 * Interface for individual wallet output details.
 * @interface WalletOutput
 * @property {number} satoshis - Amount in satoshis.
 */
interface WalletOutput {
  satoshis: number
}

/**
 * Interface for list outputs arguments.
 * @interface ListOutputsArgs
 * @property {string} [basket] - Optional basket identifier.
 * @property {number} [limit] - Optional limit on outputs.
 */
interface ListOutputsArgs {
  basket?: string
  limit?: number
}

/**
 * Props interface for the PayButton component.
 * @interface PayButtonProps
 * @property {string} [text] - Optional button text.
 * @property {number} amount - Required payment amount in satoshis.
 * @property {string} merchant - Required merchant identifier.
 * @property {string} paymentId - Required payment identifier.
 * @property {string} buttonId - Required button identifier.
 * @property {string} server - Required server URL.
 * @property {string} [loadingtext] - Optional loading text (defaults to 'Loading, please wait…').
 * @property {boolean} [variable] - Optional flag for variable amount input (defaults to false).
 * @property {string} [width] - Optional width style (defaults to 'fit-content').
 */
export interface PayButtonProps {
  text?: string
  amount: number
  merchant: string
  paymentId: string
  buttonId: string
  server: string
  loadingtext?: string
  variable?: boolean
  width?: string
  multiUse?: string | boolean
}

/**
 * Interface for the server response to an invoice request.
 * @interface InvoiceResponse
 * @property {string} status - Response status.
 * @property {string} [message] - Optional error message.
 * @property {string} derivation_suffix - BRC29 derivation suffix.
 * @property {string} derivation_prefix - BRC29 derivation prefix.
 //* @property {string} transaction_id - Transaction identifier.
 * @property {string} paymentId - Payment identifier.
 * @property {CreateActionOutput[] | undefined} outputs - Optional transaction outputs.
 */
interface InvoiceResponse {
  status: string
  message?: string
  derivation_suffix: string
  derivation_prefix: string
  //*transaction_id: string
  paymentId: string
  outputs: CreateActionOutput[] | undefined
}

/**
 * Interface for the server response to a payment request.
 * @interface PayResponse
 * @property {string} status - Response status.
 * @property {string} [message] - Optional error message.
 * @property {string} txid - Transaction ID.
 */
interface PayResponse {
  status: string
  message?: string
  txid: string
}

/**
 * Interface for the server response to a button code request.
 * @interface ButtonCodeResponse
 * @property {string} status - Response status.
 * @property {string} button_id - Button identifier.
 * @property {string} payment_id - Payment identifier.
 * @property {boolean} [multi_use] - Optional multi-use flag.
 * @property {boolean} [used] - Optional used flag.
 */
interface ButtonCodeResponse {
  status: string
  button_id: string
  payment_id: string
  multi_use?: boolean
  used?: boolean
}

/**
 * PayButton component for initiating blockchain payments.
 * Handles a multi-step payment flow with server verification, invoice generation,
 * transaction signing, and submission, supporting variable amounts and DOM synchronization.
 * @param {PayButtonProps} props - The component properties.
 * @returns {ReactElement} The rendered PayButton component.
 */
const PayButton = ({
  text,
  amount,
  merchant,
  paymentId: initialPaymentId,
  buttonId,
  server,
  loadingtext = 'Loading, please wait…',
  variable = false,
  width = 'fit-content',
  multiUse
}: PayButtonProps): ReactElement => {
  const [loading, setLoading] = useState(false)
  const [paid, setPaid] = useState(false)
  const [txid, setTxid] = useState<string | null>(null)
  const [variableAmount, setVariableAmount] = useState('1')
  const [disabled, setDisabled] = useState(false)
  const [paymentId, setPaymentId] = useState(initialPaymentId) // Add state to track updated paymentId
  const [parentDataText, setParentDataText] = useState<string | undefined>(undefined)
  const [parentOriginalText, setParentOriginalText] = useState<string | undefined>(undefined)
  const [buttonLabel, setButtonLabel] = useState<string>(text || 'Pay Now 0 Sats')
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeTextRef = useRef<HTMLDivElement>(null)

  /**
   * Corrects DOM class names based on disabled state.
   * @param {HTMLDivElement} textNode - The text node element.
   * @param {HTMLDivElement} container - The container element.
   * @param {HTMLElement | null} parentContainer - The parent container element.
   */
  const checkAndCorrectClass = useCallback(
    (textNode: HTMLDivElement, container: HTMLDivElement, parentContainer: HTMLElement | null) => {
      if (textNode.className.includes('disabled') && !disabled) {
        textNode.className = `nodeText ${disabled ? 'disabled' : ''}`
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Corrected text class due to disabled override`)
      }
      if (container.className.includes('disabled') && !disabled) {
        container.className = `gateway-paybutton gateway-paybutton-fixed ${disabled ? 'disabled' : ''}`
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Corrected container class due to disabled override`)
      }
      if (parentContainer?.className.includes('disabled') && !disabled) {
        parentContainer.className = parentContainer.className.replace('disabled', '').trim()
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Corrected parent class due to disabled override`)
      }
    },
    [disabled]
  )

  /**
   * Validates required props and sets disabled state if invalid.
   */
  useEffect(() => {
    try {
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Received props at component mount:`, {
        text,
        amount,
        merchant,
        paymentId: initialPaymentId,
        buttonId,
        server,
        variable,
        width,
        multiUse
      })
      if (!initialPaymentId || !buttonId || !merchant || !server || (!variable && amount <= 0)) {
        const errors = []
        if (!initialPaymentId) errors.push('Missing data-paymentId attribute.')
        if (!buttonId) errors.push('Missing data-buttonId attribute.')
        if (!merchant) errors.push('Missing data-merchant attribute.')
        if (!server) errors.push('Missing data-server attribute.')
        if (!variable && amount <= 0) errors.push('Missing valid data-amount attribute.')
        errors.forEach(error => toast.error(error))
        setDisabled(true) // Disabled due to invalid props
      }
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] [${F}] ❌ Failed to validate props:`,
        error instanceof Error ? error.message : 'Unknown error'
      )
      setDisabled(true) // Fallback to disabled state
    }
  }, [initialPaymentId, buttonId, merchant, server, amount, variable, width, multiUse])

  /**
   * Fetches button status to determine single-use and usage state.
   */
  useEffect(() => {
    if (!paymentId || disabled) return
    const fetchButtonStatus = async (): Promise<void> => {
      try {
        const response = await fetch(`${server}/api/buttonCode/${paymentId}`, {
          headers: { Accept: 'application/json' }
        })
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`)
        const data: ButtonCodeResponse = await response.json()
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Button status response:`, {
          multi_use: data.multi_use,
          used: data.used,
          paymentId
        })
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Fetched button status:`, data)
        if (data.status === 'success') {
          const isMultiUse = data.multi_use === true // Handle boolean or numeric
          const isUsed = data.used === true
          if (!isMultiUse && isUsed) {
            setDisabled(true)
            console.log(`[${new Date().toISOString()}] [${F}] ✅ Button disabled: single-use and already used`)
            toast.error('This button is single-use and has been used.')
          }
        }
      } catch (error) {
        console.error(
          `[${new Date().toISOString()}] [${F}] ❌ Error fetching button status:`,
          error instanceof Error ? error.message : 'Unknown error'
        )
        if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
          console.log(`[${new Date().toISOString()}] [${F}] ⚠️ Proxy server at ${server} unavailable`)
          setDisabled(true)
          toast.error('Button disabled due to server unavailability.')
        }
      }
    }
    fetchButtonStatus()
  }, [server, paymentId, disabled, paid]) // Re-run after payment

  /**
   * Caches parent dataset values from the DOM.
   */
  useEffect(() => {
    try {
      const el = containerRef.current
      if (el) {
        const parent = el.parentElement
        const ds = parent?.dataset
        if (ds) {
          setParentDataText(ds.text)
          setParentOriginalText(ds.originalText)
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 Cached parent dataset:`, {
            text: ds.text,
            originalText: ds.originalText
          })
        }
      }
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] [${F}] ❌ Failed to cache parent dataset:`,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }, [])

  /**
   * Computes and updates the dynamic button label.
   */
  useEffect(() => {
    try {
      const label = text || parentDataText || parentOriginalText || `Pay Now ${amount || variableAmount} Sats`
      setButtonLabel(label)
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Button label computed:`, {
        buttonLabel: label,
        dataText: parentDataText,
        propsText: text,
        datasetText: parentOriginalText,
        fallback: `Pay Now ${amount || variableAmount} Sats`
      })
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] [${F}] ❌ Failed to compute button label:`,
        error instanceof Error ? error.message : 'Unknown error'
      )
      setButtonLabel('Pay Now 0 Sats') // Fallback label
    }
  }, [text, amount, variableAmount, parentDataText, parentOriginalText])

  /**
   * Applies initial styles and sets up DOM structure.
   */
  useEffect(() => {
    try {
      const container = containerRef.current?.parentElement
      if (container) {
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Initial parent div state at mount:`, {
          datasetText: container.dataset.text,
          textContent: container.textContent?.trim(),
          datasetOriginalText: container.dataset.originalText,
          propsText: text,
          phase: 'mount',
          initialDisabled: container.className.includes('disabled')
        })
        const originalText =
          text ||
          containerRef.current?.parentElement?.dataset.text ||
          container.dataset.originalText ||
          container.textContent?.trim() ||
          `Pay Now ${amount || variableAmount} Sats`
        container.dataset.originalText = originalText
        container.style.display = 'flex'
        container.style.justifyContent = 'center'
        container.style.alignItems = 'center'
        container.style.width = width || 'fit-content'
        container.setAttribute('data-disabled', (loading || disabled).toString())
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Applied container styles and events:`, {
          originalText: container.dataset.originalText,
          finalTextContent: container.textContent?.trim(),
          phase: 'after',
          width: container.style.width
        })
      }
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] [${F}] ❌ Failed to apply styles:`,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }, [loading, paid, disabled, text, amount, variableAmount, width])

  /**
   * Initializes DOM class control on mount.
   */
  useLayoutEffect(() => {
    try {
      const container = containerRef.current
      const textNode = nodeTextRef.current
      const parentContainer = container?.parentElement
      if (!container || !textNode) return
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Received props at component mount (useLayoutEffect):`, {
        text,
        amount,
        merchant,
        paymentId: initialPaymentId,
        buttonId,
        server,
        variable,
        multiUse
      })
      if (!initialPaymentId || !buttonId || !merchant || !server || (!variable && amount <= 0)) {
        const errors = []
        if (!initialPaymentId) errors.push('Missing data-paymentId attribute.')
        if (!buttonId) errors.push('Missing data-buttonId attribute.')
        if (!merchant) errors.push('Missing data-merchant attribute.')
        if (!server) errors.push('Missing data-server attribute.')
        if (!variable && amount <= 0) errors.push('Missing valid data-amount attribute.')
        errors.forEach(error => toast.error(error))
        setDisabled(true) // Disabled due to invalid props
      }
      container.className = `gateway-paybutton gateway-paybutton-fixed ${disabled ? 'disabled' : ''}`
      textNode.className = `nodeText ${disabled ? 'disabled' : ''}`
      if (parentContainer?.className.includes('disabled') && !disabled) {
        parentContainer.className = parentContainer.className.replace('disabled', '').trim()
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Corrected parent class:`, {
          newClass: parentContainer.className,
          disabled
        })
      }
      const forceUpdate = () => {
        if (textNode.className.includes('disabled') && !disabled) {
          textNode.className = `nodeText ${disabled ? 'disabled' : ''}`
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 Forced DOM update:`, {
            newClass: textNode.className,
            disabled
          })
        }
        if (container.className.includes('disabled') && !disabled) {
          container.className = `gateway-paybutton gateway-paybutton-fixed ${disabled ? 'disabled' : ''}`
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 Forced container update:`, {
            newClass: container.className,
            disabled
          })
        }
        if (parentContainer?.className.includes('disabled') && !disabled) {
          parentContainer.className = parentContainer.className.replace('disabled', '').trim()
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 Forced parent update:`, {
            newClass: parentContainer.className,
            disabled
          })
        }
      }
      forceUpdate()
      setTimeout(forceUpdate, 100)
      console.log(`[${new Date().toISOString()}] [${F}] 🔍 Updated DOM class on mount (useLayoutEffect):`, {
        containerClass: container.className,
        textClass: textNode.className,
        disabled,
        disabledAttr: textNode.hasAttribute('disabled'),
        style: textNode.style.cssText
      })
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] [${F}] ❌ Failed to initialize DOM:`,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }, [initialPaymentId, buttonId, merchant, server, amount, variable, disabled, multiUse])

  /**
   * Handles pay.js script loading and DOM mutation observation.
   */
  useEffect(() => {
    try {
      const container = containerRef.current
      const textNode = nodeTextRef.current
      const parentContainer = container?.parentElement
      if (!container || !textNode || !parentContainer) return
      checkAndCorrectClass(textNode, container, parentContainer)
      const scripts = document.getElementsByTagName('script')
      let payScript = null
      for (let i = 0; i < scripts.length; i++) {
        const src = scripts[i].getAttribute('src')
        if (src && src.includes('http://localhost:3000/pay.js')) {
          payScript = scripts[i]
          break
        }
      }
      if (payScript) {
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 pay.js script detected:`, payScript.getAttribute('src'))
        const originalScript = payScript.outerHTML
        if (payScript.getAttribute('src') && document.querySelector(`script[src="${payScript.getAttribute('src')}"]`)) {
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 pay.js already loaded, original state:`, originalScript)
          checkAndCorrectClass(textNode, container, parentContainer)
        } else {
          payScript.addEventListener('load', () => {
            console.log(`[${new Date().toISOString()}] [${F}] 🔍 pay.js loaded, original state:`, originalScript)
            checkAndCorrectClass(textNode, container, parentContainer)
          })
        }
      } else {
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 No pay.js script found`)
      }
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          if (mutation.type === 'attributes' && mutation.target === parentContainer) {
            checkAndCorrectClass(textNode, container, parentContainer)
          } else if (
            mutation.type === 'childList' &&
            (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
          ) {
            checkAndCorrectClass(textNode, container, parentContainer)
          }
        })
      })
      observer.observe(parentContainer, { attributes: true, childList: true, subtree: true })
      return () => observer.disconnect() // Cleanup observer
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] [${F}] ❌ Failed to handle pay.js or mutations:`,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }, [disabled, containerRef, nodeTextRef, checkAndCorrectClass])

  /**
   * Handles changes to the variable amount input.
   * @param {React.ChangeEvent<HTMLInputElement>} event - The input change event.
   */
  const handleVariableAmountChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      try {
        const input = event.target.value.replace(/[^0-9]/g, '')
        const satValue = Math.max(1, Math.min(MAX_PAYMENT_SATS, Number(input) || 1))
        setVariableAmount(satValue.toString())
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Variable amount updated:`, satValue.toString())
      } catch (error) {
        console.error(
          `[${new Date().toISOString()}] [${F}] ❌ Failed to update variable amount:`,
          error instanceof Error ? error.message : 'Unknown error'
        )
        setVariableAmount('1') // Fallback to default
      }
    },
    [setVariableAmount]
  )

  /**
   * Executes the payment flow, handling server requests and transaction signing.
   * @param {React.MouseEvent<HTMLDivElement>} e - The click event.
   * @returns {Promise<void>}
   */
  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>): Promise<void> => {
      console.log(
        `[${new Date().toISOString()}] [${F}] 🔍 Button clicked, target:`,
        e.target,
        'class:',
        (e.target as HTMLElement).className,
        'interactive:',
        !disabled && !loading
      )
      if (loading || disabled) {
        if (disabled) toast.error('This button is disabled. Check required attributes or button status.')
        return
      }
      const target = e.nativeEvent.target as HTMLElement | null
      if (target && target.tagName === 'INPUT') {
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Click on input field ignored`)
        return
      }
      setLoading(true)
      try {
        const effectiveAmount = variable ? Number(variableAmount) : amount
        if (!Number.isInteger(effectiveAmount) || effectiveAmount <= 0 || effectiveAmount > MAX_PAYMENT_SATS) {
          throw new Error(`Invalid amount: must be a positive integer between 1 and ${MAX_PAYMENT_SATS}`)
        }
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 [Step 1] Client requested amount (sats):`, effectiveAmount)
        const wallet = new WalletClient('auto', CONFIG.WALLET_ORIGIN)
        const authFetch = new AuthFetch(wallet)
        let walletOutputs: ListOutputsResult | null = null
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
        ]
        for (const { type, substrate, skip } of substrates) {
          if (skip) {
            console.log(`[${new Date().toISOString()}] [${F}] 🔍 Skipping ${type} substrate (not available)`)
            continue
          }
          try {
            console.log(
              `[${new Date().toISOString()}] [${F}] 🔍 Attempting wallet connection with ${type} on ${CONFIG.WALLET_ORIGIN}`
            )
            const instance = new WalletClient(substrate as any, CONFIG.WALLET_ORIGIN) // Type cast needed due to substrate type mismatch
            await Promise.race([
              instance.getVersion({}),
              new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout on ${type}`)), 2000))
            ])
            console.log(`[${new Date().toISOString()}] [${F}] ✅ Wallet version retrieved with ${type}`)
            wallet.substrate = instance.substrate
            break
          } catch (walletErr) {
            console.error(
              `[${new Date().toISOString()}] [${F}] ❌ Wallet connection failed with ${type}:`,
              walletErr instanceof Error ? walletErr.message : 'Unknown error'
            )
          }
        }
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Wallet selected inputs:`, walletOutputs)
        const resStatus = await authFetch.fetch(`${server}/api/getStatus`, { method: 'GET' })
        if (!resStatus.ok) throw new Error('Server status request failed')
        const status = await resStatus.json()
        if (status.status !== 'success') throw new Error('Cannot reach server')
        console.log(`[${new Date().toISOString()}] [${F}] ✅ Server status checked:`, status)
        let fetchedPaymentId = paymentId // Use current paymentId state
        try {
          const buttonCodeResponse = await fetch(`${server}/api/buttonCode/${paymentId}`, {
            headers: { Accept: 'application/json' }
          })
          if (!buttonCodeResponse.ok) throw new Error(`HTTP error: ${buttonCodeResponse.status}`)
          const buttonCodeData: ButtonCodeResponse = await buttonCodeResponse.json()
          if (buttonCodeData.status === 'success' && buttonCodeData.payment_id) {
            fetchedPaymentId = buttonCodeData.payment_id
            console.log(`[${new Date().toISOString()}] [${F}] 🔍 [client] Fetched paymentId:`, fetchedPaymentId)
          }
        } catch (fetchError) {
          console.error(
            `[${new Date().toISOString()}] [${F}] ❌ [client] Button code fetch error:`,
            fetchError instanceof Error ? fetchError.message : 'Unknown error'
          )
        }
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 [Step 2] Requesting invoice from server:`, server)
        const resInv = await authFetch.fetch(`${server}/api/invoice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchantId: merchant,
            buttonId,
            paymentId: fetchedPaymentId,
            amount: effectiveAmount,
            description: containerRef.current?.parentElement?.getAttribute('data-description') || 'Default Description'
          })
        })
        if (!resInv.ok) {
          console.log(`[${new Date().toISOString()}] [${F}] ❌ Invoice request failed:`, {
            status: resInv.status,
            statusText: resInv.statusText
          })
          throw new Error('Invoice request failed')
        }
        const invoice: InvoiceResponse = await resInv.json()
        if (invoice.status !== 'success') {
          console.log(`[${new Date().toISOString()}] [${F}] ❌ Invoice creation failed:`, invoice.message)
          if (invoice.message?.includes('This single-use button has already been used')) {
            setDisabled(true)
            toast.error('This button is single-use and has been used.')
          }
          throw new Error(`Invoice creation failed: ${invoice.message ?? ''}`)
        }
        console.log(`[${new Date().toISOString()}] [${F}] ✅ [Step 3] Invoice received:`, invoice)
        // Update paymentId to the new one from the invoice
        if (invoice.paymentId && invoice.paymentId !== paymentId) {
          setPaymentId(invoice.paymentId)
          //const isMultiUse = data.multi_use === true // Handle boolean or numeric
          const isMultiUse = multiUse === 'true' || multiUse === true
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 Setting paid state:`, {
            paid: true,
            isMultiUse,
            resettingTo: isMultiUse ? false : true
          })
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 Updated paymentId to:`, invoice.paymentId)
        }
        let outputsWithSats =
          invoice.outputs?.map(output => ({ ...output, satoshis: output.satoshis })) || []
        if (variable && outputsWithSats.length && outputsWithSats[0].satoshis === 0) {
          outputsWithSats[0].satoshis = effectiveAmount
        }
        if (outputsWithSats.length && outputsWithSats[0].satoshis !== effectiveAmount) {
          console.log(
            `[${new Date().toISOString()}] [${F}] ⚠️ Output satoshis mismatch:`,
            outputsWithSats[0].satoshis,
            'vs expected:',
            effectiveAmount
          )
        }
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 [Step 4] Client received outputs (sats):`, outputsWithSats)
        const tx = await wallet.createAction({ description: invoice.paymentId, outputs: outputsWithSats })
        if (tx.tx == null || !Array.isArray(tx.tx)) {
          throw new Error('Invalid transaction: tx.tx is undefined or not an array')
        }
        console.log(`[${new Date().toISOString()}] [${F}] ✅ [Step 6] Action created:`, tx)
        let transaction, atomicBeefTx, txid
        try {
          transaction = Transaction.fromAtomicBEEF(tx.tx)
          txid = transaction.id('hex')
          atomicBeefTx = Utils.toHex(tx.tx)
          console.log(`[${new Date().toISOString()}] [${F}] ✅ [Step 8] Transaction serialized:`, {
            txid,
            atomicBeefTx
          })
        } catch (e) {
          throw new Error('Failed to serialize transaction')
        }
        const payPayload = {
          paymentId: invoice.paymentId,
          buttonId,
          transaction: { txid, atomicBeefTx },
          lockingScript: outputsWithSats[0]?.lockingScript,
          amount: effectiveAmount
        }
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 [Step 9] Sending pay request to server:`,
          server,
          payPayload
        )
        const resPay = await authFetch.fetch(`${server}/api/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payPayload)
        })
        if (!resPay.ok) throw new Error('Payment request failed')
        const pay: PayResponse = await resPay.json()
        if (pay.status !== 'success') throw new Error(`Payment processing failed: ${pay.message ?? ''}`)
        console.log(`[${new Date().toISOString()}] [${F}] ✅ [Step 10] Payment processed by server:`, pay)
        setPaid(true)
        setTxid(pay.txid)
        setPaymentId(initialPaymentId) // Reset paymentId for next payment
        const isMultiUse = multiUse === 'true' || multiUse === true
        if (isMultiUse) setPaid(false) // Reset paid state for multi-use buttons
        // Disable button if single-use after successful payment
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Evaluating multiUse before check:`, {
          multiUse,
          type: typeof multiUse
        })
        if (!isMultiUse && !variable && amount > 0) {
          setDisabled(true)
          console.log(`[${new Date().toISOString()}] [${F}] ✅ Button disabled: single-use payment completed`, {
            multiUse,
            isMultiUse
          })
          toast.info('This single-use button has been used and is now disabled.')
        } else if (isMultiUse) {
          console.log(`[${new Date().toISOString()}] [${F}] 🔍 Button remains enabled: multi-use button`, {
            multiUse,
            isMultiUse
          })
        }
        console.log(`[${new Date().toISOString()}] [${F}] ✅ Payment successful:`, pay)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unexpected error'
        console.error(`[${new Date().toISOString()}] [${F}] ❌ Payment flow error:`, {
          message: errorMessage,
          stack: err instanceof Error ? err.stack : 'Unknown error'
        })
        toast.error(`Payment failed: ${errorMessage}`)
      } finally {
        setLoading(false)
        console.log(`[${new Date().toISOString()}] [${F}] 🔍 Payment flow completed, loading set to false`)
      }
    },
    [
      variable,
      variableAmount,
      amount,
      setLoading,
      setPaid,
      setTxid,
      setDisabled,
      containerRef,
      disabled,
      paymentId,
      setPaymentId,
      multiUse
    ]
  )

  if (!paid) {
    if (variable) {
      const left =
        text?.split('{amount}')[0] ||
        parentDataText?.split('{amount}')[0] ||
        parentOriginalText?.split('{amount}')[0] ||
        ''
      const right =
        text?.split('{amount}')[1] ||
        parentDataText?.split('{amount}')[1] ||
        parentOriginalText?.split('{amount}')[1] ||
        'Sats'
      return (
        <div
          ref={containerRef}
          className={`gateway-paybutton gateway-paybutton-fixed ${disabled ? 'disabled' : ''}`}
          onClick={handleClick}
        >
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
              disabled={loading || disabled}
              aria-label="Variable payment amount"
            />
            {right}
          </div>
        </div>
      )
    }
    return (
      <div
        ref={containerRef}
        className={`gateway-paybutton gateway-paybutton-fixed ${disabled ? 'disabled' : ''}`}
        onClick={handleClick}
      >
        <div ref={nodeTextRef} className={`nodeText ${disabled ? 'disabled' : ''}`}>
          {loading ? loadingtext : buttonLabel}
        </div>
      </div>
    )
  }
  return (
    <div role="status">
      Payment Submitted
      <br />
      TXID:{' '}
      <code>
        <a href={`https://whatsonchain.com/tx/${txid || ''}`} target="_blank" rel="noopener noreferrer">
          {txid || ''}
        </a>
      </code>
    </div>
  )
}

export default PayButton
