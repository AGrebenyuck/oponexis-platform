import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parse } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const mode = process.argv[2]
if (!['development', 'production'].includes(mode)) {
	throw new Error('Choose a database target: development or production.')
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const localEnv = parse(readFileSync(resolve(projectRoot, '.env'), 'utf8'))
const databaseUrl = mode === 'production' ? localEnv.PROD_DATABASE_URL : localEnv.DATABASE_URL

if (!databaseUrl) {
	throw new Error(mode === 'production'
		? 'PROD_DATABASE_URL is missing from .env.'
		: 'DATABASE_URL is missing from .env.')
}

const database = new URL(databaseUrl)
if (mode === 'production') {
	const developmentUrl = localEnv.DATABASE_URL && new URL(localEnv.DATABASE_URL)
	if (developmentUrl && database.hostname === developmentUrl.hostname && database.pathname === developmentUrl.pathname) {
		throw new Error('Production and development database targets point to the same database.')
	}
}

const nextBin = resolve(projectRoot, 'node_modules/next/dist/bin/next')
const extraArgs = process.argv.slice(3)
const hasPort = extraArgs.some(argument => argument === '--port' || argument === '-p')
const args = ['dev', '--webpack', '--hostname', '0.0.0.0']
if (!hasPort) args.push('--port', '3001')
args.push(...extraArgs)

console.log(`Starting local Next.js with the ${mode} database.`)
const server = spawn(process.execPath, [nextBin, ...args], {
	cwd: projectRoot,
	env: {
		...process.env,
		DATABASE_URL: databaseUrl,
		OPONEXIS_DB_TARGET: mode,
	},
	stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => server.kill(signal))
}
server.on('exit', (code, signal) => {
	process.exitCode = code ?? (signal ? 1 : 0)
})
