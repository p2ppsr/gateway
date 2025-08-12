/**
 * @file src/pages/Payments/index.tsx
 *
 * Displays a paginated table of received payments tied to user payment buttons
 * Each row represents a payment, showing transaction_id (as ID, formatted as first5...last5), button ID, amount, currency, completion status, new status, timestamp, and actions
 *
 * - Fetches payments from the backend using `authFetch` and the Metanet client with full data fetch
 * - Highlights and allows acknowledging of "new" payments
 * - Includes filters, sorting by all columns via clickable headers, and pagination with an empty state
 * - Utilizes `formatBSV` from `utils/general.ts` for consistent amount formatting
 * - Uses `logWithTimestamp` from `utils/logging.ts` with configuration from `logging.config.ts` to measure performance and color-code logs
 * - Optimizes performance with single initial fetch
 *
 * Used by the Gateway UI to manage incoming payment activity
 * Version: v4.27 (Updated 05Aug2025_2352 BST to fix formatId error with undefined values)
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
  payment_id: string | undefined // Key for acknowledgment, using payment_button_id, allow undefined
  ID: string | undefined // transaction_id for display, allow undefined
  payment_button_id: string | undefined
  amount: number | string
  currency: string
  completed: boolean
  is_new: boolean
  transaction_info?: string
  merchant_id?: string
  created_at?: string // For Time column
}
interface PaymentResponse {
  status: string
  message: string
  title?: string // Optional title from API
  data: Payment[]
  total?: number
}
interface SortConfig {
  key: keyof Payment | null
  direction: 'asc' | 'desc'
}
// Utility function to format txid as 'first5...last5'
const formatTxid = (txid: string) => {
  if (txid.length < 10) return txid // Fallback for short IDs
  return `${txid.slice(0, 5)}...${txid.slice(-5)}`
}
// Utility function to format date as YYYY-MM-DD HH:MM:SS
const formatTime = (dateStr: string | undefined) => {
  if (!dateStr) {
    logWithTimestamp(F, 'Warning: created_at is undefined for a payment, using N/A')
    return 'N/A'
  }
  return new Date(dateStr).toISOString().replace('T', ' ').slice(0, 19)
}
const WALLET_ORIGIN = CONFIG.WALLET_ORIGIN
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
    'Payment Id': null
  })

  const handleMouseEnter = (fullValue: string, columnName: string, rowIndex: number) => {
    logWithTimestamp(F, 'Mouse enter, fullValue:', fullValue, 'column:', columnName, 'rowIndex:', rowIndex)
    if (!isClicked) {
      setHoveredValue(fullValue)
      const columnCell = document.querySelector(
        `tr:nth-child(${rowIndex + 1}) td:nth-child(${columnName === 'Txid' ? 2 : 3})`
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
        if (isBottomExit && (hoveredColumn === 'Txid' || hoveredColumn === 'Payment Id')) {
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

  useEffect(() => {
    const fetchTotal = async () => {
      setLoading(true)
      setPayments([]) // Clear state to force refresh
      try {
        const url = `${location.protocol}//${location.host}/api/listPayments?limit=${MAX_PAYMENT_SATS}`
        logWithTimestamp(F, 'Fetching total payments with URL:', url)
        const response = await authFetch.fetch(url, { method: 'GET' })
        const data: PaymentResponse = await response.json()
        logWithTimestamp(F, 'API response:', JSON.stringify(data)) // Debug API response
        if (data.status === 'error') throw new Error(`❌ ${data.message ?? 'Failed to fetch total payments'}`)
        // Map API response to Payment interface, using transaction_id as ID
        const mappedPayments = data.data.map(payment => {
          logWithTimestamp(F, `Mapping transaction_id: ${payment.ID}, payment_button_id: ${payment.payment_button_id}`)
          return {
            payment_id: payment.payment_id || 'N/A', // Preserve payment_id for acknowledgment
            ID: payment.ID || '', // Use transaction_id as ID, fallback to empty string
            payment_button_id: payment.payment_button_id || '',
            amount: payment.amount || 0,
            currency: payment.currency || 'BSV',
            completed: !!payment.completed,
            is_new: !!payment.is_new,
            transaction_info: payment.transaction_info,
            merchant_id: payment.merchant_id,
            created_at: payment.created_at
          }
        })
        logWithTimestamp(F, 'Mapped payments:', JSON.stringify(mappedPayments))
        setTotalRecords(mappedPayments.length)
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
          payment => (statusFilter === 'completed' && payment.completed) || (statusFilter === 'new' && payment.is_new)
        )
  const sortedPayments = sortConfig.key
    ? [...filteredPayments].sort((a, b) => {
        if (!sortConfig.key) return 0 // Default to no change if key is null
        let aValue: string | number | Date | boolean | undefined = a[sortConfig.key]
        let bValue: string | number | Date | boolean | undefined = b[sortConfig.key]
        // Handle undefined values by placing them at the end
        if (aValue === undefined && bValue === undefined) return 0
        if (aValue === undefined) return 1
        if (bValue === undefined) return -1
        // Convert to comparable types
        if (sortConfig.key === 'amount') {
          aValue = parseInt(aValue.toString()) || 0
          bValue = parseInt(bValue.toString()) || 0
          return sortConfig.direction === 'asc'
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number)
        } else if (sortConfig.key === 'completed' || sortConfig.key === 'is_new') {
          aValue = a[sortConfig.key] ? 1 : 0
          bValue = b[sortConfig.key] ? 1 : 0
          return sortConfig.direction === 'asc'
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number)
        } else if (sortConfig.key === 'created_at') {
          aValue = new Date((aValue as string) || new Date().toISOString())
          bValue = new Date((bValue as string) || new Date().toISOString())
          return sortConfig.direction === 'asc'
            ? (aValue as Date).getTime() - (bValue as Date).getTime()
            : (bValue as Date).getTime() - (aValue as Date).getTime()
        } else if (sortConfig.key === 'ID') {
          aValue = a.ID || ''
          bValue = b.ID || ''
          logWithTimestamp(F, `Sorting ID: aValue=${aValue}, bValue=${bValue}`)
          return sortConfig.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
        } else {
          aValue = aValue.toString()
          bValue = bValue.toString()
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
  const acknowledgePayment = async (paymentId: string) => {
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
      setPayments(refreshData.data)
      setTotalRecords(refreshData.data.length)
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
                        requestSort('ID')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Txid {sortConfig.key === 'ID' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('payment_button_id')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Payment Id{' '}
                      {sortConfig.key === 'payment_button_id' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
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
                  const fullId = payment.ID || ''
                  const fullPaymentButtonId = payment.payment_button_id || ''
                  const isIdTruncated = fullId !== formatId(fullId)
                  const isPaymentButtonIdTruncated = fullPaymentButtonId !== formatId(fullPaymentButtonId)
                  return (
                    <TableRow key={payment.ID || payment.payment_button_id || 'default-key'}>
                      <TableCell>{formatTimestamp(payment.created_at || new Date().toISOString())}</TableCell>
                      <TableCell
                        ref={(el: HTMLTableCellElement | null) => (columnRefs.current['Txid'] = el)}
                        onMouseEnter={() => {
                          logWithTimestamp(F, 'Cell mouse enter, fullId:', fullId, 'index:', index)
                          handleMouseEnter(fullId, 'Txid', index + 1)
                        }}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => handleClick(fullId, 'Txid')}
                      >
                        {formatId(payment.ID!)}
                      </TableCell>
                      <TableCell
                        ref={(el: HTMLTableCellElement | null) => (columnRefs.current['Payment Id'] = el)}
                        onMouseEnter={() => {
                          logWithTimestamp(
                            F,
                            'Cell mouse enter, fullPaymentButtonId:',
                            fullPaymentButtonId,
                            'index:',
                            index
                          )
                          handleMouseEnter(fullPaymentButtonId, 'Payment Id', index + 1)
                        }}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => handleClick(fullPaymentButtonId, 'Payment Id')}
                      >
                        {formatId(payment.payment_button_id!)}
                      </TableCell>
                      <TableCell>{payment.amount}</TableCell>
                      <TableCell>{payment.completed ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{payment.is_new ? 'Yes' : 'No'}</TableCell>
                      <TableCell>
                        {!payment.is_new ? (
                          'confirmed'
                        ) : (
                          <Button
                            variant="contained"
                            color="primary"
                            onClick={() => acknowledgePayment(payment.payment_button_id || '').catch(() => {})}
                          >
                            Acknowledge
                          </Button>
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
              justifyContent: 'flex-end', // Align to right side
              width: '100%', // Match table container width
              boxSizing: 'border-box', // Ensure padding doesn't extend width
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
                // Clear full text div states on page change
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
                left: `${tableRef.current.getBoundingClientRect().left}px`, // Revert to left alignment
                top: `${tableRef.current.getBoundingClientRect().bottom + 10}px`,
                backgroundColor: theme.palette.background.paper,
                padding: '4px 8px',
                borderRadius: '4px',
                zIndex: 1000,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                maxWidth: '100%' // Keep to constrain width if needed
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
                  {clickedValue && lastClickedColumn === 'Txid' ? (
                    <a href={`https://whatsonchain.com/tx/${clickedValue}`} target="_blank" rel="noopener noreferrer">
                      {clickedValue}
                    </a>
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
