/**
 * Panel visibility controller shared by the sidebar entry and the panel
 * mount (the same tiny state machine dsh-ssh uses).
 */

/** Snapshot of the panel's open state. */
export interface PanelControllerSnapshot {
  panelOpen: boolean
}

/** Minimal observable boolean state. */
export class PanelController {
  private open = false
  private readonly listeners = new Set<() => void>()

  getSnapshot(): PanelControllerSnapshot {
    return { panelOpen: this.open }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  toggle(): void {
    this.open = !this.open
    this.notify()
  }

  close(): void {
    if (!this.open) return
    this.open = false
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
