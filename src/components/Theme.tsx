// frontend/src/components/Theme.tsx
import React, { ReactNode, useMemo, useState } from 'react'
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material'
import { Theme } from '@mui/material/styles'

const commonTypography = {
  fontFamily: 'Satoshi'
  // Removed top-level 'color' here; apply per-variant below
}

const lightTheme = createTheme({
  spacing: 8,
  typography: {
    ...commonTypography,
    h1: { fontWeight: 'bold', fontSize: '3em', color: '#424242' }, // Added color per variant
    h2: { fontWeight: 'bold', fontSize: '2.5em', color: '#424242' },
    h3: { fontWeight: 'normal', fontSize: '2em', color: '#424242' },
    h4: { fontSize: '1.75em', color: '#424242' },
    h5: { fontSize: '1.5em', color: '#424242' },
    h6: { fontSize: '1.25em', color: '#424242' }
    // Add other variants like body1, subtitle1 if needed: body1: { color: '#424242' }
  },
  palette: {
    mode: 'light',
    primary: { main: '#424242' },
    secondary: { main: '#FC433F' },
    background: { default: '#ffffff' },
    text: { primary: '#424242' } // Fallback global text color
  },
  maxContentWidth: '1440px'
})

const darkTheme = createTheme({
  spacing: 8,
  typography: {
    ...commonTypography,
    h1: { fontWeight: 'bold', fontSize: '3em', color: '#ffffff' },
    h2: { fontWeight: 'bold', fontSize: '2.5em', color: '#ffffff' },
    h3: { fontWeight: 'normal', fontSize: '2em', color: '#ffffff' },
    h4: { fontSize: '1.75em', color: '#ffffff' },
    h5: { fontSize: '1.5em', color: '#ffffff' },
    h6: { fontSize: '1.25em', color: '#ffffff' }
  },
  palette: {
    mode: 'dark',
    primary: { main: '#ffffff' },
    secondary: { main: '#5E59F9' },
    background: { default: '#323537' },
    text: { primary: '#ffffff' } // Fallback global text color
  },
  maxContentWidth: '1440px'
})

const extendedTheme = (baseTheme: Theme) => ({
  ...baseTheme,
  typography: {
    ...baseTheme.typography,
    h1: {
      ...baseTheme.typography.h1,
      [baseTheme.breakpoints.down('md')]: { fontSize: '1.8em' }
    },
    h2: {
      ...baseTheme.typography.h2,
      [baseTheme.breakpoints.down('md')]: { fontSize: '1.6em' }
    }
  },
  templates: {
    page_wrap: {
      maxWidth: `min(${baseTheme.maxContentWidth}, 100vw)`,
      margin: 'auto',
      boxSizing: 'border-box',
      padding: baseTheme.spacing(7),
      [baseTheme.breakpoints.down('lg')]: { padding: baseTheme.spacing(5) },
      [baseTheme.breakpoints.down('md')]: { padding: baseTheme.spacing(3) },
      [baseTheme.breakpoints.down('sm')]: { padding: baseTheme.spacing(1) }
    },
    subheading: {
      fontWeight: 'bold',
      fontSize: '24px',
      width: '90%',
      maxWidth: '600px',
      color: baseTheme.palette.mode === 'dark' ? '#FFF' : '#424242',
      textAlign: 'center',
      margin: 'auto',
      [baseTheme.breakpoints.up('lg')]: { fontSize: '32px' }
    },
    subheading_f: {
      fontWeight: 'bold',
      fontSize: '24px',
      width: '90%',
      color: baseTheme.palette.mode === 'dark' ? '#FFF' : '#424242',
      maxWidth: '600px',
      textAlign: 'left',
      [baseTheme.breakpoints.up('lg')]: { fontSize: '32px' }
    },
    centeredHeader: {
      textAlign: 'center',
      marginBottom: baseTheme.spacing(7),
      color: baseTheme.palette.mode === 'dark' ? '#ffffff' : '#000000'
    }
  }
})

const ThemeWrapper = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<'light' | 'dark'>('dark')
  const theme = useMemo(
    () => extendedTheme(mode === 'light' ? lightTheme : darkTheme),
    [mode]
  )

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}

export default ThemeWrapper
