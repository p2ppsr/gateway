export default (theme) => ({
    content_wrap: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridGap: '1em',
        maxWidth: theme.maxContentWidth,
        boxShadow: theme.shadows[1],
        ...theme.templates.page_wrap
    },
    preview_wrap: {
        margin: theme.spacing(2)
    },
    code_preview: {
        fontFamily: 'monospace',
        color: theme.palette.white,
        backgroundColor: theme.palette.black
    }
})
