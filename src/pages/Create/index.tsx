/**
 * @file src/pages/Create/index.tsx
 * @description Component for creating and managing payment buttons in the Gateway UI.
 * Allows users to configure button settings, generate button code, and copy it to the clipboard.
 * @version 1.0.1 (Updated 24Aug2025_2341 BST to fix ID reuse in handleCopyCode)
 * @author xAI (Grok 3)
 * @changelog
 * - 24Aug2025_1800 BST (v1.0.0): Initial creation with button creation and copy functionality.
 * - 24Aug2025_2341 BST (v1.0.1): Fixed handleCopyCode to generate new buttonId and paymentId for each copy action, removing showCode condition to prevent ID reuse.
 */
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
  useMemo
} from 'react'
import {
  Typography,
  Container,
  Grid,
  Box,
  InputAdornment,
  Tooltip,
  IconButton,
  RadioGroup,
  FormControlLabel,
  Radio,
  Card,
  Stack,
  Checkbox,
  Paper
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { WalletClient } from '@bsv/sdk'
import { Root, ContentWrap, CenteredHeader, TextFieldStyled } from './style'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import {
  atomDark,
  oneLight,
  vscDarkPlus
} from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from '@mui/material/styles'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { toast, ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { logWithTimestamp } from '../../utils/logging'
import { CONFIG, MAX_PAYMENT_SATS } from '../../utils/constants'
import { validateCSS, generateBase58 } from '../../utils/general'
import {
  initializeIds,
  InitializeIdsResponse
} from '../../utils/initializeIds'
import {
  fetchJsonWithAuth,
  fetchWithAuth,
  setApiDefaultWallet
} from '../../utils/api'
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs'
const F = 'pages/Create'

// Vite injects this at build time, declare for TS
declare const __SERVER_IDENTITY_KEY__: string

const debounce = (func: (...args: any[]) => void, wait: number) => {
  let timeout: number | null = null
  return (...args: any[]) => {
    if (timeout !== null) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

const sanitizeInput = (input: string): string => {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

const extractCSS = (html: string): string => {
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i)
  return (styleMatch != null) ? styleMatch[1].trim() : ''
}

interface CodeSnippetProps {
  code: string
  language: string
}

interface ButtonResponse {
  status: string
  message?: string
  paymentId: string
  buttonId: string
}

// Add just below `interface ButtonResponse`:
interface ButtonCodeResponse {
  status: 'success' | 'error'
  button_id: string
  payment_id: string
  message?: string
}

// Normalize CSS to use 4-space indentation for properties
const normalizeCSS = (css: string): string => {
  const lines = css.trim().split('\n')
  let output = ''
  let indentLevel = 0
  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue
    if (trimmedLine.startsWith('}')) {
      indentLevel = Math.max(0, indentLevel - 1)
    }
    output += `${'    '.repeat(indentLevel)}${trimmedLine}\n`
    if (trimmedLine.endsWith('{')) {
      indentLevel++
    }
  }
  return output.trim()
}

function formatHtml (html: string): string {
  try {
    return (window as any).prettier
      ? (window as any).prettier.format(html, { parser: 'html' })
      : html
  } catch {
    return html
  }
}

const CodeSnippet: React.FC<CodeSnippetProps> = ({ code, language }) => {
  const theme = useTheme()
  const normalizedCode = useMemo(() => {
    // First trim trailing whitespace, then pretty-print HTML if applicable
    let cleaned = code.replace(/\s+$/, '')
    if (language === 'html') {
      cleaned = formatHtml(cleaned)
    }
    return cleaned
  }, [code, language])

  return (
    <Box
      component={Paper}
      variant='outlined'
      sx={{ p: 2, backgroundColor: theme.palette.background.paper }}
    >
      <SyntaxHighlighter
        language={language}
        style={theme.palette.mode === 'dark' ? vscDarkPlus : docco}
        customStyle={{ margin: 0, padding: 0 }}
      >
        {normalizedCode}
      </SyntaxHighlighter>
    </Box>
  )
}

const Create: React.FC = () => {
  const theme = useTheme()
  const copyIconRef = useRef<HTMLSpanElement | null>(null)
  const previewContainerRef = useRef<HTMLDivElement | null>(null)
  const isMounted = useRef(false)
  const walletRef = useRef<WalletClient | null>(null)

  const [buttonText_fixed, setButtonText_fixed] = useState('Pay Now')
  const [buttonText_variable, setButtonText_variable] = useState('Pay Now')
  const [spendingDescription_fixed, setSpendingDescription_fixed] =
    useState('')
  const [spendingDescription_variable, setSpendingDescription_variable] =
    useState('')
  const [paymentType, setPaymentType] = useState<'fixed' | 'variable'>('fixed')
  const [fixedSatAmount, setFixedSatAmount] = useState('5')
  const [isSingleUse, setIsSingleUse] = useState(false) // Checkbox state: true = single-use, false = multi-use
  const multiUse = !isSingleUse // Map checkbox to multiUse
  const [merchant, setMerchant] = useState('')
  const [buttonID, setButtonID] = useState('')
  const [paymentID, setPaymentID] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [hasMetanet, setHasMetanet] = useState(false)
  const [copySuccess, setCopySuccess] = useState('')
  const [customCSS_fixed, setCustomCSS_fixed] = useState<string>(
    `<style>
  .gateway-paybutton-fixed {
    border-radius: 2em;
    border: none;
    padding: 0.7em 1em 0.7em 1em;
    min-width: 10em;
    background: linear-gradient(145deg, #3F51B5, #1C1C1F);
    color: #ffffff;
    box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.2);
    user-select: none;
    transition: all 0.3s;
    font-weight: bold;
    text-align: center;
  }
  .gateway-paybutton-fixed:hover {
    cursor: pointer;
    box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
    background: linear-gradient(145deg, #7986cb, #2A2A2E);
    color: #ffffff;
  }
  .gateway-paybutton-fixed.disabled {
    opacity: 0.4;
    background: gray;
    cursor: not-allowed;
    pointer-events: none;
  }
</style>
<div class="gateway-paybutton gateway-paybutton-fixed">Pay</div>`
  )
  const [customCSS_variable, setCustomCSS_variable] = useState<string>(
    `<style>
  .gateway-paybutton-variable {
    border-radius: 2em;
    border: none;
    padding: 0.7em 1em 0.7em 1em;
    min-width: 10em;
    background: linear-gradient(145deg, #3F51B5, #1C1C1F);
    color: #ffffff;
    box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.2);
    user-select: none;
    transition: all 0.3s;
    font-weight: bold;
    text-align: center;
  }
  .gateway-paybutton-variable:hover {
    cursor: pointer;
    box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
    background: linear-gradient(145deg, #7986cb, #1C1C1F);
    color: #ffffff;
  }
  .gateway-paybutton-variable.disabled {
    opacity: 0.4;
    background: gray;
    cursor: not-allowed;
    pointer-events: none;
  }
</style>
<div class="gateway-paybutton gateway-paybutton-variable" data-variable="true">Pay</div>`
  )
  const [lastValidCSS_fixed, setLastValidCSS_fixed] = useState(
    extractCSS(customCSS_fixed)
  )
  const [lastValidCSS_variable, setLastValidCSS_variable] = useState(
    extractCSS(customCSS_variable)
  )
  const [previewCode_fixed, setPreviewCode_fixed] = useState('')
  const [previewCode_variable, setPreviewCode_variable] = useState('')
  const [previewFixedHtml, setPreviewFixedHtml] = useState('')
  const [previewVariableHtml, setPreviewVariableHtml] = useState('')
  const [styleElement_fixed, setStyleElement_fixed] =
    useState<HTMLStyleElement | null>(null)
  const [styleElement_variable, setStyleElement_variable] =
    useState<HTMLStyleElement | null>(null)
  const [renderKey, setRenderKey] = useState(0)
  const [isCopyHovered, setIsCopyHovered] = useState(false)
  const [updateCounter, setUpdateCounter] = useState(0)
  const [isWalletReady, setIsWalletReady] = useState(false)
  const [ids, setIds] = useState<{ buttonId: string, paymentId: string }>({
    buttonId: '',
    paymentId: ''
  })

  // Canonical API host for embeds (no trailing slash)
  const PAY_BASE = CONFIG.PAY_BASE.replace(/\/+$/, '')
  logWithTimestamp(F, 'PAY_BASE:', PAY_BASE)
  const API_BASE = CONFIG.API_BASE.replace(/\/+$/, '')
  logWithTimestamp(F, 'API_BASE:', API_BASE)

  const generatePreviewHtml = useCallback(
    (type: 'fixed' | 'variable', description: string) => {
      logWithTimestamp(
        F,
        'generatePreviewHtml: Starting for type:',
        type,
        'current paymentType:',
        paymentType,
        'isSingleUse:',
        isSingleUse,
        'description:',
        description
      )
      const text =
        type === 'fixed'
          ? `${sanitizeInput(buttonText_fixed)} ${fixedSatAmount} Sats`
          : sanitizeInput(buttonText_variable)
      const previewClassName =
        type === 'fixed'
          ? 'gateway-paybutton gateway-paybutton-fixed'
          : 'gateway-paybutton gateway-paybutton-variable'
      const codeClassName =
        type === 'fixed'
          ? `gateway-paybutton gateway-paybutton-fixed${isSingleUse ? ' disabled' : ''}`
          : `gateway-paybutton gateway-paybutton-variable${isSingleUse ? ' disabled' : ''}`
      const safeDescription = sanitizeInput(
        description || `Payment using paymentId: ${ids.paymentId || ''}`
      )
      const cssToUse =
        type === 'fixed'
          ? validateCSS(extractCSS(customCSS_fixed))
            ? extractCSS(customCSS_fixed)
            : lastValidCSS_fixed
          : validateCSS(extractCSS(customCSS_variable))
            ? extractCSS(customCSS_variable)
            : lastValidCSS_variable
      let previewHtml = ''
      let codeHtml = ''
      if (type === 'fixed') {
        previewHtml = formatHtml(
          `<div class="${previewClassName}" style="width: fit-content; margin: 0 auto; display: block" data-amount="${fixedSatAmount}" data-text="${text}" data-description="${safeDescription}" data-buttonId="${ids.buttonId}" data-paymentId="${ids.paymentId}" data-multi-use="${!isSingleUse}">${text}</div>`
        )
        codeHtml = formatHtml(`<style>
${normalizeCSS(cssToUse)}
</style>
<div
  id="${ids.buttonId}"
  class="${codeClassName}"
  data-merchant="${merchant || 'temp-merchant'}"
  data-buttonId="${ids.buttonId}"
  data-paymentId="${ids.paymentId}"
  data-amount="${fixedSatAmount}"
  data-text="${text}"
  data-description="${safeDescription}"
  data-width="fit-content"
  data-multi-use="${!isSingleUse}">${text}</div>`)
        setPreviewFixedHtml(previewHtml)
        setPreviewCode_fixed(codeHtml)
        logWithTimestamp(
          F,
          'generatePreviewHtml: Fixed preview HTML set:',
          previewHtml,
          'code HTML:',
          codeHtml
        )
      } else {
        previewHtml = formatHtml(
          `<div class="${previewClassName}" style="width: fit-content; margin: 0 auto; display: block" data-text="${text}" data-description="${safeDescription}" data-buttonId="${ids.buttonId}" data-paymentId="${ids.paymentId}" data-variable="true" data-multi-use="${!isSingleUse}">${text} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`
        )
        codeHtml = formatHtml(`<style>
${normalizeCSS(cssToUse)}
</style>
<div
  id="${ids.buttonId}"
  class="${codeClassName}"
  data-merchant="${merchant || 'temp-merchant'}"
  data-buttonId="${ids.buttonId}"
  data-paymentId="${ids.paymentId}"
  data-text="${text}"
  data-description="${safeDescription}"
  data-variable="true"
  data-width="fit-content"
  data-multi-use="${!isSingleUse}">${text} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`)
        setPreviewVariableHtml(previewHtml)
        setPreviewCode_variable(codeHtml)
        logWithTimestamp(
          F,
          'generatePreviewHtml: Variable preview HTML set:',
          previewHtml,
          'code HTML:',
          codeHtml
        )
      }
      logWithTimestamp(
        F,
        'generatePreviewHtml: Completed generation for type:',
        type
      )
    },
    [
      paymentType,
      buttonText_fixed,
      buttonText_variable,
      fixedSatAmount,
      ids,
      customCSS_fixed,
      customCSS_variable,
      lastValidCSS_fixed,
      lastValidCSS_variable,
      isSingleUse,
      merchant
    ]
  )

  const updatePreviewCodes = useCallback(() => {
    logWithTimestamp(
      F,
      'updatePreviewCodes: Starting update for paymentType:',
      paymentType,
      'merchant:',
      merchant,
      'fixedDescription:',
      spendingDescription_fixed,
      'variableDescription:',
      spendingDescription_variable,
      'buttonID:',
      buttonID,
      'paymentID:',
      paymentID
    )
    const fixedDescription =
      spendingDescription_fixed || `Payment using paymentId: ${paymentID}`
    const variableDescription =
      spendingDescription_variable || `Payment using paymentId: ${paymentID}`
    const fixedText = `${buttonText_fixed} ${fixedSatAmount} Sats`
    const fixedCode = `<style>\n${
      validateCSS(extractCSS(customCSS_fixed))
        ? extractCSS(customCSS_fixed).trim()
        : lastValidCSS_fixed.trim()
    }\n</style>\n<div id="${buttonID}"\n class="gateway-paybutton gateway-paybutton-fixed${
      isSingleUse ? ' disabled' : ''
    }"\n data-merchant="${
      merchant || 'temp-merchant'
    }"\n data-buttonId="${buttonID}"\n data-paymentId="${paymentID}"\n data-amount="${fixedSatAmount}"\n data-text="${fixedText}"\n data-description="${sanitizeInput(fixedDescription)}"\n data-width="fit-content"\n data-multi-use="${!isSingleUse}">${fixedText}</div>`
    const variableCode = `<style>\n${
      validateCSS(extractCSS(customCSS_variable))
        ? extractCSS(customCSS_variable).trim()
        : lastValidCSS_variable.trim()
    }\n</style>\n<div id="${buttonID}"\n class="gateway-paybutton gateway-paybutton-variable${
      isSingleUse ? ' disabled' : ''
    }"\n data-merchant="${
      merchant || 'temp-merchant'
    }"\n data-buttonId="${buttonID}"\n data-paymentId="${paymentID}"\n data-text="${buttonText_variable}"\n data-description="${sanitizeInput(variableDescription)}"\n data-variable="true"\n data-width="fit-content"\n data-multi-use="${!isSingleUse}">${buttonText_variable} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`
    logWithTimestamp(
      F,
      'updatePreviewCodes: Generated HTML code - fixed:',
      fixedCode.substring(0, 50) + '...',
      'variable:',
      variableCode.substring(0, 50) + '...'
    )
    setPreviewCode_fixed(fixedCode)
    setPreviewCode_variable(variableCode)
    setUpdateCounter((prev) => prev + 1)
    if (styleElement_fixed != null) {
      styleElement_fixed.textContent = validateCSS(extractCSS(customCSS_fixed))
        ? extractCSS(customCSS_fixed)
        : lastValidCSS_fixed
      logWithTimestamp(
        F,
        'updatePreviewCodes: Re-applied fixed CSS to style element:',
        (validateCSS(extractCSS(customCSS_fixed))
          ? extractCSS(customCSS_fixed)
          : lastValidCSS_fixed
        ).substring(0, 50) + '...'
      )
    }
    if (styleElement_variable != null) {
      styleElement_variable.textContent = validateCSS(
        extractCSS(customCSS_variable)
      )
        ? extractCSS(customCSS_variable)
        : lastValidCSS_variable
      logWithTimestamp(
        F,
        'updatePreviewCodes: Re-applied variable CSS to style element:',
        (validateCSS(extractCSS(customCSS_variable))
          ? extractCSS(customCSS_variable)
          : lastValidCSS_variable
        ).substring(0, 50) + '...'
      )
    }
    generatePreviewHtml('fixed', fixedDescription)
    generatePreviewHtml('variable', variableDescription)
    logWithTimestamp(
      F,
      'updatePreviewCodes: Previews generated for paymentType:',
      paymentType
    )
  }, [
    customCSS_fixed,
    customCSS_variable,
    fixedSatAmount,
    merchant,
    buttonText_fixed,
    buttonText_variable,
    spendingDescription_fixed,
    spendingDescription_variable,
    buttonID,
    paymentID,
    paymentType,
    styleElement_fixed,
    styleElement_variable,
    lastValidCSS_fixed,
    lastValidCSS_variable,
    setPreviewCode_fixed,
    setPreviewCode_variable,
    setUpdateCounter,
    generatePreviewHtml,
    isSingleUse
  ])

  useEffect(() => {
    logWithTimestamp(
      F,
      'useEffect: Loading initial values for merchant:',
      merchant
    )
    if (merchant) {
      const loadedButtonText_fixed =
        localStorage.getItem(`buttonText_fixed_${merchant}`) || 'Pay Now'
      const loadedButtonText_variable =
        localStorage.getItem(`buttonText_variable_${merchant}`) || 'Pay Now'
      const loadedSpendingDescription_fixed =
        localStorage.getItem(`spendingDescription_fixed_${merchant}`) || ''
      const loadedSpendingDescription_variable =
        localStorage.getItem(`spendingDescription_variable_${merchant}`) || ''
      const loadedPaymentType =
        (localStorage.getItem(`paymentType_${merchant}`) as
          | 'fixed'
          | 'variable') || 'fixed'
      const loadedFixedSatAmount =
        localStorage.getItem(`fixedSatAmount_${merchant}`) || '5'
      const loadedIsSingleUse =
        localStorage.getItem(`isSingleUse_${merchant}`) === 'true'
      const loadedCustomCSS_fixed =
        localStorage.getItem(`customCSS_fixed_${merchant}`) || customCSS_fixed
      const loadedCustomCSS_variable =
        localStorage.getItem(`customCSS_variable_${merchant}`) ||
        customCSS_variable
      const loadedButtonID = localStorage.getItem(`buttonID_${merchant}`) || ''
      const loadedPaymentID =
        localStorage.getItem(`paymentID_${merchant}`) || ''
      const loadedButtonInit =
        localStorage.getItem(`idsInitializedbutton_${merchant}`) === 'true'
      const loadedPaymentInit =
        localStorage.getItem(`idsInitializedpayment_${merchant}`) === 'true'

      if (loadedButtonText_fixed !== buttonText_fixed) { setButtonText_fixed(loadedButtonText_fixed) }
      if (loadedButtonText_variable !== buttonText_variable) { setButtonText_variable(loadedButtonText_variable) }
      if (loadedSpendingDescription_fixed !== spendingDescription_fixed) { setSpendingDescription_fixed(loadedSpendingDescription_fixed) }
      if (loadedSpendingDescription_variable !== spendingDescription_variable) { setSpendingDescription_variable(loadedSpendingDescription_variable) }
      if (loadedPaymentType !== paymentType) setPaymentType(loadedPaymentType)
      if (loadedFixedSatAmount !== fixedSatAmount) { setFixedSatAmount(loadedFixedSatAmount) }
      if (loadedIsSingleUse !== isSingleUse) setIsSingleUse(loadedIsSingleUse)
      if (loadedCustomCSS_fixed !== customCSS_fixed) {
        setCustomCSS_fixed(loadedCustomCSS_fixed)
        setLastValidCSS_fixed(extractCSS(loadedCustomCSS_fixed))
      }
      if (loadedCustomCSS_variable !== customCSS_variable) {
        setCustomCSS_variable(loadedCustomCSS_variable)
        setLastValidCSS_variable(extractCSS(loadedCustomCSS_variable))
      }
      if (loadedButtonID !== buttonID) setButtonID(loadedButtonID)
      if (loadedPaymentID !== paymentID) setPaymentID(loadedPaymentID)

      logWithTimestamp(
        F,
        'useEffect: Loaded initial values from localStorage',
        {
          merchant,
          loadedButtonID,
          loadedPaymentID,
          loadedButtonInit,
          loadedPaymentInit,
          loadedIsSingleUse
        }
      )
    }
  }, [merchant])

  useEffect(() => {
    logWithTimestamp(
      F,
      '@version v4.9.91 (Updated 18Aug2025_1117 BST to fix invalid ID resets, ensure persistence, maintain description consistency, support multi-use button)'
    )
    logWithTimestamp(F, 'useEffect: Starting initialization process')
    const initializeIfNeeded = async () => {
      let merchantId: string | undefined
      let wallet: WalletClient = new WalletClient('auto', CONFIG.WALLET_ORIGIN)
      const clearClientSession = async () => {
        try {
          wallet = new WalletClient('auto', CONFIG.WALLET_ORIGIN)
          await wallet.connectToSubstrate()
          logWithTimestamp(F, 'useEffect: Cleared client-side session data')
        } catch (err: any) {
          logWithTimestamp(
            F,
            '❌ useEffect: Failed to clear client-side session:',
            err
          )
        }
      }
      const substrates = [
        { type: 'HTTPWalletJSON', substrate: 'json-api' as const, skip: false },
        { type: 'HTTPWalletWire', substrate: 'Cicada' as const, skip: false },
        {
          type: 'WindowCWISubstrate',
          substrate: 'window.CWI' as const,
          skip: typeof window === 'undefined' || !(window as any).CWI
        },
        { type: 'XDMSubstrate', substrate: 'XDM' as const, skip: false },
        {
          type: 'ReactNativeWebView',
          substrate: 'react-native' as const,
          skip: false
        }
      ]
      const initializeWallet = async (retry = false): Promise<boolean> => {
        if (retry) await clearClientSession()
        for (const { type, substrate, skip } of substrates) {
          if (skip) {
            logWithTimestamp(
              F,
              `useEffect: Skipping ${type} substrate (not available)`
            )
            continue
          }
          try {
            logWithTimestamp(
              F,
              `useEffect: Attempting wallet connection with ${type} on ${CONFIG.WALLET_ORIGIN}`
            )
            wallet = new WalletClient(substrate, CONFIG.WALLET_ORIGIN)
            await wallet.connectToSubstrate()
            const authResult = await wallet.isAuthenticated({})
            if (authResult.authenticated) {
              logWithTimestamp(
                F,
                `useEffect: Wallet authenticated with ${type}`
              )
              walletRef.current = wallet
              setApiDefaultWallet(wallet)
              setIsWalletReady(true)
              return true
            }
            await wallet.waitForAuthentication({})
            logWithTimestamp(
              F,
              `useEffect: Wallet authentication completed with ${type}`
            )
            walletRef.current = wallet
            setApiDefaultWallet(wallet)
            setIsWalletReady(true)
            return true
          } catch (walletErr) {
            logWithTimestamp(
              F,
              `❌ useEffect: Wallet connection failed with ${type} on ${CONFIG.WALLET_ORIGIN}:`,
              walletErr
            )
          }
        }
        return false
      }
      try {
        let walletConnected = await initializeWallet()
        if (!walletConnected) {
          logWithTimestamp(
            F,
            '❌ useEffect: Initial wallet connection failed, retrying'
          )
          for (let i = 0; i < 2; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
            walletConnected = await initializeWallet(true)
            if (walletConnected) break
          }
          if (!walletConnected) { throw new Error('Failed to connect to wallet after retries') }
        }
        const identity = (await Promise.race([
          wallet.getPublicKey({ identityKey: true }) as Promise<{
            publicKey: string
          }>,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('wallet.getPublicKey timed out')),
              5000
            )
          )
        ])) as { publicKey: string }
        logWithTimestamp(F, 'useEffect: Wallet public key response:', identity)
        if (!identity || !identity.publicKey) { throw new Error('Invalid identity returned from wallet') }
        merchantId = identity.publicKey
        setMerchant(merchantId)
        setHasMetanet(true)
        logWithTimestamp(
          F,
          'useEffect: Merchant identity fetched:',
          merchantId
        )
      } catch (walletError: any) {
        logWithTimestamp(
          F,
          '❌ useEffect: Wallet fetch error:',
          walletError.message
        )
        if (walletError.message.includes('Session not found for nonce')) {
          logWithTimestamp(
            F,
            'useEffect: Detected stale session, reinitializing wallet'
          )
          const walletConnected = await initializeWallet(true)
          if (walletConnected) {
            try {
              const identity = (await Promise.race([
                wallet.getPublicKey({ identityKey: true }) as Promise<{
                  publicKey: string
                }>,
                new Promise((_, reject) =>
                  setTimeout(
                    () => reject(new Error('wallet.getPublicKey timed out')),
                    5000
                  )
                )
              ])) as { publicKey: string }
              if (!identity || !identity.publicKey) { throw new Error('Invalid identity after retry') }
              merchantId = identity.publicKey
              setMerchant(merchantId)
              setHasMetanet(true)
              logWithTimestamp(
                F,
                'useEffect: Wallet reinitialized, merchant ID:',
                merchantId
              )
            } catch (retryError: any) {
              logWithTimestamp(
                F,
                '❌ useEffect: Wallet reinitialization failed:',
                retryError.message
              )
              setHasMetanet(false)
              merchantId = generateBase58(12)
              setMerchant(merchantId)
              logWithTimestamp(
                F,
                'useEffect: Using temporary merchant ID:',
                merchantId
              )
              toast.error(
                `❌ Failed to fetch wallet identity after retry: ${retryError.message}`
              )
            }
          } else {
            setHasMetanet(false)
            merchantId = generateBase58(12)
            setMerchant(merchantId)
            logWithTimestamp(
              F,
              'useEffect: Using temporary merchant ID:',
              merchantId
            )
            toast.error(
              `❌ Failed to connect to wallet: ${walletError.message}`
            )
          }
        } else {
          setHasMetanet(false)
          merchantId = generateBase58(12)
          setMerchant(merchantId)
          logWithTimestamp(
            F,
            'useEffect: Using temporary merchant ID:',
            merchantId
          )
          toast.error(
            `❌ Failed to fetch wallet identity: ${walletError.message}`
          )
        }
      }
      if (!merchantId) throw new Error('Merchant ID not set')
      const sessionFlag = sessionStorage.getItem('createPageLoaded')
      const navType = performance.navigation.type
      let serverStatus = { isRestarted: false }
      try {
        const res = await fetchWithAuth('/getStatus', { method: 'GET' })
        serverStatus = await res.json()
        logWithTimestamp(F, 'useEffect: Server status:', serverStatus)
      } catch (err: any) {
        logWithTimestamp(
          F,
          '❌ useEffect: Failed to fetch server status:',
          err
        )
      }
      const validReferrers = ['/buttons', '/actions', '/payments']
      const referrer = document.referrer || ''
      const isValidReferrer = validReferrers.some((path) =>
        referrer.includes(path)
      )
      const isServerRestart =
        !sessionFlag ||
        navType === 0 ||
        navType === 1 ||
        serverStatus.isRestarted
      logWithTimestamp(
        F,
        'useEffect: Server restart check - sessionFlag:',
        sessionFlag,
        'navType:',
        navType,
        'isServerRestart:',
        isServerRestart,
        'isValidReferrer:',
        isValidReferrer
      )
      let validButtonID = localStorage.getItem(`buttonID_${merchantId}`) || ''
      let validPaymentID =
        localStorage.getItem(`paymentID_${merchantId}`) || ''
      const buttonInitialized =
        localStorage.getItem(`idsInitializedbutton_${merchantId}`) === 'true'
      const paymentInitialized =
        localStorage.getItem(`idsInitializedpayment_${merchantId}`) === 'true'
      logWithTimestamp(F, 'useEffect: Loaded persisted IDs:', {
        validButtonID,
        validPaymentID,
        buttonInitialized,
        paymentInitialized
      })
      if (
        !validButtonID ||
        !validPaymentID ||
        !buttonInitialized ||
        !paymentInitialized ||
        isServerRestart
      ) {
        try {
          const defaultDescription = `Payment using ${'button'} ID: ${generateBase58(
            12
          )}` // Temporary description
          const buttonResponse: InitializeIdsResponse = await initializeIds(
            'button',
            wallet,
            '',
            merchantId,
            setButtonID,
            setSpendingDescription_fixed,
            setSpendingDescription_variable,
            undefined,
            false
          )
          if (buttonResponse.status !== 'success') {
            throw new Error(
              `Button ID initialization failed: ${buttonResponse.message}`
            )
          }
          validButtonID = buttonResponse.id || generateBase58(12)
          localStorage.setItem(`buttonID_${merchantId}`, validButtonID)
          localStorage.setItem(`idsInitializedbutton_${merchantId}`, 'true')
          logWithTimestamp(
            F,
            'useEffect: Button ID initialized:',
            validButtonID
          )
          const paymentResponse: InitializeIdsResponse = await initializeIds(
            'payment',
            wallet,
            '',
            merchantId,
            setPaymentID,
            setSpendingDescription_fixed,
            setSpendingDescription_variable,
            undefined,
            false
          )
          if (paymentResponse.status !== 'success') {
            throw new Error(
              `Payment ID initialization failed: ${paymentResponse.message}`
            )
          }
          validPaymentID = paymentResponse.id || generateBase58(12)
          localStorage.setItem(`paymentID_${merchantId}`, validPaymentID)
          localStorage.setItem(`idsInitializedpayment_${merchantId}`, 'true')
          // CPR enable-copy: ensure state even on fallback init
          setButtonID(validButtonID)
          setPaymentID(validPaymentID)
          // CPR enable-copy: final guarantee UI reflects chosen IDs
          setButtonID(validButtonID)
          setPaymentID(validPaymentID)
          setIds({ buttonId: validButtonID, paymentId: validPaymentID })
          logWithTimestamp(
            F,
            'useEffect: Payment ID initialized:',
            validPaymentID
          )
        } catch (err: any) {
          logWithTimestamp(
            F,
            '❌ useEffect: Failed to initialize IDs:',
            err.message
          )
          validButtonID = generateBase58(12)
          validPaymentID = generateBase58(12)
          localStorage.setItem(`buttonID_${merchantId}`, validButtonID)
          localStorage.setItem(`paymentID_${merchantId}`, validPaymentID)
          localStorage.setItem(`idsInitializedbutton_${merchantId}`, 'true')
          localStorage.setItem(`idsInitializedpayment_${merchantId}`, 'true')
          toast.error(`❌ Failed to initialize IDs: ${err.message}`)
        }
      } else {
        logWithTimestamp(F, 'useEffect: Validating persisted IDs', {
          merchant: merchantId,
          validButtonID,
          validPaymentID
        })
        const validateIds = async () => {
          try {
            const data = await fetchJsonWithAuth<ButtonCodeResponse>(
              `/buttonCode/${encodeURIComponent(validButtonID)}`,
              { method: 'GET' }
            )
            logWithTimestamp(F, 'useEffect: Button code response', {
              status: data.status,
              buttonId: data.button_id,
              paymentId: data.payment_id
            })
            if (
              data.status !== 'success' ||
              data.button_id !== validButtonID ||
              data.payment_id !== validPaymentID
            ) {
              logWithTimestamp(
                F,
                'useEffect: Invalid persisted IDs, generating new ones',
                {
                  validButtonID,
                  validPaymentID
                }
              )
              localStorage.removeItem(`buttonID_${merchantId}`)
              localStorage.removeItem(`paymentID_${merchantId}`)
              localStorage.removeItem(`idsInitializedbutton_${merchantId}`)
              localStorage.removeItem(`idsInitializedpayment_${merchantId}`)
              validButtonID = generateBase58(12)
              validPaymentID = generateBase58(12)
              localStorage.setItem(`buttonID_${merchantId}`, validButtonID)
              localStorage.setItem(`paymentID_${merchantId}`, validPaymentID)
              localStorage.setItem(
                `idsInitializedbutton_${merchantId}`,
                'true'
              )
              localStorage.setItem(
                `idsInitializedpayment_${merchantId}`,
                'true'
              )
              setButtonID(validButtonID)
              setPaymentID(validPaymentID)
              setIds({ buttonId: validButtonID, paymentId: validPaymentID })
              const newDescription = `Payment using paymentId: ${validPaymentID}`
              setSpendingDescription_fixed(newDescription)
              setSpendingDescription_variable(newDescription)
              localStorage.setItem(
                `spendingDescription_fixed_${merchantId}`,
                newDescription
              )
              localStorage.setItem(
                `spendingDescription_variable_${merchantId}`,
                newDescription
              )
              const fixedText = `${buttonText_fixed} ${fixedSatAmount} Sats`
              const fixedPreviewHtml = formatHtml(
                `<div class="gateway-paybutton gateway-paybutton-fixed" style="width: fit-content; margin: 0 auto; display: block" data-amount="${fixedSatAmount}" data-text="${fixedText}" data-description="${sanitizeInput(
                  newDescription
                )}" data-buttonId="${validButtonID}" data-paymentId="${validPaymentID}" data-multi-use="${!isSingleUse}">${fixedText}</div>`
              )
              const variablePreviewHtml = formatHtml(
                `<div class="gateway-paybutton gateway-paybutton-variable" style="width: fit-content; margin: 0 auto; display: block" data-text="${buttonText_variable}" data-description="${sanitizeInput(
                  newDescription
                )}" data-buttonId="${validButtonID}" data-paymentId="${validPaymentID}" data-variable="true" data-multi-use="${!isSingleUse}">${buttonText_variable} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`
              )
              setPreviewFixedHtml(fixedPreviewHtml)
              setPreviewVariableHtml(variablePreviewHtml)
              generatePreviewHtml(paymentType, newDescription)
              setUpdateCounter((prev) => prev + 1)
              logWithTimestamp(
                F,
                'useEffect: Reinitialized IDs and updated previews',
                {
                  validButtonID,
                  validPaymentID,
                  isSingleUse
                }
              )
            } else {
              logWithTimestamp(F, 'useEffect: Valid persisted IDs', {
                validButtonID,
                validPaymentID
              })
              setIds({ buttonId: validButtonID, paymentId: validPaymentID })
            }
          } catch (err: any) {
            logWithTimestamp(F, '❌ useEffect: Failed to validate IDs', {
              error: err.message
            })
            toast.error('❌ Failed to validate IDs', { autoClose: 5000 })
            validButtonID = generateBase58(12)
            validPaymentID = generateBase58(12)
            localStorage.setItem(`buttonID_${merchantId}`, validButtonID)
            localStorage.setItem(`paymentID_${merchantId}`, validPaymentID)
            localStorage.setItem(`idsInitializedbutton_${merchantId}`, 'true')
            localStorage.setItem(`idsInitializedpayment_${merchantId}`, 'true')
            setButtonID(validButtonID)
            setPaymentID(validPaymentID)
            setIds({ buttonId: validButtonID, paymentId: validPaymentID })
            const newDescription = `Payment using paymentId: ${validPaymentID}`
            setSpendingDescription_fixed(newDescription)
            setSpendingDescription_variable(newDescription)
            localStorage.setItem(
              `spendingDescription_fixed_${merchantId}`,
              newDescription
            )
            localStorage.setItem(
              `spendingDescription_variable_${merchantId}`,
              newDescription
            )
            const fixedText = `${buttonText_fixed} ${fixedSatAmount} Sats`
            const fixedPreviewHtml = formatHtml(
              `<div class="gateway-paybutton gateway-paybutton-fixed" style="width: fit-content; margin: 0 auto; display: block" data-amount="${fixedSatAmount}" data-text="${fixedText}" data-description="${sanitizeInput(
                newDescription
              )}" data-buttonId="${validButtonID}" data-paymentId="${validPaymentID}" data-multi-use="${!isSingleUse}">${fixedText}</div>`
            )
            const variablePreviewHtml = formatHtml(
              `<div class="gateway-paybutton gateway-paybutton-variable" style="width: fit-content; margin: 0 auto; display: block" data-text="${buttonText_variable}" data-description="${sanitizeInput(
                newDescription
              )}" data-buttonId="${validButtonID}" data-paymentId="${validPaymentID}" data-variable="true" data-multi-use="${!isSingleUse}">${buttonText_variable} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`
            )
            setPreviewFixedHtml(fixedPreviewHtml)
            setPreviewVariableHtml(variablePreviewHtml)
            generatePreviewHtml(paymentType, newDescription)
            setUpdateCounter((prev) => prev + 1)
            logWithTimestamp(
              F,
              'useEffect: Reinitialized IDs and updated previews after validation failure',
              {
                validButtonID,
                validPaymentID,
                isSingleUse
              }
            )
          }
        }
        validateIds()
      }
      setIds({ buttonId: validButtonID, paymentId: validPaymentID })
      logWithTimestamp(F, 'useEffect: Using validated IDs:', {
        validButtonID,
        validPaymentID
      })
      logWithTimestamp(
        F,
        'useEffect: Evaluating Copy icon disabled state:',
        !validButtonID || !validPaymentID
      )
      logWithTimestamp(F, 'useEffect: Completed initialization process', {
        finalButtonID: validButtonID,
        finalPaymentID: validPaymentID
      })
    }
    initializeIfNeeded().catch((err) => {
      logWithTimestamp(F, '❌ useEffect: Error in initialization:', err)
      toast.error(`❌ Initialization failed: ${err.message}`)
    })
  }, []) // Reverted to empty dependency array

  useEffect(() => {
    if (merchant) {
      localStorage.setItem(`buttonText_fixed_${merchant}`, buttonText_fixed)
      localStorage.setItem(
        `buttonText_variable_${merchant}`,
        buttonText_variable
      )
      localStorage.setItem(
        `spendingDescription_fixed_${merchant}`,
        spendingDescription_fixed
      )
      localStorage.setItem(
        `spendingDescription_variable_${merchant}`,
        spendingDescription_variable
      )
      localStorage.setItem(`paymentType_${merchant}`, paymentType)
      localStorage.setItem(`fixedSatAmount_${merchant}`, fixedSatAmount)
      localStorage.setItem(`isSingleUse_${merchant}`, isSingleUse.toString())
      localStorage.setItem(`customCSS_fixed_${merchant}`, customCSS_fixed)
      localStorage.setItem(
        `customCSS_variable_${merchant}`,
        customCSS_variable
      )
      localStorage.setItem(`buttonID_${merchant}`, buttonID)
      localStorage.setItem(`paymentID_${merchant}`, paymentID)
      logWithTimestamp(F, 'useEffect: Persisted state to localStorage', {
        buttonText_fixed,
        buttonText_variable,
        spendingDescription_fixed,
        spendingDescription_variable,
        paymentType,
        fixedSatAmount,
        isSingleUse,
        buttonID,
        paymentID
      })
    }
  }, [
    buttonText_fixed,
    buttonText_variable,
    spendingDescription_fixed,
    spendingDescription_variable,
    paymentType,
    fixedSatAmount,
    isSingleUse,
    customCSS_fixed,
    customCSS_variable,
    buttonID,
    paymentID,
    merchant
  ])

  useLayoutEffect(() => {
    logWithTimestamp(
      F,
      'useLayoutEffect: Running with hasMetanet:',
      hasMetanet,
      'isMounted:',
      isMounted.current
    )
    if (isMounted.current && hasMetanet) {
      if (copyIconRef.current != null) {
        copyIconRef.current.classList.add('preview-flash-copy')
        logWithTimestamp(
          F,
          'useLayoutEffect: Added flashCopy animation to Copy Icon'
        )
      }
    } else if (copyIconRef.current != null) {
      copyIconRef.current.classList.remove('preview-flash-copy')
      logWithTimestamp(
        F,
        'useLayoutEffect: Removed flashCopy animation from Copy Icon'
      )
    }
    isMounted.current = true
    logWithTimestamp(F, 'useLayoutEffect: Completed, isMounted set to true')
  }, [hasMetanet])

  useEffect(() => {
    logWithTimestamp(
      F,
      'useEffect: Updating UI for paymentType:',
      paymentType,
      'merchant:',
      merchant,
      'renderKey:',
      renderKey,
      'buttonID:',
      buttonID,
      'paymentID:',
      paymentID
    )
    if (merchant || !hasMetanet) {
      setRenderKey((prev) => prev + 1)
      updatePreviewCodes()
    }
    logWithTimestamp(
      F,
      'useEffect: Evaluating Copy icon disabled state:',
      !buttonID || !paymentID,
      'Single ID set:',
      !!buttonID && !!paymentID
    )
  }, [
    paymentType,
    merchant,
    hasMetanet,
    updatePreviewCodes,
    buttonID,
    paymentID
  ])

  useEffect(() => {
    const newStyleElement = document.createElement('style')
    newStyleElement.id = 'custom-button-styles-fixed'
    newStyleElement.textContent = validateCSS(extractCSS(customCSS_fixed))
      ? extractCSS(customCSS_fixed)
      : lastValidCSS_fixed
    document.head.appendChild(newStyleElement)
    setStyleElement_fixed(newStyleElement)
    logWithTimestamp(
      F,
      'useEffect: Applied fixed CSS to document head:',
      (validateCSS(extractCSS(customCSS_fixed))
        ? extractCSS(customCSS_fixed)
        : lastValidCSS_fixed
      ).substring(0, 50) + '...'
    )
    if (previewContainerRef.current != null) {
      generatePreviewHtml(
        'fixed',
        spendingDescription_fixed ||
          `Payment using paymentId: ${paymentID || ''}`
      )
      logWithTimestamp(
        F,
        'useEffect: Generated fixed preview HTML in container'
      )
    }
    return () => {
      document.head.removeChild(newStyleElement)
      logWithTimestamp(
        F,
        'useEffect: Removed fixed style element from document head'
      )
    }
  }, [customCSS_fixed, lastValidCSS_fixed, paymentID])

  useEffect(() => {
    const newStyleElement = document.createElement('style')
    newStyleElement.id = 'custom-button-styles-variable'
    newStyleElement.textContent = validateCSS(extractCSS(customCSS_variable))
      ? extractCSS(customCSS_variable)
      : lastValidCSS_variable
    document.head.appendChild(newStyleElement)
    setStyleElement_variable(newStyleElement)
    logWithTimestamp(
      F,
      'useEffect: Applied variable CSS to document head:',
      (validateCSS(extractCSS(customCSS_variable))
        ? extractCSS(customCSS_variable)
        : lastValidCSS_variable
      ).substring(0, 50) + '...'
    )
    if (previewContainerRef.current != null) {
      generatePreviewHtml(
        'variable',
        spendingDescription_variable ||
          `Payment using paymentId: ${paymentID || ''}`
      )
      logWithTimestamp(
        F,
        'useEffect: Generated variable preview HTML in container'
      )
    }
    return () => {
      document.head.removeChild(newStyleElement)
      logWithTimestamp(
        F,
        'useEffect: Removed variable style element from document head'
      )
    }
  }, [customCSS_variable, lastValidCSS_variable, paymentID])

  useEffect(() => {
    if ((copyIconRef.current != null) && (!buttonID || !paymentID)) {
      copyIconRef.current.classList.add('preview-flash-copy')
      logWithTimestamp(
        F,
        'useEffect: Added preview-flash-copy class to Copy Icon for visibility'
      )
    } else if ((copyIconRef.current != null) && buttonID && paymentID) {
      copyIconRef.current.classList.remove('preview-flash-copy')
      logWithTimestamp(
        F,
        'useEffect: Removed preview-flash-copy class from Copy Icon'
      )
    }
    if (previewContainerRef.current != null) {
      previewContainerRef.current.classList.add('create-page')
      logWithTimestamp(
        F,
        'useEffect: Applied create-page class to preview container for styling'
      )
    }
    updatePreviewCodes()
    logWithTimestamp(
      F,
      'useEffect: Completed effect for buttonID and preview container updates'
    )
  }, [buttonID, paymentID, previewContainerRef, updatePreviewCodes])

  useEffect(() => {
    logWithTimestamp(
      F,
      'useEffect: Updating descriptions for paymentID change',
      'paymentID:',
      paymentID,
      'fixedSatAmount:',
      fixedSatAmount || '5'
    )
    if (paymentID && merchant) {
      const persistedFixedDescription =
        localStorage.getItem(`spendingDescription_fixed_${merchant}`) ||
        `Payment using paymentId: ${paymentID}`
      const persistedVariableDescription =
        localStorage.getItem(`spendingDescription_variable_${merchant}`) ||
        `Payment using paymentId: ${paymentID}`
      if (
        persistedFixedDescription !== spendingDescription_fixed ||
        persistedVariableDescription !== spendingDescription_variable
      ) {
        setSpendingDescription_fixed(persistedFixedDescription)
        setSpendingDescription_variable(persistedVariableDescription)
        logWithTimestamp(
          F,
          'useEffect: Updated descriptions from localStorage',
          {
            persistedFixedDescription,
            persistedVariableDescription
          }
        )
      }
      generatePreviewHtml('fixed', persistedFixedDescription)
      generatePreviewHtml('variable', persistedVariableDescription)
      updatePreviewCodes()
      logWithTimestamp(
        F,
        'useEffect: Regenerated previews for paymentID change',
        {
          paymentID,
          isSingleUse,
          multiUse: !isSingleUse
        }
      )
    }
  }, [
    paymentID,
    merchant,
    updatePreviewCodes,
    spendingDescription_fixed,
    spendingDescription_variable,
    generatePreviewHtml,
    isSingleUse
  ])

  const handleCustomCSSChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const value = event.target.value
    if (paymentType === 'fixed') {
      setCustomCSS_fixed(value)
      if (!validateCSS(extractCSS(value))) {
        toast.warn(
          '⚠️ Invalid CSS syntax detected (e.g., unbalanced parentheses or invalid linear-gradient). Preview may not render correctly.',
          { autoClose: 5000 }
        )
        logWithTimestamp(
          F,
          'handleCustomCSSChange: Invalid fixed CSS input:',
          value.substring(0, 50) + '...'
        )
      } else {
        setLastValidCSS_fixed(extractCSS(value))
        logWithTimestamp(
          F,
          'handleCustomCSSChange: Valid fixed CSS input:',
          value.substring(0, 50) + '...'
        )
      }
    } else {
      setCustomCSS_variable(value)
      if (!validateCSS(extractCSS(value))) {
        toast.warn(
          '⚠️ Invalid CSS syntax detected (e.g., unbalanced parentheses or invalid linear-gradient). Preview may not render correctly.',
          { autoClose: 5000 }
        )
        logWithTimestamp(
          F,
          'handleCustomCSSChange: Invalid variable CSS input:',
          value.substring(0, 50) + '...'
        )
      } else {
        setLastValidCSS_variable(extractCSS(value))
        logWithTimestamp(
          F,
          'handleCustomCSSChange: Valid variable CSS input:',
          value.substring(0, 50) + '...'
        )
      }
    }
    updatePreviewCodes()
    logWithTimestamp(
      F,
      'handleCustomCSSChange: Completed update for paymentType:',
      paymentType
    )
  }

  const validateCSSOnBlur = (
    value: string,
    type: 'fixed' | 'variable'
  ): void => {
    if (!validateCSS(extractCSS(value))) {
      toast.warn(
        '⚠️ Invalid CSS syntax. Reverting to last valid CSS for generation.',
        { autoClose: 5000 }
      )
      if (type === 'fixed') {
        setCustomCSS_fixed(
          `<style>\n  ${lastValidCSS_fixed}</style>\n<div class="gateway-paybutton gateway-paybutton-fixed">Pay</div>`
        )
        logWithTimestamp(
          F,
          'validateCSSOnBlur: Reverted to last valid fixed CSS due to invalid input:',
          lastValidCSS_fixed.substring(0, 50) + '...'
        )
      } else {
        setCustomCSS_variable(
          `<style>\n  ${lastValidCSS_variable}</style>\n<div class="gateway-paybutton gateway-paybutton-variable" data-variable="true">Pay</div>`
        )
        logWithTimestamp(
          F,
          'validateCSSOnBlur: Reverted to last valid variable CSS due to invalid input:',
          lastValidCSS_variable.substring(0, 50) + '...'
        )
      }
    } else {
      if (type === 'fixed') {
        setLastValidCSS_fixed(extractCSS(value))
        setCustomCSS_fixed(value)
        logWithTimestamp(
          F,
          'validateCSSOnBlur: Updated last valid fixed CSS with valid input:',
          extractCSS(value).substring(0, 50) + '...'
        )
      } else {
        setLastValidCSS_variable(extractCSS(value))
        setCustomCSS_variable(value)
        logWithTimestamp(
          F,
          'validateCSSOnBlur: Updated last valid variable CSS with valid input:',
          extractCSS(value).substring(0, 50) + '...'
        )
      }
    }
    updatePreviewCodes()
    logWithTimestamp(
      F,
      'validateCSSOnBlur: Completed validation for type:',
      type
    )
  }

  const debouncedValidateCSS = debounce(validateCSSOnBlur, 500)

  const handleCustomCSSBlur = (
    event: React.FocusEvent<HTMLInputElement>
  ): void => {
    const value = event.target.value
    debouncedValidateCSS(value, paymentType)
    logWithTimestamp(
      F,
      'handleCustomCSSBlur: Triggered debounced validation for paymentType:',
      paymentType
    )
  }

  const handleButtonTextChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const { name, value } = event.target
    if (name === 'buttonText') {
      const sanitizedValue = sanitizeInput(value.slice(0, 80))
      if (value.length > 80) {
        toast.error('❌ Button text must be 80 characters or less')
      }
      if (paymentType === 'fixed') {
        setButtonText_fixed(sanitizedValue)
      } else {
        setButtonText_variable(sanitizedValue)
      }
      logWithTimestamp(
        F,
        'handleButtonTextChange: Updated button text for paymentType:',
        paymentType,
        'value:',
        sanitizedValue
      )
    } else if (name === 'spendingDescription') {
      const sanitizedValue = sanitizeInput(value.slice(0, 80))
      if (value.length > 80) {
        toast.error('❌ Spending description must be 80 characters or less')
      }
      if (paymentType === 'fixed') {
        setSpendingDescription_fixed(sanitizedValue)
      } else {
        setSpendingDescription_variable(sanitizedValue)
      }
      logWithTimestamp(
        F,
        'handleButtonTextChange: Updated spending description for paymentType:',
        paymentType,
        'value:',
        sanitizedValue
      )
    }
    updatePreviewCodes()
    logWithTimestamp(
      F,
      'handleButtonTextChange: Completed update for paymentType:',
      paymentType
    )
  }

  const handlePaymentTypeChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ): void => {
    logWithTimestamp(
      F,
      'handlePaymentTypeChange: Before update - current paymentType:',
      paymentType,
      'new value:',
      event.target.value
    )
    const newType = event.target.value as 'fixed' | 'variable'
    setPaymentType(newType)
    setShowCode(false)
    logWithTimestamp(
      F,
      'handlePaymentTypeChange: After update - new paymentType:',
      newType
    )
    updatePreviewCodes()
    logWithTimestamp(
      F,
      'handlePaymentTypeChange: Completed update for new paymentType:',
      newType
    )
  }

  const handleFixedSatChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const input = event.target.value.replace(/[^0-9]/g, '')
    const satValue = Math.max(
      1,
      Math.min(MAX_PAYMENT_SATS, Number(input) || 5)
    )
    setFixedSatAmount(satValue.toString())
    logWithTimestamp(F, 'handleFixedSatChange: Updated to', satValue)
    updatePreviewCodes()
    logWithTimestamp(
      F,
      'handleFixedSatChange: Completed update for fixedSatAmount:',
      satValue
    )
  }

  const resetAll = async () => {
    logWithTimestamp(F, 'resetAll: Starting full reset of page fields')
    try {
      const keysToClear = [
        `buttonID_${merchant}`,
        `paymentID_${merchant}`,
        `spendingDescription_fixed_${merchant}`,
        `spendingDescription_variable_${merchant}`,
        `buttonText_fixed_${merchant}`,
        `buttonText_variable_${merchant}`,
        `paymentType_${merchant}`,
        `fixedSatAmount_${merchant}`,
        `isSingleUse_${merchant}`,
        `customCSS_fixed_${merchant}`,
        `customCSS_variable_${merchant}`,
        `idsInitializedbutton_${merchant}`,
        `idsInitializedpayment_${merchant}`
      ]
      keysToClear.forEach((k) => localStorage.removeItem(k))
      logWithTimestamp(
        F,
        'resetAll: Cleared merchant-scoped localStorage keys'
      )
      // localStorage.clear()
      // logWithTimestamp(F, 'resetAll: Cleared all localStorage keys')
      const newButtonId = generateBase58(12)
      const newPaymentId = generateBase58(12)
      const w = walletRef.current
      if (w == null) {
        toast.error('❌ Wallet not ready')
        return
      }

      await initializeIds(
        'button',
        w,
        newButtonId,
        merchant,
        setButtonID,
        setSpendingDescription_fixed,
        setSpendingDescription_variable
      )
      await initializeIds(
        'payment',
        w,
        newPaymentId,
        merchant,
        setPaymentID,
        setSpendingDescription_fixed,
        setSpendingDescription_variable
      )
      setIds((prev) => {
        const newState = { buttonId: newButtonId, paymentId: newPaymentId }
        const newFixedDescription = `Payment using paymentId: ${newPaymentId}`
        const newVariableDescription = `Payment using paymentId: ${newPaymentId}`
        setButtonID(newButtonId)
        setPaymentID(newPaymentId)
        setButtonText_fixed('Pay Now')
        setButtonText_variable('Pay Now')
        setSpendingDescription_fixed(newFixedDescription)
        setSpendingDescription_variable(newVariableDescription)
        setPaymentType('fixed')
        setFixedSatAmount('5')
        setIsSingleUse(false)
        const fixedCSS = `<style>
  .gateway-paybutton-fixed {
    border-radius: 2em;
    border: none;
    padding: 0.7em 1em 0.7em 1em;
    min-width: 10em;
    background: linear-gradient(145deg, #3F51B5, #1C1C1F);
    color: #ffffff;
    box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.2);
    user-select: none;
    transition: all 0.3s;
    font-weight: bold;
    text-align: center;
  }
  .gateway-paybutton-fixed:hover {
    cursor: pointer;
    box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
    background: linear-gradient(145deg, #7986cb, #2A2A2E);
    color: #ffffff;
  }
</style>
<div class="gateway-paybutton gateway-paybutton-fixed">Pay</div>`
        const variableCSS = `<style>
  .gateway-paybutton-variable {
    border-radius: 2em;
    border: none;
    padding: 0.7em 1em 0.7em 1em;
    min-width: 10em;
    background: linear-gradient(145deg, #3F51B5, #1C1C1F);
    color: #ffffff;
    box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.2);
    user-select: none;
    transition: all 0.3s;
    font-weight: bold;
    text-align: center;
  }
  .gateway-paybutton-variable:hover {
    cursor: pointer;
    box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
    background: linear-gradient(145deg, #7986cb, #1C1C1F);
    color: #ffffff;
  }
</style>
<div class="gateway-paybutton gateway-paybutton-variable" data-variable="true">Pay</div>`
        setCustomCSS_fixed(fixedCSS)
        setCustomCSS_variable(variableCSS)
        setLastValidCSS_fixed(extractCSS(fixedCSS))
        setLastValidCSS_variable(extractCSS(variableCSS))
        setShowCode(false)
        setCopySuccess('')
        if (merchant) {
          localStorage.setItem(`buttonID_${merchant}`, newButtonId)
          localStorage.setItem(`paymentID_${merchant}`, newPaymentId)
          localStorage.setItem(
            `spendingDescription_fixed_${merchant}`,
            newFixedDescription
          )
          localStorage.setItem(
            `spendingDescription_variable_${merchant}`,
            newVariableDescription
          )
          localStorage.setItem(`buttonText_fixed_${merchant}`, 'Pay Now')
          localStorage.setItem(`buttonText_variable_${merchant}`, 'Pay Now')
          localStorage.setItem(`paymentType_${merchant}`, 'fixed')
          localStorage.setItem(`fixedSatAmount_${merchant}`, '5')
          localStorage.setItem(`isSingleUse_${merchant}`, 'false')
          localStorage.setItem(`customCSS_fixed_${merchant}`, fixedCSS)
          localStorage.setItem(`customCSS_variable_${merchant}`, variableCSS)
        }
        // Regenerate previews to ensure multiUse consistency
        const fixedText = `Pay Now ${fixedSatAmount} Sats`
        const fixedPreviewHtml = formatHtml(
          `<div class="gateway-paybutton gateway-paybutton-fixed" style="width: fit-content; margin: 0 auto; display: block" data-amount="${fixedSatAmount}" data-text="${fixedText}" data-description="${sanitizeInput(
            newFixedDescription
          )}" data-buttonId="${newButtonId}" data-paymentId="${newPaymentId}" data-multi-use="true">${fixedText}</div>`
        )
        const variablePreviewHtml = formatHtml(
          `<div class="gateway-paybutton gateway-paybutton-variable" style="width: fit-content; margin: 0 auto; display: block" data-text="Pay Now" data-description="${sanitizeInput(
            newVariableDescription
          )}" data-buttonId="${newButtonId}" data-paymentId="${newPaymentId}" data-variable="true" data-multi-use="true">Pay Now <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`
        )
        setPreviewFixedHtml(fixedPreviewHtml)
        setPreviewVariableHtml(variablePreviewHtml)
        setRenderKey((prev) => prev + 1)
        updatePreviewCodes()
        logWithTimestamp(
          F,
          'resetAll: Successfully reset all fields and updated localStorage',
          {
            newButtonId,
            newPaymentId,
            fixedSatAmount: '5',
            paymentType: 'fixed',
            isSingleUse: false,
            multiUse: true,
            fixedDescription: newFixedDescription,
            variableDescription: newVariableDescription,
            fixedCSS: fixedCSS.substring(0, 50) + '...',
            variableCSS: variableCSS.substring(0, 50) + '...',
            fixedPreviewHtml: fixedPreviewHtml.substring(0, 50) + '...',
            variablePreviewHtml: variablePreviewHtml.substring(0, 50) + '...'
          }
        )
        toast.success('All fields reset successfully')
        return newState
      })
    } catch (err) {
      logWithTimestamp(F, '❌ resetAll: Failed to reset fields:', err)
      toast.error('❌ Failed to reset fields')
    }
  }

  const handleCopyCode = async (): Promise<void> => {
    logWithTimestamp(
      F,
      'handleCopyCode: Starting with isSingleUse:',
      isSingleUse,
      'multiUse:',
      !isSingleUse,
      'persisted isSingleUse:',
      localStorage.getItem(`isSingleUse_${merchant}`)
    )
    if (!merchant) {
      toast.error(
        '❌ Merchant identity not available. Retrying initialization...',
        { autoClose: 5000 }
      )
      logWithTimestamp(F, 'handleCopyCode: Merchant identity not available', {
        merchant
      })
      return
    }
    if (!buttonID || !paymentID) {
      toast.error('❌ Button or payment ID not initialized', {
        autoClose: 5000
      })
      logWithTimestamp(
        F,
        'handleCopyCode: Button or payment ID not initialized',
        { buttonID, paymentID }
      )
      return
    }
    // Wait for DOM to update and target the correct preview div by class
    await new Promise((resolve) => setTimeout(resolve, 0)) // Microtask delay
    const previewDiv =
      previewContainerRef.current?.querySelector('.gateway-paybutton')
    const dataDescription = previewDiv?.getAttribute('data-description') || ''
    const description =
      paymentType === 'fixed'
        ? spendingDescription_fixed
        : spendingDescription_variable
    if (dataDescription !== description) {
      logWithTimestamp(
        F,
        '❌ handleCopyCode: Mismatch between data-description and description variable',
        {
          dataDescription,
          description,
          paymentType
        }
      )
      toast.error(
        `❌ Description mismatch: data-description (${dataDescription}) does not match ${paymentType} description (${description})`
      )
      return
    }
    // Use current IDs from state
    const currentButtonId = buttonID
    const currentPaymentId = paymentID
    const updatedDescription = sanitizeInput(
      description || `Payment using paymentId: ${currentPaymentId}`
    ).slice(0, 80)
    logWithTimestamp(F, 'handleCopyCode: Using current IDs and description', {
      currentButtonId,
      currentPaymentId,
      updatedDescription
    })
    // Use CSS from state
    const cssToUse =
      paymentType === 'fixed'
        ? validateCSS(extractCSS(customCSS_fixed))
          ? extractCSS(customCSS_fixed)
          : lastValidCSS_fixed
        : validateCSS(extractCSS(customCSS_variable))
          ? extractCSS(customCSS_variable)
          : lastValidCSS_variable
    logWithTimestamp(F, 'handleCopyCode: Using CSS:', {
      cssToUse: cssToUse.substring(0, 50) + '...'
    })
    const multiUse = !isSingleUse
    const fixedText = `${buttonText_fixed} ${fixedSatAmount} Sats`
    const buttonClass =
      paymentType === 'fixed'
        ? `gateway-paybutton gateway-paybutton-fixed${
            isSingleUse ? ' disabled' : ''
          }`
        : `gateway-paybutton gateway-paybutton-variable${
            isSingleUse ? ' disabled' : ''
          }`
    logWithTimestamp(
      F,
      'handleCopyCode: Generated buttonClass:',
      buttonClass,
      'isSingleUse:',
      isSingleUse,
      'multiUse:',
      multiUse
    )
    let htmlCode =
      paymentType === 'fixed'
        ? `<style>\n${cssToUse.trim()}\n</style>\n<div\n id="${currentButtonId}"\n class="${buttonClass}"\n data-merchant="${
            merchant || 'temp-merchant'
          }"\n data-buttonId="${currentButtonId}"\n data-paymentId="${currentPaymentId}"\n data-amount="${fixedSatAmount}"\n data-text="${fixedText}"\n data-description="${sanitizeInput(
            updatedDescription
          )}"\n data-width="fit-content"\n data-multi-use="${multiUse}">${fixedText}</div>`
        : `<style>\n${cssToUse.trim()}\n</style>\n<div\n id="${currentButtonId}"\n class="${buttonClass}"\n data-merchant="${
            merchant || 'temp-merchant'
          }"\n data-buttonId="${currentButtonId}"\n data-paymentId="${currentPaymentId}"\n data-text="${buttonText_variable}"\n data-description="${sanitizeInput(
            updatedDescription
          )}"\n data-variable="true"\n data-width="fit-content"\n data-multi-use="${multiUse}">${buttonText_variable} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`
    const payload = {
      variableAmount: paymentType === 'variable',
      multiUse,
      description: updatedDescription,
      htmlCode: cssToUse,
      paymentId: currentPaymentId,
      buttonId: currentButtonId,
      amount:
        paymentType === 'fixed' ? parseInt(fixedSatAmount || '5') : undefined
    }
    try {
      logWithTimestamp(F, 'handleCopyCode: Registering button with payload:', {
        ...payload,
        multiUse
      })

      // Call API (typed JSON helper) — no raw Response/responseText usage
      const createData = await fetchJsonWithAuth<ButtonResponse>(
        '/createButton',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bsv-server': __SERVER_IDENTITY_KEY__ // ✅ injected constant
          },
          body: JSON.stringify(payload)
        }
      )

      logWithTimestamp(F, 'handleCopyCode: Parsed response data:', createData)

      if (createData.status !== 'success') {
        throw new Error(
          createData.message ||
            '❌ Failed to create button due to invalid response'
        )
      }

      const serverButtonId = createData.buttonId || currentButtonId
      const serverPaymentId = createData.paymentId || currentPaymentId

      // Build final HTML with server-confirmed IDs
      htmlCode =
        paymentType === 'fixed'
          ? `<style>\n${cssToUse.trim()}\n</style>\n<div\n id="${serverButtonId}"\n class="${buttonClass}"\n data-merchant="${
              merchant || 'temp-merchant'
            }"\n data-buttonId="${serverButtonId}"\n data-paymentId="${serverPaymentId}"\n data-amount="${fixedSatAmount}"\n data-text="${fixedText}"\n data-description="${sanitizeInput(
              updatedDescription
            )}"\n data-width="fit-content"\n data-multi-use="${multiUse}">${fixedText}</div>`
          : `<style>\n${cssToUse.trim()}\n</style>\n<div\n id="${serverButtonId}"\n class="${buttonClass}"\n data-merchant="${
              merchant || 'temp-merchant'
            }"\n data-buttonId="${serverButtonId}"\n data-paymentId="${serverPaymentId}"\n data-text="${buttonText_variable}"\n data-description="${sanitizeInput(
              updatedDescription
            )}"\n data-variable="true"\n data-width="fit-content"\n data-multi-use="${multiUse}">${buttonText_variable} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`

      setPreviewCode_fixed(
        paymentType === 'fixed' ? htmlCode : previewCode_fixed
      )
      setPreviewCode_variable(
        paymentType === 'variable' ? htmlCode : previewCode_variable
      )

      const fixedPreviewHtml = formatHtml(
        `<div class="gateway-paybutton gateway-paybutton-fixed" style="width: fit-content; margin: 0 auto; display: block" data-amount="${fixedSatAmount}" data-text="${fixedText}" data-description="${sanitizeInput(
          updatedDescription
        )}" data-buttonId="${serverButtonId}" data-paymentId="${serverPaymentId}" data-multi-use="${multiUse}">${fixedText}</div>`
      )

      const variablePreviewHtml = formatHtml(
        `<div class="gateway-paybutton gateway-paybutton-variable" style="width: fit-content; margin: 0 auto; display: block" data-text="${buttonText_variable}" data-description="${sanitizeInput(
          updatedDescription
        )}" data-buttonId="${serverButtonId}" data-paymentId="${serverPaymentId}" data-variable="true" data-multi-use="${multiUse}">${buttonText_variable} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`
      )

      setPreviewFixedHtml(fixedPreviewHtml)
      setPreviewVariableHtml(variablePreviewHtml)
      generatePreviewHtml(paymentType, updatedDescription)
      setShowCode(true)

      logWithTimestamp(
        F,
        'handleCopyCode: Button registered with ID:',
        serverButtonId,
        'and paymentId:',
        serverPaymentId,
        'multiUse:',
        multiUse
      )

      // Generate new IDs for the next button
      try {
        // Clear localStorage to force new ID generation
        localStorage.removeItem(`buttonID_${merchant}`)
        localStorage.removeItem(`paymentID_${merchant}`)
        localStorage.removeItem(`idsInitializedbutton_${merchant}`)
        localStorage.removeItem(`idsInitializedpayment_${merchant}`)
        logWithTimestamp(
          F,
          'handleCopyCode: Cleared localStorage for new ID generation',
          { merchant }
        )
        const newButtonId = generateBase58(12)
        const newPaymentId = generateBase58(12)
        logWithTimestamp(F, 'handleCopyCode: Attempting to generate new IDs', {
          newButtonId,
          newPaymentId
        })
        const w = walletRef.current
        if (w == null) {
          toast.error('❌ Wallet not ready')
          return
        }
        const buttonResponse = await initializeIds(
          'button',
          w,
          newButtonId,
          merchant,
          setButtonID,
          setSpendingDescription_fixed,
          setSpendingDescription_variable,
          undefined,
          true // Force new ID generation
        )
        if (buttonResponse.status !== 'success') {
          throw new Error(
            buttonResponse.message || 'Failed to initialize new button ID'
          )
        }
        const validatedButtonId = buttonResponse.id || newButtonId
        const paymentResponse = await initializeIds(
          'payment',
          w,
          newPaymentId,
          merchant,
          setPaymentID,
          setSpendingDescription_fixed,
          setSpendingDescription_variable,
          validatedButtonId,
          true // Force new ID generation
        )
        if (paymentResponse.status !== 'success') {
          throw new Error(
            paymentResponse.message || 'Failed to initialize new payment ID'
          )
        }
        const validatedPaymentId = paymentResponse.id || newPaymentId
        setIds({ buttonId: validatedButtonId, paymentId: validatedPaymentId })
        localStorage.setItem(`buttonID_${merchant}`, validatedButtonId)
        localStorage.setItem(`paymentID_${merchant}`, validatedPaymentId)
        localStorage.setItem(`idsInitializedbutton_${merchant}`, 'true')
        localStorage.setItem(`idsInitializedpayment_${merchant}`, 'true')
        const newFixedDescription = sanitizeInput(
          `Payment using paymentId: ${validatedPaymentId}`
        ).slice(0, 80)
        const newVariableDescription = sanitizeInput(
          `Payment using paymentId: ${validatedPaymentId}`
        ).slice(0, 80)
        setSpendingDescription_fixed(newFixedDescription)
        setSpendingDescription_variable(newVariableDescription)
        localStorage.setItem(
          `spendingDescription_fixed_${merchant}`,
          newFixedDescription
        )
        localStorage.setItem(
          `spendingDescription_variable_${merchant}`,
          newVariableDescription
        )
        logWithTimestamp(
          F,
          'handleCopyCode: Generated new IDs and descriptions for next button:',
          {
            validatedButtonId,
            validatedPaymentId,
            newFixedDescription,
            newVariableDescription
          }
        )
      } catch (err: any) {
        logWithTimestamp(
          F,
          '❌ handleCopyCode: Failed to initialize new IDs for next button:',
          { error: err.message }
        )
        toast.error('❌ Failed to initialize new IDs for next button', {
          autoClose: 5000
        })
      }

      const scriptTag = `<script src="${CONFIG.PAY_BASE}/pay.js" defer></script>`
      const codeToCopy = `${htmlCode}\n${scriptTag}`
      logWithTimestamp(
        F,
        'handleCopyCode: Attempting to copy code:',
        codeToCopy.substring(0, 50) + '...',
        'isSingleUse:',
        isSingleUse,
        'multiUse:',
        multiUse
      )
      await navigator.clipboard.writeText(codeToCopy)
      setCopySuccess('success')
      setTimeout(() => setCopySuccess(''), 2000)
      toast.success(
        `${
          paymentType === 'fixed' ? 'Fixed' : 'Variable'
        } button copied to clipboard (${
          multiUse ? 'Multi Use' : 'Single Use'
        })`,
        { autoClose: 5000 }
      )
      logWithTimestamp(
        F,
        'handleCopyCode: Copied to clipboard successfully, multiUse:',
        multiUse
      )
    } catch (err: any) {
      setCopySuccess('failed')
      // ✅ Safe fallback: if no wallet auth available, call cleanupIds via plain fetch
      if (!merchant) {
        logWithTimestamp(
          F,
          '⚠️ No merchant available, using HTTP cleanup fallback'
        )
        await fetch(`${API_BASE}/cleanupIds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buttonId: currentButtonId,
            paymentId: currentPaymentId,
            merchantId: merchant
          })
        })
        return
      }
      try {
        const res = await fetchWithAuth('/cleanupIds', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bsv-server': __SERVER_IDENTITY_KEY__
          },
          body: JSON.stringify({
            buttonId: currentButtonId,
            paymentId: currentPaymentId,
            merchantId: merchant
          })
        })

        if (res.ok) {
          logWithTimestamp(F, '✅ handleCopyCode: Cleaned up orphaned IDs:', {
            currentPaymentId,
            currentButtonId
          })
        } else {
          logWithTimestamp(
            F,
            '❌ handleCopyCode: Failed to clean up orphaned IDs:',
            {
              status: res.status
            }
          )
        }
      } catch (cleanupErr: any) {
        logWithTimestamp(
          F,
          '❌ handleCopyCode: Failed to clean up orphaned IDs:',
          cleanupErr.message
        )
      }
      toast.error('❌ Failed to copy code: ' + err.message, {
        autoClose: 5000
      })
      logWithTimestamp(
        F,
        '❌ handleCopyCode: Failed to copy code:',
        err.message,
        {
          error: err.message,
          stack: err.stack,
          payload
        }
      )
    }
  }

  return (
    <Root>
      <Container sx={{ ...(useTheme().templates?.page_wrap || {}) }}>
        <ContentWrap>
          <CenteredHeader>
            <Typography variant='h2'>Create Your Payment Button</Typography>
            <Typography variant='subtitle1'>
              Edit code live in the left panel to update the preview buttons for
              your site.
            </Typography>
          </CenteredHeader>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Stack spacing={3}>
                <Card>
                  <Typography variant='h3' sx={{ mb: 3 }}>
                    Button Details
                  </Typography>
                  <TextFieldStyled
                    label='Button Text'
                    name='buttonText'
                    value={
                      paymentType === 'fixed'
                        ? buttonText_fixed
                        : buttonText_variable
                    }
                    onChange={handleButtonTextChange}
                    fullWidth
                  />
                  <RadioGroup
                    value={paymentType}
                    onChange={handlePaymentTypeChange}
                    sx={{ display: 'flex', flexDirection: 'row' }}
                  >
                    <FormControlLabel
                      value='fixed'
                      control={<Radio />}
                      label='Fixed Amount'
                    />
                    <FormControlLabel
                      value='variable'
                      control={<Radio />}
                      label='Variable Amount'
                    />
                  </RadioGroup>
                  {paymentType === 'fixed' && (
                    <TextFieldStyled
                      label={`Fixed Sat Amount (1-${MAX_PAYMENT_SATS})`}
                      value={fixedSatAmount}
                      onChange={handleFixedSatChange}
                      type='number'
                      fullWidth
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position='start'>sat</InputAdornment>
                        )
                      }}
                    />
                  )}
                  <TextFieldStyled
                    label='Spending Description'
                    name='spendingDescription'
                    value={
                      paymentType === 'fixed'
                        ? spendingDescription_fixed
                        : spendingDescription_variable
                    }
                    onChange={handleButtonTextChange}
                    fullWidth
                  />
                  <Tooltip
                    title='Set single-use button, leave unchecked for multi-use (default)'
                    arrow
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={isSingleUse}
                          onChange={(event) => {
                            const value = event.target.checked
                            setIsSingleUse(value)
                            if (merchant) {
                              localStorage.setItem(
                                `isSingleUse_${merchant}`,
                                value.toString()
                              )
                              const disabledCSS = value
                                ? `.gateway-paybutton-${paymentType}.disabled {
                  opacity: 0.4;
                  background: gray;
                  cursor: not-allowed;
                  pointer-events: none;
                }`
                                : ''
                              const fixedBaseCSS = `<style>
  .gateway-paybutton-fixed {
    border-radius: 2em;
    border: none;
    padding: 0.7em 1em 0.7em 1em;
    min-width: 10em;
    background: linear-gradient(145deg, #3F51B5, #1C1C1F);
    color: #ffffff;
    box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.2);
    user-select: none;
    transition: all 0.3s;
    font-weight: bold;
    text-align: center;
  }
  .gateway-paybutton-fixed:hover {
    cursor: pointer;
    box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
    background: linear-gradient(145deg, #7986cb, #2A2A2E);
    color: #ffffff;
  }`
                              const variableBaseCSS = `<style>
  .gateway-paybutton-variable {
    border-radius: 2em;
    border: none;
    padding: 0.7em 1em 0.7em 1em;
    min-width: 10em;
    background: linear-gradient(145deg, #3F51B5, #1C1C1F);
    color: #ffffff;
    box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.2);
    user-select: none;
    transition: all 0.3s;
    font-weight: bold;
    text-align: center;
  }
  .gateway-paybutton-variable:hover {
    cursor: pointer;
    box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
    background: linear-gradient(145deg, #7986cb, #1C1C1F);
    color: #ffffff;
  }`
                              const fixedCSS = `${fixedBaseCSS}\n${disabledCSS}\n</style>\n<div class="gateway-paybutton gateway-paybutton-fixed">Pay</div>`
                              const variableCSS = `${variableBaseCSS}\n${disabledCSS}\n</style>\n<div class="gateway-paybutton gateway-paybutton-variable" data-variable="true">Pay</div>`
                              if (!validateCSS(extractCSS(fixedCSS))) {
                                logWithTimestamp(
                                  F,
                                  'handleSingleUseChange: Invalid fixed CSS, reverting to last valid:',
                                  lastValidCSS_fixed
                                )
                                setCustomCSS_fixed(
                                  `<style>\n  ${lastValidCSS_fixed}</style>\n<div class="gateway-paybutton gateway-paybutton-fixed">Pay</div>`
                                )
                              } else {
                                setCustomCSS_fixed(
                                  value
                                    ? fixedCSS
                                    : `${fixedBaseCSS}\n</style>\n<div class="gateway-paybutton gateway-paybutton-fixed">Pay</div>`
                                )
                                setLastValidCSS_fixed(
                                  extractCSS(
                                    value
                                      ? fixedCSS
                                      : `${fixedBaseCSS}\n</style>`
                                  )
                                )
                              }
                              if (!validateCSS(extractCSS(variableCSS))) {
                                logWithTimestamp(
                                  F,
                                  'handleSingleUseChange: Invalid variable CSS, reverting to last valid:',
                                  lastValidCSS_variable
                                )
                                setCustomCSS_variable(
                                  `<style>\n  ${lastValidCSS_variable}</style>\n<div class="gateway-paybutton gateway-paybutton-variable" data-variable="true">Pay</div>`
                                )
                              } else {
                                setCustomCSS_variable(
                                  value
                                    ? variableCSS
                                    : `${variableBaseCSS}\n</style>\n<div class="gateway-paybutton gateway-paybutton-variable" data-variable="true">Pay</div>`
                                )
                                setLastValidCSS_variable(
                                  extractCSS(
                                    value
                                      ? variableCSS
                                      : `${variableBaseCSS}\n</style>`
                                  )
                                )
                              }
                              localStorage.setItem(
                                `customCSS_fixed_${merchant}`,
                                value
                                  ? fixedCSS
                                  : `${fixedBaseCSS}\n</style>\n<div class="gateway-paybutton gateway-paybutton-fixed">Pay</div>`
                              )
                              localStorage.setItem(
                                `customCSS_variable_${merchant}`,
                                value
                                  ? variableCSS
                                  : `${variableBaseCSS}\n</style>\n<div class="gateway-paybutton gateway-paybutton-variable" data-variable="true">Pay</div>`
                              )
                              logWithTimestamp(
                                F,
                                `handleSingleUseChange: ${
                                  value ? 'Added' : 'Removed'
                                } .disabled CSS rule`,
                                {
                                  fixedCSS:
                                    (value
                                      ? fixedCSS
                                      : `${fixedBaseCSS}\n</style>\n<div class="gateway-paybutton gateway-paybutton-fixed">Pay</div>`
                                    ).substring(0, 50) + '...',
                                  variableCSS:
                                    (value
                                      ? variableCSS
                                      : `${variableBaseCSS}\n</style>\n<div class="gateway-paybutton gateway-paybutton-variable" data-variable="true">Pay</div>`
                                    ).substring(0, 50) + '...'
                                }
                              )
                              const fixedText = `${sanitizeInput(
                                buttonText_fixed
                              )} ${fixedSatAmount} Sats`
                              const variableText =
                                sanitizeInput(buttonText_variable)
                              const fixedDescription =
                                spendingDescription_fixed ||
                                `Payment using paymentId: ${paymentID}`
                              const variableDescription =
                                spendingDescription_variable ||
                                `Payment using paymentId: ${paymentID}`
                              const fixedPreviewClass = 'gateway-paybutton gateway-paybutton-fixed' // No disabled class for preview
                              const variablePreviewClass = 'gateway-paybutton gateway-paybutton-variable' // No disabled class for preview
                              const fixedCodeClass = `gateway-paybutton gateway-paybutton-fixed${
                                value ? ' disabled' : ''
                              }`
                              const variableCodeClass = `gateway-paybutton gateway-paybutton-variable${
                                value ? ' disabled' : ''
                              }`
                              const fixedPreviewHtml = formatHtml(
                                `<div class="${fixedPreviewClass}" style="width: fit-content; margin: 0 auto; display: block" data-amount="${fixedSatAmount}" data-text="${fixedText}" data-description="${sanitizeInput(
                                  fixedDescription
                                )}" data-buttonId="${buttonID}" data-paymentId="${paymentID}" data-multi-use="${!value}">${fixedText}</div>`
                              )
                              const variablePreviewHtml = formatHtml(
                                `<div class="${variablePreviewClass}" style="width: fit-content; margin: 0 auto; display: block" data-text="${variableText}" data-description="${sanitizeInput(
                                  variableDescription
                                )}" data-buttonId="${buttonID}" data-paymentId="${paymentID}" data-variable="true" data-multi-use="${!value}">${variableText} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`
                              )
                              const fixedCode = `<style>\n${extractCSS(
                                value ? fixedCSS : `${fixedBaseCSS}\n</style>`
                              ).trim()}\n</style>\n<div\n id="${buttonID}"\n class="${fixedCodeClass}"\n data-merchant="${
                                merchant || 'temp-merchant'
                              }"\n data-buttonId="${buttonID}"\n data-paymentId="${paymentID}"\n data-amount="${fixedSatAmount}"\n data-text="${fixedText}"\n data-description="${sanitizeInput(
                                fixedDescription
                              )}"\n data-width="fit-content"\n data-multi-use="${!value}">${fixedText}</div>`
                              const variableCode = `<style>\n${extractCSS(
                                value
                                  ? variableCSS
                                  : `${variableBaseCSS}\n</style>`
                              ).trim()}\n</style>\n<div\n id="${buttonID}"\n class="${variableCodeClass}"\n data-merchant="${
                                merchant || 'temp-merchant'
                              }"\n data-buttonId="${buttonID}"\n data-paymentId="${paymentID}"\n data-text="${variableText}"\n data-description="${sanitizeInput(
                                variableDescription
                              )}"\n data-variable="true"\n data-width="fit-content"\n data-multi-use="${!value}">${variableText} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`
                              setPreviewFixedHtml(fixedPreviewHtml)
                              setPreviewVariableHtml(variablePreviewHtml)
                              setPreviewCode_fixed(fixedCode)
                              setPreviewCode_variable(variableCode)
                              setUpdateCounter((prev) => prev + 1)
                              generatePreviewHtml(
                                paymentType,
                                paymentType === 'fixed'
                                  ? fixedDescription
                                  : variableDescription
                              )
                              logWithTimestamp(
                                F,
                                'handleSingleUseChange: Updated preview HTML and code block',
                                {
                                  fixedPreviewHtml:
                                    fixedPreviewHtml.substring(0, 50) + '...',
                                  variablePreviewHtml:
                                    variablePreviewHtml.substring(0, 50) +
                                    '...',
                                  fixedCode: fixedCode.substring(0, 50) + '...',
                                  variableCode:
                                    variableCode.substring(0, 50) + '...'
                                }
                              )
                            }
                            toast.info(
                              `Button set to ${
                                value ? 'Single Use' : 'Multi Use'
                              }`,
                              { autoClose: 3000 }
                            )
                            logWithTimestamp(
                              F,
                              'handleSingleUseChange: Updated isSingleUse:',
                              value,
                              'multiUse:',
                              !value
                            )
                          }}
                          sx={{ ml: 2 }}
                        />
                      }
                      label='Single Use'
                      sx={{ mt: 2 }}
                    />
                  </Tooltip>
                  <Box sx={{ mt: 2 }}>
                    <Tooltip title='Reset all fields to default values' arrow>
                      <IconButton
                        onClick={resetAll}
                        sx={{ color: 'primary.light' }}
                      >
                        <Typography>Reset</Typography>
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Card>
                <Card>
                  <Typography variant='h3' sx={{ mb: 3 }}>
                    Custom Styling
                  </Typography>
                  <TextFieldStyled
                    label='Custom CSS'
                    value={
                      paymentType === 'fixed'
                        ? customCSS_fixed
                        : customCSS_variable
                    }
                    onChange={handleCustomCSSChange}
                    onBlur={handleCustomCSSBlur}
                    fullWidth
                    multiline
                  />
                </Card>
              </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card>
                <Typography
                  variant='h3'
                  component='div'
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 3
                  }}
                >
                  Button Preview
                  <span
                    ref={copyIconRef}
                    onMouseEnter={() => setIsCopyHovered(true)}
                    onMouseLeave={() => setIsCopyHovered(false)}
                  >
                    <Tooltip
                      title={
                        buttonID && paymentID
                          ? 'Copy Code'
                          : 'Requires both IDs'
                      }
                      arrow
                    >
                      <span>
                        <IconButton
                          onClick={handleCopyCode}
                          disabled={!buttonID || !paymentID}
                          sx={{
                            ...(isCopyHovered && {
                              opacity: 0.7,
                              transition: 'opacity 0.3s'
                            })
                          }}
                        >
                          {copySuccess === 'success'
                            ? (
                              <CheckCircleIcon color='success' />
                              )
                            : (
                              <ContentCopyIcon />
                              )}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </span>
                </Typography>
                {typeof copySuccess === 'string' &&
                  copySuccess !== '' &&
                  copySuccess === 'failed' && (
                    <Typography color='error'>
                      ❌ Failed to copy code!
                    </Typography>
                )}
                <Box ref={previewContainerRef}>
                  <Box sx={{ mb: 2 }}>
                    <div
                      key={`preview-${updateCounter}`}
                      dangerouslySetInnerHTML={{
                        __html:
                          paymentType === 'fixed'
                            ? previewFixedHtml
                            : previewVariableHtml
                      }}
                    />
                  </Box>
                </Box>
                <Box>
                  <CodeSnippet
                    key={`code-${updateCounter}-${
                      paymentType === 'fixed'
                        ? previewCode_fixed
                        : previewCode_variable
                    }`}
                    language='html'
                    code={
                      paymentType === 'fixed'
                        ? previewCode_fixed
                        : previewCode_variable
                    }
                  />
                </Box>
                <Typography variant='h3' sx={{ mt: 2, mb: 3 }}>
                  Script for Head Tag
                </Typography>
                <Box>
                  <CodeSnippet
                    language='html'
                    code={`<script src="${CONFIG.PAY_BASE}/pay.js" defer></script>`}
                  />
                </Box>
              </Card>
            </Grid>
          </Grid>
        </ContentWrap>
      </Container>
      <ToastContainer
        position='top-right'
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnHover
        draggable
      />
    </Root>
  )
}

export default Create
