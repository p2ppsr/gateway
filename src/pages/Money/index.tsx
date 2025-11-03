/**
 * @file src/pages/Money/index.tsx
 * @description
 * My Money Page — Placeholder for managing fiat withdrawals and profile settings.
 * This component will allow users to withdraw fiat payments to their bank account
 * and manage profile aspects like identity certificate registration.
 * Currently a minimal implementation with commented-out logic for fetching payment buttons.
 * @version 1.0.0
 * @author xAI (Grok 3)
 */

import React from "react";
import { Container, Typography, Paper, Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";

const MyMoney: React.FC = (): JSX.Element => {
  const theme = useTheme();
  // const [loading, setLoading] = useState(true)
  // const [error, setError] = useState('')
  // const [page, setPage] = useState(1)

  // const fetchButtons = async (page, sortOrder, usedFilter) => {
  //     setLoading(true)
  //     setError('')
  //     try {
  //         let url = `${API_BASE}/api/listButtons?limit=25&offset=${(page - 1) * 25}&sort=${sortOrder}`
  //         if (usedFilter !== 'all') {
  //             url += `&usage=${usedFilter}`
  //         }
  // const response = await fetchWithTimeout(
  //   url,
  //   {
  //     method: 'GET',
  //     // headers: { 'x-bsv-auth-identity-key': merchantId } // (only if your route needs it)
  //   },
  //   wallet
  // )
  //         const data = JSON.parse(
  //             new TextDecoder().decode(response.body)
  //         )
  //         if (response.status === 'error') {
  //             throw new Error(`❌ ${response.message}`)
  //         }
  //         setButtons(data.data)
  //     } catch (err) {
  //         setError(err.message)
  //     } finally {
  //         setLoading(false)
  //     }
  // }

  // useEffect(() => {
  //     fetchButtons(page, sortOrder, usedFilter)
  // }, [page, sortOrder, usedFilter])

  // if (loading) return <div>Loading...</div>
  // if (error) return <div>Error: {error}</div>

  return (
    <Container sx={{ ...(theme.templates?.page_wrap || {}) }}>
      <Box
        sx={{
          textAlign: "center",
          marginBottom: theme.spacing(4),
          marginTop: theme.spacing(5),
          color: theme.palette.mode === "dark" ? "#ffffff" : "#000000",
        }}
      >
        <Typography variant="h2">My Money</Typography>
        <Typography variant="subtitle1">
          Withdraw funds and manage your profile.
        </Typography>
      </Box>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="body1">
          Here, you'll be able to withdraw any fiat payments into your bank
          account, and manage other aspects of your profile, such as identity
          certificate registration.
        </Typography>
      </Paper>
    </Container>
  );
};

export default MyMoney;
