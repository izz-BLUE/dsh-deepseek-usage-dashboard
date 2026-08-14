/**
 * Module-level holder for the shared UsageStore: the client entry creates
 * one store and hands it to the panel mount and the composer dock entry.
 */
import type { UsageStore } from './store.ts';
/** Set (or clear) the shared store. */
export declare function setUsageStore(store: UsageStore | undefined): void;
/** The shared store, or undefined before the client entry mounts. */
export declare function usageStore(): UsageStore | undefined;
//# sourceMappingURL=store-host.d.ts.map