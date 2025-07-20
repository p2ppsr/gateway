/**
 * @file src/pages/Create/index.tsx
 * 
 * Create Page — Allows users to configure and generate tipping button code.
 *
 * Users can customize the button text, payment amount, and CSS styles. Once configured,
 * a button is created using the Metanet identity, and corresponding embeddable HTML and script
 * code is displayed, which can be copied for integration into websites.
 *
 * The page also checks for Metanet client presence and provides user feedback via toast notifications.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Typography, Container, Grid, Box, InputAdornment, Tooltip, IconButton } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { WalletClient, AuthFetch } from '@bsv/sdk'
import {
  Root,
  ContentWrap,
  FormSection,
  PreviewSection,
  CodePreview,
  CenteredHeader,
  TextFieldStyled,
  ButtonStyled
} from './style'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { atomDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from '@mui/material/styles'
import { CurrencyConverter } from 'amountinator'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { toast } from 'react-toastify'

// One wallet + AuthFetch shared by this module
const WALLET_ORIGIN = process.env.WALLET_ORIGIN ?? 'localhost:3321'
const wallet = new WalletClient('auto', WALLET_ORIGIN)
const authFetch = new AuthFetch(wallet)

interface CodeSnippetProps {
  code: string
  language: string
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
  const [buttonText, setButtonText] = useState('Pay Now')
  const [paymentAmount, setPaymentAmount] = useState('5')
  const [merchant, setMerchant] = useState('')
  const [buttonID, setButtonID] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [hasMetanet, setHasMetanet] = useState(false)
  const [copySuccess, setCopySuccess] = useState('')
  const [customCSS, setCustomCSS] = useState(`.gateway-button-styles {
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
  }
  .gateway-button-styles:hover {
    cursor: pointer;
    box-shadow: 4px 8px 12px rgba(0, 0, 0, 0.3);
    background: linear-gradient(145deg, #ABABFF, #5050F2);
  }`)
  const [amountInSats, setAmountInSats] = useState(1000)
  const [currencySymbol, setCurrencySymbol] = useState('$')
  const currencyConverter = new CurrencyConverter()
  const theme = useTheme()

  useEffect(() => {
    ;(async () => {
      try {
        const identity = await wallet.getPublicKey({ identityKey: true })
        setMerchant(identity.publicKey)
        setHasMetanet(true)
      } catch (error) {
        console.error('❌ Failed to fetch Metanet identity:', error)
        setHasMetanet(false)
      }
    })()
  }, [])

  const handleCustomCSSChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCustomCSS(event.target.value)
  }

  useEffect(() => {
    ;(async () => {
      try {
        await currencyConverter.initialize()
        setCurrencySymbol(currencyConverter.getCurrencySymbol())
        const satoshis = await currencyConverter.convertCurrency(
          Number(paymentAmount),
          currencyConverter.preferredCurrency,
          'BSV'
        )
        setAmountInSats(satoshis || 1000)
      } catch (error) {
        console.error('❌ Failed to fetch currency:', error)
      }
    })()
  }, [paymentAmount])

  const handleAmountChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target.value.replace(/[^0-9.]/g, '')
    setPaymentAmount(input)
    setShowCode(false)
    try {
      const satoshis = await currencyConverter.convertCurrency(
        Number(input),
        currencyConverter.preferredCurrency,
        'BSV'
      )
      setAmountInSats(satoshis || 1000)
    } catch (error) {
      console.error('❌ Error converting currency:', error)
    }
  }, [])

  const handleCopyCode = async () => {
    const code = `${customCSS ? `<style>\n${customCSS}\n</style>` : ''}
  <div
    class="gateway-paybutton"
    data-merchant="${merchant}"
    data-button="${buttonID}"
    data-amount="${amountInSats}"
    data-currency="BSV"
    data-text="${buttonText}"
    data-server="${location.protocol}//${location.host}"
  ></div>`

    try {
      await navigator.clipboard.writeText(code)
      setCopySuccess('success')
      setTimeout(() => setCopySuccess(''), 2000)
      toast.success('Code copied to clipboard')
    } catch (err) {
      setCopySuccess('failed')
      toast.error('Failed to copy code')
    }
  }

  useEffect(() => {
    const styleElement = document.createElement('style')
    styleElement.id = 'custom-button-styles'
    styleElement.innerHTML = customCSS
    document.head.appendChild(styleElement)

    return () => {
      document.head.removeChild(styleElement)
    }
  }, [customCSS])

  const handleSubmit = async () => {
    if (!hasMetanet) {
      toast.error('Metanet client required! Download at https://metanet.bsvb.tech')
      return
    }

    try {
      const response = await authFetch.fetch(`${location.protocol}//${location.host}/api/createButton`, {
        method: 'POST',
        body: JSON.stringify({
          merchant,
          amount: Number(paymentAmount) / 100000000, // Convert satoshis to BSV
          currency: 'BSV',
          multiUse: true,
          variableAmount: true,
          accepts: 'BSV'
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()
      if (data.buttonId) {
        setButtonID(data.buttonId)
        setShowCode(true)
        toast.success('Button created successfully')
      } else {
        toast.error('Failed to create button')
      }
    } catch (error) {
      console.error('❌ Error creating button:', error)
      toast.error('Error creating button')
    }
  }

  return (
    <Root>
      <Container maxWidth="lg">
        <ContentWrap>
          <CenteredHeader>
            <Typography variant="h2">Create Your Tipping Button</Typography>
            <Typography variant="subtitle1">Instantly generate code to embed tipping buttons on your site.</Typography>
          </CenteredHeader>

          <Grid container spacing={4}>
            <Grid item xs={12} md={4}>
              <FormSection elevation={3}>
                <Typography variant="h4" gutterBottom>
                  Configure Your Button
                </Typography>
                <TextFieldStyled
                  label="Button Text"
                  value={buttonText}
                  onChange={e => {
                    setButtonText(e.target.value)
                    setShowCode(false)
                  }}
                  fullWidth
                  margin="normal"
                />
                <TextFieldStyled
                  label="Tip Amount"
                  value={paymentAmount}
                  onChange={handleAmountChange}
                  type="number"
                  fullWidth
                  margin="normal"
                  InputProps={{
                    startAdornment: <InputAdornment position="start">{currencySymbol}</InputAdornment>
                  }}
                />
                <TextFieldStyled
                  label="Custom CSS"
                  value={customCSS}
                  onChange={handleCustomCSSChange}
                  fullWidth
                  margin="normal"
                  multiline
                />
                <ButtonStyled
                  variant="contained"
                  color="primary"
                  fullWidth
                  sx={{ marginTop: 2 }}
                  onClick={handleSubmit}
                >
                  Generate Code
                </ButtonStyled>
              </FormSection>
            </Grid>

            <Grid item xs={12} md={8}>
              <PreviewSection elevation={3} sx={{ position: 'relative' }}>
                <Typography
                  variant="h4"
                  gutterBottom
                  component="div"
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  Button Preview
                  {showCode && (
                    <Tooltip title="Copy Code">
                      <IconButton onClick={handleCopyCode}>
                        {copySuccess === 'success' ? <CheckCircleIcon color="success" /> : <ContentCopyIcon />}
                      </IconButton>
                    </Tooltip>
                  )}
                </Typography>

                {copySuccess === 'failed' && <Typography color="error">Failed to copy code!</Typography>}

                <Box>
                  {showCode ? (
                    <CodePreview>
                      <CodeSnippet
                        language="html"
                        code={`${customCSS ? `<style>\n${customCSS}\n</style>` : ''}
  <div
    class="gateway-paybutton"
    data-merchant="${merchant}"
    data-button="${buttonID}"
    data-amount="${amountInSats}"
    data-currency="BSV"
    data-text="${buttonText}"
    data-server="${location.protocol}//${location.host}"
  ></div>`}
                      />
                    </CodePreview>
                  ) : (
                    <Typography>Click "Generate Code" to get the HTML code for your website!</Typography>
                  )}
                </Box>

                <Typography variant="h5" gutterBottom>
                  Script for Head Tag
                </Typography>
                <CodePreview>
                  <CodeSnippet
                    language="javascript"
                    code={`<script src="${location.protocol}//${location.host}/pay.js"></script>`}
                  />
                </CodePreview>
              </PreviewSection>
            </Grid>
          </Grid>
        </ContentWrap>
      </Container>
    </Root>
  )
}

export default Create
