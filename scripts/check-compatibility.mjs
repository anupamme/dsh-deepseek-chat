import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import semver from 'semver'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
// DSH app-boot 0.2.1-rc.3 uses includePrerelease:true. In particular, a bare
// <0.2.2 comparator admits 0.2.2-rc.*; <0.2.2-0 closes that prerelease boundary.
const ranges = [pkg.engines.dsh, ...Object.entries(pkg.peerDependencies)
  .filter(([name]) => name.startsWith('@deepseek-ai/dsh-')).map(([, range]) => range)]
assert.equal(ranges.length, 4)
assert(ranges.every(range => range === ranges[0]), 'Host engine and DSH peers must agree')
const cases = [
  ['0.2.0-rc.2', true], ['0.2.0-rc.3', false], ['0.2.0', false],
  ['0.2.1-beta.1', false], ['0.2.1-rc.0', false], ['0.2.1-rc.1', true],
  ['0.2.1-rc.2', true], ['0.2.1-rc.3', true], ['0.2.1-rc.4', true], ['0.2.1-rc.99', true], ['0.2.1', true],
  ['0.2.2-0', false], ['0.2.2-beta.1', false], ['0.2.2-rc.1', false], ['0.2.2', false],
  ['0.2.3', false], ['0.3.0-rc.1', false], ['1.0.0', false],
]
for (const range of ranges) {
  assert(semver.validRange(range), `Invalid range: ${range}`)
  for (const [version, expected] of cases) {
    assert.equal(semver.satisfies(version, range, { includePrerelease: true }), expected, `${version} against ${range}`)
  }
}
for (const [name, version] of Object.entries(pkg.devDependencies)) if (name.startsWith('@deepseek-ai/dsh-')) {
  assert(semver.satisfies(version, pkg.engines.dsh, { includePrerelease: true }), `Development SDK outside supported range: ${name}@${version}`)
}
assert(!semver.satisfies('0.2.1-rc.3', '0.2.0-rc.2 || 0.2.1-rc.1 || 0.2.1-rc.2', { includePrerelease: true }), 'Historical rc.3 rejection must remain reproducible')
console.log(`Compatibility passed: ${cases.length} versions × ${ranges.length} aligned ranges; rc.3 SDK allowed, unknown 0.2.2 prereleases excluded.`)
