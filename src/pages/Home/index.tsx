import React from 'react'
import {
  AppBar, Toolbar, Typography, Container, Grid, Paper, Button, TextField, Box, Link, CssBaseline, IconButton,
  List,
  ListItem,
  ListItemText,
  Divider
} from '@mui/material'
import { GitHub, Language, AttachMoney, VideogameAsset, OpenInNew } from '@mui/icons-material'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import background from './graphic.jpg' // Ensure you have a background image
import GitHubIcon from '@mui/icons-material/GitHub'
import styled from '@emotion/styled'
import { useNavigate } from 'react-router-dom'

const theme = createTheme({
  palette: {
    primary: {
      main: '#6c63ff',
    },
    background: {
      default: '#303030',
    },
    text: {
      primary: '#ffffff',
    },
  },
  typography: {
    fontFamily: 'Arial, sans-serif',
  },
})

const GradientButton = styled(Button)(({ theme }) => ({
  marginBottom: '2em',
  padding: '0.75em 1.5em',
  fontSize: '0.9em',
  borderRadius: '3em',
  background: 'linear-gradient(90deg, #00C9FF 0%, #92FE9D 100%)',
  boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.1)',
  color: '#000000',
  fontWeight: 'bold',
  transition: 'background 0.2s ease-in-out, transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
  '&:hover': {
    background: 'linear-gradient(90deg, #92FE9D 0%, #00C9FF 100%)',
    transform: 'translateY(-2px)',
    boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.2), 0 0 20px rgba(0, 201, 255, 0.6), 0 0 20px rgba(146, 254, 157, 0.6)',
  },
  '&:active': {
    transform: 'translateY(0)',
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.1)',
  },
}))

const HomePage: React.FC = () => {
  const navigate = useNavigate()
  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Grid container spacing={4} alignItems="center">
          <Grid item xs={12} md={7} sx={{ textAlign: { xs: 'center', md: 'left' } }}>
            <Typography variant="h2" sx={{ fontWeight: 'bold', mb: 4, color: '#ffffff' }}>
              Create <span style={{ color: '#6c63ff' }}>custom</span> payment buttons in minutes.
            </Typography>
            <Typography variant="body1" sx={{ mb: 4, color: '#ffffff' }}>
              Easily integrates with your favorite platforms including
              WordPress, HTML, Weebly, Wix, and Google Sites.
            </Typography>
            <GradientButton variant="contained" onClick={() => navigate('/create')}>
              CREATE A BUTTON
            </GradientButton>
          </Grid>
          <Grid item xs={12} md={5} sx={{ display: 'flex', justifyContent: 'center' }}>
            <Box
              component="img"
              src={background} // replace with your image path
              alt="Image 2"
              sx={{ width: '100%', maxWidth: '450px', borderRadius: 2, marginBottom: '4em' }}
            />
          </Grid>
        </Grid>
        <Grid
          container
          spacing={4}
          alignItems="center"
          sx={{ backgroundColor: '#00000022', borderRadius: '1em', padding: '2em' }}
        >
          <Grid item xs={12} md={6} sx={{ textAlign: { xs: 'center', md: 'left' } }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 2, color: '#ffffff' }}>
              An <span style={{ color: '#80E8CA' }}>open-source</span> solution for developers.
            </Typography>
            <Divider sx={{ borderColor: '#80E8CA', mb: 2 }} />
            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1, color: '#ffffff' }}>
              Use-cases
            </Typography>
            <List sx={{ mb: 4, color: '#ffffff', lineHeight: '1.6em' }}>
              <ListItem disablePadding>
                <ListItemText
                  primary={
                    <Typography>
                      <span style={{ fontWeight: 'bold' }}>Tipping</span> - Accept tips on your site or blog
                    </Typography>
                  }
                />
              </ListItem>
              <ListItem disablePadding>
                <ListItemText
                  primary={
                    <Typography>
                      <span style={{ fontWeight: 'bold' }}>Selling</span> - Accept BSV for digital or physical products
                    </Typography>
                  }
                />
              </ListItem>
              <ListItem disablePadding>
                <ListItemText
                  primary={
                    <Typography>
                      <span style={{ fontWeight: 'bold' }}>Gaming</span> - Build fun games with different incentives and dynamics
                    </Typography>
                  }
                />
              </ListItem>
            </List>
            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1, color: '#ffffff' }}>
              Solutions
            </Typography>
            <List sx={{ mb: 4, color: '#ffffff', lineHeight: '1.6em' }}>
              <ListItem disablePadding>
                <ListItemText
                  primary={
                    <Typography>
                      <span style={{ fontWeight: 'bold' }}>Button maker</span> - Craft unique buttons that look just how you want
                    </Typography>
                  }
                />
              </ListItem>
              <ListItem disablePadding>
                <ListItemText
                  primary={
                    <Typography>
                      <span style={{ fontWeight: 'bold' }}>Action studio</span> - Decide exactly what happens when payments go through
                    </Typography>
                  }
                />
              </ListItem>
              <ListItem disablePadding>
                <ListItemText
                  primary={
                    <Typography>
                      <span style={{ fontWeight: 'bold' }}>API Integration</span> - Use existing systems to create new buttons with code
                    </Typography>
                  }
                />
              </ListItem>
            </List>
            <Button
              variant="contained"
              color="primary"
              sx={{ mb: 8, display: 'flex', alignItems: 'center' }}
              startIcon={<GitHubIcon />}
              onClick={() => window.location.href = 'https://github.com/p2ppsr/gateway'}
            >
              Start Building
            </Button>
          </Grid>
        </Grid>
      </Container>
    </ThemeProvider>
  )
}

export default HomePage
