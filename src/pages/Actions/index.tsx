/**
 * @file src/pages/Actions/index.tsx
 * @description
 * Displays the "Payment Actions" informational page in the app. This component introduces
 * the idea of user-defined payment actions that can be triggered upon receiving payments.
 * - Uses MUI theming to apply dynamic styles for light and dark mode.
 * - Presents a heading, subtitle, and a brief explanatory paragraph.
 * - Currently static and non-interactive; serves as a placeholder for future action management UI.
 * Intended as a future home for managing payment-triggered workflows.
 * @version 1.0.0
 * @author xAI (Grok 3)
 */

import React from 'react'
import { Container, Typography, Paper, Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'

/**
 * `PaymentActionsList` is a React functional component that displays an overview section
 * describing the purpose and future functionality of user-defined payment actions.
 *
 * It uses the current MUI theme to apply dynamic styles based on light or dark mode.
 *
 * This component is purely presentational and does not currently render any actionable items.
 *
 * @returns A styled informational panel with a heading and description of payment actions.
 */
const PaymentActionsList: React.FC = () => {
  const theme = useTheme()

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
        <Typography variant="h2">Payment Actions</Typography>
        <Typography variant="subtitle1">Manage the specialized payment actions you have created.</Typography>
      </Box>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="body1">
          Here, you will be able to create actions that get triggered when one of your buttons receives a payment.
          Things like sending an email, hitting a webhook, or maybe even sending another payment somewhere else!
        </Typography>
      </Paper>
    </Container>
  )
}

export default PaymentActionsList
