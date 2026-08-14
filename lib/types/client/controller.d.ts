/**
 * Panel visibility controller shared by the sidebar entry and the panel
 * mount (the same tiny state machine dsh-ssh uses).
 */
/** Snapshot of the panel's open state. */
export interface PanelControllerSnapshot {
    panelOpen: boolean;
}
/** Minimal observable boolean state. */
export declare class PanelController {
    private open;
    private readonly listeners;
    getSnapshot(): PanelControllerSnapshot;
    subscribe(listener: () => void): () => void;
    toggle(): void;
    close(): void;
    private notify;
}
//# sourceMappingURL=controller.d.ts.map