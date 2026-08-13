import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const outDir = resolve(root, 'dist')
const version = process.env.RELEASE_VERSION ?? `dev-${new Date().toISOString().replaceAll(/[-:.]/g, '').replace('Z', 'Z')}`
const archive = resolve(outDir, `dsh-tool-android-aarch64-${version}.zip`)

mkdirSync(outDir, { recursive: true })
rmSync(archive, { force: true })
execFileSync('zip', [
  '-q', '-r', '-y', archive, '.',
  '-x', '.git/*', 'dist/*', 'node_modules/.cache/*', '*.tsbuildinfo',
], { cwd: root, stdio: 'inherit' })

console.log(basename(archive))

