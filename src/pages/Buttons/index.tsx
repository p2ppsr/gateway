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
 *
 * Used by the Gateway UI to manage user-created payment buttons. For local testing, delays are attributed to server or application logic,
 * not external connections or hardware constraints (MacBook Pro M4 Max, 128GB RAM, 2TB SSD), guiding optimization efforts
 * Version: v3.49 (Updated 01Aug2025_0320 BST with Fixed Type Errors in Sorting)
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

const WALLET_ORIGIN = process.env.WALLET_ORIGIN ?? 'localhost:3321'
const wallet = new WalletClient('auto', WALLET_ORIGIN)
const authFetch = new AuthFetch(wallet)

interface ButtonResponse {
  status: string
  message: string
  data: {
    button_id: string
    amount: number | string
    currency: string
    variable_amount: boolean
    multi_use: boolean
    used: boolean
    accepts: string
    total_paid: number | string
    description: string
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
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'desc' })
  const [customOptions, setCustomOptions] = useState<number[]>([])
  const [totalRecords, setTotalRecords] = useState(0)
  const theme = useTheme()
  const fetchTimeout = useRef<number | null>(null)

  useEffect(() => {
    const fetchTotal = async () => {
      setLoading(true)
      try {
        const url = `${location.protocol}//${location.host}/api/listButtons?limit=1000`
        logWithTimestamp('pages/Buttons', 'Fetching total buttons with URL:', url)
        const response = await authFetch.fetch(url, { method: 'GET' })
        const data: ButtonResponse = await response.json()
        if (data.status === 'error') throw new Error(`❌ ${data.message ?? 'Failed to fetch total buttons'}`)
        const sortedButtons = [...data.data].sort((a, b) => {
          let aValue: string | number = a.button_id ? a.button_id.toString() : ''
          let bValue: string | number = b.button_id ? b.button_id.toString() : ''
          return aValue.localeCompare(bValue as string)
        })
        setTotalRecords(data.data.length)
        setButtons(sortedButtons)
        logWithTimestamp('pages/Buttons', 'Initial buttons length:', sortedButtons.length)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        logWithTimestamp('pages/Buttons', 'Error fetching total buttons:', message)
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
    logWithTimestamp('pages/Buttons', 'Rows per page change:', value, 'Current options:', rowsPerPageOptions.map(opt => opt.value))
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
    logWithTimestamp('pages/Buttons', 'Custom rows on complete:', numValue)
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

  const filteredButtons = usedFilter === 'all'
    ? buttons
    : buttons.filter(button =>
        (usedFilter === 'used' && button.used) ||
        (usedFilter === 'unused' && !button.used)
      )

  const sortedButtons = sortConfig.key
    ? [...filteredButtons].sort((a, b) => {
        if (!sortConfig.key) return 0 // Default to no change if key is null
        let aValue: string | number = a[sortConfig.key] !== undefined ? a[sortConfig.key].toString() : ''
        let bValue: string | number = b[sortConfig.key] !== undefined ? b[sortConfig.key].toString() : ''
        if (sortConfig.key === 'amount' || sortConfig.key === 'total_paid') {
          aValue = parseFloat(formatBSV(aValue as string)) || 0
          bValue = parseFloat(formatBSV(bValue as string)) || 0
          return sortConfig.direction === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number)
        } else if (sortConfig.key === 'variable_amount' || sortConfig.key === 'multi_use' || sortConfig.key === 'used') {
          aValue = a[sortConfig.key] ? 1 : 0
          bValue = b[sortConfig.key] ? 1 : 0
          return sortConfig.direction === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number)
        } else {
          if (typeof aValue === 'string' && typeof bValue === 'string') {
            logWithTimestamp('pages/Buttons', `Sorting ${sortConfig.key}: aValue=${aValue}, bValue=${bValue}`)
            return sortConfig.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
          }
          return 0 // Fallback if types don't match
        }
      })
    : filteredButtons

  const paginatedButtons = sortedButtons.slice(page * rowsPerPage, (page + 1) * rowsPerPage)
  logWithTimestamp('pages/Buttons', 'Paginated buttons length:', paginatedButtons.length, 'Total buttons length:', buttons.length, 'Filtered length:', filteredButtons.length, 'Sorted length:', sortedButtons.length, 'Page:', page, 'Offset:', page * rowsPerPage)

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
  if (error !== '') {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '90vh',
          backgroundColor: theme.palette.background.paper,
        }}
      >
        <Typography color='error'>Error: {error}</Typography>
      </Box>
    )
  }

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
        <Typography variant='h2'>Payment Buttons</Typography>
        <Typography variant='subtitle1'>View all the payment buttons you have created</Typography>
      </Box>
      {buttons.length === 0 ? (
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
            <Typography variant='h2'>No Payment Buttons Yet</Typography>
            <Typography color='text.secondary'>
              It looks like you haven’t created any payment buttons. Get started by creating one now!
            </Typography>
            <Button variant='contained' component={Link} to='/' color='primary'>
              Create a Button
            </Button>
          </Stack>
        </Card>
      ) : (
        <>
          <Stack direction='row' spacing={2} sx={{ mb: 2, justifyContent: 'flex-end' }}>
            <Select
              value={usedFilter}
              onChange={(e) => setUsedFilter(e.target.value as 'all' | 'used' | 'unused')}
              variant='outlined'
            >
              <MenuItem value='all'>All</MenuItem>
              <MenuItem value='used'>Used</MenuItem>
              <MenuItem value='unused'>Unused</MenuItem>
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
                      onClick={(e) => {
                        e.preventDefault()
                        requestSort('button_id')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      ID {sortConfig.key === 'button_id' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component='a'
                      href='#'
                      onClick={(e) => {
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
                      component='a'
                      href='#'
                      onClick={(e) => {
                        e.preventDefault()
                        requestSort('currency')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Currency {sortConfig.key === 'currency' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component='a'
                      href='#'
                      onClick={(e) => {
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
                      component='a'
                      href='#'
                      onClick={(e) => {
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
                      component='a'
                      href='#'
                      onClick={(e) => {
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
                      component='a'
                      href='#'
                      onClick={(e) => {
                        e.preventDefault()
                        requestSort('accepts')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Accepts {sortConfig.key === 'accepts' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      component='a'
                      href='#'
                      onClick={(e) => {
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
                      component='a'
                      href='#'
                      onClick={(e) => {
                        e.preventDefault()
                        requestSort('description')
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      Description {sortConfig.key === 'description' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedButtons.length > 0 ? (
                  paginatedButtons.map((button) => (
                    <TableRow key={button.button_id}>
                      <TableCell>{button.button_id}</TableCell>
                      <TableCell>{formatBSV(button.amount)}</TableCell>
                      <TableCell>{button.currency}</TableCell>
                      <TableCell>{button.variable_amount ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{button.multi_use ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{button.used ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{button.accepts}</TableCell>
                      <TableCell>{formatBSV(button.total_paid)}</TableCell>
                      <TableCell>{button.description}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      <Typography>No buttons to display</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component='div'
            count={totalRecords}
            page={page}
            onPageChange={(e, newPage) => {
              setPage(newPage)
              logWithTimestamp('pages/Buttons', 'Page changed to:', newPage, 'Rows:', paginatedButtons)
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

export default PaymentButtonsList