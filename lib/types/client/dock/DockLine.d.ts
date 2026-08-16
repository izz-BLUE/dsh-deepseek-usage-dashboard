/**
 * The composer dock line: one compact row under the composer card with the
 * day's DeepSeek usage — `今日：命中 X · 未命中 X · 输出 X · 估算 ¥X · 余额 ¥X`.
 *
 * The row's `title` tooltip spells out the scope (today, Asia/Shanghai
 * 00:00 to now) so it is never mistaken for the session-scoped stats line
 * rendered by the harness next to it.
 *
 * Registers into the shipped `conversation.composer.dock` seat (the same
 * slot dsh-live-stats' TPS line uses). Data comes from the shared stats
 * store (a local HTTP poll — zero tokens), not from any projection, so the
 * line reflects the whole instance's day.
 */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** The compact today line for the composer dock. */
export declare const DockLine: import("react").NamedExoticComponent<object>;
/**
 * Composer-dock entry: adapts the session-scoped `conversation.composer.dock`
 * runtime share (the framework standard kit) to the today line.
 */
export declare const DockLineEntry: import("react").NamedExoticComponent<PropsRuntime<"conversation.composer.dock">>;
//# sourceMappingURL=DockLine.d.ts.map