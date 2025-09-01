/**
 * @file src/pages/Buttons/index.tsx
 *
 * Displays a paginated table of payment buttons created by the user.
 * Each row represents a button, showing ID, amount, currency, and other details.
 * For multi-use buttons, includes a collapsible sub-table of associated payments.
 *
 * Version: v3.123 (Updated 01Sep2025_0215 BST)
 * Change Log:
 * - 01Sep2025_0215 BST (v3.123): Updated requestSort to use derivation_prefix and derivation_suffix instead of transaction_id for sub-table sorting.
 * - 01Sep2025_0130 BST (v3.122): Replaced transaction_id with derivation_prefix and derivation_suffix in Payment interface and mapping.
 * - 31Aug2025_2130 BST (v3.113): Fixed tooltip vertical position by clearing subTableRefs and using useLayoutEffect for accurate sub-table height.
 * - 31Aug2025_2115 BST (v3.112): Fixed TypeScript error by moving tooltip logging to useEffect; improved sub-table height calculation for tooltip positioning.
 * - 31Aug2025_2045 BST (v3.110): Used DUP_FIELD_PLACEHOLDER for Button Id, Payment Id, and Description in sub-table when payment_id matches button.payment_id.
 * - 31Aug2025_2030 BST (v3.109): Used DUP_FIELD_PLACEHOLDER from consts.ts for Button Id, Payment Id, and Description in sub-table to avoid duplication.
 */
const F = 'pages/Buttons'
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react'
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
  Tooltip,
  Collapse
} from '@mui/material'
import { FirstPage, LastPage, ReceiptLong, ExpandMore, ExpandLess } from '@mui/icons-material'
import { WalletClient, AuthFetch } from '@bsv/sdk'
import { useTheme } from '@mui/material/styles'
import { Link } from 'react-router-dom'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { formatId, formatTimeLocal } from '../../utils/general'
import { logWithTimestamp } from '../../utils/logging'
import { CONFIG, DUP_FIELD_PLACEHOLDER } from '../../utils/constants'

const wallet = new WalletClient('json-api', CONFIG.WALLET_ORIGIN)
const authFetch = new AuthFetch(wallet)

interface Payment {
  payment_id: string
  //*transaction_id: string
  amount: number
  txid: string | null
  completed: boolean
  created_at: string
  description: string | null
}

interface Button {
  button_id: string
  amount: number
  description: string
  html_code: string
  variable_amount: boolean
  multi_use: boolean
  used: boolean
  calculated_total: number | null
  created_at: string
  updated_at: string
  payment_id: string | null
  payments: Payment[]
  render_id: string
}

interface ButtonResponse {
  status: string
  message: string
  title?: string
  data: {
    buttonId: string
    merchantId: string
    paymentId: string | null
    amount: number
    description: string
    htmlCode: string
    variableAmount: boolean
    multiUse: boolean
    used: boolean
    calculated_total: number | null
    createdAt: string
    updatedAt: string
    payments?: {
      paymentId: string
      //*transactionId: string
      amount: number
      txid: string | null
      completed: boolean
      createdAt: string
      description: string | null
    }[]
  }[]
  total?: number
}

interface SortConfig {
  key: Exclude<keyof Button, 'payments'> | null
  direction: 'asc' | 'desc'
}

interface SubTableSortConfig {
  key: 'amount' | 'description' | 'created_at' | 'payment_id' | 'completed' | null
  direction: 'asc' | 'desc'
}

const PaymentButtonsList = () => {
  const [buttons, setButtons] = useState<Button[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(5)
  const [customRowsPerPage, setCustomRowsPerPage] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [usedFilter, setUsedFilter] = useState<'all' | 'used' | 'unused'>('all')
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'created_at', direction: 'desc' })
  const [subTableSortConfig, setSubTableSortConfig] = useState<SubTableSortConfig>({
    key: 'created_at',
    direction: 'desc'
  })
  const [customOptions, setCustomOptions] = useState<number[]>([])
  const [totalRecords, setTotalRecords] = useState(0)
  const [title, setTitle] = useState<string>('Payment Buttons')
  const [expandedButton, setExpandedButton] = useState<string | null>(null)
  const theme = useTheme()
  const fetchTimeout = useRef<number | null>(null)
  const [hoveredValue, setHoveredValue] = useState<string | null>(null)
  const [clickedValue, setClickedValue] = useState<string | null>(null)
  const [isClicked, setIsClicked] = useState(false)
  const [exitDirection, setExitDirection] = useState<string | null>(null)
  const [lastClickedColumn, setLastClickedColumn] = useState<string | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)
const hoverTextRef = useRef<HTMLDivElement>(null)
const [isHoverMultiline, setIsHoverMultiline] = useState(false)

const subTableRefs = useRef<(HTMLTableRowElement | null)[]>([])
  const columnRefs = useRef<{ [key: string]: HTMLTableCellElement | null }>({
    'Button Id': null,
    'Payment Id': null,
    'HTML Code': null
  })

  const cellStyle = {
    borderRight: `1px solid ${theme.palette.divider}`,
    borderBottom: `1px solid ${theme.palette.divider}`
  }
  const lastCellStyle = {
    ...cellStyle,
    borderRight: 'none'
  }
  const expandedRowBg = '#4c4a4aff'

  const handleMouseEnter = (fullValue: string, columnName: string, rowIndex: number) => {
    logWithTimestamp(F, 'Mouse enter, fullValue:', fullValue, 'column:', columnName, 'rowIndex:', rowIndex)
    if (!isClicked) {
      setHoveredValue(fullValue)
      const columnCell = document.querySelector(
        `tr:nth-child(${rowIndex + 1}) td:nth-child(${['Button Id', 'Payment Id', 'HTML Code'].indexOf(columnName) + 2})`
      ) as HTMLTableCellElement | null
      if (columnCell) {
        columnRefs.current[columnName] = columnCell
      }
    }
  }

  const handleMouseLeave = (e: React.MouseEvent) => {
    logWithTimestamp(F, 'Mouse leave, tableRef defined:', !!tableRef.current)
    if (tableRef.current && hoveredValue && !isClicked) {
      const rect = tableRef.current.getBoundingClientRect()
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
          (hoveredColumn === 'Button Id' || hoveredColumn === 'Payment Id' || hoveredColumn === 'HTML Code')
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

  const fetchButtons = async () => {
    setLoading(true)
    setButtons([])
    try {
      const url = `${location.protocol}//${location.host}/api/listButtons?limit=500&t=${Date.now()}`
      logWithTimestamp(F, 'Fetching buttons with URL:', url)
      const response = await authFetch.fetch(url, { method: 'GET' })
      logWithTimestamp(F, 'Fetch response status:', response.status, 'Headers:', response.headers)
      const data: ButtonResponse = await response.json()
      logWithTimestamp(F, 'API response:', JSON.stringify(data))
      if (data.status === 'error') throw new Error(`❌ ${data.message ?? 'Failed to fetch buttons'}`)
const mappedButtons: Button[] = data.data.map((button, index) => {
  const payments = button.payments
    ? button.payments.map(payment => ({
        payment_id: payment.paymentId,
        //*transaction_id: payment.transactionId,
        amount: payment.amount,
        txid: payment.txid ?? null,
        completed: !!payment.completed,
        created_at: payment.createdAt,
        description: payment.description || `Payment using paymentId: ${payment.paymentId ? formatId(payment.paymentId) : ''}`
      }))
    : []
  logWithTimestamp(F, `Payments for button ${button.buttonId}:`, JSON.stringify(payments))
  const calculated_total =
    button.calculated_total !== null && button.calculated_total !== undefined ? button.calculated_total : null
  logWithTimestamp(F, `Calculated total for button ${button.buttonId}:`, calculated_total)
  logWithTimestamp(F, `Total paid for button ${button.buttonId}:`, calculated_total)
  logWithTimestamp(
    F,
    `Raw used for button ${button.buttonId}:`,
    button.used,
    'Mapped used:',
    !!button.used,
    'Type:',
    typeof button.used
  )
  logWithTimestamp(
    F,
    `Description for button ${button.buttonId}:`,
    button.description,
    'PaymentId:',
    button.paymentId,
    'Formatted PaymentId:',
    button.paymentId ? formatId(button.paymentId) : ''
  )
  const paymentForButton = payments.find(p => p.payment_id === button.paymentId)
  const description = paymentForButton ? paymentForButton.description : `Payment using paymentId: ${formatId(button.paymentId || '')}`
  return {
    button_id: button.buttonId,
    amount: button.variableAmount ? 0 : (button.amount ?? 0),
    description: description || (button.paymentId ? `Payment using paymentId: ${formatId(button.paymentId)}` : ''),
    html_code: button.htmlCode ?? '<div>Pay Now</div>',
    variable_amount: !!button.variableAmount,
    multi_use: !!button.multiUse,
    used: !!button.used,
    calculated_total,
    created_at: button.createdAt,
    updated_at: button.updatedAt,
    payment_id: button.paymentId ?? null,
    payments,
    render_id: `${button.buttonId}-${Date.now()}-${index}`
  }
});
      logWithTimestamp(F, 'Mapped buttons:', JSON.stringify(mappedButtons))
      setTotalRecords(data.total || mappedButtons.length)
      setButtons(mappedButtons)
      setTitle(data.title || 'Payment Buttons')
      logWithTimestamp(F, 'Initial buttons length:', mappedButtons.length)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '❌ Unknown error'
      logWithTimestamp(F, '❌ Error fetching buttons:', message)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchButtons()
    return () => {
      if (fetchTimeout.current) clearTimeout(fetchTimeout.current)
    }
  }, [])

  useEffect(() => {
    setPage(0)
  }, [usedFilter])

useEffect(() => {
  if (hoveredValue || clickedValue) {
    const subTableHeight =
      expandedButton && subTableRefs.current.length > 0
        ? subTableRefs.current.reduce((sum, el) => sum + (el?.offsetHeight || 0), 0)
        : 0
    logWithTimestamp(F, `Rendering tooltip:`, {
      hoveredValue,
      clickedValue,
      topPosition: tableRef.current
        ? `${tableRef.current.getBoundingClientRect().bottom + subTableHeight + 10}px`
        : '0px',
      subTableHeight,
      subTableRows: subTableRefs.current.length,
      subTableRowHeights: subTableRefs.current.map((el, i) => ({ index: i, height: el?.offsetHeight || 0 }))
    })
  }
}, [hoveredValue, clickedValue, expandedButton])

  const requestSort = (
    key: Exclude<keyof Button, 'payments'> | Exclude<keyof Payment, 'derivation_prefix' | 'derivation_suffix' | 'txid'> | null,
    //*key: Exclude<keyof Button, 'payments'> | Exclude<keyof Payment, 'transaction_id' | 'txid'> | null,
    isSubTable?: boolean
  ) => {
    const config = isSubTable ? subTableSortConfig : sortConfig
    let direction: 'asc' | 'desc' = 'asc'
    if (config.key === key && config.direction === 'asc') {
      direction = 'desc'
    }
    if (isSubTable) {
      const validSubTableKeys: (keyof Payment)[] = ['amount', 'description', 'created_at', 'payment_id', 'completed']
      if (key && !validSubTableKeys.includes(key as keyof Payment)) {
        console.warn(`Invalid sub-table sort key: ${key}, defaulting to 'created_at'`)
        setSubTableSortConfig({ key: 'created_at', direction })
      } else {
        setSubTableSortConfig({ key: key as Exclude<keyof Payment,  'derivation_prefix' | 'derivation_suffix' | 'txid'> | null, direction })
        //*setSubTableSortConfig({ key: key as Exclude<keyof Payment, 'transaction_id' | 'txid'> | null, direction })
      }
    } else {
      setSortConfig({ key: key as Exclude<keyof Button, 'payments'> | null, direction })
    }
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
    if (isNaN(numValue) || numValue <= 0 || numValue > 500) {
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
    { value: 0, label: 'set 1..500' },
    ...baseOptions,
    ...customOptions.map(value => ({ value, label: value.toString() }))
  ]

  const filteredButtons =
    usedFilter === 'all'
      ? buttons
      : buttons.filter(
          button =>
            (usedFilter === 'used' && button.used === true) || (usedFilter === 'unused' && button.used === false)
        )

  const sortedButtons = sortConfig.key
    ? [...filteredButtons].sort((a, b) => {
        let aValue: string | number | Date | boolean | null | undefined = sortConfig.key ? a[sortConfig.key] : undefined
        let bValue: string | number | Date | boolean | null | undefined = sortConfig.key ? b[sortConfig.key] : undefined
        if (aValue === null || aValue === undefined) return 1
        if (bValue === null || bValue === undefined) return -1
        if (sortConfig.key === 'amount' || sortConfig.key === 'calculated_total') {
          aValue = (aValue as number) || 0
          bValue = (bValue as number) || 0
          return sortConfig.direction === 'asc'
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number)
        } else if (
          sortConfig.key === 'variable_amount' ||
          sortConfig.key === 'multi_use' ||
          sortConfig.key === 'used'
        ) {
          aValue = (aValue as boolean) ? 1 : 0
          bValue = (bValue as boolean) ? 1 : 0
          return sortConfig.direction === 'asc'
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number)
        } else if (sortConfig.key === 'created_at' || sortConfig.key === 'updated_at') {
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
    : filteredButtons

  const paginatedButtons = sortedButtons.slice(page * rowsPerPage, (page + 1) * rowsPerPage)

  useLayoutEffect(() => {
  // Clear subTableRefs to prevent duplicates
  subTableRefs.current = []
  if (expandedButton && paginatedButtons.length > 0) {
    paginatedButtons.forEach((button, index) => {
      if (button.button_id === expandedButton && button.multi_use && button.payments.length > 0) {
        button.payments.forEach((_, paymentIndex) => {
          const rowEl = document.querySelector(
            `tr[data-payment-row="${button.button_id}-${paymentIndex}"]`
          ) as HTMLTableRowElement | null
          subTableRefs.current[paymentIndex] = rowEl
        })
      }
    })
    logWithTimestamp(F, `Updated subTableRefs:`, {
      expandedButton,
      subTableRows: subTableRefs.current.length,
      subTableRowHeights: subTableRefs.current.map((el, i) => ({ index: i, height: el?.offsetHeight || 0 }))
    })
  }
}, [expandedButton, paginatedButtons])

useLayoutEffect(() => {
  const el = hoverTextRef.current
  if (!el) return
  const lh = parseFloat(getComputedStyle(el).lineHeight || '20')
  setIsHoverMultiline(el.scrollHeight > lh + 2)
}, [hoveredValue, clickedValue])

  const sortPayments = (payments: Payment[], config: SubTableSortConfig) => {
    if (!config.key) return payments
    return [...payments].sort((a, b) => {
      let aValue: string | number | Date | boolean | null | undefined = config.key ? a[config.key] : undefined
      let bValue: string | number | Date | boolean | null | undefined = config.key ? b[config.key] : undefined
      if (aValue === null || aValue === undefined) return 1
      if (bValue === null || bValue === undefined) return -1
      switch (config.key) {
        case 'amount':
          aValue = (aValue as number) || 0
          bValue = (bValue as number) || 0
          return config.direction === 'asc'
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number)
        case 'completed':
          aValue = (aValue as boolean) ? 1 : 0
          bValue = (bValue as boolean) ? 1 : 0
          return config.direction === 'asc'
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number)
        case 'created_at':
          aValue = new Date((aValue as string) || '')
          bValue = new Date((bValue as string) || '')
          return config.direction === 'asc'
            ? (aValue as Date).getTime() - (bValue as Date).getTime()
            : (bValue as Date).getTime() - (aValue as Date).getTime()
        case 'payment_id':
        case 'description':
          aValue = (aValue as string) || ''
          bValue = (bValue as string) || ''
          return config.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
        default:
          return 0
      }
    })
  }

  logWithTimestamp(
    F,
    'Paginated buttons length:',
    paginatedButtons.length,
    'Total buttons length:',
    buttons.length,
    'Filtered length:',
    filteredButtons.length,
    'Sorted length:',
    sortedButtons.length,
    'Page:',
    page,
    'Offset:',
    page * rowsPerPage
  )

  useLayoutEffect(() => {
    logWithTimestamp(F, 'useLayoutEffect triggered, tableRef defined:', !!tableRef.current)
    paginatedButtons.forEach((button, index) => {
      const buttonIdCell = document.querySelector(
        `tr:nth-child(${index * 2 + 1}) td:nth-child(2)`
      ) as HTMLTableCellElement | null
      const paymentIdCell = document.querySelector(
        `tr:nth-child(${index * 2 + 1}) td:nth-child(3)`
      ) as HTMLTableCellElement | null
      const htmlCodeCell = document.querySelector(
        `tr:nth-child(${index * 2 + 1}) td:nth-child(10)`
      ) as HTMLTableCellElement | null
      if (buttonIdCell) columnRefs.current['Button Id'] = buttonIdCell
      if (paymentIdCell) columnRefs.current['Payment Id'] = paymentIdCell
      if (htmlCodeCell) columnRefs.current['HTML Code'] = htmlCodeCell
      logWithTimestamp(
        F,
        `Button Id ref assigned: ${!!buttonIdCell}, Payment Id ref: ${!!paymentIdCell}, HTML Code ref: ${!!htmlCodeCell}`
      )
      logWithTimestamp(
        F,
        `Formatted timestamp for button ${button.button_id}:`,
        formatTimeLocal(button.created_at || button.updated_at)
      )
      logWithTimestamp(
        F,
        `Used for button ${button.button_id}:`,
        button.used,
        'Rendered as:',
        button.used ? 'Yes' : 'No'
      )
    })
  }, [paginatedButtons])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    )
  }
  if (error !== '') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '90vh' }}>
        <Typography color="error">❌ Error: {error}</Typography>
      </Box>
    )
  }

  return (
    <Container sx={{ ...(theme.templates?.page_wrap || {}) }}>
      <Box sx={{ textAlign: 'center', marginBottom: theme.spacing(4), marginTop: theme.spacing(5) }}>
        <Typography variant="h2">{title}</Typography>
        <Typography variant="subtitle1">View all the payment buttons you have created</Typography>
      </Box>
      {filteredButtons.length === 0 ? (
        <Card sx={{ maxWidth: 600, margin: 'auto', padding: theme.spacing(4), textAlign: 'center' }}>
          <Stack spacing={3} alignItems="center">
            <ReceiptLong sx={{ fontSize: 60, color: theme.palette.text.secondary }} />
            <Typography variant="h2">No Payment Buttons Yet</Typography>
            <Typography color="text.secondary">
              It looks like you haven’t created any payment buttons. Get started by creating one now!
            </Typography>
            <Button variant="contained" component={Link} to="/" color="primary">
              Create a Button
            </Button>
          </Stack>
        </Card>
      ) : (
        <>
          <Stack direction="row" spacing={2} sx={{ mb: 2, justifyContent: 'flex-end' }}>
            <Select
              value={usedFilter}
              onChange={e => setUsedFilter(e.target.value as 'all' | 'used' | 'unused')}
              variant="outlined"
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="used">Used</MenuItem>
              <MenuItem value="unused">Unused</MenuItem>
            </Select>
          </Stack>
          <TableContainer component={Paper} ref={tableRef}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={cellStyle}>
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
                  <TableCell sx={cellStyle}>
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
                  <TableCell sx={cellStyle}>
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
                  <TableCell sx={cellStyle}>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('amount')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Sats {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell sx={cellStyle}>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('variable_amount')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Variable {sortConfig.key === 'variable_amount' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell sx={cellStyle}>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('multi_use')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Multi-use {sortConfig.key === 'multi_use' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell sx={cellStyle}>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('used')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Used {sortConfig.key === 'used' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell sx={cellStyle}>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('calculated_total')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Total Paid{' '}
                      {sortConfig.key === 'calculated_total' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell sx={cellStyle}>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('description')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Description {sortConfig.key === 'description' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell sx={lastCellStyle}>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('html_code')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      HTML Code {sortConfig.key === 'html_code' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedButtons.map((button, index) => {
                  const fullButtonId = button.button_id || ''
                  const fullPaymentId = button.payment_id || ''
                  const fullHtmlCode = button.html_code || '<div>Pay Now</div>'
                  logWithTimestamp(
                    F,
                    `Rendering button ${button.button_id}, multi_use: ${button.multi_use}, used: ${button.used}, render_id: ${button.render_id}, timestamp: ${formatTimeLocal(button.created_at || button.updated_at)}`
                  )
                  return (
                    <React.Fragment key={button.render_id}>
                      <TableRow data-used={`used-${fullButtonId}-${button.used}`}>
                        <TableCell
                          sx={{
                            ...cellStyle,
                            borderBottom: expandedButton === button.button_id ? 0 : `1px solid ${theme.palette.divider}`
                          }}
                        >
                          {formatTimeLocal(button.created_at || button.updated_at)}
                        </TableCell>
                        <TableCell
                          onMouseEnter={() => handleMouseEnter(fullButtonId, 'Button Id', index * 2 + 1)}
                          onMouseLeave={handleMouseLeave}
                          onClick={() => handleClick(fullButtonId, 'Button Id')}
                          sx={{
                            ...cellStyle,
                            borderBottom: expandedButton === button.button_id ? 0 : `1px solid ${theme.palette.divider}`
                          }}
                        >
                          {formatId(button.button_id)}
                        </TableCell>
                        <TableCell
                          onMouseEnter={() => handleMouseEnter(fullPaymentId, 'Payment Id', index * 2 + 1)}
                          onMouseLeave={handleMouseLeave}
                          onClick={() => handleClick(fullPaymentId, 'Payment Id')}
                          sx={{
                            ...cellStyle,
                            borderBottom: expandedButton === button.button_id ? 0 : `1px solid ${theme.palette.divider}`
                          }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              width: '100%',
                              pr: 0.5
                            }}
                          >
                            {formatId(button.payment_id || '')}
                            {button.multi_use && button.payments.length > 0 && (
                              <IconButton
                                onClick={e => {
                                  e.stopPropagation()
                                  logWithTimestamp(
                                    F,
                                    `Toggling collapse for button ${button.button_id}, expanded: ${expandedButton === button.button_id ? 'closing' : 'opening'}, current expandedButton: ${expandedButton}`
                                  )
                                  setExpandedButton(expandedButton === button.button_id ? null : button.button_id)
                                }}
                                sx={{ padding: 0 }}
                              >
                                {expandedButton === button.button_id ? <ExpandLess /> : <ExpandMore />}
                              </IconButton>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell
                          onMouseEnter={() =>
                            button.amount === 0
                              ? handleMouseEnter(
                                  'For variable buttons, this is the initial value (0). Check payments for actual amounts paid.',
                                  'Sats',
                                  index * 2 + 1
                                )
                              : null
                          }
                          onMouseLeave={handleMouseLeave}
                          onClick={() =>
                            button.amount === 0
                              ? handleClick(
                                  'For variable buttons, this is the initial value (0). Check payments for actual amounts paid.',
                                  'Sats'
                                )
                              : null
                          }
                          sx={{
                            ...cellStyle,
                            borderBottom: expandedButton === button.button_id ? 0 : `1px solid ${theme.palette.divider}`
                          }}
                        >
                          {button.amount}
                        </TableCell>
                        <TableCell
                          sx={{
                            ...cellStyle,
                            borderBottom: expandedButton === button.button_id ? 0 : `1px solid ${theme.palette.divider}`
                          }}
                        >
                          {button.variable_amount ? 'Yes' : 'No'}
                        </TableCell>
                        <TableCell
                          sx={{
                            ...cellStyle,
                            borderBottom: expandedButton === button.button_id ? 0 : `1px solid ${theme.palette.divider}`
                          }}
                        >
                          {button.multi_use ? 'Yes' : 'No'}
                        </TableCell>
                        <TableCell
                          data-debug={`used-${fullButtonId}-${button.used ? 'Yes' : 'No'}`}
                          sx={{
                            ...cellStyle,
                            borderBottom: expandedButton === button.button_id ? 0 : `1px solid ${theme.palette.divider}`
                          }}
                        >
                          {button.used ? 'Yes' : 'No'}
                        </TableCell>
                        <TableCell
                          sx={{
                            ...cellStyle,
                            borderBottom: expandedButton === button.button_id ? 0 : `1px solid ${theme.palette.divider}`
                          }}
                        >
                          {button.calculated_total !== null ? button.calculated_total : 'N/A'}
                        </TableCell>
<TableCell
  sx={{
    fontSize: '0.875rem',
    color: theme.palette.text.primary,
    padding: '6px 16px',
    borderBottom: expandedButton === button.button_id ? 0 : `1px solid ${theme.palette.divider}`
  }}
>
  {button.description || (button.payment_id ? `Payment using paymentId: ${formatId(button.payment_id)}` : '')}
</TableCell>
                        <TableCell
                          onMouseEnter={() => handleMouseEnter(fullHtmlCode, 'HTML Code', index * 2 + 1)}
                          onMouseLeave={handleMouseLeave}
                          onClick={() => handleClick(fullHtmlCode, 'HTML Code')}
                          sx={{
                            ...lastCellStyle,
                            borderBottom: expandedButton === button.button_id ? 0 : `1px solid ${theme.palette.divider}`
                          }}
                        >
                          {button.html_code
                            ? `${button.html_code.substring(0, 16)}...${button.html_code.slice(-16)}`
                            : '<div>Pay Now</div>'}
                        </TableCell>
                      </TableRow>
                      {expandedButton === button.button_id &&
                        button.multi_use &&
                        button.payments.length > 0 &&
                        sortPayments(button.payments, subTableSortConfig).map((payment, paymentIndex) => {
                          const topBorder =
                            paymentIndex === 0 ? { borderTop: `1px solid ${theme.palette.divider}` } : {}
                          logWithTimestamp(F, `Rendering payment for button ${button.button_id}:`, {
                            payment_id: payment.payment_id,
                            completed: payment.completed,
                            timestamp: formatTimeLocal(payment.created_at)
                          })
                          return (
<TableRow
        key={`payment-${button.button_id}-${payment.payment_id || paymentIndex}`}
        sx={{ backgroundColor: expandedRowBg }}
        ref={el => (subTableRefs.current[paymentIndex] = el)}
      >
        <TableCell sx={{ ...cellStyle, ...topBorder, backgroundColor: expandedRowBg }}>
          {formatTimeLocal(payment.created_at)}
        </TableCell>
        <TableCell sx={{ ...cellStyle, ...topBorder, backgroundColor: expandedRowBg }}>
          {DUP_FIELD_PLACEHOLDER}
        </TableCell>
        <TableCell
          sx={{ ...cellStyle, ...topBorder, backgroundColor: expandedRowBg }}
          onMouseEnter={() => payment.payment_id !== button.payment_id && handleMouseEnter(payment.payment_id, 'Payment Id', 0)}
          onMouseLeave={handleMouseLeave}
          onClick={() => payment.payment_id !== button.payment_id && handleClick(payment.payment_id, 'Payment Id')}
        >
          {payment.payment_id === button.payment_id ? DUP_FIELD_PLACEHOLDER : formatId(payment.payment_id)}
        </TableCell>
        <TableCell sx={{ ...cellStyle, ...topBorder, backgroundColor: expandedRowBg }}>
          {payment.amount ?? DUP_FIELD_PLACEHOLDER}
        </TableCell>
        <TableCell sx={{ ...cellStyle, ...topBorder, backgroundColor: expandedRowBg }}>
          {DUP_FIELD_PLACEHOLDER}
        </TableCell>
        <TableCell sx={{ ...cellStyle, ...topBorder, backgroundColor: expandedRowBg }}>
          {DUP_FIELD_PLACEHOLDER}
        </TableCell>
        <TableCell sx={{ ...cellStyle, ...topBorder, backgroundColor: expandedRowBg }}>
          {payment.completed ? 'Yes' : 'No'}
        </TableCell>
        <TableCell sx={{ ...cellStyle, ...topBorder, backgroundColor: expandedRowBg }}>
          {DUP_FIELD_PLACEHOLDER}
        </TableCell>
        <TableCell sx={{ ...cellStyle, ...topBorder, backgroundColor: expandedRowBg }}>
          {payment.payment_id === button.payment_id ? DUP_FIELD_PLACEHOLDER : (payment.description || (payment.payment_id ? `Payment using paymentId: ${formatId(payment.payment_id)}` : DUP_FIELD_PLACEHOLDER))}
        </TableCell>
        <TableCell sx={{ ...cellStyle, ...topBorder, backgroundColor: expandedRowBg }}>
          {DUP_FIELD_PLACEHOLDER}
        </TableCell>
      </TableRow>
                          )
                        }
                    )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
{/* Footer container: preview panel + pagination (no overlap, same width as table) */}
<Box sx={{ mt: 1 }}>
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 1,
      flexWrap: 'wrap',                // allows wrap when message becomes multi-line
      width: '100%'
    }}
  >
    {/* pagination group (stays on the first row) */}
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, ml: 'auto', order: 1 }}>
      <IconButton onClick={() => setPage(0)} disabled={page === 0} color="inherit" size="small" sx={{ mr: 0.5 }}>
        <FirstPage />
      </IconButton>
      <IconButton onClick={() => setPage(page - 1)} disabled={page === 0} color="inherit" size="small" />
      <TablePagination
        component="div"
        count={filteredButtons.length}
        page={page}
        onPageChange={(e, newPage) => {
          setPage(newPage)
          logWithTimestamp(F, 'Page changed to:', newPage, 'Rows:', paginatedButtons.length)
          setHoveredValue(null); setClickedValue(null); setIsClicked(false); setExitDirection(null); setLastClickedColumn(null)
        }}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleRowsPerPageChange}
        rowsPerPageOptions={rowsPerPageOptions}
        sx={{ mx: 0, flexShrink: 1 }}
      />
      <IconButton
        onClick={() => setPage(page + 1)}
        disabled={page >= Math.ceil(filteredButtons.length / rowsPerPage) - 1}
        color="inherit"
        size="small"
      />
      <IconButton
        onClick={() => setPage(Math.ceil(filteredButtons.length / rowsPerPage) - 1)}
        disabled={page >= Math.ceil(filteredButtons.length / rowsPerPage) - 1}
        color="inherit"
        size="small"
        sx={{ ml: 0.5 }}
      >
        <LastPage />
      </IconButton>
    </Box>

    {/* bottom message (shares the row if single-line; full-width below if multi-line) */}
    {(hoveredValue || clickedValue) && (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1,
          py: 0.5,
          borderRadius: '4px',
          bgcolor: theme.palette.background.paper,
          minWidth: 0,
          flex: isHoverMultiline ? '1 1 100%' : '1 1 auto', // single-line: share row; multi-line: take full width below
          order: isHoverMultiline ? 2 : 0                    // multi-line puts it on the next line after pagination
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
            ref={hoverTextRef}
            onClick={(hoveredValue && exitDirection === 'bottom') || clickedValue ? handleReset : undefined}
            sx={{
              mr: 1,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',          // allow multi-line
              wordBreak: 'break-all',          // prevent overflow
              cursor: (hoveredValue && exitDirection === 'bottom') || clickedValue ? 'pointer' : 'default'
            }}
          >
            {clickedValue && ['Button Id', 'Payment Id', 'HTML Code'].includes(lastClickedColumn || '')
              ? clickedValue
              : hoveredValue || clickedValue}
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
                navigator.clipboard.writeText(clickedValue).catch(err => logWithTimestamp(F, 'Failed to copy to clipboard:', err))
                setClickedValue(null); setIsClicked(false)
              }}
            >
              <ContentCopyIcon />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    )}
  </Box>
</Box>


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
                inputProps={{ min: 1, max: 500, step: 1 }}
                sx={{ width: 100 }}
              />
            </Box>
          )}
        </>
      )}
    </Container>
  )
}

export default PaymentButtonsList
