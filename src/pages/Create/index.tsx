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
 *   determined by the customer via pay.js prompt.
 * - Copies both the button HTML and the pay.js script tag as a single block for ease of use.
 * - Does not write to .html files; users manually add code to their webpages.
 * - Copy Code button is always visible, using a static image when disabled to ensure tooltip visibility, switching to an active icon after generation.
 * - Generated HTML includes default text and amount display for visible rendering even without pay.js.
 * - Preview aligns with generated button by defaulting to text-width, with optional data-width override and centering enforced.
 * - UI enhanced with continuous flashing effects with a 1-second period using CSS animations, flashing only the Copy Code icon initially (when disabled), and independent cross-flashing between Generate Button and Copy Code icon during hover.
 * - Variable button preview input field is read-only to prevent merchant interaction.
 * - Added spending description textbox with gap, no helper text.
 *
 * Version: v4.8.8 (Updated 29Jul2025_2106 BST with Fixed Rendering, Textbox Gap, No Helper Text)
 */

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { Typography, Container, Grid, Box, InputAdornment, Tooltip, IconButton, RadioGroup, FormControlLabel, Radio, Card, Stack, Button as MUIButton } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { WalletClient, AuthFetch } from '@bsv/sdk'
import {
  Root,
  ContentWrap,
  CenteredHeader,
  TextFieldStyled,
} from './style'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { atomDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from '@mui/material/styles'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { toast } from 'react-toastify'
import { logWithTimestamp } from '../../utils/logging'

// One wallet + AuthFetch shared by this module
const WALLET_ORIGIN = process.env.WALLET_ORIGIN ?? 'localhost:3321'
const wallet = new WalletClient('auto', WALLET_ORIGIN)
const authFetch = new AuthFetch(wallet)

interface CodeSnippetProps {
  code: string
  language: string
}

interface ButtonResponse {
  status: string
  message?: string
  buttonId?: string
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
  const [spendingDescription_fixed, setSpendingDescription_fixed] = useState('Tip paid to merchant')
  const [spendingDescription_variable, setSpendingDescription_variable] = useState('Tip paid to merchant')
  const [paymentType, setPaymentType] = useState<'fixed' | 'variable'>('fixed')
  const [fixedSatAmount, setFixedSatAmount] = useState('5')
  const [merchant, setMerchant] = useState('')
  const [buttonID, setButtonID] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [hasMetanet, setHasMetanet] = useState(false)
  const [copySuccess, setCopySuccess] = useState('')
  const [customCSS_fixed, setCustomCSS_fixed] = useState(`.gateway-paybutton-fixed {
    border-radius: 2em;
    border: none;
    padding: 0.7em 1em 0.7em 1em;
    min-width: 10em;
    background: linear-gradient(145deg, #8484FA, #5050F2);
    color: white;
    box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.2);
    user-select: none;
    transition: all 0.3s;
    font-weight: bold;
    text-align: center;
  }
  .gateway-paybutton-fixed:hover {
    cursor: pointer;
    box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
    background: linear-gradient(145deg, #ABABFF, #5050F2);
  }
  .gateway-paybutton-fixed.disabled {
    opacity: 0.4;
    background: gray;
    cursor: not-allowed;
    pointer-events: none;
  }`)
  const [customCSS_variable, setCustomCSS_variable] = useState(`.gateway-paybutton-variable {
    border-radius: 2em;
    border: none;
    padding: 0.7em 1em 0.7em 1em;
    min-width: 10em;
    background: linear-gradient(145deg, #FF6B6B, #4ECDC4);
    color: white;
    box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.2);
    user-select: none;
    transition: all 0.3s;
    font-weight: bold;
    text-align: center;
  }
  .gateway-paybutton-variable:hover {
    cursor: pointer;
    box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
    background: linear-gradient(145deg, #FF8787, #6BE8D9);
  }
  .gateway-paybutton-variable.disabled {
    opacity: 0.4;
    background: gray;
    cursor: not-allowed;
    pointer-events: none;
  }`)
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

  useEffect(() => {
    logWithTimestamp('pages/Create', 'useEffect: Starting merchant fetch (v4.8.8)')
    void (async () => {
      try {
        const identity = await wallet.getPublicKey({ identityKey: true })
        setMerchant(identity.publicKey)
        setHasMetanet(true)
        logWithTimestamp('pages/Create', 'useEffect: Merchant identity fetched:', identity.publicKey)
        updatePreviewCodes()
      } catch (error) {
        logWithTimestamp('pages/Create', 'useEffect: Failed to fetch Metanet identity:', error)
        setHasMetanet(false)
        updatePreviewCodes() // Render previews even without Metanet
      }
    })()
  }, [])

  useLayoutEffect(() => {
    logWithTimestamp('pages/Create', 'useLayoutEffect: Running with hasMetanet:', hasMetanet, 'isMounted:', isMounted.current)
    if (isMounted.current && hasMetanet) {
      if (generateButtonRef.current) {
        generateButtonRef.current.classList.add('preview-flash-generate')
        logWithTimestamp('pages/Create', 'useLayoutEffect: Added flashGenerate animation to Generate Button')
      }
    } else if (generateButtonRef.current) {
      generateButtonRef.current.classList.remove('preview-flash-generate')
      logWithTimestamp('pages/Create', 'useLayoutEffect: Removed flashGenerate animation from Generate Button')
    }
    isMounted.current = true
    logWithTimestamp('pages/Create', 'useLayoutEffect: Completed, isMounted set to true')
  }, [hasMetanet])

  useEffect(() => {
    if (merchant || !hasMetanet) {
      logWithTimestamp('pages/Create', 'useEffect: Updating UI for paymentType:', paymentType, 'merchant:', merchant, 'renderKey:', renderKey)
      setRenderKey(prev => prev + 1) // Force re-render to update field visibility
      updatePreviewCodes()
    }
  }, [paymentType, merchant, hasMetanet])

  useEffect(() => {
    const newStyleElement = document.createElement('style')
    newStyleElement.id = 'custom-button-styles-fixed'
    newStyleElement.textContent = customCSS_fixed
    document.head.appendChild(newStyleElement)
    setStyleElement_fixed(newStyleElement)
    logWithTimestamp('pages/Create', 'useEffect: Applied fixed custom CSS:', customCSS_fixed.substring(0, 50) + '...')
    if (previewContainerRef.current) {
      generatePreviewHtml('fixed')
      logWithTimestamp('pages/Create', 'useEffect: Generated fixed preview HTML')
    }
    return () => {
      if (styleElement_fixed) {
        document.head.removeChild(styleElement_fixed)
        logWithTimestamp('pages/Create', 'useEffect: Removed fixed style element')
      }
    }
  }, [customCSS_fixed])

  useEffect(() => {
    const newStyleElement = document.createElement('style')
    newStyleElement.id = 'custom-button-styles-variable'
    newStyleElement.textContent = customCSS_variable
    document.head.appendChild(newStyleElement)
    setStyleElement_variable(newStyleElement)
    logWithTimestamp('pages/Create', 'useEffect: Applied variable custom CSS:', customCSS_variable.substring(0, 50) + '...')
    if (previewContainerRef.current) {
      generatePreviewHtml('variable')
      logWithTimestamp('pages/Create', 'useEffect: Generated variable preview HTML')
    }
    return () => {
      if (styleElement_variable) {
        document.head.removeChild(styleElement_variable)
        logWithTimestamp('pages/Create', 'useEffect: Removed variable style element')
      }
    }
  }, [customCSS_variable])

  useEffect(() => {
    if (copyIconRef.current && !buttonID) {
      copyIconRef.current.classList.add('preview-flash-copy')
      logWithTimestamp('pages/Create', 'useEffect: Added preview-flash-copy class to Copy Icon')
    } else if (copyIconRef.current && buttonID) {
      copyIconRef.current.classList.remove('preview-flash-copy')
      logWithTimestamp('pages/Create', 'useEffect: Removed preview-flash-copy class to Copy Icon')
    }
    if (previewContainerRef.current) {
      previewContainerRef.current.classList.add('create-page')
      logWithTimestamp('pages/Create', 'useEffect: Applied create-page class to preview container')
    }
    updatePreviewCodes()
  }, [buttonID, previewContainerRef])

  const updatePreviewCodes = useCallback(() => {
    logWithTimestamp('pages/Create', 'updatePreviewCodes: Starting update for paymentType:', paymentType, 'merchant:', merchant)
    const fixedCode = `<style>\n${customCSS_fixed.trim()}\n</style>\n<div\n  class="gateway-paybutton gateway-paybutton-fixed"\n  data-merchant="${merchant || 'temp-merchant'}"\n  data-button="${buttonID || 'temp-fixed'}"\n  data-amount="${fixedSatAmount}"\n  data-currency="BSV"\n  data-text="${buttonText_fixed}"\n  data-description="${spendingDescription_fixed}"\n  data-width="fit-content"\n  data-server="${location.protocol}//${location.host}"\n>${buttonText_fixed} ${fixedSatAmount} Sats</div>`
    const variableCode = `<style>\n${customCSS_variable.trim()}\n</style>\n<div\n  class="gateway-paybutton gateway-paybutton-variable"\n  data-merchant="${merchant || 'temp-merchant'}"\n  data-button="${buttonID || 'temp-variable'}"\n  data-currency="BSV"\n  data-text="${buttonText_variable}"\n  data-description="${spendingDescription_variable}"\n  data-variable="true"\n  data-width="fit-content"\n  data-server="${location.protocol}//${location.host}"\n>${buttonText_variable} <input type="number" value="" min="1" max="10000" style="width: 50px; text-align: center;" readonly /> Sats</div>`
    setPreviewCode_fixed(fixedCode)
    setPreviewCode_variable(variableCode)
    logWithTimestamp('pages/Create', 'updatePreviewCodes: Codes generated - fixed:', fixedCode.substring(0, 50) + '...', 'variable:', variableCode.substring(0, 50) + '...')
    if (styleElement_fixed) {
      styleElement_fixed.textContent = customCSS_fixed
      logWithTimestamp('pages/Create', 'updatePreviewCodes: Re-applied fixed custom CSS:', customCSS_fixed.substring(0, 50) + '...')
    }
    if (styleElement_variable) {
      styleElement_variable.textContent = customCSS_variable
      logWithTimestamp('pages/Create', 'updatePreviewCodes: Re-applied variable custom CSS:', customCSS_variable.substring(0, 50) + '...')
    }
    setTimeout(() => {
      generatePreviewHtml('fixed')
      generatePreviewHtml('variable')
      logWithTimestamp('pages/Create', 'updatePreviewCodes: Previews generated for paymentType:', paymentType, 'after delay')
    }, 0)
  }, [customCSS_fixed, customCSS_variable, fixedSatAmount, merchant, buttonText_fixed, buttonText_variable, spendingDescription_fixed, spendingDescription_variable, buttonID, paymentType, styleElement_fixed, styleElement_variable])

  const generatePreviewHtml = (type: 'fixed' | 'variable') => {
    logWithTimestamp('pages/Create', 'generatePreviewHtml: Starting for type:', type, 'current paymentType:', paymentType, 'isSelected:', type === paymentType)
    const text = type === 'fixed' ? buttonText_fixed : buttonText_variable
    const isSelected = type === paymentType
    const className = type === 'fixed' ? `gateway-paybutton-fixed${isSelected ? '' : ' disabled'}` : `gateway-paybutton-variable${isSelected ? '' : ' disabled'}`
    let html = ''
    if (type === 'fixed') {
      html = `<div class="${className}" style="width: fit-content; margin: 0 auto; display: block">${text} ${fixedSatAmount} Sats</div>`
      setPreviewFixedHtml(html)
    } else {
      html = `<div class="${className}" style="width: fit-content; margin: 0 auto; display: block">${text} <input type="number" value="" min="1" max="10000" style="width: 50px; text-align: center;" readonly /> Sats</div>`
      setPreviewVariableHtml(html)
    }
    logWithTimestamp('pages/Create', 'generatePreviewHtml: Generated for type:', type, 'HTML:', html, 'className:', className)
  }

  const handleCustomCSSChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    if (paymentType === 'fixed') {
      setCustomCSS_fixed(event.target.value)
      logWithTimestamp('pages/Create', 'handleCustomCSSChange: Updated fixed CSS:', event.target.value.substring(0, 50) + '...')
    } else {
      setCustomCSS_variable(event.target.value)
      logWithTimestamp('pages/Create', 'handleCustomCSSChange: Updated variable CSS:', event.target.value.substring(0, 50) + '...')
    }
  }

  const handleButtonTextChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = event.target
    if (name === 'buttonText') {
      if (paymentType === 'fixed') {
        setButtonText_fixed(value)
      } else {
        setButtonText_variable(value)
      }
      logWithTimestamp('pages/Create', 'handleButtonTextChange: Updated button text for paymentType:', paymentType, 'value:', value)
    } else if (name === 'spendingDescription') {
      if (paymentType === 'fixed') {
        setSpendingDescription_fixed(value)
      } else {
        setSpendingDescription_variable(value)
      }
      logWithTimestamp('pages/Create', 'handleButtonTextChange: Updated spending description for paymentType:', paymentType, 'value:', value)
    }
  }

  const handlePaymentTypeChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    logWithTimestamp('pages/Create', 'handlePaymentTypeChange: Before update - current paymentType:', paymentType, 'new value:', event.target.value)
    const newType = event.target.value as 'fixed' | 'variable'
    setPaymentType(newType)
    setButtonID('') // Reset buttonID to disable copy icon until Generate is pressed
    setShowCode(false) // Reset showCode to disable copy icon
    logWithTimestamp('pages/Create', 'handlePaymentTypeChange: After update - new paymentType:', newType)
    updatePreviewCodes()
  }

  const handleFixedSatChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const input = event.target.value.replace(/[^0-9]/g, '')
    const satValue = Math.max(1, Math.min(1000, Number(input) || 5))
    setFixedSatAmount(satValue.toString())
    logWithTimestamp('pages/Create', 'handleFixedSatChange: Updated to', satValue)
  }

  const handleCopyCode = async (): Promise<void> => {
    const codeToCopy = `${paymentType === 'fixed' ? previewCode_fixed : previewCode_variable}\n<script src="${location.protocol}//${location.host}/pay.js"></script>`
    logWithTimestamp('pages/Create', 'handleCopyCode: Attempting to copy', paymentType, 'code:', codeToCopy)
    try {
      await navigator.clipboard.writeText(codeToCopy)
      setCopySuccess('success')
      setTimeout(() => setCopySuccess(''), 2000)
      toast.success('✅ Code copied to clipboard')
      logWithTimestamp('pages/Create', 'handleCopyCode: Copied to clipboard')
      // Reset to disable copy icon
      setButtonID('')
      setShowCode(false)
    } catch (err) {
      setCopySuccess('failed')
      toast.error('❌ Failed to copy code')
      logWithTimestamp('pages/Create', 'handleCopyCode: Failed to copy code:', err)
    }
  }

  const handleGenerateButton = async () => {
    if (!hasMetanet || !merchant) {
      toast.error('❌ Metanet identity not available')
      logWithTimestamp('pages/Create', 'handleGenerateButton: Metanet identity not available')
      return
    }

    try {
      const payload = {
        currency: 'BSV',
        variableAmount: paymentType === 'variable',
        multiUse: true,
        accepts: 'BSV',
        description: paymentType === 'fixed' ? spendingDescription_fixed : spendingDescription_variable,
        ...(paymentType === 'fixed' && { amount: parseInt(fixedSatAmount) })
      }
      logWithTimestamp('pages/Create', 'handleGenerateButton: Sending payload:', payload)
      const response = await authFetch.fetch(`${location.protocol}//${location.host}/api/createButton`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data: ButtonResponse = await response.json()
      if (data.status === 'success' && data.buttonId) {
        setButtonID(data.buttonId)
        setShowCode(true) // Enable copy icon
        toast.success('✅ Button created successfully')
        logWithTimestamp('pages/Create', 'handleGenerateButton: Button created with ID:', data.buttonId)
        updatePreviewCodes()
      } else {
        throw new Error(data.message || 'Failed to create button')
      }
    } catch (err) {
      logWithTimestamp('pages/Create', 'handleGenerateButton: Error creating button:', err)
      toast.error('❌ Failed to create button')
    }
  }

  return (
    <Root>
      <Container maxWidth="lg" sx={{ ...(useTheme().templates?.page_wrap || {}) }}>
        <ContentWrap>
          <CenteredHeader>
            <Typography variant='h2'>Create Your Payment Button</Typography>
            <Typography variant='subtitle1'>Edit code live in the left panel to update the preview buttons for your site.</Typography>
          </CenteredHeader>

          <Grid container spacing={4}>
            <Grid item xs={12} md={7}>
              <Stack spacing={3}>
                <Card>
                  <Typography variant='h3' gutterBottom>
                    Button Details
                  </Typography>
                  <TextFieldStyled
                    label='Button Text'
                    name='buttonText'
                    value={paymentType === 'fixed' ? buttonText_fixed : buttonText_variable}
                    onChange={handleButtonTextChange}
                    fullWidth
                  />
                  <RadioGroup
                    value={paymentType}
                    onChange={handlePaymentTypeChange}
                    sx={{ mt: 2, display: 'flex', flexDirection: 'row' }}
                  >
                    <FormControlLabel
                      value="fixed"
                      control={<Radio />}
                      label="Fixed Amount"
                    />
                    <FormControlLabel
                      value="variable"
                      control={<Radio />}
                      label="Variable Amount"
                    />
                  </RadioGroup>
                  {paymentType === 'fixed' && (
                    <TextFieldStyled
                      label='Fixed Sat Amount (1-1000)'
                      value={fixedSatAmount}
                      onChange={handleFixedSatChange}
                      type='number'
                      fullWidth
                      InputProps={{ startAdornment: <InputAdornment position='start'>sat</InputAdornment> }}
                    />
                  )}
                  <TextFieldStyled
                    label='Spending Description'
                    name='spendingDescription'
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
                      disabled={!hasMetanet}
                      onMouseEnter={() => setIsGenerateHovered(true)}
                      onMouseLeave={() => setIsGenerateHovered(false)}
                    >
                      Generate Button
                    </MUIButton>
                  </Tooltip>
                </Card>
                <Card>
                  <Typography variant='h3' gutterBottom>
                    Custom Styling
                  </Typography>
                  <TextFieldStyled
                    label='Custom CSS'
                    value={paymentType === 'fixed' ? customCSS_fixed : customCSS_variable}
                    onChange={handleCustomCSSChange}
                    fullWidth
                    multiline
                  />
                </Card>
              </Stack>
            </Grid>

            <Grid item xs={12} md={5}>
              <Card>
                <Typography
                  variant='h3'
                  gutterBottom
                  component='div'
                  sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  Button Preview
                  <span
                    ref={copyIconRef}
                    onMouseEnter={() => setIsCopyHovered(true)}
                    onMouseLeave={() => setIsCopyHovered(false)}
                  >
                    <Tooltip title={buttonID ? "Copy Code" : "Press Generate Button"} arrow>
                      <span>
                        <IconButton
                          onClick={handleCopyCode}
                          disabled={!buttonID}
                          sx={{ ...(isCopyHovered && { opacity: 0.7, transition: 'opacity 0.3s' }), ...(isGenerateHovered && { animation: 'flashCopy 1s infinite' }) }}
                        >
                          {copySuccess === 'success' ? <CheckCircleIcon color='success' /> : <ContentCopyIcon />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </span>
                </Typography>

                {typeof copySuccess === 'string' && copySuccess !== '' && copySuccess === 'failed' && (
                  <Typography color='error'>❌ Failed to copy code!</Typography>
                )}

                <Box ref={previewContainerRef}>
                  <Box sx={{ mb: 2 }}>
                    <div dangerouslySetInnerHTML={{ __html: previewFixedHtml }} />
                  </Box>
                  <Box sx={{ mb: 2 }}>
                    <div dangerouslySetInnerHTML={{ __html: previewVariableHtml }} />
                  </Box>
                </Box>

                <Box>
                  <CodeSnippet
                    key={paymentType === 'fixed' ? previewCode_fixed : previewCode_variable}
                    language='html'
                    code={paymentType === 'fixed' ? previewCode_fixed : previewCode_variable}
                  />
                </Box>

                <Typography variant='h3' gutterBottom sx={{ mt: 2 }}>
                  Script for Head Tag
                </Typography>
                <Box>
                  <CodeSnippet
                    language='javascript'
                    code={`<script src="${location.protocol}//${location.host}/pay.js"></script>`}
                  />
                </Box>
              </Card>
            </Grid>
          </Grid>
        </ContentWrap>
      </Container>
    </Root>
  )
}

export default Create