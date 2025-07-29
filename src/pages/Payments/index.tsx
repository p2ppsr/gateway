/**
 * @file src/pages/Payments/index.tsx
 *
 * Displays a paginated table of received payments tied to user payment buttons.
 * Each row represents a payment, showing ID, amount, currency, completion status, and more.
 *
 * - Fetches payments from the backend using `authFetch` and the Metanet client.
 * - Highlights and allows acknowledging of "new" payments.
 * - Includes filters, sorting, and pagination with an empty state.
 * - Utilizes `formatBSV` from `utils/general.ts` for consistent amount formatting.
 * - Uses `logWithTimestamp` from `utils/logging.ts` with configuration from `logging.config.ts` to measure performance and color-code logs.
 * - Optimizes performance with a 100ms debounce to prevent multiple rapid fetch attempts.
 *
 * Used by the Gateway UI to manage incoming payment activity.
 * Version: v1.5 (Updated 25Jul2025_1045 BST)
 */

import React, { useState, useEffect, useRef } from 'react'
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
  Select,
  MenuItem,
  Stack,
  TablePagination,
  IconButton,
  Box,
  Card,
} from '@mui/material'
import { ArrowBack, ArrowForward, ReceiptLong } from '@mui/icons-material'
import { WalletClient, AuthFetch } from '@bsv/sdk'
import { useTheme } from '@mui/material/styles'
import { Link } from 'react-router-dom'
import { formatBSV } from '../../utils/general'
import { logWithTimestamp } from '../../utils/logging'

/**
 * Represents a payment received through a payment button.
 */
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

interface PaymentResponse {
  status: string
  message?: string
  data: Payment[]
}

const WALLET_ORIGIN = process.env.WALLET_ORIGIN ?? 'localhost:3321'
const wallet = new WalletClient('auto', WALLET_ORIGIN)
const authFetch = new AuthFetch(wallet)

const PaymentsList: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(5)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'new'>('all')
  const theme = useTheme()
  const fetchTimeout = useRef<number | null>(null)

  const fetchPayments = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const url = `${location.protocol}//${location.host}/api/listPayments?limit=100&sort=${sortOrder}` // Fetch all data
      logWithTimestamp('pages/Payments', 'Fetching payments with URL:', url)

      const response = await authFetch.fetch(url, { method: 'GET' })
      if (!response.ok) throw new Error(`❌ HTTP error! status: ${response.status.toString()}`)
      const data: PaymentResponse = await response.json()
      if (data.status === 'error') throw new Error(`❌ ${data.message ?? 'Failed to fetch payments'}`)
      setPayments(data.data)
      logWithTimestamp('pages/Payments', 'Fetched payments:', data.data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logWithTimestamp('pages/Payments', 'Error fetching payments:', message)
      setError(`❌ Fetching payments failed: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  const acknowledgePayment = async (paymentId: string): Promise<void> => {
    try {
      const response = await authFetch.fetch(`${location.protocol}//${location.host}/api/acknowledgePayment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`❌ HTTP error! status: ${response.status.toString()}, body: ${errorText}`)
      }
      const data: PaymentResponse = await response.json()
      if (data.status === 'error') throw new Error(`❌ ${data.message ?? 'Failed to acknowledge payment'}`)
      logWithTimestamp('pages/Payments', 'Successfully acknowledged payment:', paymentId)
      logWithTimestamp('pages/Payments', 'Acknowledgment response:', data)
      await fetchPayments() // Refresh the list
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logWithTimestamp('pages/Payments', 'Error acknowledging payment:', message)
      setError(`❌ Acknowledging payment failed: ${message}`)
    }
  }

  useEffect(() => {
    if (fetchTimeout.current) {
      clearTimeout(fetchTimeout.current)
    }
    fetchTimeout.current = setTimeout(() => {
      void fetchPayments()
    }, 100) // Debounce by 100ms
    return () => {
      if (fetchTimeout.current) {
        clearTimeout(fetchTimeout.current)
      }
    }
  }, [sortOrder, rowsPerPage]) // Fetch only on sort or rowsPerPage change

  // Reset page to 0 when statusFilter changes
  useEffect(() => {
    setPage(0)
  }, [statusFilter])

  // Apply client-side filtering based on statusFilter
  const filteredPayments = statusFilter === 'all'
    ? payments
    : payments.filter(payment => 
        (statusFilter === 'completed' && payment.completed) ||
        (statusFilter === 'new' && payment.is_new)
      )
  logWithTimestamp('pages/Payments', 'Filtered payments by status:', statusFilter, filteredPayments)

  // Apply pagination
  const paginatedPayments = filteredPayments.slice(page * rowsPerPage, (page + 1) * rowsPerPage)
  logWithTimestamp('pages/Payments', 'Paginated payments for page', page, 'range:', `${page * rowsPerPage}-${(page + 1) * rowsPerPage - 1}`, paginatedPayments)

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          backgroundColor: theme.palette.background.default,
        }}
      >
        <CircularProgress />
      </Box>
    )
  }
  if (error !== '') return <Typography color='error'>{error}</Typography>

  return (
    <Container>
      <Box
        sx={{
          textAlign: 'center',
          marginBottom: theme.spacing(4),
          marginTop: theme.spacing(5),
          color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
        }}
      >
        <Typography variant='h2'>Payments</Typography>
        <Typography variant='subtitle1'>Acknowledge your incoming payments</Typography>
      </Box>
      {filteredPayments.length === 0 ? (
        <Card
          sx={{
            maxWidth: 600,
            margin: 'auto',
            padding: theme.spacing(4),
            textAlign: 'center',
            backgroundColor: theme.palette.background.paper,
          }}
        >
          <Stack spacing={3} alignItems="center">
            <ReceiptLong sx={{ fontSize: 60, color: theme.palette.text.secondary }} />
            <Typography variant="h2">No Payments Yet</Typography>
            <Typography color="text.secondary">
              It looks like you haven’t received any payments. Check your buttons or create a new one!
            </Typography>
            <Button variant="contained" component={Link} to="/buttons" color="primary">
              View Your Buttons
            </Button>
          </Stack>
        </Card>
      ) : (
        <>
          <Stack direction="row" spacing={2} sx={{ mb: 2, justifyContent: 'flex-end' }}>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'completed' | 'new')}
              variant="outlined"
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="new">New</MenuItem>
            </Select>
            <Button
              variant="contained"
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            >
              Sort by Amount: {sortOrder.toUpperCase()}
            </Button>
          </Stack>
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
                {paginatedPayments.map((payment) => (
                  <TableRow key={payment.payment_id}>
                    <TableCell>{payment.payment_id}</TableCell>
                    <TableCell>{payment.payment_button_id}</TableCell>
                    <TableCell>{formatBSV(payment.amount)}</TableCell>
                    <TableCell>{payment.currency}</TableCell>
                    <TableCell>{payment.completed ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{payment.is_new ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      {payment.is_new && (
                        <Button
                          variant="contained"
                          color="primary"
                          onClick={() => { acknowledgePayment(payment.payment_id).catch(() => {}); }}
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
          <TablePagination
            component="div"
            count={filteredPayments.length} // Use filtered count
            page={page}
            onPageChange={(e, newPage) => {
              setPage(newPage)
              logWithTimestamp('pages/Payments', 'Page changed to:', newPage, 'Rows:', paginatedPayments)
            }}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10))
              setPage(0) // Reset to first page on rowsPerPage change
              logWithTimestamp('pages/Payments', 'Rows per page changed to:', e.target.value)
            }}
            rowsPerPageOptions={[5, 10, 25]}
          />
        </>
      )}
    </Container>
  )
}

export default PaymentsList
