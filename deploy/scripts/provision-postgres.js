const path = require('node:path')

const backendRoot = process.argv[2]
if (!backendRoot) throw new Error('Indica la ruta del backend como primer argumento.')

require(path.join(backendRoot, 'node_modules', 'dotenv')).config({
  path: path.join(backendRoot, '.env'),
  quiet: true,
})

const databaseUrl = new URL(process.env.DATABASE_URL)
const username = decodeURIComponent(databaseUrl.username)
const password = decodeURIComponent(databaseUrl.password)
const database = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ''))

if (!username || !password || !database) {
  throw new Error('DATABASE_URL debe incluir usuario, contraseña y base de datos.')
}

const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`
const quoteLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`

const role = quoteIdentifier(username)
const roleName = quoteLiteral(username)
const rolePassword = quoteLiteral(password)
const databaseName = quoteLiteral(database)

process.stdout.write(`
DO $provision$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${roleName}) THEN
    ALTER ROLE ${role} WITH LOGIN PASSWORD ${rolePassword};
  ELSE
    CREATE ROLE ${role} WITH LOGIN PASSWORD ${rolePassword};
  END IF;
END
$provision$;

SELECT format('CREATE DATABASE %I OWNER %I', ${databaseName}, ${roleName})
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${databaseName})
\\gexec
`)
