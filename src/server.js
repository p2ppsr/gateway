require('dotenv').config()
const express = require('express')
const bodyparser = require('body-parser')
const prettyjson = require('prettyjson')
const routes = require('./routes')
const authrite = require('authrite-express')
const { SERVER_PRIVATE_KEY, SPAWN_NGINX } = process.env
const path = require('path')

const HTTP_PORT = process.env.HTTP_PORT || 3001
const ROUTING_PREFIX = process.env.ROUTING_PREFIX || '/api'
const HOSTING_DOMAIN = process.env.HOSTING_DOMAIN || 'http://localhost:3001'

const spawn = require('child_process').spawn

const app = express()
app.use(bodyparser.json({ limit: '1gb', type: 'application/json' }))
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', '*')
    res.header('Access-Control-Allow-Methods', '*')
    res.header('Access-Control-Expose-Headers', '*')
    res.header('Access-Control-Allow-Private-Network', 'true')
    if (req.method === 'OPTIONS') {
        res.sendStatus(200)
    } else {
        next()
    }
})
app.use((req, res, next) => {
    console.log('[' + req.method + '] <- ' + req._parsedUrl.pathname)
    const logObject = { ...req.body }
    console.log(prettyjson.render(logObject, { keysColor: 'blue' }))
    res.nologJson = res.json
    res.json = json => {
        res.nologJson(json)
        if (json.secret) json.secret = '********'
        if (json.oldsecret) json.oldsecret = '********'
        if (json.newsecret) json.newsecret = '********'
        console.log('[' + req.method + '] -> ' + req._parsedUrl.pathname)
        console.log(prettyjson.render(json, { keysColor: 'green' }))
    }
    next()
})

// Serve static files
app.use(express.static('build'))

// Redirect all non-API requests to React app's index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'))
})
app.get('/buttons', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'))
})
app.get('/payments', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'))
})
app.get('/actions', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'))
})
app.get('/money', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'))
})
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'))
})

// API Routes
const authriteMid = authrite.middleware({
    serverPrivateKey: SERVER_PRIVATE_KEY,
    baseUrl: HOSTING_DOMAIN
})
app.use(authriteMid)
const apiRouter = express.Router()
routes.forEach((route) => {
    apiRouter[route.type](route.path, route.func)
})
app.use(ROUTING_PREFIX, apiRouter)

app.listen(HTTP_PORT, async () => {
    console.log('Gateway Payment Server listening on port', HTTP_PORT)
    if (SPAWN_NGINX === 'yes') {
        spawn('nginx', [], { stdio: [process.stdin, process.stdout, process.stderr] })
    }
})