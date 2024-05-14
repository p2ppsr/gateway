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
} from '@mui/material'
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
  const [customCSS, setCustomCSS] = useState(
    `.customCSS {
  border-radius: 2em;
  border: none;
  padding: 0.7em;
  min-width: 10em;
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
      await currencyConverter.initialize()
      setCurrencySymbol(currencyConverter.getCurrencySymbol())
      const satoshis = await currencyConverter.convertCurrency(Number(paymentAmount), currencyConverter.preferredCurrency, 'BSV')
      setAmountInSats(satoshis || 1000)
    })()
  }, [])

  const handleAmountChange = useCallback(async (event: any) => {
    const input = event.target.value.replace(/[^0-9.]/g, '')
    // setPaymentAmount(paymentAmount) // ??
    setPaymentAmount(input)
    setShowCode(false)
    console.log('entered', input)
    // if (input !== paymentAmount) {
    try {
      const satoshis = await currencyConverter.convertCurrency(Number(input), currencyConverter.preferredCurrency, 'BSV')
      console.log('amount', satoshis)
      setAmountInSats(satoshis || 1000)
    } catch (error) {
      console.error('Error converting currency:', error)
    }
    // }
  }, [])

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
              <Paper elevation={3} className={classes.previewSection} style={{ borderRadius: '0.8em' }}>
                <Typography variant="h4" gutterBottom>
                  Button Preview
                </Typography>
                <Box sx={{ marginBottom: 2 }}>
                  <PayButton
                    text={buttonText}
                    amount={Number(paymentAmount)}
                    merchant={merchant}
                    button={buttonID}
                    server={`${location.protocol}//${location.host}`}
                  />
                </Box>
                <Typography variant="h5" gutterBottom>
                  Code Snippet
                </Typography>
                {showCode ? (
                  <Box className={classes.codePreview}>
                    <CodeSnippet
                      language="html"
                      code={`${customCSS ? `<style>
${customCSS}
</style>` : ''}
<div
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
