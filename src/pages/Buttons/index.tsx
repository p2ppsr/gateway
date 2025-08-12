/**
 * @file src/pages/Buttons/index.tsx
 *
 * Displays a paginated table of payment buttons created by the user.
 * Each row represents a button, showing ID, amount, currency, and other details.
 *
 * - Fetches buttons from the backend using `authFetch` and the Metanet client with full data fetch
 * - Includes filters for usage (all, used, unused) and client-side sorting by all columns via clickable headers
 * - Implements an empty state with a CTA to create a button
 * - Uses MUI table components with pagination, allowing custom rows per page via a dropdown with a "set 5..100" trigger and a popup number input
 * - Utilizes `formatBSV` from `utils/general.ts` for consistent amount formatting
 * - Uses `logWithTimestamp` from `utils/logging.ts` with configuration from `logging.config.ts` to measure performance and color-code logs
 * - Optimizes performance with single initial fetch
 * - Adjusted `useRef` type to `number | null` to align with browser `setTimeout` return type, correcting TS2322 error
 * - Added `description` column to the table for custom spending descriptions
 * - Added `customCSS` column to display truncated HTML code (first 16 chars, ellipsis, last 16 chars), renamed to HTML Code
 * - Added check for buttons with customCSS in database and logs discrepancy, with tracing for empty HTML code (03Aug2025_1425 BST)
 * - Updated to reflect successful customCSS storage in database (03Aug2025_1459 BST)
 * - Added default sorting by timestamp (most recent first) (04Aug2025_1101 BST)
 *
 * Used by the Gateway UI to manage user-created payment buttons. For local testing, delays are attributed to server or application logic,
 * not external connections or hardware constraints (MacBook Pro M4 Max, 128GB RAM, 2TB SSD), guiding optimization efforts
 * Version: v3.64 (Updated 05Aug2025_2034 BST to fix N/A timestamp using created_at fallback)
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
const WALLET_ORIGIN = CONFIG.WALLET_ORIGIN
const wallet = new WalletClient('auto', WALLET_ORIGIN)
const authFetch = new AuthFetch(wallet)
interface ButtonResponse {
  status: string
  message: string
  data: {
    id?: string // Add id as optional to reflect API response
    button_id: string
    amount: number | string
    currency: string
    variable_amount: boolean
    multi_use: boolean
    used: boolean
    accepts: string
    total_paid: number | string
    description: string
    customCSS?: string
    timestamp?: string // Made optional to handle missing values
    created_at?: string // Added as a potential timestamp field
    payment_id?: string // Added to support the new column, optional
  }[]
  total?: number
}
interface SortConfig {
  key: keyof ButtonResponse['data'][number] | null
  direction: 'asc' | 'desc'
}
const PaymentButtonsList = () => {
  const [buttons, setButtons] = useState<ButtonResponse['data']>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(5)
  const [customRowsPerPage, setCustomRowsPerPage] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [usedFilter, setUsedFilter] = useState<'all' | 'used' | 'unused'>('all')
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'timestamp', direction: 'desc' }) // Default to timestamp descending
  const [customOptions, setCustomOptions] = useState<number[]>([])
  const [totalRecords, setTotalRecords] = useState(0)
  const theme = useTheme()
  const [hoveredValue, setHoveredValue] = useState<string | null>(null)
  const [clickedValue, setClickedValue] = useState<string | null>(null)
  const [isClicked, setIsClicked] = useState(false) // New state to disable hover after click
  const [exitDirection, setExitDirection] = useState<string | null>(null) // Track exit direction
  const [lastClickedColumn, setLastClickedColumn] = useState<string | null>(null) // Track last clicked column
  const tableRef = useRef<HTMLDivElement>(null)
  const columnRefs = useRef<{ [key: string]: HTMLTableCellElement | null }>({
    'Button Id': null,
    'Payment Id': null,
    'HTML Code': null
  })

  const handleMouseEnter = (fullValue: string, columnName: string, rowIndex: number) => {
    logWithTimestamp(F, 'Mouse enter, fullValue:', fullValue, 'column:', columnName, 'rowIndex:', rowIndex)
    if (!isClicked) {
      setHoveredValue(fullValue)
      const columnCell = document.querySelector(
        `tr:nth-child(${rowIndex}) td:nth-child(${columnName === 'Button Id' ? 2 : columnName === 'Payment Id' ? 3 : 10})`
      ) as HTMLTableCellElement | null
      if (columnCell) {
        columnRefs.current[columnName] = columnCell // Overwrite with the latest cell
        logWithTimestamp(F, `Assigned ${columnName} ref to row ${rowIndex}`)
      } else {
        logWithTimestamp(F, `Failed to find ${columnName} cell for row ${rowIndex}`)
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
    try {
      const url = `${location.protocol}//${location.host}/api/listButtons?limit=500`
      logWithTimestamp(F, 'Fetching total buttons with URL:', url)
      const response = await authFetch.fetch(url, { method: 'GET' })
      const data: ButtonResponse = await response.json()
      logWithTimestamp(F, 'API response:', JSON.stringify(data)) // Debug full response
      if (data.status === 'error') throw new Error(`❌ ${data.message ?? 'Failed to fetch total buttons'}`)
      const sortedButtons = [...data.data].sort((a, b) => {
        const aTime = new Date(a.timestamp || a.created_at || new Date().toISOString()).getTime() // Fallback to created_at or current time
        const bTime = new Date(b.timestamp || b.created_at || new Date().toISOString()).getTime()
        return bTime - aTime // Descending order (most recent first)
      })
      const mappedButtons = sortedButtons.map(button => ({
        ...button,
        variable_amount: Number(button.variable_amount) !== 0,
        multi_use: Number(button.multi_use) !== 0,
        used: Number(button.used) !== 0,
        button_id: button.id || '', // Assign API id to button_id, fallback set blank
      }))
      const processedButtons = mappedButtons.map(button => {
        if (!button.payment_id && button.customCSS) {
          const parser = new DOMParser()
          const doc = parser.parseFromString(button.customCSS, 'text/html')
          const paymentIdElement = doc.querySelector('[data-paymentid]')
          const paymentId = paymentIdElement ? paymentIdElement.getAttribute('data-paymentid') : undefined
          logWithTimestamp(F, `Extracted payment_id ${paymentId} from customCSS for button ${button.id}`)
          return { ...button, payment_id: paymentId || undefined }
        }
        return button
      })
      // Check if any button has customCSS (HTML code)
      const hasCustomCSS = processedButtons.some(
        button => button.customCSS !== undefined && button.customCSS !== null
      )
      if (processedButtons.length > 0 && !hasCustomCSS) {
        logWithTimestamp(F, 'Warning: No buttons with HTML code found in database')
      } else {
        logWithTimestamp(F, 'Success: At least one button with HTML code found in database')
      }
      setTotalRecords(data.data.length)
      setButtons(processedButtons)
      logWithTimestamp(F, 'Initial buttons length:', processedButtons.length)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '❌ Unknown error'
      logWithTimestamp(F, '❌ Error fetching total buttons:', message)
      setError(message)
    } finally {
      setLoading(false)
    }
  }
  fetchTotal()
}, [])
  useEffect(() => {
    setPage(0)
  }, [usedFilter])
  const requestSort = (key: keyof ButtonResponse['data'][number]) => {
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
    { value: 0, label: 'set 1..500' },
    ...baseOptions,
    ...customOptions.map(value => ({ value, label: value.toString() }))
  ]
  const filteredButtons =
    usedFilter === 'all'
      ? buttons
      : buttons.filter(button => (usedFilter === 'used' && button.used) || (usedFilter === 'unused' && !button.used))
  const sortedButtons = sortConfig.key
    ? [...filteredButtons].sort((a, b) => {
        if (!sortConfig.key) return 0 // Default to no change if key is null
        let aValue: string | number = a[sortConfig.key]?.toString() ?? ''
        let bValue: string | number = b[sortConfig.key]?.toString() ?? ''
        if (sortConfig.key === 'amount' || sortConfig.key === 'total_paid') {
          aValue = parseInt(aValue as string) || 0
          bValue = parseInt(bValue as string) || 0
          return sortConfig.direction === 'asc'
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number)
        } else if (
          sortConfig.key === 'variable_amount' ||
          sortConfig.key === 'multi_use' ||
          sortConfig.key === 'used'
        ) {
          aValue = a[sortConfig.key] ? 1 : 0
          bValue = b[sortConfig.key] ? 1 : 0
          return sortConfig.direction === 'asc'
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number)
        } else if (sortConfig.key === 'timestamp') {
          const aTime = new Date(a.timestamp || a.created_at || new Date().toISOString()).getTime() // Fallback to created_at or current time
          const bTime = new Date(b.timestamp || b.created_at || new Date().toISOString()).getTime()
          return sortConfig.direction === 'asc' ? aTime - bTime : bTime - aTime
        } else {
          if (typeof aValue === 'string' && typeof bValue === 'string') {
            logWithTimestamp(F, `Sorting ${sortConfig.key}: aValue=${aValue}, bValue=${bValue}`)
            return sortConfig.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
          }
          return 0 // Fallback if types don't match
        }
      })
    : filteredButtons
  logWithTimestamp(F, 'Paginated page:', page, 'rowsPerPage:', rowsPerPage)
  logWithTimestamp(F, 'Paginated sortedButtons.slice(', page * rowsPerPage, ',', (page + 1) * rowsPerPage, ')')
  const paginatedButtons = sortedButtons.slice(page * rowsPerPage, (page + 1) * rowsPerPage)

  useLayoutEffect(() => {
  paginatedButtons.forEach((button, index) => {
    const buttonIdCell = document.querySelector(`tr:nth-child(${index + 1}) td:nth-child(2)`) as HTMLTableCellElement | null;
    const paymentIdCell = document.querySelector(`tr:nth-child(${index + 1}) td:nth-child(3)`) as HTMLTableCellElement | null;
    const htmlCodeCell = document.querySelector(`tr:nth-child(${index + 1}) td:nth-child(10)`) as HTMLTableCellElement | null;

    if (buttonIdCell) {
      columnRefs.current['Button Id'] = buttonIdCell;
      logWithTimestamp(F, `Button Id ref assigned for index: ${index}`);
    } else {
      logWithTimestamp(F, 'Button Id ref is null for index:', index);
    }
    if (paymentIdCell) {
      columnRefs.current['Payment Id'] = paymentIdCell;
      logWithTimestamp(F, `Payment Id ref assigned for index: ${index}`);
    } else {
      logWithTimestamp(F, 'Payment Id ref is null for index:', index);
    }
    if (htmlCodeCell) {
      columnRefs.current['HTML Code'] = htmlCodeCell;
      logWithTimestamp(F, `HTML Code ref assigned for index: ${index}`);
    } else {
      logWithTimestamp(F, 'HTML Code ref is null for index:', index);
    }
  });
}, [paginatedButtons]); // Re-run when paginatedButtons changes

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
  if (error !== '') {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '90vh',
          backgroundColor: theme.palette.background.paper
        }}
      >
        <Typography color="error">❌ Error: {error}</Typography>
      </Box>
    )
  }
  logWithTimestamp(F, 'Pagination rowsPerPage:', rowsPerPage)
  logWithTimestamp(F, 'Pagination count:filteredButtons.length:', filteredButtons.length)
  const paginatedTableButtons = sortedButtons.slice(page * rowsPerPage, (page + 1) * rowsPerPage)

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
        <Typography variant="h2">Payment Buttons</Typography>
        <Typography variant="subtitle1">View all the payment buttons you have created</Typography>
      </Box>
      {buttons.length === 0 ? (
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
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('timestamp')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Timestamp {sortConfig.key === 'timestamp' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
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
                        requestSort('amount')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Amount(Sats) {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
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
                  <TableCell>
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
                  <TableCell>
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
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('total_paid')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Total Paid {sortConfig.key === 'total_paid' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
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
                  <TableCell>
                    <Typography
                      component="a"
                      href="#"
                      onClick={e => {
                        e.preventDefault()
                        requestSort('customCSS')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      HTML Code {sortConfig.key === 'customCSS' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
<TableBody>
  {paginatedButtons.length > 0 ? (
    paginatedButtons.map((button, index) => {
      logWithTimestamp(F, 'Pagination button:', button, 'index:', index)
      const fullButtonId = button.button_id || ''
      const fullPaymentId = button.payment_id || 'N/A'
      const fullHtmlCode = button.customCSS || 'N/A'
      return (
        <TableRow key={button.payment_id}>
          <TableCell>
            {formatTimestamp(button.timestamp || button.created_at || new Date().toISOString())}
          </TableCell>
          <TableCell
            ref={(el: HTMLTableCellElement | null) => (columnRefs.current['Button Id'] = el)} // Typed ref assignment
            onMouseEnter={e => {
              e.stopPropagation()
              logWithTimestamp(F, 'Cell mouse enter, fullButtonId:', fullButtonId, 'index:', index)
              handleMouseEnter(fullButtonId, 'Button Id', index + 1) // Pass row index (1-based for nth-child)
            }}
            onMouseLeave={handleMouseLeave}
            onClick={e => {
              e.stopPropagation()
              handleClick(fullButtonId, 'Button Id')
            }}
          >
            {formatId(button.button_id)}
          </TableCell>
          <TableCell
            ref={(el: HTMLTableCellElement | null) => (columnRefs.current['Payment Id'] = el)} // Typed ref assignment
            onMouseEnter={e => {
              e.stopPropagation()
              logWithTimestamp(F, 'Cell mouse enter, fullPaymentId:', fullPaymentId, 'index:', index)
              handleMouseEnter(fullPaymentId, 'Payment Id', index + 1) // Pass row index
            }}
            onMouseLeave={handleMouseLeave}
            onClick={e => {
              e.stopPropagation()
              handleClick(fullPaymentId, 'Payment Id')
            }}
          >
            {formatId(button.payment_id || 'N/A')}
          </TableCell>
          <TableCell>{button.amount}</TableCell>
          <TableCell>{button.variable_amount ? 'Yes' : 'No'}</TableCell>
          <TableCell>{button.multi_use ? 'Yes' : 'No'}</TableCell>
          <TableCell>{button.used ? 'Yes' : 'No'}</TableCell>
          <TableCell>{button.total_paid}</TableCell>
          <TableCell>{button.description}</TableCell>
          <TableCell
            ref={(el: HTMLTableCellElement | null) => (columnRefs.current['HTML Code'] = el)} // Typed ref assignment
            onMouseEnter={e => {
              e.stopPropagation()
              logWithTimestamp(F, 'Cell mouse enter, fullHtmlCode:', fullHtmlCode, 'index:', index)
              handleMouseEnter(fullHtmlCode, 'HTML Code', index + 1) // Pass row index
            }}
            onMouseLeave={handleMouseLeave}
            onClick={e => {
              e.stopPropagation()
              handleClick(fullHtmlCode, 'HTML Code')
            }}
          >
            {button.customCSS
              ? `${button.customCSS.substring(0, 16)}...${button.customCSS.slice(-16)}`
              : 'N/A'}
          </TableCell>
        </TableRow>
      )
    })
  ) : (
    <TableRow>
      <TableCell colSpan={10} align="center">
        <Typography>
          {buttons.length === 0
            ? 'No payment buttons found in database'
            : 'No buttons match the current filter'}
        </Typography>
        {buttons.length > 0 && !paginatedButtons.some(b => b.customCSS) && (
          <Typography color="warning">
            Note: No buttons have HTML code defined, despite creating a fixed button. Tracing logs above
            may indicate the issue.
          </Typography>
        )}
      </TableCell>
    </TableRow>
  )}
</TableBody>
            </Table>
          </TableContainer>
          <div
            style={{
              marginTop: '0.5em',
              display: 'flex',
              flexDirection: 'row',
              width: '100%',
              position: 'relative',
              alignItems: 'flex-start'
            }}
          >
            <Box sx={{ flex: '0 0 auto', paddingRight: '10px' }}>
              {(hoveredValue || clickedValue) && tableRef.current && (
                <Box
                  sx={{
                    position: 'relative',
                    width: '100%',
                    backgroundColor: theme.palette.background.paper,
                    padding: '4px 8px',
                    borderRadius: '4px',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'flex-start',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word',
                    minHeight: '40px',
                    maxHeight: 'none',
                    overflowY: 'auto',
                    boxSizing: 'border-box'
                  }}
                >
                  <Tooltip
                    title={
                      (hoveredValue && exitDirection === 'bottom') || clickedValue
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
                        <a
                          href={`https://whatsonchain.com/tx/${clickedValue}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
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
            </Box>
            <Box sx={{ flex: 1, backgroundColor: theme.palette.background.default }} /> {/* Middle padding column */}
            <Box sx={{ flex: '0 0 auto', paddingLeft: '1em' }}>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start', // Align pagination to the top
                  gap: 0, // Remove extra vertical gap
                  justifyContent: 'flex-start', // Ensure top alignment
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0' // Remove padding to avoid extra space
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.25,
                    justifyContent: 'flex-end', // Align to right side
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                >
                  <IconButton
                    onClick={() => setPage(0)}
                    disabled={page === 0}
                    color="inherit"
                    size="small"
                    sx={{ mr: 0.5 }}
                  >
                    <FirstPage />
                  </IconButton>
                  <IconButton onClick={() => setPage(page - 1)} disabled={page === 0} color="inherit" size="small">
                    {/* "Previous" handled by TablePagination context */}
                  </IconButton>
                  <TablePagination
                    component="div"
                    count={filteredButtons.length}
                    page={page}
                    onPageChange={(e, newPage) => {
                      setPage(newPage)
                      logWithTimestamp(
                        F,
                        'Page changed to:',
                        newPage,
                        'Rows:',
                        paginatedButtons,
                        'filteredButtons.length:',
                        filteredButtons.length
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
                    disabled={page >= Math.ceil(filteredButtons.length / rowsPerPage) - 1}
                    color="inherit"
                    size="small"
                  >
                    {/* "Next" handled by TablePagination context */}
                  </IconButton>
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
              </Box>
            </Box>
          </div>
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
export default PaymentButtonsList
