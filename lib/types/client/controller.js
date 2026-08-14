/**
 * Panel visibility controller shared by the sidebar entry and the panel
 * mount (the same tiny state machine dsh-ssh uses).
 */
/** Minimal observable boolean state. */
export class PanelController {
    open = false;
    listeners = new Set();
    getSnapshot() {
        return { panelOpen: this.open };
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    toggle() {
        this.open = !this.open;
        this.notify();
    }
    close() {
        if (!this.open)
            return;
        this.open = false;
        this.notify();
    }
    notify() {
        for (const listener of this.listeners)
            listener();
    }
}
