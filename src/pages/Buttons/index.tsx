import React, { useState, useEffect } from 'react'
import {
  Container,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Button,
  useTheme,
  Box
} from '@mui/material'
import authrite from '../../utils/Authrite'

interface PaymentButton {
  button_id: string
  amount: number
  currency: string
  variable_amount: boolean
  multi_use: boolean
  used: boolean
  accepts: string
  total_paid: number
}

const PaymentButtonsList: React.FC = () => {
  const [buttons, setButtons] = useState<PaymentButton[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [usedFilter, setUsedFilter] = useState<'all' | 'used' | 'unused'>('all')

  const theme = useTheme()

  const fetchButtons = async (page: number, sortOrder: 'asc' | 'desc', usedFilter: 'all' | 'used' | 'unused') => {
    setLoading(true)
    setError('')
    try {
      let url = `${location.protocol}//${location.host}/api/listButtons?limit=25&offset=${(page - 1) * 25}&sort=${sortOrder}`
      if (usedFilter !== 'all') {
        url += `&usage=${usedFilter}`
      }
      const response = await authrite.request(url, {
        method: 'GET',
      })
      const data = JSON.parse(new TextDecoder().decode(response.body))
      if (data.status === 'error') {
        throw new Error(response.message)
      }
      setButtons(data.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchButtons(page, sortOrder, usedFilter)
  }, [page, sortOrder, usedFilter])

  if (loading) return <CircularProgress />
  if (error) return <Typography color="error">Error: {error}</Typography>

  return (
    <Container style={{ backgroundColor: theme.palette.background.default, padding: theme.spacing(4) }}>
      <Typography variant="h4" gutterBottom>
        Payment Buttons
      </Typography>
      <FormControl variant="outlined" fullWidth margin="normal">
        <InputLabel>Filter by usage</InputLabel>
        <Select
          value={usedFilter}
          onChange={(e) => setUsedFilter(e.target.value as 'all' | 'used' | 'unused')}
          label="Filter by usage"
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="used">Used</MenuItem>
          <MenuItem value="unused">Unused</MenuItem>
        </Select>
      </FormControl>
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
            {buttons.map((button) => (
              <TableRow key={button.button_id}>
                <TableCell>{button.button_id}</TableCell>
                <TableCell>{button.amount}</TableCell>
                <TableCell>{button.currency}</TableCell>
                <TableCell>{button.variable_amount ? 'Yes' : 'No'}</TableCell>
                <TableCell>{button.multi_use ? 'Yes' : 'No'}</TableCell>
                <TableCell>{button.used ? 'Yes' : 'No'}</TableCell>
                <TableCell>{button.accepts}</TableCell>
                <TableCell>{button.total_paid}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {buttons.length === 0 && <Typography>No payment buttons found.</Typography>}
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, gap: 2 }}>
        <Button
          variant="contained"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <Button
          variant="contained"
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
        <Button
          variant="contained"
          onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
        >
          Sort Order: {sortOrder.toUpperCase()}
        </Button>
      </Box>
    </Container>
  )
}

export default PaymentButtonsList
