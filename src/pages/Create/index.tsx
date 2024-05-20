import React, { useState, useEffect, useCallback } from 'react'
import {
  Typography,
  TextField,
  Button,
  Container,
  Grid,
  Paper,
  Box,
  InputAdornment,
  Tooltip,
  IconButton,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import PayButton from '../../components/PayButton'
import checkForMetaNetClient from '../../utils/checkForMetaNetClient'
import { getPublicKey } from '@babbage/sdk-ts'
import authrite from '../../utils/Authrite'
import useStyles from './style'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { atomDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from '@mui/material/styles'
import { AmountInputField } from 'amountinator-react'
import { CurrencyConverter } from 'amountinator'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { toast } from 'react-toastify'

const CodeSnippet = ({ code, language }) => {
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
  const [hasMetaNet, setHasMetaNet] = useState(false)
  const [copySuccess, setCopySuccess] = useState('')
  const [customCSS, setCustomCSS] = useState(
    `.gateway-button-styles {
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
}`
  )
  const [amountInSats, setAmountInSats] = useState(1000)
  const [currencySymbol, setCurrencySymbol] = useState('$')
  const currencyConverter = new CurrencyConverter()
  const classes = useStyles()
  const theme = useTheme()

  useEffect(() => {
    (async () => {
      const metaNetClient = await checkForMetaNetClient()
      if (metaNetClient === 0) {
        setHasMetaNet(false)
      } else {
        const identity = await getPublicKey({ identityKey: true })
        setMerchant(identity)
        setHasMetaNet(true)
      }
    })()
  }, [])

  const handleCustomCSSChange = (event) => {
    setCustomCSS(event.target.value)
  }

  useEffect(() => {
    (async () => {
      try {
        await currencyConverter.initialize()
        setCurrencySymbol(currencyConverter.getCurrencySymbol())
        const satoshis = await currencyConverter.convertCurrency(Number(paymentAmount), currencyConverter.preferredCurrency, 'BSV')
        setAmountInSats(satoshis || 1000)
      } catch (error) {
        console.error('Failed to fetch currency:', error)
      }
    })()
  }, [])

  const handleAmountChange = useCallback(async (event: any) => {
    const input = event.target.value.replace(/[^0-9.]/g, '')
    setPaymentAmount(input)
    setShowCode(false)
    console.log('entered', input)
    try {
      const satoshis = await currencyConverter.convertCurrency(Number(input), currencyConverter.preferredCurrency, 'BSV')
      console.log('amount', satoshis)
      setAmountInSats(satoshis || 1000)
    } catch (error) {
      console.error('Error converting currency:', error)
    }
  }, [])

  const handleCopyCode = async () => {
    const code = `${customCSS ? `<style>
${customCSS}
</style>` : ''}
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
    } catch (err) {
      setCopySuccess('failed')
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
    if (!hasMetaNet) {
      return alert(
        'Download MetaNet Client!\n\nhttps://projectbabbage.com/metanet-client'
      )
    }
    const createResponse = await authrite.request(
      `${location.protocol}//${location.host}/api/createButton`,
      {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(paymentAmount),
          currency: 'BSV',
          multiUse: true,
          variableAmount: true,
          accepts: 'BSV',
        }),
      }
    )
    const create = JSON.parse(new TextDecoder().decode(createResponse.body))
    setButtonID(create.buttonId)
    setShowCode(true)
  }

  return (
    <Box className={classes.root}>
      <Container maxWidth="lg">
        <Box className={classes.contentWrap}>
          <Box className={classes.centeredHeader}>
            <Typography variant="h2">Create Your Tipping Button</Typography>
            <Typography variant="subtitle1">
              Instantly generate code to embed tipping buttons on your site.
            </Typography>
          </Box>

          <Grid container spacing={4}>
            <Grid
              item
              xs={12}
              md={4}
              style={{
                borderRadius: '0.8em',
                overflow: 'hidden',
              }}
            >
              <Paper elevation={3} className={classes.formSection} style={{ borderRadius: '0.8em' }}>
                <Typography variant="h4" gutterBottom>
                  Configure Your Button
                </Typography>
                <TextField
                  label="Button Text"
                  value={buttonText}
                  onChange={(e) => {
                    setButtonText(e.target.value)
                    setShowCode(false)
                  }}
                  fullWidth
                  margin="normal"
                  className={classes.textField}
                />
                <TextField
                  label="Tip Amount"
                  value={paymentAmount}
                  onChange={handleAmountChange}
                  type="number"
                  fullWidth
                  margin="normal"
                  className={classes.textField}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">{currencySymbol}</InputAdornment>
                  }}
                />

                <TextField
                  label="Custom CSS"
                  value={customCSS}
                  onChange={handleCustomCSSChange}
                  fullWidth
                  margin="normal"
                  className={classes.textField}
                  multiline
                />
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  sx={{ marginTop: 2 }}
                  onClick={handleSubmit}
                >
                  Generate Code
                </Button>
              </Paper>
            </Grid>

            <Grid
              item
              xs={12}
              md={8}
              style={{
                borderRadius: '0.8em',
                overflow: 'hidden',
              }}
            >
              <Paper elevation={3} className={classes.previewSection} style={{ borderRadius: '0.8em', position: 'relative' }}>
                <Typography variant="h4" gutterBottom component="div" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                    <Box className="codePreview">
                      <CodeSnippet
                        language="html"
                        code={`${customCSS ? `<style>
${customCSS}
</style>` : ''}
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
                    </Box>
                  ) : (
                    <Typography>
                      Click "Generate Code" to get the HTML code for your website!
                    </Typography>
                  )}
                </Box>
                <Typography variant="h5" gutterBottom>
                  Script for Head Tag
                </Typography>
                <Box className={classes.codePreview}>
                  <CodeSnippet
                    language="javascript"
                    code={`<script src="${location.protocol}//${location.host}/pay.js"></script>`}
                  />
                </Box>
              </Paper>
            </Grid>
          </Grid>

        </Box>
      </Container>
    </Box>
  )
}

export default Create
