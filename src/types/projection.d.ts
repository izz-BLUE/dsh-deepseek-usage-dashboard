/**
 * Registers the `deepseekUsage` projection key into the merge-extensible
 * session-projection map table (the same augmentation technique
 * dsh-live-stats uses for `liveTokenUsage`).
 */

import type { DeepseekUsageProjection } from '../core/projection.ts'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Per-session settled DeepSeek usage step records. */
    deepseekUsage: DeepseekUsageProjection
  }
}

// Module-augmentation marker: makes this file an external module so the
// declare module block above merges (augments) its target.
export {}
