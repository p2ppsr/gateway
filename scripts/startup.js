#!/usr/bin/env node
/* Seedless, cross-platform startup for Gateway DB + migrations */
const { spawnSync } = require('child_process')
const { existsSync, readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

const argv = process.argv.slice(2)
const getArg = (name, short) => {
  const i = argv.findIndex(a => a === name || a === short)
  return i >= 0 ? argv[i + 1] : undefined
}
/** Support multiple flag aliases */
const getArgAny = (...names) => {
  for (const n of names) {
    const v = getArg(n)
    if (typeof v !== 'undefined') return v
  }
  return undefined
}

const PORT = parseInt(
  getArgAny('--port', '-p') || process.env.SQL_DATABASE_PORT || '3307',
  10
)
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) {
  console.error(`❌ Invalid port: ${PORT}`)
  process.exit(1)
}

/** Allow database name to be passed in via CLI */
const DB_NAME =
  getArgAny('--db', '-d', '--database') ||
  process.env.SQL_DATABASE_DB_NAME ||
  'gateway'
/** Basic safety: MySQL DB names typically allow letters, digits, underscore */
if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) {
  console.error(
    `❌ Invalid database name: "${DB_NAME}". Use letters, numbers, and underscore only.`
  )
  process.exit(1)
}

const DB_USER = process.env.SQL_DATABASE_USER || 'gateway'
const DB_PASS = process.env.SQL_DATABASE_PASSWORD || 'gateway123'
const HOST = '127.0.0.1'

const PROJECT = `gatewaydb-${PORT}`
const NETWORK = `${PROJECT}_default`
const VOLUME = `${PROJECT}_${PROJECT}_data`
const MYSQL_CTN = `${PROJECT}-mysql`

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts })
  if (res.error) throw res.error
  if (typeof res.status === 'number' && res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`)
  }
  return res
}

function dockerExists() {
  const r = spawnSync('docker', ['--version'], { stdio: 'ignore' })
  return r.status === 0
}
if (!dockerExists()) {
  console.error('❌ Docker is required but not found on PATH.')
  process.exit(1)
}

function containerExists(name) {
  const r = spawnSync('docker', ['ps', '-a', '--format', '{{.Names}}'], {
    encoding: 'utf8'
  })
  return (r.stdout || '')
    .split('\n')
    .map(s => s.trim())
    .includes(name)
}
function containerRunning(name) {
  const r = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8'
  })
  return (r.stdout || '')
    .split('\n')
    .map(s => s.trim())
    .includes(name)
}
function networkExists(name) {
  const r = spawnSync('docker', ['network', 'ls', '--format', '{{.Name}}'], {
    encoding: 'utf8'
  })
  return (r.stdout || '')
    .split('\n')
    .map(s => s.trim())
    .includes(name)
}
function ensureNetwork(name) {
  if (!networkExists(name)) {
    console.log(`==> Creating network ${name}...`)
    run('docker', ['network', 'create', name])
  }
}
function ensureContainer() {
  ensureNetwork(NETWORK)
  if (containerExists(MYSQL_CTN)) {
    if (!containerRunning(MYSQL_CTN)) {
      console.log(`==> Starting container ${MYSQL_CTN}...`)
      run('docker', ['start', MYSQL_CTN])
    } else {
      console.log(`==> Container ${MYSQL_CTN} already running.`)
    }
    return
  }
  console.log(`==> Running MySQL container ${MYSQL_CTN} on ${HOST}:${PORT}...`)
  // Bind to loopback only; use restart policy; allow MYSQL_ROOT_PASSWORD via env with a safe default
  run('docker', [
    'run',
    '-d',
    '--name',
    MYSQL_CTN,
    '--network',
    NETWORK,
    '--restart',
    'unless-stopped',
    '-p',
    `127.0.0.1:${PORT}:3306`,
    '-e',
    'MYSQL_DATABASE=' + DB_NAME,
    '-e',
    'MYSQL_USER=' + DB_USER,
    '-e',
    'MYSQL_PASSWORD=' + DB_PASS,
    '-e',
    'MYSQL_ROOT_PASSWORD=' +
      (process.env.MYSQL_ROOT_PASSWORD || 'changeMeNow123!'),
    '-v',
    `${VOLUME}:/var/lib/mysql`,
    'mysql:8.0'
  ])
}

function waitForMysql() {
  console.log('==> Waiting for MySQL to respond...')
  const max = 60 // ~60 * 1s = 60s
  for (let i = 0; i < max; i++) {
    const ping = spawnSync(
      'docker',
      [
        'exec',
        MYSQL_CTN,
        'mysqladmin',
        'ping',
        '-h',
        '127.0.0.1',
        '-u',
        'root',
        '-proot'
      ],
      { stdio: 'ignore' }
    )
    if (ping.status === 0) {
      console.log('   MySQL is up.')
      return
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)
  }
  throw new Error('MySQL did not become ready in time.')
}

function ensureDbAndUser() {
  console.log('==> Ensuring DB/user/grants...')
  const sql =
    `CREATE DATABASE IF NOT EXISTS \\\`${DB_NAME}\\\`;` +
    `CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASS}';` +
    `GRANT ALL PRIVILEGES ON \\\`${DB_NAME}\\\`.* TO '${DB_USER}'@'%';` +
    'FLUSH PRIVILEGES;'
  run('docker', [
    'exec',
    MYSQL_CTN,
    'sh',
    '-lc',
    `mysql -uroot -proot -e "${sql}"`
  ])
}

function upsertEnv() {
  console.log('==> Updating .env ...')
  const envPath = join(process.cwd(), '.env')
  let lines = []
  if (existsSync(envPath)) {
    lines = readFileSync(envPath, 'utf8').split(/\r?\n/)
  }
  const setKV = (k, v) => {
    const idx = lines.findIndex(l => l.startsWith(k + '='))
    if (idx >= 0) lines[idx] = `${k}=${v}`
    else lines.push(`${k}=${v}`)
  }
  setKV('SQL_DATABASE_HOST', HOST)
  setKV('SQL_DATABASE_PORT', String(PORT))
  setKV('SQL_DATABASE_USER', DB_USER)
  setKV('SQL_DATABASE_PASSWORD', DB_PASS)
  setKV('SQL_DATABASE_DB_NAME', DB_NAME)
  writeFileSync(envPath, lines.filter(Boolean).join('\n') + '\n', 'utf8')
}

function ensureDeps() {
  console.log('==> Installing Node deps (CI if lock present)...')
  const hasLock = existsSync(join(process.cwd(), 'package-lock.json'))
  if (hasLock) {
    const r = spawnSync('npm', ['ci'], { stdio: 'inherit' })
    if (r.status === 0) return
  }
  run('npm', ['install'])
}

function migrateOnly() {
  console.log('==> Running migrations (seedless) ...')
  // robust TS knex invocation (works on Windows/macOS/Linux)
  const env = { ...process.env, TS_NODE_TRANSPILE_ONLY: '1' }
  const nodeBin = process.execPath
  const args = [
    '-r',
    'ts-node/register',
    './node_modules/knex/bin/cli.js',
    '--knexfile',
    'knexfile.ts',
    'migrate:latest'
  ]
  const r = spawnSync(nodeBin, args, { stdio: 'inherit', env })
  if (r.status !== 0) throw new Error('Knex migrations failed')
}

;(function printBanner() {
  const usage = [
    '',
    'Usage:',
    '  node scripts/startup.js [--port <port>] [--db <database>]',
    '',
    'Examples:',
    '  node scripts/startup.js --port 3310 --db gateway_dev',
    '  node scripts/startup.js -p 3307 -d gateway',
    ''
  ].join('\n')
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage)
    process.exit(0)
  }
})()

;(async function main() {
  try {
    console.log(
      `==> Project: ${PROJECT}  DB: ${DB_NAME}  User: ${DB_USER}  Port: ${PORT}`
    )
    ensureContainer()
    waitForMysql()
    ensureDbAndUser()
    upsertEnv()
    ensureDeps()
    migrateOnly() // 🚫 no seeds
    console.log(
      `✅ Done. MySQL is on ${HOST}:${PORT}. DB '${DB_NAME}' is migrated and ready.`
    )
    console.log('   Start your app:  npm run dev   (or)   npm run start')
  } catch (err) {
    console.error('❌ Startup failed:', err && err.message ? err.message : err)
    process.exit(1)
  }
})()
