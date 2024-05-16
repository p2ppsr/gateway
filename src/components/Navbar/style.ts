import { createStyles, Theme } from '@mui/material/styles'

export default (theme: Theme) =>
  createStyles({
    navbar: {
      boxShadow: theme.shadows[3],
      marginBottom: theme.spacing(1),
      maxWidth: '1920px',
      margin: '0 auto',
    },
    toolbar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      position: 'relative',
    },
    logo: {
      fontWeight: 'bold',
      cursor: 'pointer',
    },
    navLinksWrapper: {
      display: 'flex',
      flex: 1,
      justifyContent: 'center',
      position: 'relative',
    },
    navLinks: {
      display: 'flex',
      gap: theme.spacing(4),
    },
    link: {
      color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
      '&:hover': {
        color: theme.palette.secondary.main,
      },
    },
    activeLink: {
      color: theme.palette.secondary.main,
      fontWeight: 'bold',
    },
    moneyLink: {
      color: theme.palette.secondary.contrastText,
      backgroundColor: theme.palette.secondary.main,
      padding: theme.spacing(0.5, 1),
      borderRadius: theme.shape.borderRadius,
      '&:hover': {
        backgroundColor: theme.palette.secondary.light,
      },
    },
    moneyLinkWrapper: {
      position: 'absolute',
      right: 0,
    },
  })
