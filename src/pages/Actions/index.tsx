import React, { useState, useEffect } from 'react'
import {
  CircularProgress,
  Container,
  Typography,
  Paper,
  Box,
} from '@mui/material'
import { useTheme } from '@emotion/react'
// import authrite from '../../utils/Authrite'

const PaymentActionsList: React.FC = () => {
  const theme = useTheme()
  // const [loading, setLoading] = useState(true)
  // const [error, setError] = useState('')
  // const [page, setPage] = useState(1)
  // const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  // const [usedFilter, setUsedFilter] = useState<string>('all')
  // const [buttons, setButtons] = useState<Button[]>([])

  // const fetchButtons = async () => {
  //     setLoading(true)
  //     setError('')
  //     try {
  //         let url = `${location.protocol}//${location.host}/api/listButtons?limit=25&offset=${(page - 1) * 25}&sort=${sortOrder}`
  //         if (usedFilter !== 'all') {
  //             url += `&usage=${usedFilter}`
  //         }
  //         const response = await authrite.request(url, {
  //             method: 'GET',
  //             // Include headers as necessary, e.g., for authentication
  //         })
  //         const data = JSON.parse(new TextDecoder().decode(response.body))
  //         if (data.status === 'error') {
  //             throw new Error(response.message)
  //         }
  //         setButtons(data.data)
  //     } catch (err: any) {
  //         setError(`Fetching buttons failed: ${err.message}`)
  //     } finally {
  //         setLoading(false)
  //     }
  // }

  // useEffect(() => {
  //     fetchButtons()
  // }, [page, sortOrder, usedFilter])

  // if (loading) return <CircularProgress />
  // if (error) return <Typography color="error">{error}</Typography>

  return (
    <Container>
      <Box style={{
        textAlign: 'center',
        marginBottom: theme.spacing(4),
        marginTop: theme.spacing(5),
        color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
      }}>
        <Typography variant="h2">Payment Actions</Typography>
        <Typography variant="subtitle1">
          Manage the specialized payment actions you have created.
        </Typography>
      </Box>
      <Paper elevation={3}>
        <Box p={3}>
          <Typography variant="body1">
            Here, you will be able to create actions that get triggered when one of your buttons receives a payment. Things like sending an email, hitting a webhook, or maybe even sending another payment somewhere else!
          </Typography>
        </Box>
      </Paper>
    </Container>
  )
}

export default PaymentActionsList
