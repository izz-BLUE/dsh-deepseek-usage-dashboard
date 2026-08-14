/**
 * Hard requirements guards:
 * - The plugin must never call any LLM interface (capture, refresh, display,
 *   and balance queries perform no model calls; idle and page refreshes cost
 *   0 tokens).
 * - The API key must never be written into logs.
 *
 * These are enforced by construction (the balance call is a direct Host
 * fetch to the fixed endpoint), and this spec scans the source tree so a
 * future change that introduces an LLM call or key logging fails CI.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Every TypeScript source file of the package. */
function sourceFiles(): string[] {
  const root = join(__dirname, '..', 'src')
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(path)
    }
  }
  walk(root)
  return files
}

describe('no LLM interface is ever invoked', () => {
  const sources = sourceFiles()

  it('never references the LLM runtime or its waterfall', () => {
    for (const file of sources) {
      const content = readFileSync(file, 'utf8')
      expect(content, file).not.toMatch(/ctx\.llm\b/)
      expect(content, file).not.toMatch(/llm\/stream/)
      expect(content, file).not.toMatch(/generateStream|\.stream\(/)
    }
  })

  it('performs network calls only through the fixed balance endpoint (host) and the stats routes (client)', () => {
    for (const file of sources) {
      const content = readFileSync(file, 'utf8')
      const relative = file.replace(/\\/g, '/').split('/').slice(-2).join('/')
      // Only real `fetch(` CALL sites count — not method declarations
      // (`async fetch(): Promise<...>`) nor calls to the store's OWN method
      // (`this.fetch()`).
      const withoutDeclarations = content.replace(/async fetch\([^)]*\)\s*:\s*Promise<[^>]+>/g, '')
      const fetchCalls = withoutDeclarations.match(/(?<![A-Za-z0-9_.])fetch\(/g) ?? []
      if (relative === 'core/balance.ts') {
        // The single Host network call site — the balance endpoint only.
        expect(content, file).toContain('BALANCE_URL')
        expect(content, file).not.toMatch(/fetch\(['"`]/)
      } else if (relative === 'client/api.ts') {
        // The browser half fetches the plugin's own routes only.
        expect(content, file).toMatch(/\/api\/deepseek-usage\//)
      } else {
        expect(fetchCalls.length, `${file} must not call fetch`).toBe(0)
      }
    }
  })

  it('never logs the API key or any credential value', () => {
    for (const file of sources) {
      const content = readFileSync(file, 'utf8')
      expect(content, file).not.toMatch(/logger\.(info|warn|debug|error)\([^)]*apiKey/)
      expect(content, file).not.toMatch(/logger\.(info|warn|debug|error)\([^)]*resolved\.value/)
      expect(content, file).not.toMatch(/console\.(log|info|warn|error)\([^)]*apiKey/)
    }
  })
})
