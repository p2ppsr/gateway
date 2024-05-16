import React, { useState } from 'react'
import { makeStyles } from '@mui/styles'
import { Typography, AppBar, Toolbar, Button, IconButton, Drawer, List, ListItem, ListItemText } from '@mui/material'
import { Menu as MenuIcon, AccountBalanceWallet } from '@mui/icons-material'
import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import style from './style'

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
      <ListItem button component={Link} to='/' onClick={() => setDrawerOpen(false)}>
        <ListItemText primary="Home" />
      </ListItem>
      <ListItem button component={Link} to='/create' onClick={() => setDrawerOpen(false)}>
        <ListItemText primary="Create a Button" />
      </ListItem>
      <ListItem button component={Link} to='/buttons' onClick={() => setDrawerOpen(false)}>
        <ListItemText primary="Your Buttons" />
      </ListItem>
      <ListItem button component={Link} to='/actions' onClick={() => setDrawerOpen(false)}>
        <ListItemText primary="Payment Actions" />
      </ListItem>
      <ListItem button component={Link} to='/payments' onClick={() => setDrawerOpen(false)}>
        <ListItemText primary="Payments" />
      </ListItem>
      {isAdmin && (
        <ListItem button component={Link} to='/admin' onClick={() => setDrawerOpen(false)}>
          <ListItemText primary="Admin Dashboard" />
        </ListItem>
      )}
    </List>
  )

  return (
    <AppBar position="sticky" color="primary" className={classes.navbar}>
      <Toolbar className={classes.toolbar}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src='/gatewaycash.svg' height='50px' style={{ paddingRight: '0.5em' }} />
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
                  component={Link}
                  to='/'
                  className={location.pathname === '/' ? classes.activeLink : classes.link}
                >
                  Home
                </Button>
                <Button
                  component={Link}
                  to='/create'
                  className={location.pathname === '/create' ? classes.activeLink : classes.link}
                >
                  Create a Button
                </Button>
                <Button
                  component={Link}
                  to='/buttons'
                  className={location.pathname === '/buttons' ? classes.activeLink : classes.link}
                >
                  Your Buttons
                </Button>
                <Button
                  component={Link}
                  to='/actions'
                  className={location.pathname === '/actions' ? classes.activeLink : classes.link}
                >
                  Payment Actions
                </Button>
              </div>
              <div className={classes.moneyLinkWrapper}>
                <Button
                  component={Link}
                  to='/payments'
                  className={location.pathname === '/payments' ? classes.activeLink : classes.moneyLink}
                  startIcon={<AccountBalanceWallet />}
                >
                  Payments
                </Button>
              </div>
            </div>
            {isAdmin && (
              <Button
                component={Link}
                to='/admin'
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
