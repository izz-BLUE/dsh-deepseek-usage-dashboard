/**
 * Sidebar entry injection.
 *
 * dsh's sidebar shell exposes no slot an external plugin can register into,
 * so — following the task-board/ssh precedent of DOM-level extension — the
 * "API 用量" row is injected between the shell's New Session button and the
 * workspace browser. A MutationObserver self-heals re-renders (re-insertion
 * happens in the same frame, before paint, so no flicker). The row is plain
 * DOM so it can never disturb the shell's reconciliation; the panel it
 * toggles is a separate React root in the center column (see mount.tsx).
 */
import type { PanelController } from './controller.ts';
/** Stable data attribute identifying the injected entry row. */
export declare const ENTRY_SELECTOR = "[data-dsh-usage-entry]";
/**
 * Mount the sidebar entry, waiting for the shell to render and self-healing
 * on later React re-renders.
 * @param controller - the panel controller the entry toggles.
 * @returns disposer removing the entry and its observers.
 */
export declare function mountSidebarEntry(controller: PanelController): () => void;
//# sourceMappingURL=sidebar-entry.d.ts.map