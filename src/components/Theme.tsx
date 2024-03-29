import React, { ReactNode } from 'react'
import {
    createTheme, ThemeProvider, StyledEngineProvider
} from '@mui/material/styles'
import { makeStyles } from '@mui/styles'

const baseTheme = createTheme({
    spacing: 8,
    typography: {
        a: {
            fontWeight: 'medium'
        },
        h1: {
            fontFamily: 'Satoshi',
            fontWeight: 'bold',
            fontSize: '3em',
            color: '#424242'
        },
        h2: {
            fontFamily: 'Satoshi',
            fontWeight: 'bold',
            fontSize: '2.5em',
            color: '#424242'
        },
        h3: {
            fontFamily: 'Satoshi',
            fontWeight: 'normal',
            fontSize: '2em',
            color: '#424242'
        },
        h4: {
            fontFamily: 'Satoshi',
            fontSize: '1.75em',
            color: '#424242'
        },
        h5: {
            fontFamily: 'Satoshi',
            fontSize: '1.5em',
            color: '#424242'
        },
        h6: {
            fontFamily: 'Satoshi',
            fontSize: '1.25em',
            color: '#424242'
        }
    },
    palette: {
        primary: {
            main: '#424242'
        },
        secondary: {
            main: '#FC433F'
        },
        cli: {
            main: '#31C4A0'
        }
    },
    overrides: {
        footerBackground: 'white',
        footerText: '#424242',
        navTextInactive: '#F68A8A',
        logoText: '#424242',
        lilDiv: '#DDE7FF'
    },
    maxContentWidth: '1440px'
})

const extendedTheme = theme => ({
    ...theme,
    typography: {
        ...theme.typography,
        h1: {
            ...theme.typography.h1,
            [theme.breakpoints.down('md')]: {
                fontSize: '1.8em'
            }
        },
        h2: {
            ...theme.typography.h2,
            [theme.breakpoints.down('md')]: {
                fontSize: '1.6em'
            }
        }
    },
    templates: {
        page_wrap: {
            maxWidth: `min(${theme.maxContentWidth}, 100vw)`,
            margin: 'auto',
            boxSizing: 'border-box',
            padding: theme.spacing(7),
            [theme.breakpoints.down('lg')]: {
                padding: theme.spacing(5)
            },
            [theme.breakpoints.down('md')]: {
                padding: theme.spacing(3)
            },
            [theme.breakpoints.down('sm')]: {
                padding: theme.spacing(1)
            }
        },
        subheading: {
            fontWeight: 'bold',
            fontSize: '24px',
            width: '90%',
            maxWidth: '600px',
            color: '#424242',
            textAlign: 'center',
            margin: 'auto',
            [theme.breakpoints.up('lg')]: {
                fontSize: '32px'
            }
        },
        subheading_drk: {
            fontWeight: 'bold',
            fontSize: '24px',
            width: '90%',
            color: '#FFF',
            maxWidth: '600px',
            textAlign: 'center',
            margin: 'auto',
            [theme.breakpoints.up('lg')]: {
                fontSize: '32px'
            }
        },
        subheading_f: {
            fontWeight: 'bold',
            fontSize: '24px',
            width: '90%',
            color: '#424242',
            maxWidth: '600px',
            textAlign: 'left',
            [theme.breakpoints.up('lg')]: {
                fontSize: '32px'
            }
        },
        subheading_f_drk: {
            fontWeight: 'bold',
            fontSize: '24px',
            width: '90%',
            color: '#FFF',
            maxWidth: '600px',
            textAlign: 'left',
            [theme.breakpoints.up('lg')]: {
                fontSize: '32px'
            }
        }
    }
})

const useStyles = makeStyles({
    '@global html': {
        padding: '0px',
        margin: '0px'
    },
    '@global body': {
        padding: '0px',
        margin: '0px',
        fontFamily: 'helvetica'
    },
    '@global a': {
        textDecoration: 'none',
        color: '#FC433F'
    },
    '@global h1': {
        fontWeight: 'bold',
        fontSize: '2.5em',
        color: '#424242'
    },
    '@global h2': {
        fontWeight: 'bold',
        fontSize: '1.7em',
        color: '#424242'
    },
    '@global h3': {

        fontSize: '1.4em',
        color: '#424242'
    },
    '@global h4': {
        fontSize: '1.25em',
        color: '#424242'
    },
    '@global h5': {
        fontSize: '1.1em',
        color: '#424242'
    },
    '@global h6': {
        fontSize: '1em',
        color: '#424242'
    }
})

/**
 * Defines global styles and the theme
 */
const Theme = ({ children }: { children: ReactNode }) => {
    useStyles() // Applies global styles
    return (
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={baseTheme}>
                <ThemeProvider theme={extendedTheme}>
                    {children}
                </ThemeProvider>
            </ThemeProvider>
        </StyledEngineProvider>
    )
}

export default Theme
