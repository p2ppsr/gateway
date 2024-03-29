export default (theme) => ({
    navbar: {
        position: 'sticky',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        boxShadow: theme.shadows[3],
        padding: theme.spacing(2),
        marginBottom: theme.spacing(1)
    },
    nav_links: {
        display: 'grid',
        justifySelf: 'right',
        alignItems: 'center',
        gridTemplateColumns: 'repeat(5, auto)',
        gridGap: '1em'
    }
})
