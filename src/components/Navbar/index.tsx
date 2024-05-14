import React from 'react';
import { makeStyles } from '@mui/styles';
import { Typography, AppBar, Toolbar, Button } from '@mui/material';
import { AccountBalanceWallet } from '@mui/icons-material';
import style from './style';
import { Link, useLocation } from 'react-router-dom';

const useStyles = makeStyles(style, { name: 'Navbar' });

const Navbar = ({ isAdmin }: { isAdmin: boolean }) => {
  const classes = useStyles();
  const location = useLocation();

  return (
    <AppBar position="sticky" color="primary" className={classes.navbar}>
      <Toolbar className={classes.toolbar}>
        <Typography variant="h5" className={classes.logo}>
          Gateway
        </Typography>
        <div className={classes.navLinks}>
          <Button
            component={Link}
            to='/'
            className={location.pathname === '/' ? classes.activeLink : classes.link}
          >
            Create a Button
          </Button>
          <Button
            component={Link}
            to='/payments'
            className={location.pathname === '/payments' ? classes.activeLink : classes.link}
          >
            Payments
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
          <Button
            component={Link}
            to='/money'
            className={location.pathname === '/money' ? classes.activeLink : classes.moneyLink}
            startIcon={<AccountBalanceWallet />}
          >
            My Money
          </Button>
          {isAdmin && (
            <Button
              component={Link}
              to='/admin'
              className={location.pathname === '/admin' ? classes.activeLink : classes.link}
            >
              Admin Dashboard
            </Button>
          )}
        </div>
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;
