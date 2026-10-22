import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const manifestPath = 'lib/build-manifest.json'
const fixedInputs = [
  'package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'cordis.patch.yml', 'assets/icon.svg',
  'scripts/build.mjs', 'scripts/client-contract.mjs', 'scripts/check-artifact.mjs',
  'scripts/distribution-manifest.mjs', 'scripts/check-distribution.mjs',
]

async function filesUnder(root, directory) {
  const files = []
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue
    const relative = `${directory}/${entry.name}`
    if (entry.isDirectory()) files.push(...await filesUnder(root, relative))
    else if (entry.isFile()) files.push(relative)
    else throw new Error(`Unexpected non-file in distribution inputs: ${relative}`)
  }
  return files.sort()
}

async function hashes(root, files) {
  const result = {}
  for (const file of [...files].sort()) {
    result[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')
  }
  return result
}

async function currentManifest(root) {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  const inputs = await hashes(root, [...fixedInputs, ...await filesUnder(root, 'src'), ...await filesUnder(root, 'locale')])
  const artifacts = await hashes(root, (await filesUnder(root, 'lib')).filter(file => file !== manifestPath))
  return { format: 1, name: manifest.name, version: manifest.version, inputs, artifacts }
}

export async function writeDistributionManifest(root) {
  await writeFile(path.join(root, manifestPath), JSON.stringify(await currentManifest(root), null, 2) + '\n')
}

export async function verifyDistributionManifest(root) {
  const saved = JSON.parse(await readFile(path.join(root, manifestPath), 'utf8'))
  assert.deepEqual(saved, await currentManifest(root), 'Compiled files are stale or modified. Run pnpm release:prepare and include lib/ in the commit.')
  return saved
}
