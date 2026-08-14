/**
 * Module-level holder for the shared UsageStore: the client entry creates
 * one store and hands it to the panel mount and the composer dock entry.
 */

import type { UsageStore } from './store.ts'

let current: UsageStore | undefined

/** Set (or clear) the shared store. */
export function setUsageStore(store: UsageStore | undefined): void {
  current = store
}

/** The shared store, or undefined before the client entry mounts. */
export function usageStore(): UsageStore | undefined {
  return current
}
