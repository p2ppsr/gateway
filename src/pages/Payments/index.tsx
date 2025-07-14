// frontend/src/pages/Payments/index.tsx
import React, { useState, useEffect } from 'react'
import {
  CircularProgress,
  Container,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Button,
  Paper,
  TableContainer,
  IconButton,
  Box
} from '@mui/material'
import { ArrowBack, ArrowForward, Sort } from '@mui/icons-material'
import {
  Transaction,
  P2PKH,
  PrivateKey,
  PublicKey,
  WalletClient,
  Hash,
  Utils,
  CreateActionArgs,
  AuthFetch
} from '@bsv/sdk'
import { useTheme } from '@mui/material/styles'

interface Payment {
  payment_id: string
  button_id: string
  amount: number
  currency: string
  completed: boolean
  is_new: boolean
  transaction_info: string
  merchant_id: string
}

const wallet = new WalletClient('auto', 'localhost')
const authFetch = new AuthFetch(wallet)

const PaymentsList: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [page, setPage] = useState(1)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const theme = useTheme()

  const fetchPayments = async () => {
    setLoading(true)
    setError('')
    try {
      const url = `${location.protocol}//${location.host}/api/listPayments?limit=25&offset=${(page - 1) * 25}&sort=${sortOrder}`
      const response = await authFetch.fetch(url, { method: 'GET' })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      if (data.status === 'error') {
        throw new Error(data.message)
      }
      setPayments(data.data)
    } catch (err: any) {
      setError(`Fetching payments failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const acknowledgePayment = async (payment: Payment) => {
    try {
      const transaction = JSON.parse(payment.transaction_info)
      const senderPrivKey = new PrivateKey(
        '0000000000000000000000000000000000000000000000000000000000000001',
        'hex'
      )
      const recipientPubKey = PublicKey.fromString(payment.merchant_id)
      const invoiceNumber = `2-3241645161d8-${payment.payment_id} 1`
      const combined = Utils.toArray(
        `${senderPrivKey.toString()}${recipientPubKey.toString()}${invoiceNumber}`,
        'utf8'
      )
      const derivedHash = Hash.sha256(Hash.sha256(combined))
      const derivedPriv = new PrivateKey(Utils.toHex(derivedHash), 'hex')
      const derivedPubKey = derivedPriv.toPublicKey()
      const expectedAmount = Math.round(payment.amount * 100000000)
      const pkh = new P2PKH()
      const derivedScript = pkh.lock(derivedPubKey.toHash()).toHex()
      const bsvtx = Transaction.fromHex(transaction.rawTx)
      const incomingTxid = bsvtx.id('hex')
      const index = bsvtx.outputs.findIndex(
        x =>
          x.lockingScript.toHex() === derivedScript &&
          x.satoshis === expectedAmount
      )
      if (index === -1) {
        throw new Error('Could not discover our output of this transaction.')
      }
      const anyonePriv = new PrivateKey(
        '0000000000000000000000000000000000000000000000000000000000000001',
        'hex'
      )
      const anyonePub = anyonePriv.toPublicKey()

      const anyonePkh = new P2PKH()
      const anyoneScript = anyonePkh.lock(anyonePub.toHash()).toHex()

      const args: CreateActionArgs = {
        description: 'Receive a payment',
        inputs: [
          {
            outpoint: `${incomingTxid}_${index}`,
            unlockingScriptLength: 73,
            inputDescription: 'Acknowledge payment input'
          }
        ],
        outputs: [
          {
            lockingScript: anyoneScript,
            satoshis: expectedAmount,
            outputDescription: 'Acknowledged payment'
          }
        ]
      }
      const { tx } = await wallet.createAction(args)
      if (!tx) {
        throw new Error('Unable to create transaction.')
      }

      const parsedTx = Transaction.fromAtomicBEEF(tx)
      const successTxid = parsedTx.id('hex')
      if (!successTxid) {
        throw new Error('Unable to submit incoming payment.')
      }

      const response = await authFetch.fetch(
        `${location.protocol}//${location.host}/api/acknowledgePayment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ paymentId: payment.payment_id })
        }
      )
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `HTTP error! status: ${response.status}, body: ${errorText}`
        )
      }
      const data = await response.json()
      if (data.status === 'error') {
        throw new Error(data.message)
      }
      await fetchPayments() // Refresh the list
    } catch (err: any) {
      setError(`Acknowledging payment failed: ${err.message}`)
    }
  }

  useEffect(() => {
    fetchPayments()
  }, [page, sortOrder])

  if (loading)
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh'
        }}
      >
        <CircularProgress />
      </Box>
    )
  if (error) return <Typography color="error">{error}</Typography>

  return (
    <Container>
      <Box
        sx={{
          textAlign: 'center',
          marginBottom: theme.spacing(4),
          marginTop: theme.spacing(5),
          color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
        }}
      >
        <Typography variant="h2">Payments</Typography>
        <Typography variant="subtitle1">Acknowledge your incoming payments</Typography>
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Payment ID</TableCell>
              <TableCell>Button ID</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Currency</TableCell>
              <TableCell>Completed</TableCell>
              <TableCell>New</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payments.map(payment => (
              <TableRow key={payment.payment_id}>
                <TableCell>{payment.payment_id}</TableCell>
                <TableCell>{payment.button_id}</TableCell>
                <TableCell>{payment.amount}</TableCell>
                <TableCell>{payment.currency}</TableCell>
                <TableCell>{payment.completed ? 'Yes' : 'No'}</TableCell>
                <TableCell>{payment.is_new ? 'Yes' : 'No'}</TableCell>
                <TableCell>
                  {payment.is_new && (
                    <Button variant="contained" color="primary" onClick={() => acknowledgePayment(payment)}>
                      Acknowledge
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {payments.length === 0 && (
        <Typography sx={{ paddingTop: '1em' }}>No payments found.</Typography>
      )}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mt: 2
        }}
      >
        <IconButton
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          <ArrowBack />
        </IconButton>
        <IconButton onClick={() => setPage(page + 1)}>
          <ArrowForward />
        </IconButton>
        <Button
          variant="outlined"
          startIcon={<Sort />}
          onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
        >
          Sort Order: {sortOrder.toUpperCase()}
        </Button>
      </Box>
    </Container>
  )
}

export default PaymentsList
