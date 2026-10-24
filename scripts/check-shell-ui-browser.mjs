import { build } from 'esbuild'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundle = async entry => (await build({ absWorkingDir: root, entryPoints: [entry], bundle: true,
  write: false, format: 'esm', platform: 'browser', target: 'chrome130' })).outputFiles[0].text
const files = {
  '/': ['text/html; charset=utf-8', await readFile(path.join(root, 'tests/browser/shell-ui.fixture.html'))],
  '/fixture.js': ['text/javascript; charset=utf-8', await readFile(path.join(root, 'tests/browser/shell-ui.fixture.js'))],
  '/icon.js': ['text/javascript; charset=utf-8', await bundle('src/settings-icon.ts')],
  '/styles.js': ['text/javascript; charset=utf-8', await bundle('src/styles.ts')],
}
const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/results') {
    let body = ''
    for await (const chunk of req) { body += chunk; if (body.length > 20_000) { res.writeHead(413).end(); return } }
    try {
      const results = JSON.parse(body)
      const passed = Array.isArray(results) && results.length === 34
        && results.every(result => typeof result.name === 'string' && result.passed === true)
      console.log(JSON.stringify({ passed, actualCases: results.length, results }, null, 2))
      res.writeHead(200).end('ok')
      server.close(() => { process.exitCode = passed ? 0 : 1 })
    } catch { res.writeHead(400).end() }
    return
  }
  const file = req.method === 'GET' && files[req.url]
  if (!file) { res.writeHead(404).end(); return }
  res.writeHead(200, { 'Content-Type': file[0], 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src data:" }).end(file[1])
})
server.listen(0, '127.0.0.1', () => console.log(`Shell UI regression fixture (no DSH/website/account): http://127.0.0.1:${server.address().port}/`))
process.on('SIGINT', () => server.close())
