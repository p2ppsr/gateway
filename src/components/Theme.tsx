import React, { ReactNode, useMemo, useState } from 'react'
import { createTheme, ThemeProvider, StyledEngineProvider, Theme } from '@mui/material/styles'
import { makeStyles, createStyles } from '@mui/styles'

const commonTypography = {
  fontFamily: 'Satoshi',
  color: '#424242',
}

const lightTheme = createTheme({
  spacing: 8,
  typography: {
    ...commonTypography,
    h1: { fontWeight: 'bold', fontSize: '3em' },
    h2: { fontWeight: 'bold', fontSize: '2.5em' },
    h3: { fontWeight: 'normal', fontSize: '2em' },
    h4: { fontSize: '1.75em' },
    h5: { fontSize: '1.5em' },
    h6: { fontSize: '1.25em' },
  },
  palette: {
    mode: 'light',
    primary: { main: '#424242' },
    secondary: { main: '#FC433F' },
    background: { default: '#ffffff' },
  },
  maxContentWidth: '1440px',
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
    h6: { fontSize: '1.25em', color: '#ffffff' },
  },
  palette: {
    mode: 'dark',
    primary: { main: '#ffffff' },
    secondary: { main: '#5E59F9' },
    background: { default: '#323537' },
  },
  maxContentWidth: '1440px',
})

const extendedTheme = (theme: Theme) => ({
  ...theme,
  typography: {
    ...theme.typography,
    h1: {
      ...theme.typography.h1,
      [theme.breakpoints.down('md')]: { fontSize: '1.8em' },
    },
    h2: {
      ...theme.typography.h2,
      [theme.breakpoints.down('md')]: { fontSize: '1.6em' },
    },
  },
  templates: {
    page_wrap: {
      maxWidth: `min(${theme.maxContentWidth}, 100vw)`,
      margin: 'auto',
      boxSizing: 'border-box',
      padding: theme.spacing(7),
      [theme.breakpoints.down('lg')]: { padding: theme.spacing(5) },
      [theme.breakpoints.down('md')]: { padding: theme.spacing(3) },
      [theme.breakpoints.down('sm')]: { padding: theme.spacing(1) },
    },
    subheading: {
      fontWeight: 'bold',
      fontSize: '24px',
      width: '90%',
      maxWidth: '600px',
      color: theme.palette.mode === 'dark' ? '#FFF' : '#424242',
      textAlign: 'center',
      margin: 'auto',
      [theme.breakpoints.up('lg')]: { fontSize: '32px' },
    },
    subheading_f: {
      fontWeight: 'bold',
      fontSize: '24px',
      width: '90%',
      color: theme.palette.mode === 'dark' ? '#FFF' : '#424242',
      maxWidth: '600px',
      textAlign: 'left',
      [theme.breakpoints.up('lg')]: { fontSize: '32px' },
    },
  },
})

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    '@global html, body': {
      padding: '0px',
      margin: '0px',
      fontFamily: 'helvetica',
      backgroundColor: theme.palette.background.default,
      color: theme.palette.mode === 'dark' ? '#ffffff' : '#424242'
    },
    '@global a': {
      textDecoration: 'none',
      color: '#FC433F',
    },
  })
)

const GlobalStyles = () => {
  useStyles()
  return null
}

const ThemeWrapper = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<'light' | 'dark'>('dark') // Default to dark mode

  const theme = useMemo(() => {
    const base = mode === 'light' ? lightTheme : darkTheme
    return createTheme(extendedTheme(base))
  }, [mode])

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <GlobalStyles />
        {children}
      </ThemeProvider>
    </StyledEngineProvider>
  )
}

export default ThemeWrapper
