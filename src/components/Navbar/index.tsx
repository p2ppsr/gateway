import React from 'react'
import { makeStyles } from '@mui/styles'
import { Typography } from '@mui/material'
import style from './style'
import { Link } from 'react-router-dom'

const useStyles = makeStyles(style, { name: 'Navbar' })

const Navbar = ({ isAdmin }: { isAdmin: boolean }) => {
    const classes = useStyles()
    return (
        <div className={classes.navbar}>
            <Typography variant='h3'>Gateway</Typography>
            <div className={classes.nav_links}>
                <Link to='/'>+ Create Button</Link>
                <Link to='/payments'>My Payments</Link>
                <Link to='/buttons'>My Buttons</Link>
                <Link to='/actions'>My Payment Actions</Link>
                <Link to='/money'>My Money</Link>
                {isAdmin && <Link to='/admin'>Admin Dashboard</Link>}
            </div>
        </div>
    )
}

export default Navbar