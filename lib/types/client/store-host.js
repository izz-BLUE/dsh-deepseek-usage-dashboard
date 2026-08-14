/**
 * Module-level holder for the shared UsageStore: the client entry creates
 * one store and hands it to the panel mount and the composer dock entry.
 */
let current;
/** Set (or clear) the shared store. */
export function setUsageStore(store) {
    current = store;
}
/** The shared store, or undefined before the client entry mounts. */
export function usageStore() {
    return current;
}
