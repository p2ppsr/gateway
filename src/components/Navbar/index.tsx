import React, { useState } from 'react'
import { makeStyles } from '@mui/styles'
import { Typography, AppBar, Toolbar, Button, IconButton, Drawer, List, ListItem, ListItemText } from '@mui/material'
import { Menu as MenuIcon, AccountBalanceWallet } from '@mui/icons-material'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useTheme } from '@mui/material/styles'
import { ClassNameMap } from '@mui/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import style from './style'
// 👇 Helper to resolve TS conflict when using ListItem + RouterLink + button
const ListItemLink = (props: { to: string; primary: string; onClick: () => void }) => {
  const { to, primary, onClick } = props
  return (
    <ListItem button component={RouterLink as any} to={to} onClick={onClick}>
      <ListItemText primary={primary} />
    </ListItem>
  )
}
const useStyles = makeStyles(style, { name: 'Navbar' })

const Navbar = ({ isAdmin }: { isAdmin: boolean }) => {
  const classes = useStyles()
  const location = useLocation()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen)
  }

  const drawer = (
    <List>
      <ListItemLink to="/" primary="Create a Button" onClick={() => setDrawerOpen(false)} />
      <ListItemLink to="/buttons" primary="Your Buttons" onClick={() => setDrawerOpen(false)} />
      <ListItemLink to="/actions" primary="Actions" onClick={() => setDrawerOpen(false)} />
      <ListItemLink to="/payments" primary="Payments" onClick={() => setDrawerOpen(false)} />
      {isAdmin && <ListItemLink to="/admin" primary="Admin Dashboard" onClick={() => setDrawerOpen(false)} />}
    </List>
  )

  return (
    <AppBar position="sticky" color="primary" className={classes.navbar}>
      <Toolbar className={classes.toolbar}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src="/gatewaycash.svg" height="50px" style={{ paddingRight: '0.5em' }} />
          <Typography variant="h5" className={classes.logo}>
            Gateway
          </Typography>
        </div>
        {isMobile ? (
          <>
            <IconButton edge="start" color="inherit" aria-label="menu" onClick={handleDrawerToggle}>
              <MenuIcon />
            </IconButton>
            <Drawer anchor="left" open={drawerOpen} onClose={handleDrawerToggle}>
              {drawer}
            </Drawer>
          </>
        ) : (
          <>
            <div className={classes.navLinksWrapper}>
              <div className={classes.navLinks}>
                <Button
                  component={RouterLink}
                  to="/"
                  className={location.pathname === '/' ? classes.activeLink : classes.link}
                >
                  Create a Button
                </Button>
                <Button
                  component={RouterLink}
                  to="/buttons"
                  className={location.pathname === '/buttons' ? classes.activeLink : classes.link}
                >
                  Your Buttons
                </Button>
                <Button
                  component={RouterLink}
                  to="/actions"
                  className={location.pathname === '/actions' ? classes.activeLink : classes.link}
                >
                  Actions
                </Button>
              </div>
              <div className={classes.moneyLinkWrapper}>
                <Button
                  component={RouterLink}
                  to="/payments"
                  className={location.pathname === '/payments' ? classes.activeLink : classes.moneyLink}
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
                className={location.pathname === '/admin' ? classes.activeLink : classes.link}
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
