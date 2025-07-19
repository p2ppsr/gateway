// frontend/src/pages/Payments/index.tsx
import React, { useState, useEffect } from 'react'
import {
  CircularProgress,
  Container,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Button,
  Paper,
  IconButton,
  Box
} from '@mui/material'
import { ArrowBack, ArrowForward } from '@mui/icons-material'
import { WalletClient, AuthFetch } from '@bsv/sdk'
import { useTheme } from '@mui/material/styles'

const formatBSV = (value: number | string): string => {
  return parseFloat(value.toString()).toFixed(8)
}

interface Payment {
  payment_id: string
  payment_button_id: string
  amount: number | string
  currency: string
  completed: boolean
  is_new: boolean
  transaction_info?: string
  merchant_id?: string
}

const WALLET_ORIGIN = process.env.WALLET_ORIGIN ?? 'localhost:3321'
const wallet = new WalletClient('auto', WALLET_ORIGIN)
const authFetch = new AuthFetch(wallet)

const PaymentsList: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [page, setPage] = useState(1)
  const sortOrder = 'desc'

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

  const acknowledgePayment = async (paymentId: string) => {
    try {
      const response = await authFetch.fetch(`${location.protocol}//${location.host}/api/acknowledgePayment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ paymentId })
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`)
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
  }, [page])

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
                <TableCell>{payment.payment_button_id}</TableCell>
                <TableCell>{formatBSV(payment.amount)}</TableCell>
                <TableCell>{payment.currency}</TableCell>
                <TableCell>{payment.completed ? 'Yes' : 'No'}</TableCell>
                <TableCell>{payment.is_new ? 'Yes' : 'No'}</TableCell>
                <TableCell>
                  {payment.is_new && (
                    <Button variant="contained" color="primary" onClick={() => acknowledgePayment(payment.payment_id)}>
                      Acknowledge
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {payments.length === 0 && <Typography sx={{ paddingTop: '1em' }}>No payments found.</Typography>}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mt: 2
        }}
      >
        <IconButton onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
          <ArrowBack />
        </IconButton>
        <IconButton onClick={() => setPage(page + 1)}>
          <ArrowForward />
        </IconButton>
      </Box>
    </Container>
  )
}

export default PaymentsList
