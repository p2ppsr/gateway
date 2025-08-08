/**
 * @file src/pages/Create/index.tsx
 *
 * Create Page — Allows users to configure and generate payment button code.
 *
 * Users can customize the button text, payment amount (fixed or variable in satoshis), spending description, and CSS styles.
 * Once configured, a button is created using the Metanet identity, and corresponding embeddable HTML
 * and script code is displayed, which can be copied for integration into websites.
 *
 * The page also checks for Metanet client presence and provides user feedback via toast notifications.
 * - Calls /api/createButton to register the button and get buttonId for the generated code, triggered by "Generate Button".
 * - Added "Generate Button" to finalize creation before copying, with live preview updates for editing.
 * - For variable payments, flags variableAmount=true with no default amount, leaving the amount fully
 * determined by the customer via pay.js prompt.
 * - Copies both the button HTML and the pay.js script tag as a single block for ease of use.
 * - Does not write to .html files; users manually add code to their webpages.
 * - Copy Code button is always visible, using a static image when disabled to ensure tooltip visibility, switching to an active icon after generation.
 * - Generated HTML includes default text and amount display for visible rendering even without pay.js.
 * - Preview aligns with generated button by defaulting to text-width, with optional data-width override and centering enforced.
 * - UI enhanced with continuous flashing effects with a 1-second period using CSS animations, flashing only the Copy Code icon initially (when disabled), and independent cross-flashing between Generate Button and Copy Code icon during hover.
 * - Variable button preview input field is read-only to prevent merchant interaction.
 * - Added spending description textbox with gap, no helper text, live-updated data-description.
 * - Generates temporary buttonId and paymentId on page load for default description.
 * - Added validation and sanitization for buttonText (max 80 chars).
 * - Added <ToastContainer /> for toast messages to display.
 * - Updated default spending description to "Payment using paymentId: <paymentId>".
 * - Added CSS validation and fallback to last valid customCSS.
 * - Changed toast to warning for invalid CSS, allowing valid code to render.
 * - Removed data-css attribute to eliminate redundancy, relying on <style> tag.
 * - Added debouncing and onBlur validation to prevent continuous toast warnings.
 * - Fixed TypeScript errors in debounce and fetchWithTimeout (04Aug2025_1216 BST).
 * - Updated to send tempButtonId as buttonId in createButton payload, ensuring consistency with HTML data-button (05Aug2025_0105 BST).
 * - Temporarily bypassed hasMetanet check for testing due to wallet service unavailability (05Aug2025_0130 BST).
 * - Added data-paymentId attribute to generated HTML for reliable paymentId passing (05Aug2025_0255 BST).
 *
 * Version: v4.8.60 (Updated 05Aug2025_0255 BST to use data-paymentId attribute)
 */
const F = 'pages/Create'
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { randomBytes } from 'crypto'
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
  Button as MUIButton
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { WalletClient, AuthFetch } from '@bsv/sdk'
import { Root, ContentWrap, CenteredHeader, TextFieldStyled } from './style'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { atomDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from '@mui/material/styles'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { toast, ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { logWithTimestamp } from '../../utils/logging'
import { MAX_PAYMENT_SATS } from '../../utils/constants'

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
// Simple CSS validator
const validateCSS = (css: string): boolean => {
  try {
    const rules = css
      .split('}')
      .map(rule => rule.trim())
      .filter(rule => rule.length > 0)
    for (const rule of rules) {
      const [selectorPart, propertiesPart] = rule.split('{').map(part => part.trim())
      if (!selectorPart || !propertiesPart) return false
      const properties = propertiesPart
        .split(';')
        .map(prop => prop.trim())
        .filter(prop => prop.length > 0)
      for (const prop of properties) {
        const [key, value] = prop.split(':').map(part => part.trim())
        if (!key || !value) return false
      }
    }
    return true
  } catch {
    return false
  }
}
// Extract CSS from the HTML code block
const extractCSS = (html: string): string => {
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i)
  return styleMatch ? styleMatch[1].trim() : ''
}
const WALLET_ORIGIN = process.env.WALLET_ORIGIN ?? 'localhost:3321'
const wallet = new WalletClient('auto', WALLET_ORIGIN)
const authFetch = new AuthFetch(wallet)
// Custom fetch with timeout, compatible with AuthFetch
const fetchWithTimeout = async (
  url: string,
  options: { headers?: Record<string, string>; method?: string; body?: string },
  timeoutMs: number = MAX_PAYMENT_SATS
): Promise<Response> => {
  const timeoutId = setTimeout(() => {
    throw new Error(`Request timed out after ${timeoutMs}ms`)
  }, timeoutMs)
  try {
    const response = await authFetch.fetch(url, options)
    return response
  } catch (err) {
    throw err // Let the caller handle the error, including timeout
  } finally {
    clearTimeout(timeoutId)
  }
}
interface CodeSnippetProps {
  code: string
  language: string
}
interface ButtonResponse {
  status: string
  message?: string
  buttonId?: string
  paymentId?: string // Retained for compatibility with backend
}
const CodeSnippet: React.FC<CodeSnippetProps> = ({ code, language }) => {
  const theme = useTheme()
  return (
    <SyntaxHighlighter
      language={language}
      style={theme.palette.mode === 'dark' ? atomDark : oneLight}
      showLineNumbers
      wrapLines
    >
      {code.trim()}
    </SyntaxHighlighter>
  )
}
const Create: React.FC = () => {
  const [buttonText_fixed, setButtonText_fixed] = useState('Pay Now')
  const [buttonText_variable, setButtonText_variable] = useState('Pay Now')
  const [tempButtonId, setTempButtonId] = useState(randomBytes(12).toString('hex'))
  const [tempPaymentId, setTempPaymentId] = useState(randomBytes(8).toString('hex')) // Generate once for payment tracking
  const [spendingDescription_fixed, setSpendingDescription_fixed] = useState(
    `Payment using paymentId: ${tempPaymentId}`
  )
  const [spendingDescription_variable, setSpendingDescription_variable] = useState(
    `Payment using paymentId: ${tempPaymentId}`
  )
  const [paymentType, setPaymentType] = useState<'fixed' | 'variable'>('fixed')
  const [fixedSatAmount, setFixedSatAmount] = useState('5')
  const [merchant, setMerchant] = useState('')
  const [buttonID, setButtonID] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [hasMetanet, setHasMetanet] = useState(false)
  const [copySuccess, setCopySuccess] = useState('')
  // const [customCSS_fixed, setCustomCSS_fixed] = useState(`<style>.gateway-paybutton-fixed {
  //   border-radius: 2em;
  //   border: none;
  //   padding: 0.7em 1em 0.7em 1em;
  //   min-width: 10em;
  //   background: linear-gradient(145deg, #8484FA, #0F2000);
  //   color: white;
  //   box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.2);
  //   user-select: none;
  //   transition: all 0.3s;
  //   font-weight: bold;
  //   text-align: center;
  // }
  // .gateway-paybutton-fixed:hover {
  //   cursor: pointer;
  //   box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
  //   background: linear-gradient(145deg, #ABABFF, #5050F2);
  //   color: yellow;
  // }
  // .gateway-paybutton-fixed.disabled {
  //   opacity: 0.4;
  //   background: gray;
  //   cursor: not-allowed;
  //   pointer-events: none;
  // }</style><div class="gateway-paybutton gateway-paybutton-fixed" data-amount="${MAX_PAYMENT_SATS}">Pay</div>`)
  // const [customCSS_variable, setCustomCSS_variable] = useState(`<style>.gateway-paybutton-variable {
  //   border-radius: 2em;
  //   border: none;
  //   padding: 0.7em 1em 0.7em 1em;
  //   min-width: 10em;
  //   background: linear-gradient(145deg, #FF6B6B, #4ECDC4);
  //   color: white;
  //   box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.2);
  //   user-select: none;
  //   transition: all 0.3s;
  //   font-weight: bold;
  //   text-align: center;
  // }
  // .gateway-paybutton-variable:hover {
  //   cursor: pointer;
  //   box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
  //   background: linear-gradient(145deg, #FF8787, #6BE8D9);
  //   color: red;
  // }
  // .gateway-paybutton-variable.disabled {
  //   opacity: 0.4;
  //   background: gray;
  //   cursor: not-allowed;
  //   pointer-events: none;
  // }</style><div class="gateway-paybutton gateway-paybutton-variable" data-variable="true">Pay</div>`)

  const theme = useTheme()
  const [customCSS_fixed, setCustomCSS_fixed] = useState(`<style>.gateway-paybutton-fixed {
    border-radius: 2em;
    border: none;
    padding: 0.7em 1em 0.7em 1em;
    min-width: 10em;
    background: linear-gradient(145deg, #8484FA, ${theme.palette.background.default});
    color: ${theme.palette.mode === 'dark' ? '#ffffff' : '#000000'};
    box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.2);
    user-select: none;
    transition: all 0.3s;
    font-weight: bold;
    text-align: center;
  }
  .gateway-paybutton-fixed:hover {
    cursor: pointer;
    box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
    background: linear-gradient(145deg, #ABABFF,${theme.palette.background.paper});
    color: ${theme.palette.mode === 'dark' ? '#ffffff' : '#000000'};
;
  }
  .gateway-paybutton-fixed.disabled {
    opacity: 0.4;
    background: gray;
    cursor: not-allowed;
    pointer-events: none;
  }</style><div class="gateway-paybutton gateway-paybutton-fixed" data-amount="${MAX_PAYMENT_SATS}">Pay</div>`)
  const [customCSS_variable, setCustomCSS_variable] = useState(`<style>.gateway-paybutton-variable {
    border-radius: 2em;
    border: none;
    padding: 0.7em 1em 0.7em 1em;
    min-width: 10em;
    background: linear-gradient(145deg, #FF6B6B, ${theme.palette.background.paper});
    color: ${theme.palette.mode === 'dark' ? '#ffffff' : '#000000'};
    box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.2);
    user-select: none;
    transition: all 0.3s;
    font-weight: bold;
    text-align: center;
  }
  .gateway-paybutton-variable:hover {
    cursor: pointer;
    box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
    background: linear-gradient(145deg, #FF8787, ${theme.palette.background.default});
    color: ${theme.palette.mode === 'dark' ? '#ffffff' : '#000000'};
  }
  .gateway-paybutton-variable.disabled {
    opacity: 0.4;
    background: gray;
    cursor: not-allowed;
    pointer-events: none;
  }</style><div class="gateway-paybutton gateway-paybutton-variable" data-variable="true">Pay</div>`)
  
  const [lastValidCSS_fixed, setLastValidCSS_fixed] = useState(extractCSS(customCSS_fixed))
  const [lastValidCSS_variable, setLastValidCSS_variable] = useState(extractCSS(customCSS_variable))
  const [previewCode_fixed, setPreviewCode_fixed] = useState('')
  const [previewCode_variable, setPreviewCode_variable] = useState('')
  const [previewFixedHtml, setPreviewFixedHtml] = useState('')
  const [previewVariableHtml, setPreviewVariableHtml] = useState('')
  const [styleElement_fixed, setStyleElement_fixed] = useState<HTMLStyleElement | null>(null)
  const [styleElement_variable, setStyleElement_variable] = useState<HTMLStyleElement | null>(null)
  const [renderKey, setRenderKey] = useState(0)
  const [isGenerateHovered, setIsGenerateHovered] = useState(false)
  const [isCopyHovered, setIsCopyHovered] = useState(false)
  const generateButtonRef = useRef<HTMLButtonElement>(null)
  const copyIconRef = useRef<HTMLSpanElement | null>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const isMounted = useRef(false)
  const [updateCounter, setUpdateCounter] = useState(0)

  useEffect(() => {
    const newTempId = randomBytes(12).toString('hex')
    const newTempPaymentId = randomBytes(8).toString('hex')
    setTempButtonId(newTempId)
    setTempPaymentId(newTempPaymentId)
    setSpendingDescription_fixed(`Payment using paymentId: ${newTempPaymentId}`)
    setSpendingDescription_variable(`Payment using paymentId: ${newTempPaymentId}`)
    logWithTimestamp(F, 'useEffect: Generated tempButtonId:', newTempId, 'tempPaymentId:', newTempPaymentId)
  }, [])

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
      'tempButtonId:',
      tempButtonId
    )
    const fixedDescription =
      spendingDescription_fixed.replace(/paymentId: [a-f0-9]{16}/, `paymentId: ${tempPaymentId}`) ||
      `Payment using paymentId: ${tempPaymentId}`
    const variableDescription =
      spendingDescription_variable.replace(/paymentId: [a-f0-9]{16}/, `paymentId: ${tempPaymentId}`) ||
      `Payment using paymentId: ${tempPaymentId}`
    const fixedText = `${buttonText_fixed} ${fixedSatAmount} Sats`
    const fixedCode = `<style>\n${validateCSS(extractCSS(customCSS_fixed)) ? extractCSS(customCSS_fixed).trim() : lastValidCSS_fixed.trim()}\n</style>\n<div\n class="gateway-paybutton gateway-paybutton-fixed"\n data-merchant="${merchant || 'temp-merchant'}"\n data-button="${buttonID || tempButtonId}"\n data-paymentId="${tempPaymentId}"\n data-amount="${fixedSatAmount}"\n data-currency="BSV"\n data-text="${fixedText}"\n data-description="${fixedDescription}"\n data-width="fit-content"\n data-server="${location.protocol}//${location.host}">${fixedText}</div>`
    const variableCode = `<style>\n${validateCSS(extractCSS(customCSS_variable)) ? extractCSS(customCSS_variable).trim() : lastValidCSS_variable.trim()}\n</style>\n<div\n class="gateway-paybutton gateway-paybutton-variable"\n data-merchant="${merchant || 'temp-merchant'}"\n data-button="${buttonID || tempButtonId}"\n data-paymentId="${tempPaymentId}"\n data-currency="BSV"\n data-text="${buttonText_variable}"\n data-description="${variableDescription}"\n data-variable="true"\n data-width="fit-content"\n data-server="${location.protocol}//${location.host}">${buttonText_variable} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`
    logWithTimestamp(
      F,
      'updatePreviewCodes: Generated HTML code - fixed:',
      fixedCode.substring(0, 50) + '...',
      'variable:',
      variableCode.substring(0, 50) + '...'
    )
    setPreviewCode_fixed(fixedCode)
    setPreviewCode_variable(variableCode)
    setUpdateCounter(prev => prev + 1)
    if (styleElement_fixed) {
      styleElement_fixed.textContent = validateCSS(extractCSS(customCSS_fixed))
        ? extractCSS(customCSS_fixed)
        : lastValidCSS_fixed
      logWithTimestamp(
        F,
        'updatePreviewCodes: Re-applied fixed CSS:',
        (validateCSS(extractCSS(customCSS_fixed)) ? extractCSS(customCSS_fixed) : lastValidCSS_fixed).substring(0, 50) +
          '...'
      )
    }
    if (styleElement_variable) {
      styleElement_variable.textContent = validateCSS(extractCSS(customCSS_variable))
        ? extractCSS(customCSS_variable)
        : lastValidCSS_variable
      logWithTimestamp(
        F,
        'updatePreviewCodes: Re-applied variable CSS:',
        (validateCSS(extractCSS(customCSS_variable))
          ? extractCSS(customCSS_variable)
          : lastValidCSS_variable
        ).substring(0, 50) + '...'
      )
    }
    generatePreviewHtml('fixed', fixedDescription)
    generatePreviewHtml('variable', variableDescription)
    logWithTimestamp(F, 'updatePreviewCodes: Previews generated for paymentType:', paymentType)
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
    paymentType,
    styleElement_fixed,
    styleElement_variable,
    tempButtonId,
    tempPaymentId,
    lastValidCSS_fixed,
    lastValidCSS_variable
  ])

  useEffect(() => {
    logWithTimestamp(F, 'useEffect: Starting merchant fetch (v4.8.15)')
    void (async () => {
      try {
        const identity = await wallet.getPublicKey({ identityKey: true })
        setMerchant(identity.publicKey)
        setHasMetanet(true)
        logWithTimestamp(F, 'useEffect: Merchant identity fetched:', identity.publicKey)
        updatePreviewCodes()
      } catch (error) {
        logWithTimestamp(F, 'useEffect: Failed to fetch Metanet identity:', error)
        setHasMetanet(false)
        updatePreviewCodes()
      }
    })()
  }, [updatePreviewCodes])

  useLayoutEffect(() => {
    logWithTimestamp(F, 'useLayoutEffect: Running with hasMetanet:', hasMetanet, 'isMounted:', isMounted.current)
    if (isMounted.current && hasMetanet) {
      if (generateButtonRef.current) {
        generateButtonRef.current.classList.add('preview-flash-generate')
        logWithTimestamp(F, 'useLayoutEffect: Added flashGenerate animation to Generate Button')
      }
    } else if (generateButtonRef.current) {
      generateButtonRef.current.classList.remove('preview-flash-generate')
      logWithTimestamp(F, 'useLayoutEffect: Removed flashGenerate animation from Generate Button')
    }
    isMounted.current = true
    logWithTimestamp(F, 'useLayoutEffect: Completed, isMounted set to true')
  }, [hasMetanet])

  useEffect(() => {
    if (merchant || !hasMetanet) {
      logWithTimestamp(
        F,
        'useEffect: Updating UI for paymentType:',
        paymentType,
        'merchant:',
        merchant,
        'renderKey:',
        renderKey
      )
      setRenderKey(prev => prev + 1)
      updatePreviewCodes()
    }
  }, [paymentType, merchant, hasMetanet, updatePreviewCodes, customCSS_fixed, customCSS_variable])

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
      'useEffect: Applied fixed CSS:',
      (validateCSS(extractCSS(customCSS_fixed)) ? extractCSS(customCSS_fixed) : lastValidCSS_fixed).substring(0, 50) +
        '...'
    )
    if (previewContainerRef.current) {
      generatePreviewHtml('fixed', spendingDescription_fixed)
      logWithTimestamp(F, 'useEffect: Generated fixed preview HTML')
    }
    return () => {
      if (styleElement_fixed) {
        document.head.removeChild(styleElement_fixed)
        logWithTimestamp(F, 'useEffect: Removed fixed style element')
      }
    }
  }, [customCSS_fixed, lastValidCSS_fixed])

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
      'useEffect: Applied variable CSS:',
      (validateCSS(extractCSS(customCSS_variable)) ? extractCSS(customCSS_variable) : lastValidCSS_variable).substring(
        0,
        50
      ) + '...'
    )
    if (previewContainerRef.current) {
      generatePreviewHtml('variable', spendingDescription_variable)
      logWithTimestamp(F, 'useEffect: Generated variable preview HTML')
    }
    return () => {
      if (styleElement_variable) {
        document.head.removeChild(styleElement_variable)
        logWithTimestamp(F, 'useEffect: Removed variable style element')
      }
    }
  }, [customCSS_variable, lastValidCSS_variable])

  useEffect(() => {
    if (copyIconRef.current && !buttonID) {
      copyIconRef.current.classList.add('preview-flash-copy')
      logWithTimestamp(F, 'useEffect: Added preview-flash-copy class to Copy Icon')
    } else if (copyIconRef.current && buttonID) {
      copyIconRef.current.classList.remove('preview-flash-copy')
      logWithTimestamp(F, 'useEffect: Removed preview-flash-copy class to Copy Icon')
    }
    if (previewContainerRef.current) {
      previewContainerRef.current.classList.add('create-page')
      logWithTimestamp(F, 'useEffect: Applied create-page class to preview container')
    }
    updatePreviewCodes()
  }, [buttonID, previewContainerRef, updatePreviewCodes])

  useEffect(() => {
    logWithTimestamp(
      F,
      'useEffect: Updating previews for description change - paymentType:',
      paymentType,
      'fixedDescription:',
      spendingDescription_fixed,
      'variableDescription:',
      spendingDescription_variable
    )
    updatePreviewCodes()
  }, [spendingDescription_fixed, spendingDescription_variable, updatePreviewCodes])

  const generatePreviewHtml = (type: 'fixed' | 'variable', description: string) => {
    logWithTimestamp(
      F,
      'generatePreviewHtml: Starting for type:',
      type,
      'current paymentType:',
      paymentType,
      'isSelected:',
      type === paymentType,
      'description:',
      description
    )
    const text =
      type === 'fixed'
        ? `${sanitizeInput(buttonText_fixed)} ${fixedSatAmount} Sats`
        : sanitizeInput(buttonText_variable)
    const isSelected = type === paymentType
    const className =
      type === 'fixed'
        ? `gateway-paybutton gateway-paybutton-fixed${isSelected ? '' : ' disabled'}`
        : `gateway-paybutton gateway-paybutton-variable${isSelected ? '' : ' disabled'}`
    const safeDescription = sanitizeInput(description || `Payment using paymentId: ${tempPaymentId}`)
    const cssToUse =
      type === 'fixed'
        ? validateCSS(extractCSS(customCSS_fixed))
          ? extractCSS(customCSS_fixed)
          : lastValidCSS_fixed
        : validateCSS(extractCSS(customCSS_variable))
          ? extractCSS(customCSS_variable)
          : lastValidCSS_variable
    let html = ''
    if (type === 'fixed') {
      html = `<div class="${className}" style="width: fit-content; margin: 0 auto; display: block" data-amount="${fixedSatAmount}" data-text="${text}" data-description="${safeDescription}" data-button="${buttonID || tempButtonId}" data-paymentId="${tempPaymentId}">${text}</div>`
      setPreviewFixedHtml(html)
      logWithTimestamp(F, 'generatePreviewHtml: Fixed preview HTML set:', html)
    } else {
      html = `<div class="${className}" style="width: fit-content; margin: 0 auto; display: block" data-text="${text}" data-description="${safeDescription}" data-button="${buttonID || tempButtonId}" data-paymentId="${tempPaymentId}">${text} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`
      setPreviewVariableHtml(html)
      logWithTimestamp(F, 'generatePreviewHtml: Variable preview HTML set:', html)
    }
  }

  const handleCustomCSSChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value
    if (paymentType === 'fixed') {
      setCustomCSS_fixed(value)
      if (!validateCSS(extractCSS(value))) {
        toast.warn('⚠️ Invalid CSS syntax detected, preview may not render correctly.')
      } else {
        setLastValidCSS_fixed(extractCSS(value))
      }
      logWithTimestamp(F, 'handleCustomCSSChange: Updated fixed CSS input:', value.substring(0, 50) + '...')
    } else {
      setCustomCSS_variable(value)
      if (!validateCSS(extractCSS(value))) {
        toast.warn('⚠️ Invalid CSS syntax detected, preview may not render correctly.')
      } else {
        setLastValidCSS_variable(extractCSS(value))
      }
      logWithTimestamp(F, 'handleCustomCSSChange: Updated variable CSS input:', value.substring(0, 50) + '...')
    }
    updatePreviewCodes()
    setUpdateCounter(prev => prev + 1)
  }

  const validateCSSOnBlur = (value: string, type: 'fixed' | 'variable'): void => {
    if (!validateCSS(extractCSS(value))) {
      toast.warn('⚠️ Invalid CSS syntax. Using last valid CSS for generation.')
      if (type === 'fixed') {
        setCustomCSS_fixed(
          `<style>${lastValidCSS_fixed}</style><div class="gateway-paybutton gateway-paybutton-fixed" data-amount="${MAX_PAYMENT_SATS}">Pay</div>`
        )
        logWithTimestamp(
          F,
          'validateCSSOnBlur: Reverted to last valid fixed CSS:',
          lastValidCSS_fixed.substring(0, 50) + '...'
        )
      } else {
        setCustomCSS_variable(
          `<style>${lastValidCSS_variable}</style><div class="gateway-paybutton gateway-paybutton-variable" data-variable="true">Pay</div>`
        )
        logWithTimestamp(
          F,
          'validateCSSOnBlur: Reverted to last valid variable CSS:',
          lastValidCSS_variable.substring(0, 50) + '...'
        )
      }
    } else {
      if (type === 'fixed') {
        setLastValidCSS_fixed(extractCSS(value))
        setCustomCSS_fixed(value)
        logWithTimestamp(
          F,
          'validateCSSOnBlur: Updated last valid fixed CSS:',
          extractCSS(value).substring(0, 50) + '...'
        )
      } else {
        setLastValidCSS_variable(extractCSS(value))
        setCustomCSS_variable(value)
        logWithTimestamp(
          F,
          'validateCSSOnBlur: Updated last valid variable CSS:',
          extractCSS(value).substring(0, 50) + '...'
        )
      }
    }
    updatePreviewCodes()
  }

  const debouncedValidateCSS = debounce(validateCSSOnBlur, 500)

  const handleCustomCSSBlur = (event: React.FocusEvent<HTMLInputElement>): void => {
    const value = event.target.value
    debouncedValidateCSS(value, paymentType)
  }

  const handleButtonTextChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = event.target
    if (name === 'buttonText') {
      const sanitizedValue = sanitizeInput(value.slice(0, 80))
      if (value.length > 80) {
        toast.error('Button text must be 80 characters or less')
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
        toast.error('Spending description must be 80 characters or less')
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
  }

  const handlePaymentTypeChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    logWithTimestamp(
      F,
      'handlePaymentTypeChange: Before update - current paymentType:',
      paymentType,
      'new value:',
      event.target.value
    )
    const newType = event.target.value as 'fixed' | 'variable'
    setPaymentType(newType)
    setButtonID('')
    setShowCode(false)
    logWithTimestamp(F, 'handlePaymentTypeChange: After update - new paymentType:', newType)
    const newTempPaymentId = randomBytes(8).toString('hex')
    setTempPaymentId(newTempPaymentId)
    setSpendingDescription_fixed(`Payment using paymentId: ${newTempPaymentId}`)
    setSpendingDescription_variable(`Payment using paymentId: ${newTempPaymentId}`)
    logWithTimestamp(F, 'handlePaymentTypeChange: Generated new tempPaymentId:', newTempPaymentId)
    updatePreviewCodes()
  }

  const handleFixedSatChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const input = event.target.value.replace(/[^0-9]/g, '')
    const satValue = Math.max(1, Math.min(MAX_PAYMENT_SATS, Number(input) || 5))
    setFixedSatAmount(satValue.toString())
    logWithTimestamp(F, 'handleFixedSatChange: Updated to', satValue)
    updatePreviewCodes()
  }

  const handleCopyCode = async (): Promise<void> => {
    const cssToUse =
      paymentType === 'fixed'
        ? validateCSS(extractCSS(customCSS_fixed))
          ? extractCSS(customCSS_fixed)
          : lastValidCSS_fixed
        : validateCSS(extractCSS(customCSS_variable))
          ? extractCSS(customCSS_variable)
          : lastValidCSS_variable
    const codeToCopy =
      paymentType === 'fixed'
        ? `<style>\n${cssToUse.trim()}\n</style>\n<div\n class="gateway-paybutton gateway-paybutton-fixed"\n data-merchant="${merchant || 'temp-merchant'}"\n data-button="${buttonID || tempButtonId}"\n data-paymentId="${tempPaymentId}"\n data-amount="${fixedSatAmount}"\n data-currency="BSV"\n data-text="${buttonText_fixed} ${fixedSatAmount} Sats"\n data-description="${spendingDescription_fixed || `Payment using paymentId: ${tempPaymentId}`}"\n data-width="fit-content"\n data-server="${location.protocol}//${location.host}">${buttonText_fixed} ${fixedSatAmount} Sats</div>`
        : `<style>\n${cssToUse.trim()}\n</style>\n<div\n class="gateway-paybutton gateway-paybutton-variable"\n data-merchant="${merchant || 'temp-merchant'}"\n data-button="${buttonID || tempButtonId}"\n data-paymentId="${tempPaymentId}"\n data-currency="BSV"\n data-text="${buttonText_variable}"\n data-description="${spendingDescription_variable || `Payment using paymentId: ${tempPaymentId}`}"\n data-variable="true"\n data-width="fit-content"\n data-server="${location.protocol}//${location.host}">${buttonText_variable} <input type="number" value="" min="1" max="${MAX_PAYMENT_SATS}" style="width: 50px; text-align: center;" readonly /> Sats</div>`
    const finalCode = `${codeToCopy}\n<script src="${location.protocol}//${location.host}/pay.js"></script>`
    logWithTimestamp(F, 'handleCopyCode: Attempting to copy', paymentType, 'code:', finalCode)
    try {
      await navigator.clipboard.writeText(finalCode)
      setCopySuccess('success')
      setTimeout(() => setCopySuccess(''), 2000)
      toast.success('✅ Code copied to clipboard')
      logWithTimestamp(F, 'handleCopyCode: Copied to clipboard')
      setButtonID('')
      setShowCode(false)
    } catch (err) {
      setCopySuccess('failed')
      toast.error('❌ Failed to copy code')
      logWithTimestamp(F, 'handleCopyCode: Failed to copy code:', (err as Error).message)
    }
  }

  const handleGenerateButton = async () => {
    if (!merchant) {
      // Temporarily bypass hasMetanet check for testing
      toast.error('❌ Merchant identity not available')
      logWithTimestamp(F, 'handleGenerateButton: Merchant identity not available')
      return
    }
    try {
      const description = paymentType === 'fixed' ? spendingDescription_fixed : spendingDescription_variable
      const htmlCode = paymentType === 'fixed' ? previewCode_fixed : previewCode_variable
      logWithTimestamp(
        F,
        'handleGenerateButton: Preparing payload with description:',
        description,
        'HTML code:',
        htmlCode.substring(0, 50) + '...',
        'tempPaymentId:',
        tempPaymentId
      )
      const payload = {
        currency: 'BSV',
        variableAmount: paymentType === 'variable',
        multiUse: true,
        accepts: 'BSV',
        description: description,
        customCSS: htmlCode,
        paymentId: tempPaymentId,
        buttonId: tempButtonId, // Send tempButtonId as buttonId to match data-button
        amount: paymentType === 'fixed' ? parseInt(fixedSatAmount) : undefined // Optional amount for fixed payments
      }
      logWithTimestamp(F, 'handleGenerateButton: Sending payload:', payload)
      const response = await fetchWithTimeout(
        `${location.protocol}//${location.host}/api/createButton`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        },
        15000
      )
      const data: ButtonResponse = await response.json()
      if (data.status === 'success' && data.buttonId && data.paymentId) {
        setButtonID(data.buttonId)
        const updatedDescription = `Payment using paymentId: ${data.paymentId}`
        setSpendingDescription_fixed(updatedDescription)
        setSpendingDescription_variable(updatedDescription)
        setShowCode(true)
        toast.success('✅ Button created successfully')
        logWithTimestamp(
          F,
          'handleGenerateButton: Button created with ID:',
          data.buttonId,
          'Payment ID:',
          data.paymentId
        )
        updatePreviewCodes()
      } else {
        throw new Error(data.message || 'Failed to create button')
      }
    } catch (err) {
      logWithTimestamp(
        F,
        'handleGenerateButton: Error creating button:',
        err instanceof Error ? err.message : 'Unknown error'
      )
      toast.error(`❌ Failed to create button: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return (
    <Root>
      <Container maxWidth="lg" sx={{ ...(useTheme().templates?.page_wrap || {}) }}>
        <ContentWrap>
          <CenteredHeader>
            <Typography variant="h2">Create Your Payment Button</Typography>
            <Typography variant="subtitle1">
              Edit code live in the left panel to update the preview buttons for your site.
            </Typography>
          </CenteredHeader>
          <Grid container spacing={4}>
            <Grid item xs={12} md={7}>
              <Stack spacing={3}>
                <Card>
                  <Typography variant="h3" gutterBottom>
                    Button Details
                  </Typography>
                  <TextFieldStyled
                    label="Button Text"
                    name="buttonText"
                    value={paymentType === 'fixed' ? buttonText_fixed : buttonText_variable}
                    onChange={handleButtonTextChange}
                    fullWidth
                  />
                  <RadioGroup
                    value={paymentType}
                    onChange={handlePaymentTypeChange}
                    sx={{ mt: 2, display: 'flex', flexDirection: 'row' }}
                  >
                    <FormControlLabel value="fixed" control={<Radio />} label="Fixed Amount" />
                    <FormControlLabel value="variable" control={<Radio />} label="Variable Amount" />
                  </RadioGroup>
                  {paymentType === 'fixed' && (
                    <TextFieldStyled
                      label={`Fixed Sat Amount (1-${MAX_PAYMENT_SATS})`}
                      value={fixedSatAmount}
                      onChange={handleFixedSatChange}
                      type="number"
                      fullWidth
                      InputProps={{ startAdornment: <InputAdornment position="start">sat</InputAdornment> }}
                      sx={{ mt: 2 }}
                    />
                  )}
                  <TextFieldStyled
                    label="Spending Description"
                    name="spendingDescription"
                    value={paymentType === 'fixed' ? spendingDescription_fixed : spendingDescription_variable}
                    onChange={handleButtonTextChange}
                    fullWidth
                    sx={{ mt: 2 }}
                  />
                  <Tooltip title="Press to enable copy icon">
                    <MUIButton
                      ref={generateButtonRef}
                      variant="contained"
                      color="primary"
                      onClick={handleGenerateButton}
                      sx={{ mt: 2, ...(isGenerateHovered && { opacity: 0.7, transition: 'opacity 0.3s' }) }}
                      disabled={!merchant} // Temporarily bypass hasMetanet check
                      onMouseEnter={() => setIsGenerateHovered(true)}
                      onMouseLeave={() => setIsGenerateHovered(false)}
                    >
                      Generate Button
                    </MUIButton>
                  </Tooltip>
                </Card>
                <Card>
                  <Typography variant="h3" gutterBottom>
                    Custom Styling
                  </Typography>
                  <TextFieldStyled
                    label="Custom CSS"
                    value={paymentType === 'fixed' ? customCSS_fixed : customCSS_variable}
                    onChange={handleCustomCSSChange}
                    onBlur={handleCustomCSSBlur}
                    fullWidth
                    multiline
                  />
                </Card>
              </Stack>
            </Grid>
            <Grid item xs={12} md={5}>
              <Card>
                <Typography
                  variant="h3"
                  gutterBottom
                  component="div"
                  sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  Button Preview
                  <span
                    ref={copyIconRef}
                    onMouseEnter={() => setIsCopyHovered(true)}
                    onMouseLeave={() => setIsCopyHovered(false)}
                  >
                    <Tooltip title={buttonID ? 'Copy Code' : 'Press Generate Button'} arrow>
                      <span>
                        <IconButton
                          onClick={handleCopyCode}
                          disabled={!buttonID}
                          sx={{
                            ...(isCopyHovered && { opacity: 0.7, transition: 'opacity 0.3s' }),
                            ...(isGenerateHovered && { animation: 'flashCopy 1s infinite' })
                          }}
                        >
                          {copySuccess === 'success' ? <CheckCircleIcon color="success" /> : <ContentCopyIcon />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </span>
                </Typography>
                {typeof copySuccess === 'string' && copySuccess !== '' && copySuccess === 'failed' && (
                  <Typography color="error">❌ Failed to copy code!</Typography>
                )}
                <Box ref={previewContainerRef}>
                  <Box sx={{ mb: 2 }}>
                    <div key={`fixed-${updateCounter}`} dangerouslySetInnerHTML={{ __html: previewFixedHtml }} />
                  </Box>
                  <Box sx={{ mb: 2 }}>
                    <div key={`variable-${updateCounter}`} dangerouslySetInnerHTML={{ __html: previewVariableHtml }} />
                  </Box>
                </Box>
                <Box>
                  <CodeSnippet
                    key={`code-${updateCounter}-${paymentType === 'fixed' ? previewCode_fixed : previewCode_variable}`}
                    language="html"
                    code={paymentType === 'fixed' ? previewCode_fixed : previewCode_variable}
                  />
                </Box>
                <Typography variant="h3" gutterBottom sx={{ mt: 2 }}>
                  Script for Head Tag
                </Typography>
                <Box>
                  <CodeSnippet
                    language="javascript"
                    code={`<script src="${location.protocol}//${location.host}/pay.js"></script>`}
                  />
                </Box>
              </Card>
            </Grid>
          </Grid>
        </ContentWrap>
      </Container>
      <ToastContainer
        position="top-right"
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
