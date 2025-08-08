/**
 * @file src/pages/Create/style.ts
 *
 * Provides styled MUI components used in the "Create Payment Button" page.
 * These components apply consistent spacing, typography, and theme-aware coloring
 * to support both light and dark modes across layout sections and form inputs.
 *
 * - Components include: `Root`, `ContentWrap`, `FormSection`, `PreviewSection`, `CodePreview`,
 *   `CenteredHeader`, `TextFieldStyled`, and `ButtonStyled`.
 * - All styles are responsive to `theme.palette.mode` and use MUI’s `styled` API.
 *
 * Used by `src/pages/Create/index.tsx` to style the UI consistently with the app theme.
 */

import { styled } from '@mui/material/styles'
import { Box, Paper, TextField, Button } from '@mui/material'

export const Root = styled(Box)(({ theme }) => ({
  minHeight: '100vh',
  color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
  paddingTop: theme.spacing(1),
  paddingBottom: theme.spacing(8),
  '& h3, & h2, & h4, & h5, & h6, & .MuiTypography-subtitle1': {
    color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
  }
}))

export const ContentWrap = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(4)
}))

export const FormSection = styled(Paper)(({ theme }) => ({
  // Changed from Box to Paper
  padding: theme.spacing(4),
  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  backdropFilter: 'blur(10px)',
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.palette.mode === 'dark' ? '0 4px 30px rgba(0, 0, 0, 0.1)' : '0 4px 30px rgba(255, 255, 255, 0.1)',
  color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
}))

export const PreviewSection = styled(Paper)(({ theme }) => ({
  // Changed from Box to Paper
  padding: theme.spacing(4),
  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  backdropFilter: 'blur(10px)',
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.palette.mode === 'dark' ? '0 4px 30px rgba(0, 0, 0, 0.1)' : '0 4px 30px rgba(255, 255, 255, 0.1)',
  color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
}))

export const CodePreview = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)',
  color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  fontFamily: 'monospace',
  overflowX: 'auto'
}))

export const CenteredHeader = styled(Box)(({ theme }) => ({
  textAlign: 'center',
  marginBottom: theme.spacing(7),
  color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
}))

export const TextFieldStyled = styled(TextField)(({ theme }) => ({
  '& label.Mui-focused': {
    color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
  },
  '& label': {
    color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
  },
  '& .MuiInput-underline:after': {
    borderBottomColor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
  },
  '& .MuiOutlinedInput-root': {
    '& fieldset': {
      borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
    },
    '&:hover fieldset': {
      borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
    },
    '&.Mui-focused fieldset': {
      borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
    }
  },
  '& .MuiInputBase-input': {
    color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
  },
  '& .MuiFormHelperText-root': {
    color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
  }
}))

export const ButtonStyled = styled(Button)(({ theme }) => ({
  color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
  borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
  '&:hover': {
    borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
  }
}))
