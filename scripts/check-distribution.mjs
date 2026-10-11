import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkArtifact } from './check-artifact.mjs'
import { verifyDistributionManifest } from './distribution-manifest.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
// npm and pnpm may rebuild Git packages with these scripts. Distribution is
// deliberately prebuilt; only explicitly named developer commands build it.
for (const hook of ['build', 'prepare', 'prepack', 'postpack', 'prepublish', 'prepublishOnly', 'publish', 'preinstall', 'install', 'postinstall']) {
  assert(!manifest.scripts?.[hook], `Git distribution must not contain the ${hook} script`)
}
assert(!manifest.workspaces, 'Git distribution must not require a workspace build')
assert.deepEqual([...manifest.files].sort(), ['README.md', 'assets/icon.svg', 'cordis.patch.yml', 'lib'])
await checkArtifact(root)
const release = await verifyDistributionManifest(root)
console.log(`Prebuilt distribution passed: ${release.name}@${release.version}; ${Object.keys(release.artifacts).length} compiled files match source inputs.`)
