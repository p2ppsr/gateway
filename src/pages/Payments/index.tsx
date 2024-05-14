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
  Box,
} from '@mui/material'
import { ArrowBack, ArrowForward, Sort } from '@mui/icons-material'
import authrite from '../../utils/Authrite'
import { submitDirectTransaction } from '@babbage/sdk-ts'
import { getPaymentAddress } from 'sendover'
import { Transaction, P2PKH, PrivateKey, PublicKey } from '@bsv/sdk'

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

const PaymentsList: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [page, setPage] = useState(1)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const fetchPayments = async () => {
    setLoading(true)
    setError('')
    try {
      const url = `${location.protocol}//${location.host}/api/listPayments?limit=25&offset=${(page - 1) * 25}&sort=${sortOrder}`
      const response = await authrite.request(url, { method: 'GET' })
      const data = JSON.parse(new TextDecoder().decode(response.body))
      if (data.status === 'error') {
        throw new Error(response.message)
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
      const derivedPubKey = getPaymentAddress({
        senderPrivateKey: '0000000000000000000000000000000000000000000000000000000000000001',
        recipientPublicKey: payment.merchant_id,
        invoiceNumber: `2-3241645161d8-${payment.payment_id} 1`,
        returnType: 'publicKey',
      })
      const expectedAmount = Math.round(payment.amount * 100000000)

      const pkh = new P2PKH()
      const derivedScript = pkh.lock(PublicKey.fromString(derivedPubKey).toHash()).toHex()
      const bsvtx = Transaction.fromHex(transaction.rawTx)
      const index = bsvtx.outputs.findIndex(
        (x) => x.lockingScript.toHex() === derivedScript && x.satoshis === expectedAmount
      )
      if (index === -1) {
        throw new Error('Could not discover our output of this transaction.')
      }
      const anyonePub = new PrivateKey('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
        .toPublicKey()
        .toDER()
      transaction.outputs = [
        {
          vout: index,
          satoshis: expectedAmount,
          derivationPrefix: payment.payment_id,
          derivationSuffix: '1',
          senderIdentityKey: anyonePub,
        },
      ]

      const success = await submitDirectTransaction({
        protocol: '3241645161d8',
        senderIdentityKey: anyonePub,
        derivationPrefix: payment.payment_id,
        transaction,
        note: 'Receive a payment',
        amount: Math.round(payment.amount * 100000000),
      })
      if (!success.referenceNumber) {
        throw new Error('Unable to submit incoming payment.')
      }
      const response = await authrite.request(`${location.protocol}//${location.host}/api/acknowledgePayment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentId: payment.payment_id }),
      })
      const data = JSON.parse(new TextDecoder().decode(response.body))
      if (data.status === 'error') {
        throw new Error(response.message)
      }
      await fetchPayments() // Refresh the list to show the updated status
    } catch (err: any) {
      setError(`Acknowledging payment failed: ${err.message}`)
    }
  }

  useEffect(() => {
    fetchPayments()
  }, [page, sortOrder])

  if (loading) return <CircularProgress />
  if (error) return <Typography color="error">{error}</Typography>

  return (
    <Container>
      <Typography variant="h4" gutterBottom>
        Payments
      </Typography>
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
            {payments.map((payment) => (
              <TableRow key={payment.payment_id}>
                <TableCell>{payment.payment_id}</TableCell>
                <TableCell>{payment.button_id}</TableCell>
                <TableCell>{payment.amount}</TableCell>
                <TableCell>{payment.currency}</TableCell>
                <TableCell>{payment.completed ? 'Yes' : 'No'}</TableCell>
                <TableCell>{payment.is_new ? 'Yes' : 'No'}</TableCell>
                <TableCell>
                  {payment.is_new && (
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => acknowledgePayment(payment)}
                    >
                      Acknowledge
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {payments.length === 0 && <Typography>No payments found.</Typography>}
      <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
        <IconButton onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
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
