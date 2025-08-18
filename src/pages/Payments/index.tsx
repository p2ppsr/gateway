/**
 * @file src/pages/Payments/index.tsx
 *
 * Displays a paginated table of received payments tied to user payment buttons
 * Each row represents a payment, showing Txid, Payment Id, Button Id, Payer Id, Amount, Complete status, New status, Timestamp, and Actions
 *
 * - Fetches payments from the backend using `authFetch` and the Metanet client with full data fetch
 * - Highlights and allows acknowledging of "new" payments
 * - Includes filters, sorting by all columns via clickable headers, and pagination with an empty state
 * - Utilizes `formatBSV` from `utils/general.ts` for consistent amount formatting
 * - Uses `logWithTimestamp` from `utils/logging.ts` with configuration from `logging.config.ts` to measure performance and color-code logs
 * - Updates only on code changes via HMR
 *
 * Used by the Gateway UI to manage incoming payment activity
 * Version: v4.33 (Updated 14Aug2025_0155 BST to fix API response mapping after schema update)
 * Change Log:
 * - 01Aug2025_0335 BST (v3.3): Fixed Type Errors and Restored acknowledgePayment.
 * - 05Aug2025_0700 BST (v3.4): Updated to display transaction_id as ID (showing txid), integrated title "Transaction History" from API response, and aligned with listPayments v1.1 changes.
 * - 05Aug2025_0710 BST (v3.5): Fixed TypeScript errors in sorting logic by adding type guards for aValue and bValue to prevent undefined errors.
 * - 05Aug2025_0720 BST (v3.6): Added force data refresh on page load by clearing payments state and triggering re-fetch, addressing potential stale data issues.
 * - 05Aug2025_0730 BST (v3.7): Added pre-processing for payment.amount to handle invalid or undefined values before calling formatBSV, fixing TypeError.
 * - 05Aug2025_0825 BST (v4.0): Added Time column with created_at, formatted txid as 'first5...last5' with tooltip, and prepared for future Satoshis switch.
 * - 05Aug2025_0830 BST (v4.1): Fixed Action column to ensure Acknowledge buttons appear for new payments, added fallback for missing timestamps, and defaulted currency to BSV.
 * - 05Aug2025_0900 BST (v4.3): Replaced payment_id with transaction_id (aliased as ID, formatted as first5...last5), added Time column, ensured defaults.
 * - 05Aug2025_1510 BST (v4.4): Fixed TypeScript error in onRowsPerPageChange prop by aligning event type with TablePagination input (reverted in v4.5).
 * - 05Aug2025_1525 BST (v4.5): Reverted to original dropdown logic, replaced payment_id with transaction_id (formatted as first5...last5), and added Time column.
 * - 05Aug2025_1535 BST (v4.6): Reverted Acknowledge button logic to v3.3, debugged Time and Amount columns.
 * - 05Aug2025_1555 BST (v4.7): Reverted Acknowledge logic to use payment_id, further debugged Time and Amount issues.
 * - 05Aug2025_1615 BST (v4.8): Aligned with database schema, fixed Time, Amount, and Acknowledge display with proper mapping.
 * - 05Aug2025_1625 BST (v4.9): Reverted Amount formatting to v3.3, aligned with database schema for Time and Acknowledge.
 * - 05Aug2025_1600 BST (v4.10): Debugged API response to ensure all fields are returned.
 * - 05Aug2025_1800 BST (v4.11): Fixed API response mapping, added detailed logging, and ensured full code delivery.
 * - 05Aug2025_1815 BST (v4.12): Aligned with API field names (e.g., `CreatedAt` to `created_at`, `New` to `is_new`) with frontend expectations and added detailed logging for debugging.
 * - 05Aug2025_1830 BST (v4.13): Fixed TypeScript errors (TS2551, TS2367) by aligning `transaction_id` with `ID` and correcting boolean type handling for `completed` and `is_new`, ensured full file delivery.
 * - 05Aug2025_1935 BST (v4.14): Reordered columns to (timestamp, txid, Payment Id, Button Id), integrated formatId and formatTimestamp functions.
 * - 05Aug2025_1940 BST (v4.15): Ensured full file delivery and corrected any truncation issues.
 * - 05Aug2025_1955 BST (v4.16): Fixed blank payment_id display by adding debugging and ensuring proper mapping.
 * - 05Aug2025_2016 BST (v4.17): Enhanced debugging for payment_id and ensured proper display of blank values.
 * - 05Aug2025_2056 BST (v4.19): Aligned version with Buttons page fix.
 * - 05Aug2025_2106 BST (v4.20): Fixed N/A payment_id using payment_button_id fallback.
 * - 05Aug2025_2122 BST (v4.21): Fixed N/A payment_id using payment_button_id and acknowledge button error with enhanced logging.
 * - 05Aug2025_2139 BST (v4.22): Fixed N/A payment_id rendering and acknowledge button error logging.
 * - 05Aug2025_2147 BST (v4.23): Fixed acknowledge button error with transaction_id.
 * - 05Aug2025_2210 BST (v4.24): Fixed acknowledge button error using transactionId.
 * - 05Aug2025_2218 BST (v4.25): Fixed acknowledge button error with correct paymentId.
 * - 05Aug2025_2249 BST (v4.26): Fixed acknowledge button URL to port 3001.
 * - 05Aug2025_2352 BST (v4.27): Fixed formatId error with undefined values.
 * - 13Aug2025_0340 BST (v4.28): Aligned with latest schema, updated to display Txid, Payment Id, Button Id, Payer Id, Amount, Complete, New, Timestamp, and Actions.
 * - 13Aug2025_1300 BST (v4.29): Fixed API response mapping and enhanced logging.
 * - 13Aug2025_1310 BST (v4.30): Added controlled polling and optimized useEffect.
 * - 13Aug2025_1315 BST (v4.31): Fixed TypeScript error in API response mapping.
 * - 13Aug2025_1325 BST (v4.32): Removed polling and fixed Actions column display.
 * - 14Aug2025_0155 BST (v4.33): Fixed API response mapping to use snake_case fields after schema update.
 */
const F = 'pages/Payments'
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
  Box,
  Card,
  TextField,
  IconButton,
  Tooltip
} from '@mui/material'
import { FirstPage, LastPage, ReceiptLong } from '@mui/icons-material'
import { WalletClient, AuthFetch } from '@bsv/sdk'
import { useTheme } from '@mui/material/styles'
import { Link } from 'react-router-dom'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { formatId, formatTimestamp } from '../../utils/general'
import { logWithTimestamp } from '../../utils/logging'
import { CONFIG, MAX_PAYMENT_SATS } from '../../utils/constants'

/**
 * Represents a payment received through a payment button
 */
interface Payment {
  payment_id: string | null // Pre-created ID from ids with type='payment'
  button_id: string | null // Pre-created ID from ids with type='button'
  payer_id: string | null // Payer's identifier
  txid: string | null // Blockchain transaction ID
  amount: number | null // Actual paid amount
  completed: boolean | null // Completion status
  is_new: boolean | null // New payment status
  created_at: string | null // Timestamp of payment
}

/**
 * Represents the API response structure
 */
interface PaymentResponse {
  status: string
  message: string
  title?: string // Optional title from API
  data: {
    payment_id: string | null
    txid: string | null
    payer_id: string | null
    button_id: string | null
    amount: string | number | null
    completed: number | null
    is_new: number | null
    created_at: string | null
  }[]
  total?: number
}

interface SortConfig {
  key: keyof Payment | null
  direction: 'asc' | 'desc'
}

// Utility function to format txid as 'first5...last5'
const formatTxid = (txid: string | null) => {
  if (!txid || txid.length < 10) return txid || 'N/A'
  return `${txid.slice(0, 5)}...${txid.slice(-5)}`
}

// Utility function to format date as YYYY-MM-DD HH:MM:SS
const formatTime = (dateStr: string | null) => {
  if (!dateStr) {
    logWithTimestamp(F, 'Warning: created_at is undefined for a payment, using N/A')
    return 'N/A'
  }
  return new Date(dateStr).toISOString().replace('T', ' ').slice(0, 19)
}

const wallet = new WalletClient('auto', CONFIG.WALLET_ORIGIN)
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
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'created_at', direction: 'desc' })
  const [customOptions, setCustomOptions] = useState<number[]>([])
  const [totalRecords, setTotalRecords] = useState(0)
  const [title, setTitle] = useState<string>('Payments') // Default title
  const theme = useTheme()
  const fetchTimeout = useRef<number | null>(null)
  const [hoveredValue, setHoveredValue] = useState<string | null>(null)
  const [clickedValue, setClickedValue] = useState<string | null>(null)
  const [isClicked, setIsClicked] = useState(false) // New state to disable hover after click
  const [exitDirection, setExitDirection] = useState<string | null>(null) // Track exit direction
  const [lastClickedColumn, setLastClickedColumn] = useState<string | null>(null) // Track last clicked column
  const tableRef = useRef<HTMLDivElement>(null)
  const columnRefs = useRef<{ [key: string]: HTMLTableCellElement | null }>({
    Txid: null,
    'Payment Id': null,
    'Button Id': null,
    'Payer Id': null
  })

  const handleMouseEnter = (fullValue: string, columnName: string, rowIndex: number) => {
    logWithTimestamp(F, 'Mouse enter, fullValue:', fullValue, 'column:', columnName, 'rowIndex:', rowIndex)
    if (!isClicked) {
      setHoveredValue(fullValue)
      const columnCell = document.querySelector(
        `tr:nth-child(${rowIndex + 1}) td:nth-child(${['Txid', 'Payment Id', 'Button Id', 'Payer Id'].indexOf(columnName) + 2})`
      ) as HTMLTableCellElement | null
      if (columnCell) {
        columnRefs.current[columnName] = columnCell
      }
    }
  }

  const handleMouseLeave = (e: React.MouseEvent) => {
    logWithTimestamp(F, 'Mouse leave')
    if (tableRef.current && hoveredValue && !isClicked) {
      const tableRect = tableRef.current.getBoundingClientRect()
      const mouseY = e.clientY
      const mouseX = e.clientX
      const hoveredColumn = Object.keys(columnRefs.current).find(col =>
        columnRefs.current[col]?.contains(e.target as Node)
      )
      if (hoveredColumn) {
        const colRect = columnRefs.current[hoveredColumn]!.getBoundingClientRect()
        const isBottomExit = mouseY > colRect.bottom && mouseX >= colRect.left && mouseX <= colRect.right
        if (
          isBottomExit &&
          (hoveredColumn === 'Txid' ||
            hoveredColumn === 'Payment Id' ||
            hoveredColumn === 'Button Id' ||
            hoveredColumn === 'Payer Id')
        ) {
          setExitDirection('bottom')
        } else {
          setHoveredValue(null)
          setExitDirection(null)
        }
      } else {
        setHoveredValue(null)
        setExitDirection(null)
      }
    }
  }

  const handleClick = (fullValue: string, columnName: string) => {
    logWithTimestamp(F, 'Mouse click, fullValue:', fullValue, 'column:', columnName)
    setHoveredValue(null) // Clear hover state
    setIsClicked(true) // Disable further hover events
    setClickedValue(fullValue)
    setLastClickedColumn(columnName) // Track the clicked column
    navigator.clipboard.writeText(fullValue).catch(err => logWithTimestamp(F, 'Failed to copy to clipboard:', err))
  }

  const handleReset = () => {
    logWithTimestamp(F, 'Reset click')
    setClickedValue(null)
    setIsClicked(false) // Re-enable hover events
    setHoveredValue(null) // Clear hover on reset
    setExitDirection(null)
    setLastClickedColumn(null) // Clear last clicked column
  }

  const fetchPayments = async () => {
    setLoading(true)
    setPayments([]) // Clear state to force refresh
    try {
      const url = `${location.protocol}//${location.host}/api/listPayments?limit=${MAX_PAYMENT_SATS}`
      logWithTimestamp(F, 'Fetching total payments with URL:', url)
      const response = await authFetch.fetch(url, { method: 'GET' })
      const data: PaymentResponse = await response.json()
      logWithTimestamp(F, 'API response:', JSON.stringify(data)) // Debug API response
      if (data.status === 'error') throw new Error(`❌ ${data.message ?? 'Failed to fetch total payments'}`)
      // Map API response to Payment interface with snake_case fields
      const mappedPayments = data.data.map(payment => ({
        payment_id: payment.payment_id || null,
        button_id: payment.button_id || null,
        payer_id: payment.payer_id || null,
        txid: payment.txid || null,
        amount: typeof payment.amount === 'string' ? parseFloat(payment.amount) : payment.amount || null,
        completed: payment.completed === 1 || false,
        is_new: payment.is_new === 1 || false,
        created_at: payment.created_at || null
      }))
      logWithTimestamp(F, 'Mapped payments:', JSON.stringify(mappedPayments))
      setTotalRecords(data.total || mappedPayments.length)
      setPayments(mappedPayments)
      setTitle(data.title || 'Payments')
      logWithTimestamp(F, 'Initial payments length:', mappedPayments.length)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '❌ Unknown error'
      logWithTimestamp(F, '❌ Error fetching total payments:', message)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPayments() // Initial fetch on mount
    return () => {
      if (fetchTimeout.current) clearTimeout(fetchTimeout.current)
    }
  }, []) // Empty dependency array ensures this runs only on mount

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
    logWithTimestamp(
      F,
      'Rows per page change:',
      value,
      'Current options:',
      rowsPerPageOptions.map(opt => opt.value)
    )
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

  const handleCustomInputComplete = (
    event: React.KeyboardEvent<HTMLDivElement> | React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (event.type === 'keypress' && (event as React.KeyboardEvent<HTMLDivElement>).key !== 'Enter') return
    const numValue = parseInt(customRowsPerPage, 10)
    logWithTimestamp(F, 'Custom rows on complete:', numValue)
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

  const baseOptions = [
    { value: 5, label: '5' },
    { value: 10, label: '10' },
    { value: 25, label: '25' }
  ]
  const rowsPerPageOptions = [
    { value: 0, label: 'set 1..100' },
    ...baseOptions,
    ...customOptions.map(value => ({ value, label: value.toString() }))
  ]

  const filteredPayments =
    statusFilter === 'all'
      ? payments
      : payments.filter(
          payment =>
            (statusFilter === 'completed' && payment.completed === true) ||
            (statusFilter === 'new' && payment.is_new === true)
        )

  const sortedPayments = sortConfig.key
    ? [...filteredPayments].sort((a, b) => {
        if (!sortConfig.key) return 0 // Default to no change if key is null
        let aValue: string | number | Date | boolean | null | undefined = a[sortConfig.key]
        let bValue: string | number | Date | boolean | null | undefined = b[sortConfig.key]
        // Handle null/undefined values by placing them at the end
        if (aValue === null || aValue === undefined) return 1
        if (bValue === null || bValue === undefined) return -1
        // Convert to comparable types
        if (sortConfig.key === 'amount') {
          aValue = (aValue as number) || 0
          bValue = (bValue as number) || 0
          return sortConfig.direction === 'asc'
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number)
        } else if (sortConfig.key === 'completed' || sortConfig.key === 'is_new') {
          aValue = (aValue as boolean) ? 1 : 0
          bValue = (bValue as boolean) ? 1 : 0
          return sortConfig.direction === 'asc'
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number)
        } else if (sortConfig.key === 'created_at') {
          aValue = new Date((aValue as string) || '')
          bValue = new Date((bValue as string) || '')
          return sortConfig.direction === 'asc'
            ? (aValue as Date).getTime() - (bValue as Date).getTime()
            : (bValue as Date).getTime() - (aValue as Date).getTime()
        } else {
          aValue = (aValue as string) || ''
          bValue = (bValue as string) || ''
          return sortConfig.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
        }
      })
    : filteredPayments

  const paginatedPayments = sortedPayments.slice(page * rowsPerPage, (page + 1) * rowsPerPage)

  logWithTimestamp(
    F,
    'Paginated payments length:',
    paginatedPayments.length,
    'Total payments length:',
    payments.length,
    'Filtered length:',
    filteredPayments.length,
    'Sorted length:',
    sortedPayments.length,
    'Page:',
    page,
    'Offset:',
    page * rowsPerPage
  )

  const acknowledgePayment = async (paymentId: string | null) => {
    if (!paymentId) {
      logWithTimestamp(F, '❌ Attempted to acknowledge payment with null paymentId')
      return
    }
    try {
      logWithTimestamp(
        F,
        'Attempting to acknowledge payment with paymentId:',
        paymentId,
        'URL:',
        `http://localhost:3001/api/acknowledgePayment`
      )
      const response = await authFetch.fetch(`http://localhost:3001/api/acknowledgePayment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }) // Send paymentId as required
      })
      if (!response.ok) {
        const errorText = await response.text()
        logWithTimestamp(F, '❌ Acknowledgment failed with response:', errorText)
        throw new Error(`❌ HTTP error! status: ${response.status.toString()}, body: ${errorText}`)
      }
      const data: PaymentResponse = await response.json()
      logWithTimestamp(F, 'Acknowledgment response:', JSON.stringify(data))
      if (data.status === 'error') throw new Error(`❌ ${data.message ?? 'Failed to acknowledge payment'}`)
      logWithTimestamp(F, 'Successfully acknowledged payment:', paymentId)
      // Refresh the payments list after acknowledgment
      const url = `${location.protocol}//${location.host}/api/listPayments?limit=${MAX_PAYMENT_SATS}`
      const refreshResponse = await authFetch.fetch(url, { method: 'GET' })
      const refreshData: PaymentResponse = await refreshResponse.json()
      if (refreshData.status === 'error') throw new Error(`❌ ${refreshData.message ?? 'Failed to refresh payments'}`)
      setPayments(
        refreshData.data.map(payment => ({
          payment_id: payment.payment_id || null,
          button_id: payment.button_id || null,
          payer_id: payment.payer_id || null,
          txid: payment.txid || null,
          amount: typeof payment.amount === 'string' ? parseFloat(payment.amount) : payment.amount || null,
          completed: payment.completed === 1 || false,
          is_new: payment.is_new === 1 || false,
          created_at: payment.created_at || null
        }))
      )
      setTotalRecords(refreshData.total || refreshData.data.length)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '❌ Unknown error'
      logWithTimestamp(F, '❌ Error acknowledging payment:', message)
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
          backgroundColor: theme.palette.background.default
        }}
      >
        <CircularProgress />
      </Box>
    )
  }
  if (error !== '') return <Typography color="error">{error}</Typography>

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
        <Typography variant="h2">{title}</Typography>
        <Typography variant="subtitle1">Acknowledge your incoming payments</Typography>
      </Box>
      {filteredPayments.length === 0 ? (
        <Card
          sx={{
            maxWidth: 600,
            margin: 'auto',
            padding: theme.spacing(4),
            textAlign: 'center',
            backgroundColor: theme.palette.background.paper
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
              onChange={e => setStatusFilter(e.target.value as 'all' | 'completed' | 'new')}
              variant="outlined"
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="completed">Complete</MenuItem>
              <MenuItem value="new">New</MenuItem>
            </Select>
          </Stack>
          <TableContainer component={Paper} ref={tableRef}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('created_at')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Timestamp {sortConfig.key === 'created_at' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('txid')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Txid {sortConfig.key === 'txid' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('payment_id')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Payment Id {sortConfig.key === 'payment_id' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('button_id')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Button Id {sortConfig.key === 'button_id' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('payer_id')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Payer Id {sortConfig.key === 'payer_id' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('amount')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Amount {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('completed')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Complete {sortConfig.key === 'completed' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('is_new')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      New {sortConfig.key === 'is_new' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedPayments.map((payment, index) => {
                  const fullTxid = payment.txid || ''
                  const fullPaymentId = payment.payment_id || ''
                  const fullButtonId = payment.button_id || ''
                  const fullPayerId = payment.payer_id || ''
                  const isTxidTruncated = fullTxid !== formatId(fullTxid)
                  const isPaymentIdTruncated = fullPaymentId !== formatId(fullPaymentId)
                  const isButtonIdTruncated = fullButtonId !== formatId(fullButtonId)
                  const isPayerIdTruncated = fullPayerId !== formatId(fullPayerId)
                  return (
                    <TableRow key={payment.payment_id || index}>
                      <TableCell>{formatTime(payment.created_at)}</TableCell>
                      <TableCell
                        ref={(el: HTMLTableCellElement | null) => (columnRefs.current['Txid'] = el)}
                        onMouseEnter={() => handleMouseEnter(fullTxid, 'Txid', index + 1)}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => handleClick(fullTxid, 'Txid')}
                      >
                        {formatTxid(payment.txid)}
                      </TableCell>
                      <TableCell
                        ref={(el: HTMLTableCellElement | null) => (columnRefs.current['Payment Id'] = el)}
                        onMouseEnter={() => handleMouseEnter(fullPaymentId, 'Payment Id', index + 1)}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => handleClick(fullPaymentId, 'Payment Id')}
                      >
                        {formatId(payment.payment_id || '')}
                      </TableCell>
                      <TableCell
                        ref={(el: HTMLTableCellElement | null) => (columnRefs.current['Button Id'] = el)}
                        onMouseEnter={() => handleMouseEnter(fullButtonId, 'Button Id', index + 1)}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => handleClick(fullButtonId, 'Button Id')}
                      >
                        {formatId(payment.button_id || '')}
                      </TableCell>
                      <TableCell
                        ref={(el: HTMLTableCellElement | null) => (columnRefs.current['Payer Id'] = el)}
                        onMouseEnter={() => handleMouseEnter(fullPayerId, 'Payer Id', index + 1)}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => handleClick(fullPayerId, 'Payer Id')}
                      >
                        {formatId(payment.payer_id || '')}
                      </TableCell>
                      <TableCell>{payment.amount !== null ? payment.amount : 'N/A'}</TableCell>
                      <TableCell>{payment.completed !== null ? (payment.completed ? 'Yes' : 'No') : 'N/A'}</TableCell>
                      <TableCell>{payment.is_new !== null ? (payment.is_new ? 'Yes' : 'No') : 'N/A'}</TableCell>
                      <TableCell>
                        {payment.is_new ? (
                          <Button
                            variant="contained"
                            color="primary"
                            onClick={() => acknowledgePayment(payment.payment_id).catch(() => {})}
                          >
                            Acknowledge
                          </Button>
                        ) : (
                          'confirmed'
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
              justifyContent: 'flex-end',
              width: '100%',
              boxSizing: 'border-box',
              padding: '4px 0'
            }}
          >
            <IconButton onClick={() => setPage(0)} disabled={page === 0} color="inherit" size="small" sx={{ mr: 0.5 }}>
              <FirstPage />
            </IconButton>
            <IconButton onClick={() => setPage(page - 1)} disabled={page === 0} color="inherit" size="small">
              {/* "Previous" handled by TablePagination context */}
            </IconButton>
            <TablePagination
              component="div"
              count={filteredPayments.length}
              page={page}
              onPageChange={(e, newPage) => {
                setPage(newPage)
                logWithTimestamp(
                  F,
                  'Page changed to:',
                  newPage,
                  'Rows:',
                  paginatedPayments,
                  'filteredPayments.length:',
                  filteredPayments.length
                )
                setHoveredValue(null)
                setClickedValue(null)
                setIsClicked(false)
                setExitDirection(null)
                setLastClickedColumn(null)
              }}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleRowsPerPageChange}
              rowsPerPageOptions={rowsPerPageOptions}
              sx={{ mx: 0, flexShrink: 1 }}
            />
            <IconButton
              onClick={() => setPage(page + 1)}
              disabled={page >= Math.ceil(filteredPayments.length / rowsPerPage) - 1}
              color="inherit"
              size="small"
            >
              {/* "Next" handled by TablePagination context */}
            </IconButton>
            <IconButton
              onClick={() => setPage(Math.ceil(filteredPayments.length / rowsPerPage) - 1)}
              disabled={page >= Math.ceil(filteredPayments.length / rowsPerPage) - 1}
              color="inherit"
              size="small"
              sx={{ ml: 0.5 }}
            >
              <LastPage />
            </IconButton>
          </Box>
          {(hoveredValue || clickedValue) && tableRef.current && (
            <Box
              sx={{
                position: 'fixed',
                left: `${tableRef.current.getBoundingClientRect().left}px`,
                top: `${tableRef.current.getBoundingClientRect().bottom + 10}px`,
                backgroundColor: theme.palette.background.paper,
                padding: '4px 8px',
                borderRadius: '4px',
                zIndex: 1000,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                maxWidth: '100%'
              }}
            >
              <Tooltip
                title={
                  hoveredValue && exitDirection === 'bottom'
                    ? 'click to reset'
                    : clickedValue
                      ? 'click to reset'
                      : hoveredValue
                        ? 'click table field'
                        : ''
                }
              >
                <Typography
                  onClick={(hoveredValue && exitDirection === 'bottom') || clickedValue ? handleReset : undefined}
                  sx={{
                    marginRight: '8px',
                    fontFamily: 'monospace',
                    cursor: (hoveredValue && exitDirection === 'bottom') || clickedValue ? 'pointer' : 'default'
                  }}
                >
                  {clickedValue && ['Txid', 'Payment Id', 'Button Id', 'Payer Id'].includes(lastClickedColumn || '') ? (
                    lastClickedColumn === 'Txid' ? (
                      <a href={`https://whatsonchain.com/tx/${clickedValue}`} target="_blank" rel="noopener noreferrer">
                        {clickedValue}
                      </a>
                    ) : (
                      clickedValue
                    )
                  ) : (
                    hoveredValue || clickedValue
                  )}
                </Typography>
              </Tooltip>
              {hoveredValue && (
                <Tooltip title="click table field to enable copy">
                  <span>
                    <IconButton size="small" disabled>
                      <ContentCopyIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              {clickedValue && (
                <Tooltip title="copy field">
                  <IconButton
                    size="small"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(clickedValue)
                        .catch(err => logWithTimestamp(F, 'Failed to copy to clipboard:', err))
                      setClickedValue(null)
                      setIsClicked(false)
                    }}
                  >
                    <ContentCopyIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          )}
          {showCustomInput && (
            <Box sx={{ mb: 2, textAlign: 'right' }}>
              <TextField
                type="number"
                label="Custom Rows"
                value={customRowsPerPage}
                onChange={handleCustomRowsPerPageChange}
                onKeyPress={handleCustomInputComplete}
                onBlur={handleCustomInputComplete}
                variant="outlined"
                size="small"
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
