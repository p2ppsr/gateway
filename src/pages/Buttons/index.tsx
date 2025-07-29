/**
 * @file src/pages/Buttons/index.tsx
 *
 * Displays a paginated table of payment buttons created by the user.
 * Each row represents a button, showing ID, amount, currency, and other details.
 *
 * - Fetches buttons from the backend using `authFetch` and the Metanet client.
 * - Includes filters for usage (all, used, unused) and client-side sorting by total paid.
 * - Implements an empty state with a CTA to create a button.
 * - Uses MUI table components with pagination.
 * - Utilizes `formatBSV` from `utils/general.ts` for consistent amount formatting.
 * - Uses `logWithTimestamp` from `utils/logging.ts` with configuration from `logging.config.ts` to measure performance and color-code logs,
 *   including detailed timing from fetch initiation to response, optimized for local testing.
 * - Optimizes performance with a 100ms debounce to prevent multiple rapid fetch attempts.
 * - Adjusted `useRef` type to `number | null` to align with browser `setTimeout` return type, correcting TS2322 error.
 *
 * Used by the Gateway UI to manage user-created payment buttons. For local testing, delays are attributed to server or application logic,
 * not external connections or hardware constraints (MacBook Pro M4 Max, 128GB RAM, 2TB SSD), guiding optimization efforts.
 *
 * Version: v2.3 (Updated 25Jul2025_1027 BST)
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
  message?: string
  data: {
    button_id: string
    amount: number | string
    currency: string
    variable_amount: boolean
    multi_use: boolean
    used: boolean
    accepts: string
    total_paid: number | string
  }[]
}

const PaymentButtonsList: React.FC = () => {
  const [buttons, setButtons] = useState<ButtonResponse['data']>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [usedFilter, setUsedFilter] = useState<'all' | 'used' | 'unused'>('all')
  const theme = useTheme()
  const fetchTimeout = useRef<number | null>(null) // Changed type to number | null

  const fetchButtons = async (pageNum: number, sort: string, usedFilterVal: string): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      let url = `${location.protocol}//${location.host}/api/listButtons?sort=${sort}&limit=100&offset=0`
      if (usedFilterVal !== 'all') url += `&usage=${usedFilterVal}`

      logWithTimestamp('pages/Buttons', 'Starting fetch for buttons with URL:', url)

      // Measure exact fetch duration
      logWithTimestamp('pages/Buttons', 'Initiating API fetch')
      const response = await authFetch.fetch(url, { method: 'GET' })
      logWithTimestamp('pages/Buttons', 'API fetch completed')

      logWithTimestamp('pages/Buttons', 'API response status:', response.status)
      const data: ButtonResponse = await response.json()
      if (data.status === 'error') throw new Error(`❌ ${data.message ?? 'Failed to fetch buttons'}`)
      
      const rawTotals = data.data.map(b => b.total_paid)
      logWithTimestamp('pages/Buttons', 'Raw total_paid values:', rawTotals)

      const sortedButtons = [...data.data].sort((a, b) => {
        const aValue = parseFloat(formatBSV(a.total_paid)) || 0
        const bValue = parseFloat(formatBSV(b.total_paid)) || 0
        return sort === 'asc' ? aValue - bValue : bValue - aValue
      })
      const sortedTotals = sortedButtons.map(b => b.total_paid)
      logWithTimestamp('pages/Buttons', 'Sorted total_paid values:', sortedTotals)

      setButtons(sortedButtons)
      logWithTimestamp('pages/Buttons', 'Rendered buttons state:', sortedButtons.map(b => b.total_paid))
      if (usedFilterVal === 'used' && data.data.length === 0) {
        logWithTimestamp('pages/Buttons', 'Debug: No used buttons found in API response - URL:', url, 'Response:', data)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logWithTimestamp('pages/Buttons', 'Error fetching buttons:', message)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (fetchTimeout.current) {
      clearTimeout(fetchTimeout.current)
    }
    fetchTimeout.current = setTimeout(() => {
      void fetchButtons(page, sortOrder, usedFilter)
    }, 100) // Debounce by 100ms
    return () => {
      if (fetchTimeout.current) {
        clearTimeout(fetchTimeout.current)
      }
    }
  }, [page, sortOrder, usedFilter, rowsPerPage])

  useEffect(() => {
    setPage(0)
  }, [usedFilter])

  const paginatedButtons = buttons.slice(page * rowsPerPage, (page + 1) * rowsPerPage)

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
          backgroundColor: theme.palette.background.default,
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
              onChange={(e) => setUsedFilter(e.target.value as 'all' | 'used' | 'unused')}
              variant="outlined"
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="used">Used</MenuItem>
              <MenuItem value="unused">Unused</MenuItem>
            </Select>
            <Button
              variant="contained"
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            >
              Sort by Total: {sortOrder.toUpperCase()}
            </Button>
          </Stack>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Currency</TableCell>
                  <TableCell>Variable Amount</TableCell>
                  <TableCell>Multi-use</TableCell>
                  <TableCell>Used</TableCell>
                  <TableCell>Accepts</TableCell>
                  <TableCell>Total Paid</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedButtons.map((button) => (
                  <TableRow key={button.button_id}>
                    <TableCell>{button.button_id}</TableCell>
                    <TableCell>{formatBSV(button.amount)}</TableCell>
                    <TableCell>{button.currency}</TableCell>
                    <TableCell>{button.variable_amount ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{button.multi_use ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{button.used ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{button.accepts}</TableCell>
                    <TableCell>{formatBSV(button.total_paid)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={buttons.length}
            page={page}
            onPageChange={(e, newPage) => {
              setPage(newPage)
              logWithTimestamp('pages/Buttons', 'Page changed to:', newPage, 'Rows:', paginatedButtons)
            }}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10))
              setPage(0)
              logWithTimestamp('pages/Buttons', 'Rows per page changed to:', e.target.value)
            }}
            rowsPerPageOptions={[5, 10, 25]}
          />
        </>
      )}
    </Container>
  )
}

export default PaymentButtonsList
