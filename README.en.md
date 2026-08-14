# dsh-deepseek-usage-dashboard

[简体中文](./README.md) | English

A standalone, installable Web UI plugin for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) that:

- counts the **daily DeepSeek token usage** of this DSH instance from session logs (exact provider usage only — cache hit / cache miss input, output, reasoning),
- **estimates today's cost** per model from a user-editable price table,
- watches the **DeepSeek account balance** (Host-side, 10-minute refresh, manual refresh supported),
- shows it all in a Web GUI dashboard, a composer dock line, and a settings card.

Built **only on the official `@deepseek-ai/*` NPM SDK**. It never modifies DSH sources; installation goes through `cordis.patch.yml` + the profile plugin mechanism. The plugin **never calls any LLM interface**: capture, refresh, display, and balance queries perform zero model calls, so idle running and page refreshes cost 0 tokens.

## Features

- **Daily statistics (Asia/Shanghai)**: cache-hit input, cache-miss input, output, reasoning (when reported), total input, total tokens, request count, failed request count, cache hit rate.
- **Only real DeepSeek traffic counts**: provider route `deepseek-official` (configurable) **and** effective base URL host `api.deepseek.com` — a custom gateway does not pollute the statistics.
- **Streaming-safe**: only the FINAL usage settles a record; streamed estimates are never written to the exact daily statistics.
- **Idempotent + durable**: SQLite (`node:sqlite`, built into the Node 24 runtime) with a `UNIQUE (session_id, turn, step)` constraint and `INSERT OR IGNORE`, so projection replays, duplicate streaming usage, restart re-scans, and duplicate event submissions can never double-count. Survives restarts; corrupt files are moved aside and recreated.
- **Decimal money**: cost is accumulated in integer micro-units (1e-6 CNY) with BigInt — no float accumulation. Prices are configured **per model** (`cacheHitInputPricePerMillion`, `cacheMissInputPricePerMillion`, `outputPricePerMillion`, `currency`, `effectiveFrom`) with a `*` fallback, editable in the settings page; the UI displays the price-table version and its update time, and every amount is labelled **estimate, not an official bill**.
- **Balance**: Host-only `GET https://api.deepseek.com/user/balance` (fixed base URL, 10 s timeout, 401/402/429/5xx/timeout/malformed handled separately); the last good snapshot is retained and shown as stale after a failure; manual refresh included. The API key never reaches the browser, logs, or request parameters.
- **Host HTTP API**: `/api/deepseek-usage/stats` + `/api/deepseek-usage/refresh`, gated by the DSH browser-trust fence (Host / Origin / Sec-Fetch-Site, reproduced from the official api-request-trust semantics) plus a loopback-socket check; balance detail is loopback-only; POST requires `application/json`; bodies are size-capped; no arbitrary URL/file/command proxy.
- **Web UI**: sidebar entry "API 用量" (or "API Usage"), dashboard with today cards, cache hit/miss bar, hit rate, estimated cost, balance (total / granted / topped-up), 7-day trend, last-updated + data-source footer; a compact `conversation.composer.dock` line (`今日：命中 X · 未命中 X · 输出 X · 估算 ¥X · 余额 ¥X`); full zh + en locales; DSH CSS tokens only (light/dark themes); no `dangerouslySetInnerHTML`.

## Install

```sh
dsh plugin --profile web add https://github.com/izz-BLUE/dsh-deepseek-usage-dashboard.git
```

Restart `dsh web`. The sidebar gains an "API 用量" entry; the composer shows the today line.

For local development, install a checkout with:

```sh
dsh plugin --profile web add link:<path-to-this-repository>
```

> To register it into the `dsh-web-ui-all` aggregate, append the package to `packages/dsh-web-ui-all/aggregate.yml` (`patchFrom` + `deps`) and run `node scripts/aggregate.mjs`.

## Verify

```sh
pnpm typecheck
pnpm test
pnpm build
```

## Configuration

Settings namespace `deepseek-usage` (settings page → plugin config, or `~/.dsh/settings.yaml`):

| field | default | meaning |
| --- | --- | --- |
| `enabled` | `true` | master switch |
| `providerId` | `deepseek-official` | provider route counted as DeepSeek |
| `balanceRefreshMinutes` | `10` | balance refresh interval |
| `prices` | see `DEFAULT_PRICE_ENTRIES` | per-model price table |

Data lives in `~/.dsh/deepseek-usage/usage.db` (SQLite). The API key is resolved through `@deepseek-ai/dsh-credentials` on the `llm-deepseek` credential reference (default `DEEPSEEK_API_KEY`), with the host process environment as the documented fallback.

## Data source & mapping

The statistics come from **session event logs** via the official replayable projection registry (`ctx.sessionProjections`, the same seam `@linxin666/dsh-live-stats` uses) plus a startup catch-up scan over `ctx.sessionQuery`. The official DeepSeek adapter (`@deepseek-ai/dsh-llm-deepseek`) maps wire usage as (`translate.mapUsage`):

| DeepSeek wire field | harness `TokenUsage` | dashboard bucket |
| --- | --- | --- |
| `prompt_cache_hit_tokens` (or `prompt_tokens_details.cached_tokens`) | `cacheReadTokens` | `cacheHitInputTokens` |
| `prompt_tokens - cacheRead` (disjoint; `prompt_cache_miss_tokens`) | `inputTokens` | `cacheMissInputTokens` |
| `completion_tokens` | `outputTokens` | `outputTokens` |
| `completion_tokens_details.reasoning_tokens` | `reasoningTokens` | `reasoningTokens` |
| (never reported by DeepSeek) | `cacheWriteTokens` (absent) | contributes 0 |

The equivalence is pinned by tests (`tests/mapping.spec.ts`).

## Security

- The API key exists only in the Host process (credentials seam → env fallback); it is never logged, never sent to the browser, and never accepted from request parameters.
- Balance responses are sanitized to `is_available` + `balance_infos[].{currency,total_balance,granted_balance,topped_up_balance}`; raw error bodies, headers, and the credential never cross the boundary.
- Routes are loopback-only with the DSH browser-trust fence; no arbitrary URL/file/command proxying exists.

## Known limitations

- `isTrustedApiRequest` is not exported by the official SDK, so the fence reproduces its documented semantics locally (same Host/Origin/Sec-Fetch-Site rules, no trustedHosts).
- A step whose provider reported no usage and whose turn completed normally produces no row (usage is unknown); failed requests are counted from `error`/`aborted` turns without usage.
- Steps are attributed to the header in force when they start; a mid-turn header change applies to the following steps.
- The balance endpoint is fixed to `https://api.deepseek.com` and is not configurable (per spec).
- Estimates are based on the configured price table — DeepSeek's official bills are authoritative.
- SQLite uses Node's built-in `node:sqlite`; the database file is a single machine-level store under `~/.dsh/deepseek-usage/`.

## License

BSD-3-Clause
