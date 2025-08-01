/**
 * @file src/pages/Payments/index.tsx
 *
 * Displays a paginated table of received payments tied to user payment buttons
 * Each row represents a payment, showing ID, amount, currency, completion status, and more
 *
 * - Fetches payments from the backend using `authFetch` and the Metanet client with full data fetch
 * - Highlights and allows acknowledging of "new" payments
 * - Includes filters, sorting by all columns via clickable headers, and pagination with an empty state
 * - Utilizes `formatBSV` from `utils/general.ts` for consistent amount formatting
 * - Uses `logWithTimestamp` from `utils/logging.ts` with configuration from `logging.config.ts` to measure performance and color-code logs
 * - Optimizes performance with single initial fetch
 *
 * Used by the Gateway UI to manage incoming payment activity
 * Version: v3.3 (Updated 01Aug2025_0335 BST with Fixed Type Errors and Restored acknowledgePayment)
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
  TextField,
} from '@mui/material'
import { ReceiptLong } from '@mui/icons-material'
import { WalletClient, AuthFetch } from '@bsv/sdk'
import { useTheme } from '@mui/material/styles'
import { Link } from 'react-router-dom'
import { formatBSV } from '../../utils/general'
import { logWithTimestamp } from '../../utils/logging'
import type { SelectChangeEvent } from '@mui/material/Select'

/**
 * Represents a payment received through a payment button
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
  message: string
  data: Payment[]
  total?: number
}

interface SortConfig {
  key: keyof Payment | null
  direction: 'asc' | 'desc'
}

const WALLET_ORIGIN = process.env.WALLET_ORIGIN ?? 'localhost:3321'
const wallet = new WalletClient('auto', WALLET_ORIGIN)
const authFetch = new AuthFetch(wallet)

const PaymentsList = () => {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(5)
  const [customRowsPerPage, setCustomRowsPerPage] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'new'>('all')
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'desc' })
  const [customOptions, setCustomOptions] = useState<number[]>([])
  const [totalRecords, setTotalRecords] = useState(0)
  const theme = useTheme()
  const fetchTimeout = useRef<number | null>(null)

  useEffect(() => {
    const fetchTotal = async () => {
      setLoading(true)
      try {
        const url = `${location.protocol}//${location.host}/api/listPayments?limit=1000`
        logWithTimestamp('pages/Payments', 'Fetching total payments with URL:', url)
        const response = await authFetch.fetch(url, { method: 'GET' })
        const data: PaymentResponse = await response.json()
        if (data.status === 'error') throw new Error(`❌ ${data.message ?? 'Failed to fetch total payments'}`)
        const sortedPayments = [...data.data].sort((a, b) => {
          let aValue: string | number = a.payment_id ? a.payment_id.toString() : ''
          let bValue: string | number = b.payment_id ? b.payment_id.toString() : ''
          return aValue.localeCompare(bValue as string)
        })
        setTotalRecords(data.data.length)
        setPayments(sortedPayments)
        logWithTimestamp('pages/Payments', 'Initial payments length:', sortedPayments.length)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        logWithTimestamp('pages/Payments', 'Error fetching total payments:', message)
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    fetchTotal()
  }, [])

  useEffect(() => {
    setPage(0)
  }, [statusFilter])

  const requestSort = (key: keyof Payment) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const handleRowsPerPageChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    const value = event.target.value
    logWithTimestamp('pages/Payments', 'Rows per page change:', value, 'Current options:', rowsPerPageOptions.map(opt => opt.value))
    if (typeof value === 'object' && value !== null && 'value' in value && value.value === 0) {
      setShowCustomInput(true)
    } else {
      const numValue = typeof value === 'number' ? value : (value as any)?.value || 5
      const isValidOption = rowsPerPageOptions.some(option => option.value === numValue)
      if (isValidOption) {
        setRowsPerPage(numValue)
        setCustomRowsPerPage('')
        setShowCustomInput(false)
        setPage(0)
      } else {
        setRowsPerPage(5)
        setPage(0)
      }
    }
  }

  const handleCustomRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.replace(/[^0-9]/g, '')
    setCustomRowsPerPage(value)
  }

  const handleCustomInputComplete = (event: React.KeyboardEvent<HTMLDivElement> | React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.type === 'keypress' && (event as React.KeyboardEvent<HTMLDivElement>).key !== 'Enter') return
    const numValue = parseInt(customRowsPerPage, 10)
    logWithTimestamp('pages/Payments', 'Custom rows on complete:', numValue)
    if (isNaN(numValue) || numValue <= 0 || numValue > 100) {
      setRowsPerPage(5)
    } else {
      setRowsPerPage(numValue)
      setCustomOptions(prev => {
        if (!prev.includes(numValue) && ![5, 10, 25].includes(numValue)) {
          return [...prev, numValue].sort((a, b) => a - b).slice(-3)
        }
        return prev
      })
    }
    setCustomRowsPerPage('')
    setShowCustomInput(false)
    setPage(0)
  }

  const baseOptions = [{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 25, label: '25' }]
  const rowsPerPageOptions = [
    { value: 0, label: 'set 5..100' },
    ...baseOptions,
    ...customOptions.map(value => ({ value, label: value.toString() })),
  ]

  const filteredPayments = statusFilter === 'all'
    ? payments
    : payments.filter(payment =>
        (statusFilter === 'completed' && payment.completed) ||
        (statusFilter === 'new' && payment.is_new)
      )

  const sortedPayments = sortConfig.key
    ? [...filteredPayments].sort((a, b) => {
        if (!sortConfig.key) return 0 // Default to no change if key is null
        let aValue: string | number | undefined = a[sortConfig.key] !== undefined ? a[sortConfig.key]?.toString() : ''
        let bValue: string | number | undefined = b[sortConfig.key] !== undefined ? b[sortConfig.key]?.toString() : ''
        if (sortConfig.key === 'amount') {
          aValue = parseFloat(formatBSV(aValue as string)) || 0
          bValue = parseFloat(formatBSV(bValue as string)) || 0
          return sortConfig.direction === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number)
        } else if (sortConfig.key === 'completed' || sortConfig.key === 'is_new') {
          aValue = a[sortConfig.key] ? 1 : 0
          bValue = b[sortConfig.key] ? 1 : 0
          return sortConfig.direction === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number)
        } else {
          if (typeof aValue === 'string' && typeof bValue === 'string') {
            logWithTimestamp('pages/Payments', `Sorting ${sortConfig.key}: aValue=${aValue}, bValue=${bValue}`)
            return sortConfig.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
          }
          return 0 // Fallback if types don't match
        }
      })
    : filteredPayments

  const paginatedPayments = sortedPayments.slice(page * rowsPerPage, (page + 1) * rowsPerPage)
  logWithTimestamp('pages/Payments', 'Paginated payments length:', paginatedPayments.length, 'Total payments length:', payments.length, 'Filtered length:', filteredPayments.length, 'Sorted length:', sortedPayments.length, 'Page:', page, 'Offset:', page * rowsPerPage)

  const acknowledgePayment = async (paymentId: string) => {
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
      // Refresh the payments list after acknowledgment
      const url = `${location.protocol}//${location.host}/api/listPayments?limit=1000`
      const refreshResponse = await authFetch.fetch(url, { method: 'GET' })
      const refreshData: PaymentResponse = await refreshResponse.json()
      if (refreshData.status === 'error') throw new Error(`❌ ${refreshData.message ?? 'Failed to refresh payments'}`)
      setPayments(refreshData.data)
      setTotalRecords(refreshData.data.length)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logWithTimestamp('pages/Payments', 'Error acknowledging payment:', message)
      setError(message)
    }
  }

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
          <Stack spacing={3} alignItems='center'>
            <ReceiptLong sx={{ fontSize: 60, color: theme.palette.text.secondary }} />
            <Typography variant='h2'>No Payments Yet</Typography>
            <Typography color='text.secondary'>
              It looks like you haven’t received any payments. Check your buttons or create a new one!
            </Typography>
            <Button variant='contained' component={Link} to='/buttons' color='primary'>
              View Your Buttons
            </Button>
          </Stack>
        </Card>
      ) : (
        <>
          <Stack direction='row' spacing={2} sx={{ mb: 2, justifyContent: 'flex-end' }}>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'completed' | 'new')}
              variant='outlined'
            >
              <MenuItem value='all'>All</MenuItem>
              <MenuItem value='completed'>Complete</MenuItem>
              <MenuItem value='new'>New</MenuItem>
            </Select>
          </Stack>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <Typography
                      component='a'
                      href='#'
                      onClick={(e) => { e.preventDefault(); requestSort('payment_id'); }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Payment ID {sortConfig.key === 'payment_id' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component='a'
                      href='#'
                      onClick={(e) => { e.preventDefault(); requestSort('payment_button_id'); }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Button ID {sortConfig.key === 'payment_button_id' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component='a'
                      href='#'
                      onClick={(e) => { e.preventDefault(); requestSort('amount'); }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Amount {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component='a'
                      href='#'
                      onClick={(e) => { e.preventDefault(); requestSort('currency'); }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Currency {sortConfig.key === 'currency' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component='a'
                      href='#'
                      onClick={(e) => { e.preventDefault(); requestSort('completed'); }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Complete {sortConfig.key === 'completed' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component='a'
                      href='#'
                      onClick={(e) => { e.preventDefault(); requestSort('is_new'); }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      New {sortConfig.key === 'is_new' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
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
                          variant='contained'
                          color='primary'
                          onClick={() => acknowledgePayment(payment.payment_id).catch(() => {})}
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
            component='div'
            count={totalRecords}
            page={page}
            onPageChange={(e, newPage) => {
              setPage(newPage)
              logWithTimestamp('pages/Payments', 'Page changed to:', newPage, 'Rows:', paginatedPayments)
            }}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleRowsPerPageChange}
            rowsPerPageOptions={rowsPerPageOptions}
          />
          {showCustomInput && (
            <Box sx={{ mb: 2, textAlign: 'right' }}>
              <TextField
                type='number'
                label='Custom Rows'
                value={customRowsPerPage}
                onChange={handleCustomRowsPerPageChange}
                onKeyPress={handleCustomInputComplete}
                onBlur={handleCustomInputComplete}
                variant='outlined'
                size='small'
                inputProps={{ min: 1, max: 100, step: 1 }}
                sx={{ width: 100 }}
              />
            </Box>
          )}
        </>
      )}
    </Container>
  )
}

export default PaymentsList
