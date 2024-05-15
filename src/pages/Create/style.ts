import { makeStyles } from '@mui/styles';

const useStyles = makeStyles((theme) => ({
  root: {
    minHeight: '100vh',
    color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(8),
    '& h3, & h2, & h4, & h5, & h6, & .MuiTypography-subtitle1': {
      color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
    },
  },
  contentWrap: {
    marginTop: theme.spacing(4),
  },
  formSection: {
    padding: theme.spacing(4),
    backgroundColor: theme.palette.mode === 'dark'
      ? 'rgba(255, 255, 255, 0.1)'
      : 'rgba(0, 0, 0, 0.1)',
    backdropFilter: 'blur(10px)',
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.palette.mode === 'dark'
      ? '0 4px 30px rgba(0, 0, 0, 0.1)'
      : '0 4px 30px rgba(255, 255, 255, 0.1)',
    color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
  },
  previewSection: {
    padding: theme.spacing(4),
    backgroundColor: theme.palette.mode === 'dark'
      ? 'rgba(255, 255, 255, 0.1)'
      : 'rgba(0, 0, 0, 0.1)',
    backdropFilter: 'blur(10px)',
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.palette.mode === 'dark'
      ? '0 4px 30px rgba(0, 0, 0, 0.1)'
      : '0 4px 30px rgba(255, 255, 255, 0.1)',
    color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
  },
  codePreview: {
    backgroundColor: theme.palette.mode === 'dark'
      ? 'rgba(0, 0, 0, 0.8)'
      : 'rgba(255, 255, 255, 0.8)',
    color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    fontFamily: 'monospace',
    overflowX: 'auto',
  },
  centeredHeader: {
    textAlign: 'center',
    marginBottom: theme.spacing(7),
    color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
  },
  textField: {
    '& label.Mui-focused': {
      color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
    },
    '& label': {
      color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
    },
    '& .MuiInput-underline:after': {
      borderBottomColor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
    },
    '& .MuiOutlinedInput-root': {
      '& fieldset': {
        borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
      },
      '&:hover fieldset': {
        borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
      },
      '&.Mui-focused fieldset': {
        borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
      },
    },
    '& .MuiInputBase-input': {
      color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
    },
    '& .MuiFormHelperText-root': {
      color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
    },
  },
  button: {
    color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
    borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
    '&:hover': {
      borderColor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
      backgroundColor: theme.palette.mode === 'dark'
        ? 'rgba(255, 255, 255, 0.2)'
        : 'rgba(0, 0, 0, 0.2)',
    },
  },
  link: {
    color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
    '&:hover': {
      color: theme.palette.mode === 'dark' ? '#bbbbbb' : '#333333',
    },
  },
}));

export default useStyles;
