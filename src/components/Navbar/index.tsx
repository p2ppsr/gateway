/**
 * @file src/components/Navbar/index.tsx
 * @description Renders the main navigation bar for the Gateway application, providing responsive navigation links
 *              including 'Create a Button', 'Your Buttons', 'Actions', 'Payments', and an optional 'Admin Dashboard'
 *              for admins. Utilizes a drawer menu on mobile devices and adapts to light/dark themes.
 * @version 1.0.1
 * @author xAI (Grok 3)
 * @dependencies
 * - @mui/material: For UI components (AppBar, Button, etc.)
 * - @mui/icons-material: For Menu and AccountBalanceWallet icons
 * - react-router-dom: For navigation routing
 */
import React, { useState, useCallback } from 'react'
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

/**
 * Props interface for the ListItemLink component.
 * @interface ListItemLinkProps
 * @property {string} to - The route path for navigation.
 * @property {string} primary - The text displayed for the link.
 * @property {React.MouseEventHandler<HTMLAnchorElement>} onClick - Handler for click events on the link.
 */
interface ListItemLinkProps {
  to: string
  primary: string
  onClick: React.MouseEventHandler<HTMLAnchorElement>
}

/**
 * Renders a navigable list item as a link.
 * @param {ListItemLinkProps} props - The properties for the link component.
 * @returns {JSX.Element} A ListItem component styled as a navigable link.
 */
const ListItemLink = ({
  to,
  primary,
  onClick
}: ListItemLinkProps): JSX.Element => {
  return (
    <ListItem button component={RouterLink} to={to} onClick={onClick}>
      <ListItemText primary={primary} />
    </ListItem>
  )
}

/**
 * Navigation bar component for the Gateway frontend.
 * Displays the site logo and routes for creating buttons, viewing buttons, actions,
 * payments, and an optional admin dashboard. Adjusts layout based on mobile viewport
 * using a drawer menu and adapts to theme changes.
 * @component
 * @param {Object} props - The component props.
 * @param {boolean} props.isAdmin - Indicates if the user is an admin, enabling the Admin Dashboard link.
 * @returns {JSX.Element} The rendered Navbar component.
 */
const Navbar = ({ isAdmin }: { isAdmin: boolean }): JSX.Element => {
  const theme = useTheme() // Retrieves the current MUI theme
  const location = useLocation() // Gets the current route location
  const isMobile = useMediaQuery(theme.breakpoints.down('md')) // Detects mobile viewport
  const [drawerOpen, setDrawerOpen] = useState(false) // Manages drawer state

  /**
   * Toggles the drawer open/closed state with error handling.
   * @returns {void}
   */
  const handleDrawerToggle = useCallback((): void => {
    try {
      setDrawerOpen(prev => !prev) // ✅ Toggles drawer state
    } catch (error) {
      console.error(
        '❌ Failed to toggle drawer:',
        error instanceof Error ? error.message : 'Unknown error'
      )
      setDrawerOpen(false) // ✅ Fallback to closed state
    }
  }, [setDrawerOpen]) // Added setDrawerOpen to dependency array

  /**
   * Generates style object for navigation links based on the current route.
   * @param {string} path - The route path to compare with the current location.
   * @returns {object} Style object for the link based on active/inactive state.
   */
  const getLinkStyle = useCallback(
    (path: string): object => {
      try {
        return location.pathname === path
          ? {
              color: theme.palette.primary.light,
              fontWeight: 'bold'
            }
          : {
              color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
              '&:hover': { color: theme.palette.primary.light }
            }
      } catch (error) {
        console.error(
          '❌ Failed to generate link style:',
          error instanceof Error ? error.message : 'Unknown error'
        )
        return { color: '#000000' } // ✅ Fallback style
      }
    },
    [location.pathname, theme.palette.mode, theme.palette.primary.light]
  )

  const paymentsButtonStyle = {
    color: '#ffffff',
    backgroundColor: theme.palette.primary.main,
    padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
    borderRadius: theme.shape.borderRadius,
    '&:hover': {
      backgroundColor: theme.palette.primary.light
    }
  }

  return (
    <AppBar
      position="sticky"
      color="primary"
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
          <img
            src="/gateway-logo-dark.svg"
            height="50px"
            style={{ paddingRight: '0.5em' }}
            alt="Gateway Logo"
          />
          <Typography
            variant="h5"
            sx={{ fontWeight: 'bold', cursor: 'pointer' }}
          >
            Gateway
          </Typography>
        </div>
        {isMobile ? (
          <>
            <IconButton
              edge="start"
              color="inherit"
              aria-label="menu"
              onClick={handleDrawerToggle}
            >
              <MenuIcon />
            </IconButton>
            <Drawer
              anchor="left"
              open={drawerOpen}
              onClose={handleDrawerToggle}
            >
              <List>
                <ListItemLink
                  to="/"
                  primary="Create a Button"
                  onClick={handleDrawerToggle}
                />
                <ListItemLink
                  to="/buttons"
                  primary="Your Buttons"
                  onClick={handleDrawerToggle}
                />
                <ListItemLink
                  to="/actions"
                  primary="Actions"
                  onClick={handleDrawerToggle}
                />
                <ListItemLink
                  to="/payments"
                  primary="Payments"
                  onClick={handleDrawerToggle}
                />
                {isAdmin && (
                  <ListItemLink
                    to="/admin"
                    primary="Admin Dashboard"
                    onClick={handleDrawerToggle}
                  />
                )}
              </List>
            </Drawer>
          </>
        ) : (
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
                <Button component={RouterLink} to="/" sx={getLinkStyle('/')}>
                  Create a Button
                </Button>
                <Button
                  component={RouterLink}
                  to="/buttons"
                  sx={getLinkStyle('/buttons')}
                >
                  Your Buttons
                </Button>
                <Button
                  component={RouterLink}
                  to="/actions"
                  sx={getLinkStyle('/actions')}
                >
                  Actions
                </Button>
              </div>
              <div style={{ position: 'absolute', right: 0 }}>
                <Button
                  component={RouterLink}
                  to="/payments"
                  sx={paymentsButtonStyle}
                  startIcon={<AccountBalanceWallet />}
                >
                  Payments
                </Button>
              </div>
            </div>
            {isAdmin && (
              <Button
                component={RouterLink}
                to="/admin"
                sx={getLinkStyle('/admin')}
              >
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
