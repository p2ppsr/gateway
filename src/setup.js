/**
 * API Environment Setup Script
 */
const readline = require('readline')
const fs = require('fs')
const mysql = require('mysql2')
const promisify = require('util').promisify

const collectInformation = async () => {
    // create a new readline query stream
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    // promisify the readline callback
    rl.question[promisify.custom] = (query) => {
        return new Promise((resolve) => {
            rl.question(query, resolve)
        })
    }
    let question = promisify(rl.question)

    // get the hostname
    let dbHostname = await question(
        '\nSQL database hostname (ENTER for 127.0.0.1): ',
    )
    dbHostname = dbHostname || '127.0.0.1'

    // get the DB port
    let dbPort = await question(
        'SQL database port (normally 3306) (ENTER for 3306): '
    )
    dbPort = dbPort || '3306'

    // get the username
    let dbUser = await question('SQL user name (ENTER for gateway): ')
    dbUser = dbUser || 'gateway'

    // get the password
    let dbPass = await question('SQL user password (ENTER for gateway123): ')
    dbPass = dbPass || 'gateway123'

    // get the database name
    let db = await question('SQL database name (ENTER for gateway): ')
    db = db || 'gateway'

    // grab the port to host the API on
    let httpPort = await question('Web server port (ENTER for 3001): ')
    httpPort = httpPort || '3001'

    // grab the domain to host the API on
    let domain = await question('Web server hosting domain including http(s):// (ENTER for http://localhost:3000, which is what you want for frontend compatibility in development): ')
    domain = domain || 'http://localhost:3000'

    // determine whether to start nginx
    let spawnNginx = await question('Start the local NGINX server process after the payment server starts listening? (generally only useful in production) [yes/no]: ')
    spawnNginx = spawnNginx || 'no'

    // determine the BSV net
    let bsvNet = await question('Select the BSV network on which this server will run. (ENTER for mainnet) [mainnet/testnet]: ')
    bsvNet = bsvNet || 'mainnet'

    // close the readline stream
    rl.close()
    testDatabaseConnection(dbHostname, dbPort, dbUser, dbPass, db, httpPort, domain, spawnNginx, bsvNet)
}

const testDatabaseConnection = async (
    host,
    port,
    user,
    pass,
    db,
    listen,
    domain,
    spawnNginx,
    bsvNet
) => {
    console.log('\nTesting MySQL credentials...')
    const conn = mysql.createConnection({
        host: host,
        port: port,
        user: user,
        password: pass,
        database: db,
        multipleStatements: true,
    })
    conn.connect((err) => {
        if (err) {
            console.log('Error connecting to database! The error was:')
            console.log(err)
            console.log('Check your credentials and try again.')
            console.log('For help setting up a MySQL database, please see here:')
            console.log('https://dev.mysql.com/doc/refman/8.0/en/installing.html')
            collectInformation()
            return
        }

        console.log('Your MySQL credentials look good!')
        console.log('\nSaving your new configuration...')
        fs.writeFile(
            './.env',
            'HTTP_PORT=' + listen + '\n' +
            'BSV_NETWORK=' + bsvNet + '\n' +
            'SERVER_PRIVATE_KEY=' + require('crypto').randomBytes(32).toString('hex') + '\n' +
            'HOSTING_DOMAIN=' + domain + '\n' +
            'SQL_DATABASE_HOST=' + host + '\n' +
            'SQL_DATABASE_PORT=' + port + '\n' +
            'SQL_DATABASE_USER=' + user + '\n' +
            'SQL_DATABASE_PASSWORD=' + pass + '\n' +
            'SQL_DATABASE_DB_NAME=' + db + '\n' +
            'SPAWN_NGINX=' + spawnNginx + '\n',
            (err) => {
                if (err) {
                    console.log('Could not save configuration to .env')
                    throw err
                } else {
                    console.log('New API configuration saved to .env')
                    conn.end()
                    setupDatabase()
                }
            },
        )
    })
}

const setupDatabase = async () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    // promisify the readline callback
    rl.question[promisify.custom] = (query) => {
        return new Promise((resolve) => {
            rl.question(query, resolve)
        })
    }
    let question = promisify(rl.question)

    console.log('Migrating your database...')
    const knex = require('knex')(require('../knexfile.js'))
    await knex.migrate.latest()

    console.log(`
Seeding a new test database will erase all data, including users, transactions
and payment buttons, from the database server you just entered. This action cannot
be undone.

If you are a developer or if this is a new deployment of the database, answer
YES and your new database will be set up automatically.

If you are running a production server or if you already have a working
database you want to keep, answer NO.
`
    )

    let setup = await question(
        'ERASE and re-seed the database for development? [Y/N]: '
    )

    if (setup === 'N' || setup === 'n' || setup === 'no' || setup === 'NO') {
        rl.close()
        console.log('Thank you for helping build Gateway.')
    } else if (
        setup === 'Y' ||
        setup === 'y' ||
        setup === 'yes' ||
        setup === 'YES'
    ) {
        console.log('Seeding a new database...')
        await knex.seed.run()
        console.log('Your new database has been successfully created!')
        console.log('Thank you for helping build Gateway.')
        rl.close()
    } else {
        console.log('Please answer with either "Y" or "N"')
        rl.close()
        setupDatabase()
    }
    process.exit(0)
}

// print some informational text
console.log(
    `The Gateway API server uses a MySQL database to store and manage user
buttons, payments and other data. To set up the API server (required for both
development and production deployments), follow these steps prior to continuing:

1). Install the MySQL Server onto the machine you will use for this deployment
2). Secure the database, taking care to change the root password
3). Log into the server and create a new database for the deployment
4). Create a new user (DO NOT just use "root"), with read and write permissions
    on the new database
5). Set a secure password for the new user and take any other steps needed to
    ensure the database is secure if it is being used in production
6). When this is complete, enter the information into the prompts on this screen

NOTE: Completing this setup wizard will not automatically wipe the database.
You will be asked if you wish to wipe the database or not after the database
connection is tested. This means that you are free to run this setup wizard
without losing data.`
)
collectInformation()
