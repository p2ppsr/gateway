/**
 * @file src/components/Navbar/index.tsx
 *
 * Renders the main navigation bar for the Gateway application.
 *
 * This component provides responsive navigation links including "Create a Button",
 * "Your Buttons", "Actions", "Payments", and optionally "Admin Dashboard" if the user is an admin.
 * On smaller screens, it collapses into a hamburger menu using MUI's Drawer component.
 * The active route is highlighted, and visual styling adapts to light/dark themes.
 *
 * NOTE: This file uses strict TypeScript linting rules.
 *       All function expressions must declare an explicit return type.
 */

import React, { useState } from 'react'
import {
  Typography,
  AppBar,
  Toolbar,
  Button,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemText,
  useTheme,
  useMediaQuery
} from '@mui/material'
import { Menu as MenuIcon, AccountBalanceWallet } from '@mui/icons-material'
import { Link as RouterLink, useLocation } from 'react-router-dom'

const ListItemLink = (props: { to: string, primary: string, onClick: () => void }): JSX.Element => {
  const { to, primary, onClick } = props
  return (
    <ListItem button component={RouterLink as any} to={to} onClick={onClick}>
      <ListItemText primary={primary} />
    </ListItem>
  )
}

/**
 * Navigation bar component for the Gateway frontend.
 *
 * Displays the site logo and routes for creating buttons, viewing buttons, actions,
 * payments, and admin dashboard. Adjusts layout based on mobile viewport using a drawer menu.
 *
 * @component
 * @param {boolean} isAdmin - Whether the user is an admin. Admins see the "Admin Dashboard" link.
 * @returns {JSX.Element} The rendered Navbar component.
 */
const Navbar = ({ isAdmin }: { isAdmin: boolean }): JSX.Element => {
  const theme = useTheme()
  const location = useLocation()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleDrawerToggle = (): void => {
    setDrawerOpen(!drawerOpen)
  }

  const getLinkStyle = (path: string): object =>
    location.pathname === path
      ? {
          color: theme.palette.secondary.main,
          fontWeight: 'bold'
        }
      : {
          color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
          '&:hover': { color: theme.palette.secondary.main }
        }

  return (
    <AppBar
      position='sticky'
      color='primary'
      sx={{
        boxShadow: 3,
        mb: 1,
        maxWidth: '1920px',
        mx: 'auto'
      }}
    >
      <Toolbar
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src='/gatewaycash.svg' height='50px' style={{ paddingRight: '0.5em' }} />
          <Typography variant='h5' sx={{ fontWeight: 'bold', cursor: 'pointer' }}>
            Gateway
          </Typography>
        </div>

        {isMobile
          ? (
            <>
              <IconButton edge='start' color='inherit' aria-label='menu' onClick={handleDrawerToggle}>
                <MenuIcon />
              </IconButton>
              <Drawer anchor='left' open={drawerOpen} onClose={handleDrawerToggle}>
                <List>
                  <ListItemLink to='/' primary='Create a Button' onClick={() => setDrawerOpen(false)} />
                  <ListItemLink to='/buttons' primary='Your Buttons' onClick={() => setDrawerOpen(false)} />
                  <ListItemLink to='/actions' primary='Actions' onClick={() => setDrawerOpen(false)} />
                  <ListItemLink to='/payments' primary='Payments' onClick={() => setDrawerOpen(false)} />
                  {isAdmin && <ListItemLink to='/admin' primary='Admin Dashboard' onClick={() => setDrawerOpen(false)} />}
                </List>
              </Drawer>
            </>
            )
          : (
            <>
              <div
                style={{
                  display: 'flex',
                  flex: 1,
                  justifyContent: 'center',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', gap: theme.spacing(4) }}>
                  <Button component={RouterLink} to='/' sx={getLinkStyle('/')}>
                    Create a Button
                  </Button>
                  <Button component={RouterLink} to='/buttons' sx={getLinkStyle('/buttons')}>
                    Your Buttons
                  </Button>
                  <Button component={RouterLink} to='/actions' sx={getLinkStyle('/actions')}>
                    Actions
                  </Button>
                </div>
                <div style={{ position: 'absolute', right: 0 }}>
                  <Button
                    component={RouterLink}
                    to='/payments'
                    sx={
                    location.pathname === '/payments'
                      ? {
                          color: theme.palette.secondary.contrastText,
                          backgroundColor: theme.palette.secondary.main,
                          padding: theme.spacing(0.5, 1),
                          borderRadius: theme.shape.borderRadius,
                          '&:hover': {
                            backgroundColor: theme.palette.secondary.light
                          }
                        }
                      : {
                          color: theme.palette.secondary.contrastText,
                          backgroundColor: theme.palette.secondary.main,
                          padding: theme.spacing(0.5, 1),
                          borderRadius: theme.shape.borderRadius,
                          '&:hover': {
                            backgroundColor: theme.palette.secondary.light
                          }
                        }
                  }
                    startIcon={<AccountBalanceWallet />}
                  >
                    Payments
                  </Button>
                </div>
              </div>
              {isAdmin && (
                <Button component={RouterLink} to='/admin' sx={getLinkStyle('/admin')}>
                  Admin Dashboard
                </Button>
              )}
            </>
            )}
      </Toolbar>
    </AppBar>
  )
}

export default Navbar
