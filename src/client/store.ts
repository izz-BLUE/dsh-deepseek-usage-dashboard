/**
 * Client-side stats store: one shared poller for the dashboard panel and the
 * composer dock line. Polling is a local HTTP GET against the Host — it
 * consumes zero tokens, so idle or refreshing the page never costs anything.
 */

import type { UsageApi, UsageStatsWire } from './api.ts'

/** The store's public snapshot. */
export interface UsageStoreSnapshot {
  data: UsageStatsWire | null
  /** Stable error code of the last failed fetch, or null. */
  error: string | null
  /** Whether a fetch is in flight. */
  loading: boolean
  /** Whether a manual refresh is in flight. */
  refreshing: boolean
}

/** Reactive store over one UsageApi instance. */
export class UsageStore {
  private snapshot: UsageStoreSnapshot = { data: null, error: null, loading: false, refreshing: false }
  private readonly listeners = new Set<() => void>()
  private timer: ReturnType<typeof setInterval> | undefined
  private pollMs: number

  /** @param api - the API client.
   * @param pollMs - automatic poll interval (default 60s). */
  constructor(
    private readonly api: UsageApi,
    pollMs = 60_000,
  ) {
    this.pollMs = pollMs
  }

  getSnapshot(): UsageStoreSnapshot {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Start polling (initial fetch + interval). */
  start(): void {
    void this.fetch()
    this.timer = setInterval(() => { void this.fetch() }, this.pollMs)
    this.timer.unref?.()
  }

  /** Stop polling. */
  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  /** One background fetch (no spinner; keeps the last good data on failure). */
  async fetch(): Promise<void> {
    const snapshot = this.snapshot
    if (snapshot.loading) return
    this.publish({ ...snapshot, loading: true })
    try {
      const data = await this.api.stats()
      this.publish({ ...this.snapshot, data, error: null, loading: false })
    } catch (error) {
      this.publish({ ...this.snapshot, error: error instanceof Error ? error.message : String(error), loading: false })
    }
  }

  /** Force a balance refresh, then re-fetch stats. */
  async refresh(): Promise<void> {
    const snapshot = this.snapshot
    if (snapshot.refreshing) return
    this.publish({ ...snapshot, refreshing: true })
    try {
      const data = await this.api.refreshBalance()
      this.publish({ ...this.snapshot, data, error: null, refreshing: false })
    } catch (error) {
      this.publish({ ...this.snapshot, error: error instanceof Error ? error.message : String(error), refreshing: false })
    }
  }

  private publish(next: UsageStoreSnapshot): void {
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}
