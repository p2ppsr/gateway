require('dotenv').config()
const express = require('express')
const bodyparser = require('body-parser')
const prettyjson = require('prettyjson')
const routesModule = require('./routes')
const routes = routesModule.default ?? routesModule // works for CJS + ESM
const authrite = require('authrite-express')
const { SERVER_PRIVATE_KEY, SPAWN_NGINX } = process.env
const path = require('path')
const knex = require('knex')(require('../knexfile.js'))

const HTTP_PORT = process.env.HTTP_PORT || 3001
const ROUTING_PREFIX = process.env.ROUTING_PREFIX || '/api'
const HOSTING_DOMAIN = process.env.HOSTING_DOMAIN || 'http://localhost:3001'

const { spawn } = require('child_process')

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
  console.log(`[${req.method}] <- ${req._parsedUrl.pathname}`)
  console.log('Incoming body:')
  console.log(prettyjson.render({ ...req.body }, { keysColor: 'blue' }))
  res.nologJson = res.json
  res.json = json => {
    res.nologJson(json)
    if (json && typeof json === 'object') {
      const scrubbed = JSON.parse(JSON.stringify(json))
      ;['secret', 'oldsecret', 'newsecret'].forEach(k => {
        if (scrubbed[k]) scrubbed[k] = '********'
      })
      console.log(`[${req.method}] -> ${req._parsedUrl.pathname}`)
      console.log(prettyjson.render(scrubbed, { keysColor: 'green' }))
    }
  }
  next()
})

// Serve static files for production build
app.use(express.static('build'))

// Fallback routes for SPA URLs
const spaPaths = ['/', '/buttons', '/payments', '/actions', '/money', '/admin']
spaPaths.forEach(p =>
  app.get(p, (_, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'))
  })
)

// Catch-all fallback for other SPA routes
app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, '../build', 'index.html'))
})


// Auth middleware
const authriteMid = authrite.middleware({
  serverPrivateKey: SERVER_PRIVATE_KEY,
  baseUrl: HOSTING_DOMAIN
})
app.use(authriteMid)

// API Router
const apiRouter = express.Router()

routes.forEach(raw => {
  const route = raw && raw.default ? raw.default : raw // unwrap TS default export
  console.log('Registering route:', route.type, route.path)
  const method = String(route.type || 'get').toLowerCase()
  if (typeof apiRouter[method] !== 'function') {
    console.warn(
      `Unknown HTTP verb "${route.type}" for ${route.path}; skipping.`
    )
    return
  }
  const handler = route.func || route.handler
  if (!handler || typeof route.path !== 'string') {
    console.warn('Invalid route object, skipping:', route)
    return
  }
  apiRouter[method](route.path, handler)
})

app.use(ROUTING_PREFIX, apiRouter)

app.listen(HTTP_PORT, async () => {
  console.log('Gateway Payment Server listening on port', HTTP_PORT)
  if (SPAWN_NGINX === 'yes') {
    spawn('nginx', [], { stdio: [process.stdin, process.stdout, process.stderr] })
    await knex.migrate.latest()
  }
})
