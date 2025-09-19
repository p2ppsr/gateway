/**
 * @file src/components/PayButton/index.tsx
 * @description Renders a PayButton component for initiating blockchain payments using the Metanet client, supporting variable amounts and single-use/multi-use buttons with a multi-step flow for verification, invoice request, transaction signing, and payment submission.
 * @version 2.59.0 (Updated 03Sep2025_1359 BST to add null check for parentContainer in handleScriptAndMutations)
 * @author xAI (Grok 3)
 * @dependencies
 * - react: For component rendering and state management
 * - react-toastify: For user notifications
 * - @bsv/sdk: For blockchain transaction handling and Metanet client integration
 * - ../../utils/constants: For configuration constants
 * @changelog
 * - 03Sep2025_1359 BST (v2.59.0): Added null check for parentContainer in handleScriptAndMutations useEffect to prevent runtime errors.
 * - 03Sep2025_1351 BST (v2.59.0): Formalized JSDoc comments for useEffect and useLayoutEffect hooks and added null check for containerRef in applyStyles.
 */
import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  ReactElement
} from 'react'
import { toast, ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import {
  WalletClient,
  Transaction,
  Utils,
  CreateActionOutput,
  CreateActionResult,
  WERR_REVIEW_ACTIONS
} from '@bsv/sdk'
import { CONFIG, MAX_PAYMENT_SATS } from '../../utils/constants'
import { fetchWithTimeout } from '../../utils/general'
import { getScriptOrigin } from '../../utils/scriptOrigin'
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
 * Props interface for the PayButton component.
 * @interface PayButtonProps
 * @property {string} [text] - Optional button text.
 * @property {number} amount - Required payment amount in satoshis.
 * @property {string} merchant - Required merchant identifier.
 * @property {string} paymentId - Required payment identifier.
 * @property {string} buttonId - Required button identifier.
 * @property {string} [loadingtext] - Optional loading text (defaults to 'Loading, please wait…').
 * @property {boolean} [variable] - Optional flag for variable amount input (defaults to false).
 * @property {string} [width] - Optional width style (defaults to 'fit-content').
 * @property {string | boolean} [multiUse] - Optional flag for multi-use buttons.
 */
export interface PayButtonProps {
  text?: string
  amount: number
  merchant: string
  paymentId: string
  buttonId: string
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
 * @property {string} paymentId - Payment identifier.
 * @property {CreateActionOutput[] | undefined} outputs - Optional transaction outputs.
 */
interface InvoiceResponse {
  status: string
  message?: string
  derivation_suffix: string
  derivation_prefix: string
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

declare const SERVER_IDENTITY_KEY: string
const serverIdentityKey = SERVER_IDENTITY_KEY

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
  const [parentDataText, setParentDataText] = useState<string | undefined>(
    undefined
  )
  const [parentOriginalText, setParentOriginalText] = useState<
  string | undefined
  >(undefined)
  const [buttonLabel, setButtonLabel] = useState<string>(
    text ?? 'Pay Now 0 Sats'
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeTextRef = useRef<HTMLDivElement>(null)

  /**
   * Corrects DOM class names based on disabled state.
   * @param {HTMLDivElement} textNode - The text node element.
   * @param {HTMLDivElement} container - The container element.
   * @param {HTMLElement | null} parentContainer - The parent container element.
   */
  const checkAndCorrectClass = useCallback(
    (
      textNode: HTMLDivElement,
      container: HTMLDivElement,
      parentContainer: HTMLElement | null
    ) => {
      if (textNode.className.includes('disabled') && !disabled) {
        textNode.className = `nodeText ${disabled ? 'disabled' : ''}`
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 Corrected text class due to disabled override`
        )
      }
      if (container.className.includes('disabled') && !disabled) {
        container.className = `gateway-paybutton gateway-paybutton-fixed ${disabled ? 'disabled' : ''}`
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 Corrected container class due to disabled override`
        )
      }
      const pc = parentContainer
      if (pc == null || !pc.className.includes('disabled') || disabled) {
        // nothing to do
      } else {
        pc.className = pc.className.replace('disabled', '').trim()
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 Corrected parent class due to disabled override`
        )
      }
    },
    [disabled]
  )

  /**
   * Validates required props and sets disabled state if invalid.
   * @function validateProps
   */
  useEffect(() => {
    try {
      console.log(
        `[${new Date().toISOString()}] [${F}] 🔍 Received props at component mount:`,
        {
          text,
          amount,
          merchant,
          paymentId: initialPaymentId,
          buttonId,
          variable,
          width,
          multiUse
        }
      )
      if (
        initialPaymentId === '' ||
        initialPaymentId == null ||
        buttonId === '' ||
        buttonId == null ||
        merchant === '' ||
        merchant == null ||
        (!variable && amount <= 0)
      ) {
        const errors: string[] = []
        if (initialPaymentId === '' || initialPaymentId == null) {
          errors.push('Missing data-paymentId attribute.')
        }
        if (buttonId === '' || buttonId == null) {
          errors.push('Missing data-buttonId attribute.')
        }
        if (merchant === '' || merchant == null) {
          errors.push('Missing data-merchant attribute.')
        }
        if (!variable && amount <= 0) {
          errors.push('Missing valid data-amount attribute.')
        }
        errors.forEach((err) => toast.error(err))
        setDisabled(true)
      }
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] [${F}] ❌ Failed to validate props:`,
        error instanceof Error ? error.message : 'Unknown error'
      )
      setDisabled(true) // Fallback to disabled state
    }
  }, [initialPaymentId, buttonId, merchant, amount, variable, width, multiUse])

  /**
   * Fetches button status to determine single-use and usage state.
   * @function fetchButtonStatus
   */
  useEffect(() => {
    if (paymentId == null || paymentId === '' || disabled) return
    let cancelled = false
    const run = async (): Promise<void> => {
      try {
        const wallet = new WalletClient('auto', CONFIG.WALLET_ORIGIN)
        if ((multiUse === true || multiUse === 'true') && paymentId != null && paymentId !== '') {
          const base = getScriptOrigin()
          const url = `${base}/api/buttonCode/${paymentId}`
          const response = await fetchWithTimeout(
            url,
            { method: 'GET' },
            wallet
          )
          if (!response.ok) throw new Error(`HTTP error: ${response.status}`)
          const data: ButtonCodeResponse = await response.json()

          if (cancelled) return

          console.log(
            `[${new Date().toISOString()}] [${F}] 🔍 Button status response:`,
            {
              multi_use: multiUse,
              used: data.used,
              paymentId
            }
          )
          console.log(
            `[${new Date().toISOString()}] [${F}] 🔍 Fetched button status:`,
            data
          )
          if (data.status === 'success') {
            const isMultiUse = data.multi_use === true
            const isUsed = data.used === true
            if (!isMultiUse && isUsed) {
              setDisabled(true)
              console.log(
                `[${new Date().toISOString()}] [${F}] ✅ Button disabled: single-use and already used`
              )
              toast.warning(
                '⚠️ Button cannot be reused',
                {
                  autoClose: 5000,
                  position: 'top-right'
                }
              )
            }
          }
        }
      } catch (error) {
        console.error(
          `[${new Date().toISOString()}] [${F}] ❌ Error fetching button status:`,
          error instanceof Error ? error.message : 'Unknown error'
        )
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [paymentId, disabled, paid])

  /**
   * Caches parent dataset values from the DOM.
   * @function cacheParentDataset
   */
  useEffect(() => {
    try {
      const el = containerRef.current
      if (el != null) {
        const parent = el.parentElement
        const ds = parent?.dataset
        if (ds != null) {
          setParentDataText(ds.text)
          setParentOriginalText(ds.originalText)
          console.log(
            `[${new Date().toISOString()}] [${F}] 🔍 Cached parent dataset:`,
            {
              text: ds.text,
              originalText: ds.originalText
            }
          )
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
   * @function updateButtonLabel
   */
  useEffect(() => {
    try {
      const chosenText =
        (typeof text === 'string' && text.trim() !== '' ? text : undefined) ??
        (typeof parentDataText === 'string' && parentDataText.trim() !== '' ? parentDataText : undefined) ??
        (typeof parentOriginalText === 'string' && parentOriginalText.trim() !== '' ? parentOriginalText : undefined)

      const amountNumber = Number(amount)
      const variableNumber = Number(variableAmount)

      const satsValue =
        Number.isFinite(amountNumber) && amountNumber > 0
          ? amountNumber
          : Number.isFinite(variableNumber) && variableNumber > 0
            ? variableNumber
            : 0
      const label = chosenText ?? `Pay Now ${satsValue} Sats`
      setButtonLabel(label)
      console.log(
        `[${new Date().toISOString()}] [${F}] 🔍 Button label computed:`,
        {
          buttonLabel: label,
          dataText: parentDataText,
          propsText: text,
          datasetText: parentOriginalText,
          fallback: `Pay Now ${Number.isFinite(amount) && amount > 0 ? amount : Number(variableAmount) > 0 ? variableAmount : 0} Sats`
        }
      )
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
   * @function applyStyles
   */
  useEffect(() => {
    try {
      if (containerRef.current == null) return
      const container = containerRef.current.parentElement
      if (container != null) {
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 Initial parent div state at mount:`,
          {
            datasetText: container.dataset.text,
            textContent: container.textContent?.trim(),
            datasetOriginalText: container.dataset.originalText,
            propsText: text,
            phase: 'mount',
            initialDisabled: container.className.includes('disabled')
          }
        )
        const parentDataTextValue = containerRef.current?.parentElement?.dataset.text
        const containerOriginalTextValue = container.dataset.originalText
        const containerTextContentValue = container.textContent?.trim()

        const textValue =
          text !== undefined && text.trim() !== '' ? text : undefined
        const parentDataValue =
          parentDataTextValue !== undefined && parentDataTextValue.trim() !== ''
            ? parentDataTextValue
            : undefined
        const containerOriginalValue =
          containerOriginalTextValue !== undefined && containerOriginalTextValue.trim() !== ''
            ? containerOriginalTextValue
            : undefined
        const containerTextValue =
          containerTextContentValue !== undefined && containerTextContentValue !== ''
            ? containerTextContentValue
            : undefined

        const originalText =
          textValue ??
          parentDataValue ??
          containerOriginalValue ??
          containerTextValue ??
          `Pay Now ${
            Number.isFinite(amount) && amount > 0
              ? amount
              : Number(variableAmount) > 0
              ? variableAmount
              : 0
          } Sats`
        container.dataset.originalText = originalText
        container.style.display = 'flex'
        container.style.justifyContent = 'center'
        container.style.alignItems = 'center'
        container.style.width = width ?? 'fit-content'
        container.setAttribute(
          'data-disabled',
          (loading || disabled).toString()
        )
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 Applied container styles and events:`,
          {
            originalText: container.dataset.originalText,
            finalTextContent: container.textContent?.trim(),
            phase: 'after',
            width: container.style.width
          }
        )
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
   * @function initializeDOM
   */
  useLayoutEffect(() => {
    try {
      const container = containerRef.current
      const textNode = nodeTextRef.current
      const parentContainer = container?.parentElement
      if ((container == null) || (textNode == null)) return
      console.log(
        `[${new Date().toISOString()}] [${F}] 🔍 Received props at component mount (useLayoutEffect):`,
        {
          text,
          amount,
          merchant,
          paymentId: initialPaymentId,
          buttonId,
          variable,
          multiUse
        }
      )
      if (
        initialPaymentId === undefined ||
        initialPaymentId.trim() === '' ||
        buttonId === undefined ||
        buttonId.trim() === '' ||
        merchant === undefined ||
        merchant.trim() === '' ||
        (!variable && amount <= 0)
      ) {
        const errors: string[] = []
        if (initialPaymentId === undefined || initialPaymentId.trim() === '') {
          errors.push('Missing data-paymentId attribute.')
        }
        if (buttonId === undefined || buttonId.trim() === '') {
          errors.push('Missing data-buttonId attribute.')
        }
        if (merchant === undefined || merchant.trim() === '') {
          errors.push('Missing data-merchant attribute.')
        }
        if (!variable && amount <= 0) {
          errors.push('Missing valid data-amount attribute.')
        }
        errors.forEach((err) => toast.error(err))
        setDisabled(true)
      }
      container.className = `gateway-paybutton gateway-paybutton-fixed ${disabled ? 'disabled' : ''}`
      textNode.className = `nodeText ${disabled ? 'disabled' : ''}`
      if (
        parentContainer != null &&
        parentContainer.className.trim() !== '' &&
        parentContainer.className.includes('disabled') &&
        !disabled
      ) {
        const newClassName = parentContainer.className.replace('disabled', '').trim()
        parentContainer.className = newClassName
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 Corrected parent class:`,
          {
            newClass: newClassName,
            disabled
          }
        )
      }
      const forceUpdate = (): void => {
        if (textNode?.className.includes('disabled') && !disabled) {
          textNode.className = `nodeText ${disabled ? 'disabled' : ''}`
          console.log(
      `[${new Date().toISOString()}] [${F}] 🔍 Forced DOM update:`,
      {
        newClass: textNode.className,
        disabled
      }
          )
        }

        if (container?.className.includes('disabled') && !disabled) {
          container.className = `gateway-paybutton gateway-paybutton-fixed ${disabled ? 'disabled' : ''}`
          console.log(
      `[${new Date().toISOString()}] [${F}] 🔍 Forced container update:`,
      {
        newClass: container.className,
        disabled
      }
          )
        }
        if (
          parentContainer?.className.includes('disabled') === true && !disabled
        ) {
          parentContainer.className = parentContainer.className
            .replace('disabled', '')
            .trim()
          console.log(
    `[${new Date().toISOString()}] [${F}] 🔍 Forced parent update:`,
    {
      newClass: parentContainer.className,
      disabled
    }
          )
        }
      }
      forceUpdate()
      setTimeout(forceUpdate, 100)
      console.log(
        `[${new Date().toISOString()}] [${F}] 🔍 Updated DOM class on mount (useLayoutEffect):`,
        {
          containerClass: container.className,
          textClass: textNode.className,
          disabled,
          disabledAttr: textNode.hasAttribute('disabled'),
          style: textNode.style.cssText
        }
      )
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] [${F}] ❌ Failed to initialize DOM:`,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }, [
    initialPaymentId,
    buttonId,
    merchant,
    amount,
    variable,
    disabled,
    multiUse
  ])

  /**
   * Handles pay.js script loading and DOM mutation observation.
   * @function handleScriptAndMutations
   */
  useEffect(() => {
    try {
      const container = containerRef.current
      const textNode = nodeTextRef.current
      const parentContainer = container?.parentElement
      if ((container == null) || (textNode == null) || (parentContainer == null)) return

      checkAndCorrectClass(textNode, container, parentContainer)

      // --- robust pay.js detection (no hard-coded host) ---
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const baseGuess =
        ((window as any).__GATEWAY_API_BASE__ as string | undefined)?.replace(
          /\/+$/,
          ''
        ) || CONFIG.API_BASE.replace(/\/+$/, '')
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const scripts = document.getElementsByTagName('script')
      let payScript: HTMLScriptElement | null = null

      for (let i = 0; i < scripts.length; i++) {
        const src = scripts[i].getAttribute('src') || ''
        try {
          const u = new URL(src, window.location.href)
          // accept any origin; just ensure it’s the pay.js asset (with optional query/hash)
          if (/\/pay\.js(?:[?#].*)?$/i.test(u.pathname + u.search + u.hash)) {
            payScript = scripts[i]
            break
          }
        } catch {
          // ignore malformed src values
        }
      }

      if (payScript != null) {
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 pay.js script detected:`,
          payScript.getAttribute('src')
        )
        const originalScript = payScript.outerHTML
        if (
          payScript.getAttribute('src') &&
          (document.querySelector(
            `script[src="${payScript.getAttribute('src')}"]`
          ) != null)
        ) {
          console.log(
            `[${new Date().toISOString()}] [${F}] 🔍 pay.js already loaded, original state:`,
            originalScript
          )
          checkAndCorrectClass(textNode, container, parentContainer)
        } else {
          payScript.addEventListener('load', () => {
            console.log(
              `[${new Date().toISOString()}] [${F}] 🔍 pay.js loaded, original state:`,
              originalScript
            )
            checkAndCorrectClass(textNode, container, parentContainer)
          })
        }
      } else {
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 No pay.js script found (base guess: ${baseGuess})`
        )
      }

      // Observe DOM changes to keep classes corrected
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (
            mutation.type === 'attributes' &&
            mutation.target === parentContainer
          ) {
            checkAndCorrectClass(textNode, container, parentContainer)
          } else if (
            mutation.type === 'childList' &&
            (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
          ) {
            checkAndCorrectClass(textNode, container, parentContainer)
          }
        })
      })
      observer.observe(parentContainer, {
        attributes: true,
        childList: true,
        subtree: true
      })

      return () => observer.disconnect() // Cleanup observer
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] [${F}] ❌ Failed to handle pay.js or mutations:`,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }, [disabled, containerRef, nodeTextRef])

  /**
   * Handles changes to the variable amount input.
   * @param {React.ChangeEvent<HTMLInputElement>} event - The input change event.
   * @returns {void}
   */
  const handleVariableAmountChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      try {
        const input = event.target.value.replace(/[^0-9]/g, '')
        const satValue = Math.max(
          1,
          Math.min(MAX_PAYMENT_SATS, Number(input) || 1)
        )
        setVariableAmount(satValue.toString())
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 Variable amount updated:`,
          satValue.toString()
        )
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
        if (disabled) {
          toast.error(
            'This button is disabled. Check required attributes or button status.'
          )
        }
        return
      }
      const target = e.nativeEvent.target as HTMLElement | null
      if ((target != null) && target.tagName === 'INPUT') {
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 Click on input field ignored`
        )
        return
      }
      setLoading(true)
      try {
        const effectiveAmount = variable ? Number(variableAmount) : amount
        if (
          !Number.isInteger(effectiveAmount) ||
          effectiveAmount <= 0 ||
          effectiveAmount > MAX_PAYMENT_SATS
        ) {
          throw new Error(
            `Invalid amount: must be a positive integer between 1 and ${MAX_PAYMENT_SATS}`
          )
        }
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 [Step 1] Client requested amount (sats):`,
          effectiveAmount
        )
        const wallet = new WalletClient('auto', CONFIG.WALLET_ORIGIN)
        const walletOutputs: ListOutputsResult | null = null
        const substrates = [
          { type: 'HTTPWalletJSON', substrate: 'json-api', skip: false },
          { type: 'HTTPWalletWire', substrate: 'Cicada', skip: false },
          {
            type: 'WindowCWISubstrate',
            substrate: 'window.CWI',
            skip: typeof window === 'undefined' || !(window as any).CWI
          },
          { type: 'XDMSubstrate', substrate: 'XDM', skip: false },
          {
            type: 'ReactNativeWebView',
            substrate: 'react-native',
            skip: false
          }
        ]
        for (const { type, substrate, skip } of substrates) {
          if (skip) {
            console.log(
              `[${new Date().toISOString()}] [${F}] 🔍 Skipping ${type} substrate (not available)`
            )
            continue
          }
          try {
            console.log(
              `[${new Date().toISOString()}] [${F}] 🔍 Attempting wallet connection with ${type} on ${CONFIG.WALLET_ORIGIN}`
            )
            const instance = new WalletClient(
              substrate as any,
              CONFIG.WALLET_ORIGIN
            )
            await Promise.race([
              instance.getVersion({}),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout on ${type}`)), 2000)
              )
            ])
            console.log(
              `[${new Date().toISOString()}] [${F}] ✅ Wallet version retrieved with ${type}`
            )
            wallet.substrate = instance.substrate
            break
          } catch (walletErr) {
            console.error(
              `[${new Date().toISOString()}] [${F}] ❌ Wallet connection failed with ${type}:`,
              walletErr instanceof Error ? walletErr.message : 'Unknown error'
            )
          }
        }
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 Wallet selected inputs:`,
          walletOutputs
        )
        let fetchedPaymentId = paymentId
        try {
          const base = getScriptOrigin()
          const url = `${base}/api/buttonCode/${paymentId}`
          const buttonCodeResponse = await fetchWithTimeout(
            url,
            { method: 'GET' },
            wallet
          )
          if (!buttonCodeResponse.ok) { throw new Error(`HTTP error: ${buttonCodeResponse.status}`) }
          const buttonCodeData: ButtonCodeResponse =
            await buttonCodeResponse.json()
          if (
            buttonCodeData.status === 'success' &&
            buttonCodeData.payment_id
          ) {
            fetchedPaymentId = buttonCodeData.payment_id
            console.log(
              `[${new Date().toISOString()}] [${F}] 🔍 [client] Fetched paymentId:`,
              fetchedPaymentId
            )
          }
        } catch (fetchError) {
          console.error(
            `[${new Date().toISOString()}] [${F}] ❌ [client] Button code fetch error:`,
            fetchError instanceof Error ? fetchError.message : 'Unknown error'
          )
        }
        const base = getScriptOrigin()
        const url = `${base}/api/invoice`
        const resInv = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-bsv-server': serverIdentityKey
            },
            body: JSON.stringify({
              merchantId: merchant,
              buttonId,
              paymentId: fetchedPaymentId,
              amount: effectiveAmount,
              description:
                containerRef.current?.parentElement?.getAttribute(
                  'data-description'
                ) || 'Default Description'
            })
          },
          wallet
        )

        if (!resInv.ok) {
          console.log(
            `[${new Date().toISOString()}] [${F}] ❌ Invoice request failed:`,
            {
              status: resInv.status,
              statusText: resInv.statusText
            }
          )
          throw new Error('Invoice request failed')
        }
        const invoice: InvoiceResponse = await resInv.json()
        if (invoice.status !== 'success') {
          console.log(
            `[${new Date().toISOString()}] [${F}] ❌ Invoice creation failed:`,
            invoice.message
          )
          if (
            invoice.message?.includes(
              'This single-use button has already been used'
            )
          ) {
            setDisabled(true)
            toast.warning(
              '⚠️ Button cannot be reused',
              {
                autoClose: 5000,
                position: 'top-right'
              }
            )
          }
          throw new Error(`Invoice creation failed: ${invoice.message ?? ''}`)
        }
        console.log(
          `[${new Date().toISOString()}] [${F}] ✅ [Step 3] Invoice received:`,
          invoice
        )
        if (invoice.paymentId && invoice.paymentId !== paymentId) {
          setPaymentId(invoice.paymentId)
          const isMultiUse = multiUse === 'true' || multiUse === true
          console.log(
            `[${new Date().toISOString()}] [${F}] 🔍 Setting paid state:`,
            {
              paid: true,
              isMultiUse,
              resettingTo: !isMultiUse
            }
          )
          console.log(
            `[${new Date().toISOString()}] [${F}] 🔍 Updated paymentId to:`,
            invoice.paymentId
          )
        }
        const outputsWithSats: CreateActionOutput[] =
          invoice.outputs?.map((output) => ({
            ...output,
            satoshis: output.satoshis
          })) ?? []
        if (
          variable &&
          (outputsWithSats.length > 0) &&
          outputsWithSats[0].satoshis === 0
        ) {
          outputsWithSats[0].satoshis = effectiveAmount
        }
        if (
          (outputsWithSats.length > 0) &&
          outputsWithSats[0].satoshis !== effectiveAmount
        ) {
          console.log(
            `[${new Date().toISOString()}] [${F}] ⚠️ Output satoshis mismatch:`,
            outputsWithSats[0].satoshis,
            'vs expected:',
            effectiveAmount
          )
        }
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 [Step 4] Client received outputs (sats):`,
          outputsWithSats
        )

        try {
          const createActionResult: CreateActionResult =
            await wallet.createAction({
              description: invoice.paymentId,
              outputs: outputsWithSats
            })
          console.log('result=', createActionResult)

          if (createActionResult.tx == null) {
            throw new Error('Transaction is undefined. Action may be delayed.')
          }
          if (!Array.isArray(createActionResult.tx)) {
            throw new Error('Invalid transaction: tx is not an array')
          }

          console.log(
            `[${new Date().toISOString()}] [${F}] ✅ [Step 6] Action created:`,
            createActionResult
          )
          let transaction, atomicBeefTx, txid
          try {
            transaction = Transaction.fromAtomicBEEF(createActionResult.tx)
            txid = transaction.id('hex')
            atomicBeefTx = Utils.toHex(createActionResult.tx)
            console.log(
              `[${new Date().toISOString()}] [${F}] ✅ [Step 8] Transaction serialized:`,
              {
                txid,
                atomicBeefTx
              }
            )
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
            payPayload
          )
          const payUrl = `${getScriptOrigin()}/api/pay`
          const resPay = await fetchWithTimeout(
            payUrl,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-bsv-server': serverIdentityKey
              },
              body: JSON.stringify(payPayload)
            },
            wallet
          )
          if (!resPay.ok) throw new Error('Payment request failed')
          const pay: PayResponse = await resPay.json()
          if (pay.status !== 'success') { throw new Error(`Payment processing failed: ${pay.message ?? ''}`) }
          console.log(
            `[${new Date().toISOString()}] [${F}] ✅ [Step 10] Payment processed by server:`,
            pay
          )
          setPaid(true)
          setTxid(pay.txid)
          setPaymentId(initialPaymentId)
          const isMultiUse = multiUse === 'true' || multiUse === true
          if (isMultiUse) setPaid(false)

          // Show success toast notification
          toast.success(
            `✅ Payment sent! ${effectiveAmount} sats`,
            {
              autoClose: 6000,
              position: 'top-right'
            }
          )
          console.log(
            `[${new Date().toISOString()}] [${F}] 🔍 Evaluating multiUse before check:`,
            {
              multiUse,
              type: typeof multiUse
            }
          )
          if (!isMultiUse && !variable && amount > 0) {
            setDisabled(true)
            console.log(
              `[${new Date().toISOString()}] [${F}] ✅ Button disabled: single-use payment completed`,
              {
                multiUse,
                isMultiUse
              }
            )
            toast.info(
              'ℹ️ Button used successfully',
              {
                autoClose: 4000,
                position: 'top-right'
              }
            )
          } else if (isMultiUse) {
            console.log(
              `[${new Date().toISOString()}] [${F}] 🔍 Button remains enabled: multi-use button`,
              {
                multiUse,
                isMultiUse
              }
            )
          }
          console.log(
            `[${new Date().toISOString()}] [${F}] ✅ Payment successful:`,
            pay
          )
        } catch (error: unknown) {
          if (error instanceof WERR_REVIEW_ACTIONS) {
            console.error('Wallet threw WERR_REVIEW_ACTIONS:', {
              code: error.code,
              message: error.message,
              reviewActionResults: error.reviewActionResults,
              sendWithResults: error.sendWithResults,
              txid: error.txid,
              tx: error.tx,
              noSendChange: error.noSendChange
            })
          } else if (error instanceof Error) {
            console.error('Failed with error status:', {
              message: error.message,
              name: error.name,
              stack: error.stack,
              error
            })
          } else {
            console.error('Failed with unknown error:', error)
          }
          throw error
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unexpected error'
        console.error(
          `[${new Date().toISOString()}] [${F}] ❌ Payment flow error:`,
          {
            message: errorMessage,
            stack: err instanceof Error ? err.stack : 'Unknown error'
          }
        )
        toast.error(`Payment failed: ${errorMessage}`)
      } finally {
        setLoading(false)
        console.log(
          `[${new Date().toISOString()}] [${F}] 🔍 Payment flow completed, loading set to false`
        )
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

  const renderButton = () => {
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
            <div
              ref={nodeTextRef}
              className={`nodeText ${disabled ? 'disabled' : ''}`}
            >
              {left}
              <input
                type='number'
                value={variableAmount}
                onChange={handleVariableAmountChange}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                min='1'
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
                aria-label='Variable payment amount'
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
          <div
            ref={nodeTextRef}
            className={`nodeText ${disabled ? 'disabled' : ''}`}
          >
            {loading ? loadingtext : buttonLabel}
          </div>
        </div>
      )
    }
    return (
      <div role='status'>
        Payment Submitted
        <br />
        TXID:{' '}
        <code>
          <a
            href={`https://whatsonchain.com/tx/${txid || ''}`}
            target='_blank'
            rel='noopener noreferrer'
          >
            {txid || ''}
          </a>
        </code>
      </div>
    )
  }

  return (
    <>
      {renderButton()}
      <ToastContainer
        position='top-right'
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnHover
        draggable
        limit={3}
      />
    </>
  )
}

export default PayButton
