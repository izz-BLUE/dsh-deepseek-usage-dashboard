/**
 * The API usage dashboard panel: today's token cards, cache hit/miss
 * comparison, output, hit rate, estimated cost, balance, 7-day trend, and
 * the data-source footer. Rendered inside a plain React root (family
 * pattern), so locale comes from the document language, and every color
 * comes from DSH CSS tokens.
 */
import type { PanelController } from '../controller.ts';
import type { UsageStore, UsageStoreSnapshot } from '../store.ts';
/** Props the panel receives. */
export interface UsageDashboardProps {
    controller: PanelController;
    store: UsageStore;
}
/**
 * Render the usage dashboard.
 * @param props - panel controller and the shared stats store.
 */
export declare function UsageDashboard({ store }: UsageDashboardProps): import("react").JSX.Element;
/** Pure view over one store snapshot (also used by tests). */
export declare function DashboardView(props: {
    snapshot: UsageStoreSnapshot;
    onRefresh: () => void;
}): import("react").JSX.Element;
//# sourceMappingURL=UsageDashboard.d.ts.map