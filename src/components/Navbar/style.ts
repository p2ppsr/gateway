import { createStyles, Theme } from '@mui/material/styles';

export default (theme: Theme) =>
  createStyles({
    navbar: {
      boxShadow: theme.shadows[3],
      marginBottom: theme.spacing(1),
    },
    toolbar: {
      display: 'flex',
      justifyContent: 'space-between',
    },
    logo: {
      fontWeight: 'bold',
      cursor: 'pointer',
    },
    navLinks: {
      display: 'flex',
      gap: theme.spacing(2),
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
      padding: theme.spacing(1),
      borderRadius: theme.shape.borderRadius,
      '&:hover': {
        backgroundColor: theme.palette.secondary.light,
      },
    },
  });
