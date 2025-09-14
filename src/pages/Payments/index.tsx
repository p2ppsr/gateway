/**
 * @file src/components/PayButton/index.tsx
 * @description Renders a PayButton component for initiating blockchain payments using the Metanet client. Executes a multi-step flow: server verification, invoice request, transaction signing, and payment submission, with support for variable amounts and single-use/multi-use buttons.
 * @version 2.58.13
 * @changelog
 * - 28Aug2025_1535 BST (v2.58.13): Enhanced invoice error handling in handleClick to log all failures; added paid state logging.
 * - 28Aug2025_1521 BST (v2.58.10): Added invoice failure logging in handleClick to debug multi-use button issue.
 * - 28Aug2025_1435 BST (v2.58.9): Added logging in fetchButtonStatus to diagnose incorrect disabling of multi-use buttons.
 * - Previous changes omitted for brevity...
 */
const F = 'pages/Payments'
import React, { useState, useEffect, useRef, useMemo } from 'react'
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
import { Link } from 'react-router-dom'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { fetchWithTimeout, formatId, formatTimeLocal } from '../../utils/general'
import { logWithTimestamp } from '../../utils/logging'
import { CONFIG } from '../../utils/constants'
import { WalletClient } from '@bsv/sdk'
import { useTheme } from '@mui/material/styles'

interface Payment {
  payment_id: string | null
  button_id: string | null
  payer_id: string | null
  txid: string | null
  amount: number | null
  completed: boolean | null
  is_new: boolean | null
  created_at: string | null
  description: string | null
}
interface PaymentResponse {
  status: string
  message: string
  title?: string
  data: {
    payment_id: string | null
    txid: string | null
    payer_id: string | null
    button_id: string | null
    amount: string | number | null
    completed: number | null
    is_new: number | null
    created_at: string | null
    description: string | null
  }[]
  total?: number
}
// interface Payment {
//   payment_id: string | null;
//   button_id: string | null;
//   payer_id: string | null;
//   txid: string | null;
//   amount: number | null;
//   completed: boolean | null;
//   is_new: boolean | null;
//   created_at: string | null;
// }

// interface PaymentResponse {
//   status: string;
//   message: string;
//   title?: string;
//   data: {
//     payment_id: string | null;
//     txid: string | null;
//     payer_id: string | null;
//     button_id: string | null;
//     amount: string | number | null;
//     completed: number | null;
//     is_new: number | null;
//     created_at: string | null;
//   }[];
//   total?: number;
// }

interface SortConfig {
  key: keyof Payment | null
  direction: 'asc' | 'desc'
}

const formatTxid = (txid: string | null) => {
  if (!txid || txid.length < 10) return txid || 'N/A'
  return `${txid.slice(0, 5)}...${txid.slice(-5)}`
}

const formatPayerId = (payerId: string | null) => {
  if (!payerId || payerId.length < 10) return payerId || 'N/A'
  return `${payerId.slice(0, 5)}...${payerId.slice(-5)}`
}

const wallet = new WalletClient('auto', CONFIG.WALLET_ORIGIN)

const PaymentsList = () => {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [customRowsPerPage, setCustomRowsPerPage] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'new'>('all')
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'created_at', direction: 'desc' })
  const [customOptions, setCustomOptions] = useState<number[]>([])
  const [totalRecords, setTotalRecords] = useState(0)
  const [title, setTitle] = useState<string>('Payments')
  const [renderKey, setRenderKey] = useState(Date.now()) // Force re-render
  const theme = useTheme()
  const tableRef = useRef<HTMLDivElement>(null)
  const [hoveredValue, setHoveredValue] = useState<string | null>(null)
  const [clickedValue, setClickedValue] = useState<string | null>(null)
  const [isClicked, setIsClicked] = useState(false)
  const [exitDirection, setExitDirection] = useState<string | null>(null)
  const [lastClickedColumn, setLastClickedColumn] = useState<string | null>(null)
  const columnRefs = useRef<{ [key: string]: HTMLTableCellElement | null }>({
    Txid: null,
    'Payment Id': null,
    'Button Id': null,
    'Payer Id': null
  })
const API_BASE = CONFIG.API_BASE.replace(/\/+$/, '')

  const fetchPayments = async (retries = 2): Promise<void> => {
    setLoading(true)
    setPayments([]) // Reset state to avoid stale data
    setError('')
    logWithTimestamp(F, 'Starting fetchPayments with statusFilter:', statusFilter, 'Retries:', retries)
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('payments_cache')
        window.sessionStorage.removeItem('payments_cache')
      }
const url = `${API_BASE}/listPayments?limit=500&status=${statusFilter}&t=${Date.now()}`
      logWithTimestamp(F, 'Fetching payments with URL:', url)
const response = await fetchWithTimeout(
  url,
  { method: 'GET' },
  wallet
)
      logWithTimestamp(F, 'Fetch response status:', response.status, 'Headers:', response.headers)
      const data: PaymentResponse = await response.json()
      logWithTimestamp(F, 'Full API response:', JSON.stringify(data))
      if (data.status === 'error') throw new Error(`❌ ${data.message ?? 'Failed to fetch payments'}`)
      if (!Array.isArray(data.data)) {
        logWithTimestamp(F, '❌ Invalid API response: data is not an array')
        throw new Error('Invalid API response: data is not an array')
      }
      const mappedPayments = data.data.map((payment, index) => {
        const mappedPayment = {
          payment_id: payment.payment_id || null,
          button_id: payment.button_id || null,
          payer_id: payment.payer_id || null,
          txid: payment.txid || null,
          amount: typeof payment.amount === 'string' ? parseFloat(payment.amount) : payment.amount || null,
          completed: payment.completed === null ? false : !!payment.completed,
          is_new: payment.is_new === null ? false : !!payment.is_new,
          created_at: payment.created_at || null,
          description: payment.description || null
          // payment_id: payment.payment_id || null,
          // button_id: payment.button_id || null,
          // payer_id: payment.payer_id || null,
          // txid: payment.txid || null,
          // amount: typeof payment.amount === 'string' ? parseFloat(payment.amount) : payment.amount || null,
          // completed: payment.completed === null ? false : !!payment.completed,
          // is_new: payment.is_new === null ? false : !!payment.is_new,
          // created_at: payment.created_at || null,
        }
        logWithTimestamp(F, `Mapped payment ${index}:`, {
          payment_id: mappedPayment.payment_id,
          completed: mappedPayment.completed,
          raw_completed: payment.completed,
          completed_type: typeof payment.completed,
          is_new: mappedPayment.is_new,
          raw_is_new: payment.is_new,
          is_new_type: typeof payment.is_new
        })
        return mappedPayment
      })
      const deepCopiedPayments = JSON.parse(JSON.stringify(mappedPayments))
      logWithTimestamp(
        F,
        'Total mapped payments:',
        deepCopiedPayments.length,
        'Completed count:',
        deepCopiedPayments.filter((p: Payment) => p.completed).length,
        'Incomplete count:',
        deepCopiedPayments.filter((p: Payment) => !p.completed).length
      )
      setPayments(deepCopiedPayments)
      logWithTimestamp(F, 'Payments state updated:', {
        total: deepCopiedPayments.length,
        sample: deepCopiedPayments.slice(0, 5).map((p: Payment) => ({
          payment_id: p.payment_id,
          completed: p.completed,
          is_new: p.is_new
        }))
      })
      setTotalRecords(data.total || deepCopiedPayments.length)
      setTitle(data.title || 'Payments')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '❌ Unknown error'
      logWithTimestamp(F, '❌ Error fetching payments:', message)
      if (retries > 0) {
        logWithTimestamp(F, 'Retrying fetchPayments, retries left:', retries - 1)
        await new Promise(resolve => setTimeout(resolve, 1000))
        return fetchPayments(retries - 1)
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    logWithTimestamp(F, 'Fetching payments due to statusFilter change:', statusFilter)
    setPayments([]) // Reset payments on filter change
    setRenderKey(Date.now()) // Force re-render
    fetchPayments()
  }, [statusFilter])

  useEffect(() => {
    logWithTimestamp(F, 'Payments state changed:', {
      total: payments.length,
      sample: payments.slice(0, 5).map((p: Payment) => ({
        payment_id: p.payment_id,
        completed: p.completed,
        is_new: p.is_new
      }))
    })
    const targetPayments = payments.filter((p: Payment) =>
      ['MZgHoSGBGbu5', 'WQq5HoqKwFBS', '3rKCwcmZ7kqt'].includes(p.payment_id || '')
    )
    logWithTimestamp(F, 'Payments state for target payments:', JSON.stringify(targetPayments, null, 2))
  }, [payments])

  const sortedPayments = useMemo(() => {
    if (!sortConfig.key) return payments
    const sorted = [...payments].sort((a, b) => {
      if (!sortConfig.key || sortConfig.key === 'completed' || sortConfig.key === 'is_new') return 0
      let aValue: string | number | Date | boolean | null | undefined = a[sortConfig.key]
      let bValue: string | number | Date | boolean | null | undefined = b[sortConfig.key]
      if (aValue === null || aValue === undefined) aValue = 'N/A'
      if (bValue === null || bValue === undefined) bValue = 'N/A'
      if (sortConfig.key === 'amount') {
        aValue = typeof aValue === 'number' ? aValue : 0
        bValue = typeof bValue === 'number' ? bValue : 0
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
        aValue = (aValue as string) || 'N/A'
        bValue = (bValue as string) || 'N/A'
        return sortConfig.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
      }
    })
    logWithTimestamp(
      F,
      'Sorted payments:',
      sorted.map((p: Payment) => ({
        payment_id: p.payment_id,
        completed: p.completed,
        is_new: p.is_new
      }))
    )
    const targetSorted = sorted.filter((p: Payment) =>
      ['MZgHoSGBGbu5', 'WQq5HoqKwFBS', '3rKCwcmZ7kqt'].includes(p.payment_id || '')
    )
    logWithTimestamp(F, 'Sorted payments for target payments:', JSON.stringify(targetSorted, null, 2))
    return sorted
  }, [payments, sortConfig])

  const paginatedPayments = useMemo(() => {
    const paginated = sortedPayments.slice(page * rowsPerPage, (page + 1) * rowsPerPage)
    logWithTimestamp(
      F,
      'Paginated payments length:',
      paginated.length,
      'Total payments length:',
      payments.length,
      'Page:',
      page,
      'Offset:',
      page * rowsPerPage,
      'Status filter:',
      statusFilter
    )
    logWithTimestamp(
      F,
      'Paginated payments:',
      paginated.map((p: Payment) => ({
        payment_id: p.payment_id,
        completed: p.completed,
        is_new: p.is_new
      }))
    )
    const targetPaginated = paginated.filter((p: Payment) =>
      ['MZgHoSGBGbu5', 'WQq5HoqKwFBS', '3rKCwcmZ7kqt'].includes(p.payment_id || '')
    )
    logWithTimestamp(F, 'Paginated payments for target payments:', JSON.stringify(targetPaginated, null, 2))
    return paginated
  }, [sortedPayments, page, rowsPerPage])

  const requestSort = (key: keyof Payment) => {
    if (key === 'completed' || key === 'is_new') return
    if (key === 'description') {
      setSortConfig({ key, direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc' })
      return
    }
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
    logWithTimestamp(F, 'Sort config updated:', { key, direction })
  }

  const handleRowsPerPageChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    const value = event.target.value
    logWithTimestamp(F, 'Rows per page change:', value)
    if (typeof value === 'object' && value !== null && 'value' in value && value.value === 0) {
      setShowCustomInput(true)
    } else {
      const numValue = typeof value === 'number' ? value : (value as any)?.value || 10
      setRowsPerPage(numValue)
      setCustomRowsPerPage('')
      setShowCustomInput(false)
      setPage(0)
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
    if (isNaN(numValue) || numValue <= 0 || numValue > 500) {
      setRowsPerPage(10)
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
    setHoveredValue(null)
    setIsClicked(true)
    setClickedValue(fullValue)
    setLastClickedColumn(columnName)
    navigator.clipboard.writeText(fullValue).catch(err => logWithTimestamp(F, 'Failed to copy to clipboard:', err))
  }

  const handleReset = () => {
    logWithTimestamp(F, 'Reset click')
    setClickedValue(null)
    setIsClicked(false)
    setHoveredValue(null)
    setExitDirection(null)
    setLastClickedColumn(null)
  }

  const acknowledgePayment = async (paymentId: string | null) => {
    if (!paymentId) {
      logWithTimestamp(F, '❌ Attempted to acknowledge payment with null paymentId')
      return
    }
    try {
logWithTimestamp(
  F,
  'URL:',
  `${API_BASE}/acknowledgePayment`
)
const response = await fetchWithTimeout(
  `${API_BASE}/acknowledgePayment?t=${Date.now()}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId })
  },
  wallet
)
      if (!response.ok) {
        const errorText = await response.text()
        logWithTimestamp(F, '❌ Acknowledgment failed with response:', errorText)
        throw new Error(`❌ HTTP error! status: ${response.status.toString()}, body: ${errorText}`)
      }
      const data: PaymentResponse = await response.json()
      logWithTimestamp(F, 'Acknowledgment response:', JSON.stringify(data))
      if (data.status === 'error') throw new Error(`❌ ${data.message ?? 'Failed to acknowledge payment'}`)
      logWithTimestamp(F, 'Successfully acknowledged payment:', paymentId)
      setPayments([])
      setRenderKey(Date.now()) // Force re-render after acknowledgment
      await fetchPayments()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '❌ Unknown error'
      logWithTimestamp(F, '❌ Error acknowledging payment:', message)
      setError(message)
    }
  }

  const baseOptions = [
    { value: 5, label: '5' },
    { value: 10, label: '10' },
    { value: 25, label: '25' }
  ]
  const rowsPerPageOptions = [
    { value: 0, label: 'set 1..500' },
    ...baseOptions,
    ...customOptions.map(value => ({ value, label: value.toString() }))
  ]

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
    <Container sx={{ ...(theme.templates?.page_wrap || {}) }}>
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
      {paginatedPayments.length === 0 ? (
        <Card
          sx={{
            maxWidth: 600,
            margin: 'auto',
            padding: theme.spacing(4),
            textAlign: 'center',
            backgroundColor: theme.palette.background.paper
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: theme.spacing(3) }}>
            <ReceiptLong sx={{ fontSize: 60, color: theme.palette.text.secondary }} />
            <Typography variant="h2">No Payments Yet</Typography>
            <Typography color="text.secondary">
              It looks like you haven’t received any payments. Check your buttons or create a new one!
            </Typography>
            <Button variant="contained" component={Link} to="/buttons" color="primary">
              View Your Buttons
            </Button>
          </Box>
        </Card>
      ) : (
        <>
          <Stack direction="row" spacing={2} sx={{ mb: 2, justifyContent: 'flex-end' }}>
            <Select
              value={statusFilter}
              onChange={e => {
                const newFilter = e.target.value as 'all' | 'completed' | 'new'
                logWithTimestamp(F, 'Status filter changed:', newFilter)
                setStatusFilter(newFilter)
              }}
              variant="outlined"
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="completed">Complete</MenuItem>
              <MenuItem value="new">New</MenuItem>
            </Select>
          </Stack>
          <TableContainer key={renderKey} component={Paper} ref={tableRef}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <Typography
                      sx={{
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      onClick={() => requestSort('created_at')}
                    >
                      Timestamp
                      {sortConfig.key === 'created_at' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      sx={{
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      onClick={() => requestSort('txid')}
                    >
                      Txid
                      {sortConfig.key === 'txid' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      sx={{
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      onClick={() => requestSort('payment_id')}
                    >
                      Payment Id
                      {sortConfig.key === 'payment_id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      sx={{
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      onClick={() => requestSort('button_id')}
                    >
                      Button Id
                      {sortConfig.key === 'button_id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      sx={{
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      onClick={() => requestSort('payer_id')}
                    >
                      Payer Id
                      {sortConfig.key === 'payer_id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      sx={{
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      onClick={() => requestSort('amount')}
                    >
                      Sats
                      {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      sx={{
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      onClick={() => requestSort('description')}
                    >
                      Description
                      {sortConfig.key === 'description' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ whiteSpace: 'nowrap' }}>Complete</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ whiteSpace: 'nowrap' }}>New</Typography>
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
                  logWithTimestamp(F, 'Rendering payment row:', {
                    payment_id: fullPaymentId,
                    completed: payment.completed,
                    is_new: payment.is_new
                  })
                  const renderedComplete = payment.completed !== null ? (payment.completed ? 'Yes' : 'No') : 'N/A'
                  logWithTimestamp(F, 'Complete column value:', {
                    payment_id: fullPaymentId,
                    completed_value: payment.completed,
                    completed_type: typeof payment.completed,
                    rendered: renderedComplete
                  })
                  return (
                    <TableRow key={`${fullPaymentId}-${statusFilter}-${Date.now()}`}>
                      <TableCell>{formatTimeLocal(payment.created_at)}</TableCell>
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
                        {formatPayerId(payment.payer_id)}
                      </TableCell>
                      <TableCell>{payment.amount !== null ? payment.amount : 'N/A'}</TableCell>
                      <TableCell>{payment.description || 'N/A'}</TableCell>
                      <TableCell data-debug={`completed-${fullPaymentId}-${renderedComplete}`}>
                        {renderedComplete}
                      </TableCell>
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
              {/* Previous */}
            </IconButton>
            <TablePagination
              component="div"
              count={payments.length}
              page={page}
              onPageChange={(e, newPage) => {
                setPage(newPage)
                logWithTimestamp(
                  F,
                  'Page changed to:',
                  newPage,
                  'Rows:',
                  paginatedPayments,
                  'Payments length:',
                  payments.length
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
              disabled={page >= Math.ceil(payments.length / rowsPerPage) - 1}
              color="inherit"
              size="small"
            >
              {/* Next */}
            </IconButton>
            <IconButton
              onClick={() => setPage(Math.ceil(payments.length / rowsPerPage) - 1)}
              disabled={page >= Math.ceil(payments.length / rowsPerPage) - 1}
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
