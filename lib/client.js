window.__ModuleLoader__.load({
	id: "@linxin666/dsh-deepseek-usage-dashboard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_dom_client = require("react-dom/client");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/api.ts
		/** Browser API client for the usage routes. */
		var UsageApi = class {
			/** Fetch the current stats snapshot. */
			async stats() {
				const response = await fetch("/api/deepseek-usage/stats", {
					method: "GET",
					headers: { Accept: "application/json" },
					cache: "no-store"
				});
				if (!response.ok) throw new Error(`usage stats: HTTP ${response.status}`);
				return await response.json();
			}
			/** Force a balance refresh (Host-side fetch), then re-read stats. */
			async refreshBalance() {
				const response = await fetch("/api/deepseek-usage/refresh", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json"
					},
					body: "{}",
					cache: "no-store"
				});
				if (!response.ok) throw new Error(`usage refresh: HTTP ${response.status}`);
				await response.json();
				return await this.stats();
			}
		};
		/** Format a token count with grouping separators. */
		function formatCount(value) {
			return value.toLocaleString("en-US");
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* The `deepseek-usage` namespace dictionaries: the dashboard panel, the
		* composer dock line, the sidebar entry, and the plugin settings card.
		*/
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"entry.label": "API 用量",
			"entry.tooltip": "查看今日 DeepSeek Token 用量与账户余额",
			"panel.title": "DeepSeek API 用量",
			"panel.today": "今日用量（Asia/Shanghai）",
			"panel.trend": "最近 7 天用量趋势",
			"panel.trendTotal": "7 天合计",
			"panel.trendAverage": "日均",
			"panel.trendChartTitle": "Token 用量趋势",
			"panel.trendTotalLegend": "Token 合计",
			"panel.inputShare": "输入占比 {percent}",
			"panel.tokensUnit": "tokens",
			"panel.timesUnit": "次",
			"panel.excellent": "优秀",
			"panel.failureRate": "{rate} 失败率",
			"panel.refresh": "刷新",
			"panel.refreshing": "刷新中…",
			"panel.lastUpdated": "最后更新",
			"panel.dataSource": "数据来源",
			"panel.priceVersion": "价格版本",
			"panel.priceUpdated": "价格更新时间",
			"panel.pricingModeLegacy": "自定义旧版价格 · {date}",
			"panel.pricingNow": "{name} · 分时定价 · {timezone}",
			"panel.timezoneBeijing": "北京时间 {tz}",
			"panel.pricingMultiple": "多种价格计划",
			"panel.pricingTimezone": "计价时区",
			"panel.currentBandOffPeak": "空闲时段",
			"panel.currentBandPeak": "高峰时段",
			"panel.currentBandAllDay": "全天统一价",
			"panel.currentWindow": "当前时段：{span}",
			"panel.currentRates": "当前费率（{model}）：命中 {hit} · 未命中 {miss} · 输出 {out}",
			"panel.offPeakHalfNote": "当前费率为高峰时段的 50%",
			"panel.windowsTooltip": "高峰时段：{peak}；空闲时段：{offpeak}",
			"panel.bandBreakdownLabel": "时段分解",
			"panel.bandCostRow": "{band} {cost} · {count} 次",
			"panel.bandCostTokens": "命中 {hit} · 未命中 {miss} · 输出 {out}",
			"panel.unpriced": "部分用量未计价",
			"panel.unpricedDetail": "{count} 个请求未计价（模型未在价格计划中）",
			"panel.estimateNote": "估算，非官方账单",
			"panel.estimateLabel": "今日估算费用",
			"panel.balance": "当前可用余额",
			"panel.balanceUnavailable": "余额不可用（未配置 API Key）",
			"panel.balanceStale": "余额数据已过期（上次刷新失败）",
			"panel.cacheHit": "缓存命中输入",
			"panel.cacheMiss": "缓存未命中输入",
			"panel.output": "输出",
			"panel.reasoning": "推理",
			"panel.totalInput": "输入合计",
			"panel.totalTokens": "Token 合计",
			"panel.hitRate": "缓存命中率",
			"panel.requestCount": "请求数",
			"panel.failedRequests": "失败请求",
			"panel.available": "可用",
			"panel.granted": "赠送余额",
			"panel.toppedUp": "充值余额",
			"panel.totalBalance": "总余额",
			"panel.endpointFiltered": "当前 DeepSeek 端点 ({baseUrl}) 不属于 api.deepseek.com，用量统计已暂停。",
			"panel.endpointOk": "统计端点：{baseUrl}（provider {provider}）",
			"panel.noData": "今日暂无记录",
			"panel.notConfigured": "未配置 DeepSeek API Key，无法查询余额。",
			"dock.today": "今日：命中 {hit} · 未命中 {miss} · 输出 {out} · 估算 {cost} · 余额 {balance}",
			"dock.todayTooltip": "今日统计：Asia/Shanghai 自然日，从 00:00 到当前。",
			"settings.title": "DeepSeek 用量仪表盘",
			"settings.description": "每日 Token 统计、价格表与余额刷新参数。",
			"settings.enabled": "启用统计与余额",
			"settings.enabledHint": "关闭后停止捕获用量、刷新余额与提供统计接口。",
			"settings.providerId": "DeepSeek provider 路由",
			"settings.providerIdHint": "被统计为 DeepSeek 的 provider 路由 id（官方适配器默认 deepseek-official）。",
			"settings.refreshMinutes": "余额刷新间隔（分钟）",
			"settings.refreshMinutesHint": "每隔多少分钟刷新一次余额，默认 10 分钟。",
			"settings.pricingMode": "计价模式",
			"settings.pricingModeLegacy": "自定义旧版价格表（prices，全天统一价）——正在覆盖官方默认分时定价",
			"settings.pricingModeSchedules": "分时定价（按请求时间计价）",
			"settings.pricingTimezone": "计价时区",
			"settings.pricingSchedules": "价格计划",
			"settings.pricingBuiltinDefault": "默认使用 DeepSeek 2026-08-17 官方分时定价：08-17 起按高峰/空闲时段计价，更早请求按 legacy-2026-04-24 兼容价格计算。配置自定义 pricingSchedules 或修改 prices 后会覆盖默认。",
			"settings.pricingOffPeakHint": "未落入上方任一窗口的时段自动归入空闲时段（off-peak）。",
			"settings.pricingSchedulesHint": "已配置 time-aware pricingSchedules；下方 prices 为旧版兼容配置，仅在未配置 pricingSchedules 时生效。分时段窗口编辑器将在后续版本提供。",
			"settings.prices": "价格表（每百万 Token）",
			"settings.pricesHint": "按模型配置价格；DeepSeek 调整价格后请在此更新。命中/未命中/输出价格均为每百万 Token 的币种金额。",
			"settings.model": "模型",
			"settings.hitPrice": "缓存命中",
			"settings.missPrice": "缓存未命中",
			"settings.outputPrice": "输出",
			"settings.currency": "币种",
			"settings.effectiveFrom": "生效日期",
			"settings.addRow": "添加价格行",
			"settings.removeRow": "删除该行",
			"settings.invalidPrice": "价格必须是大于等于 0 的数字；模型与币种不能为空；生效日期格式为 YYYY-MM-DD。",
			"settings.fallbackModel": "*（兜底模型，仅在你显式配置时生效）",
			"settings.save": "保存",
			"settings.saving": "保存中…",
			"settings.discard": "放弃",
			"settings.unsaved": "未保存",
			"settings.overridden": "已覆盖",
			"settings.reset": "恢复默认",
			"settings.saveFailed": "部署未接受这些值，已保留供你修改。",
			"settings.readOnly": "当前部署的设置只读。",
			"settings.notExposed": "当前 DSH 版本未向设置页暴露本插件的配置命名空间，表单不可用。可编辑 ~/.dsh/settings.yaml 直接配置，或为 dsh-host-apiproxy 的 WEB_SETTINGS_NAMESPACES 白名单补充本命名空间后重启。",
			"settings.inherit": "继承",
			"settings.on": "开",
			"settings.off": "关"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"entry.label": "API Usage",
			"entry.tooltip": "Daily DeepSeek token usage and account balance",
			"panel.title": "DeepSeek API Usage",
			"panel.today": "Today (Asia/Shanghai)",
			"panel.trend": "Usage trend — last 7 days",
			"panel.trendTotal": "7-day total",
			"panel.trendAverage": "Daily average",
			"panel.trendChartTitle": "Token usage trend",
			"panel.trendTotalLegend": "Total tokens",
			"panel.inputShare": "Input share {percent}",
			"panel.tokensUnit": "tokens",
			"panel.timesUnit": "times",
			"panel.excellent": "Excellent",
			"panel.failureRate": "{rate} failure rate",
			"panel.refresh": "Refresh",
			"panel.refreshing": "Refreshing…",
			"panel.lastUpdated": "Last updated",
			"panel.dataSource": "Data source",
			"panel.priceVersion": "Price version",
			"panel.priceUpdated": "Prices updated",
			"panel.pricingModeLegacy": "Custom legacy prices · {date}",
			"panel.pricingNow": "{name} · time-of-day pricing · {timezone}",
			"panel.timezoneBeijing": "Beijing time ({tz})",
			"panel.pricingMultiple": "Multiple pricing schedules",
			"panel.pricingTimezone": "Pricing timezone",
			"panel.currentBandOffPeak": "Off-peak",
			"panel.currentBandPeak": "Peak",
			"panel.currentBandAllDay": "Flat all-day",
			"panel.currentWindow": "Current period: {span}",
			"panel.currentRates": "Current rate ({model}): hit {hit} · miss {miss} · output {out}",
			"panel.offPeakHalfNote": "Current rate is 50% of the peak rate",
			"panel.windowsTooltip": "Peak: {peak}; Off-peak: {offpeak}",
			"panel.bandBreakdownLabel": "By period",
			"panel.bandCostRow": "{band} {cost} · {count} requests",
			"panel.bandCostTokens": "hit {hit} · miss {miss} · output {out}",
			"panel.unpriced": "Some usage unpriced",
			"panel.unpricedDetail": "{count} request(s) unpriced (model not in any schedule)",
			"panel.estimateNote": "Estimate, not an official bill",
			"panel.estimateLabel": "Estimated cost today",
			"panel.balance": "Available balance",
			"panel.balanceUnavailable": "Balance unavailable (no API key configured)",
			"panel.balanceStale": "Balance data is stale (last refresh failed)",
			"panel.cacheHit": "Cache-hit input",
			"panel.cacheMiss": "Cache-miss input",
			"panel.output": "Output",
			"panel.reasoning": "Reasoning",
			"panel.totalInput": "Total input",
			"panel.totalTokens": "Total tokens",
			"panel.hitRate": "Cache hit rate",
			"panel.requestCount": "Requests",
			"panel.failedRequests": "Failed requests",
			"panel.available": "Available",
			"panel.granted": "Granted balance",
			"panel.toppedUp": "Topped-up balance",
			"panel.totalBalance": "Total balance",
			"panel.endpointFiltered": "The current DeepSeek endpoint ({baseUrl}) is not api.deepseek.com; usage capture is paused.",
			"panel.endpointOk": "Tracking endpoint: {baseUrl} (provider {provider})",
			"panel.noData": "No records today",
			"panel.notConfigured": "No DeepSeek API key configured; balance cannot be queried.",
			"dock.today": "Today: hit {hit} · miss {miss} · out {out} · est. {cost} · balance {balance}",
			"dock.todayTooltip": "Today statistics: current Asia/Shanghai calendar day, from 00:00 to now.",
			"settings.title": "DeepSeek usage dashboard",
			"settings.description": "Daily token stats, price table, and balance refresh parameters.",
			"settings.enabled": "Enable stats and balance",
			"settings.enabledHint": "When off, usage capture, balance refresh, and the stats routes stop.",
			"settings.providerId": "DeepSeek provider route",
			"settings.providerIdHint": "Provider route id counted as DeepSeek (official adapter default: deepseek-official).",
			"settings.refreshMinutes": "Balance refresh interval (minutes)",
			"settings.refreshMinutesHint": "How often the balance refreshes; default 10 minutes.",
			"settings.pricingMode": "Pricing mode",
			"settings.pricingModeLegacy": "Custom legacy price table (prices, flat all-day) — overriding the official default time-of-day pricing",
			"settings.pricingModeSchedules": "Time-of-day pricing (priced at request time)",
			"settings.pricingTimezone": "Pricing timezone",
			"settings.pricingSchedules": "Pricing schedules",
			"settings.pricingBuiltinDefault": "Using the built-in default: official DeepSeek 2026-08-17 time-of-day pricing (peak/off-peak from 08-17; earlier requests keep the legacy-2026-04-24 compatibility prices). Custom pricingSchedules or edited prices override it.",
			"settings.pricingOffPeakHint": "Minutes outside the windows above fall into the implicit off-peak band.",
			"settings.pricingSchedulesHint": "Time-aware pricingSchedules are configured; the legacy prices below only apply while no pricingSchedules are set. A band editor ships in a later version.",
			"settings.prices": "Price table (per million tokens)",
			"settings.pricesHint": "Prices are configured per model; update them here when DeepSeek changes pricing. Hit/miss/output prices are currency amounts per million tokens.",
			"settings.model": "Model",
			"settings.hitPrice": "Cache hit",
			"settings.missPrice": "Cache miss",
			"settings.outputPrice": "Output",
			"settings.currency": "Currency",
			"settings.effectiveFrom": "Effective from",
			"settings.addRow": "Add price row",
			"settings.removeRow": "Remove row",
			"settings.invalidPrice": "Prices must be non-negative numbers; model and currency must not be empty; effectiveFrom must be YYYY-MM-DD.",
			"settings.fallbackModel": "* (fallback model; only when you configure it explicitly)",
			"settings.save": "Save",
			"settings.saving": "Saving…",
			"settings.discard": "Discard",
			"settings.unsaved": "Unsaved",
			"settings.overridden": "Overridden",
			"settings.reset": "Reset to default",
			"settings.saveFailed": "The deployment did not accept these values; they were left for you to correct.",
			"settings.readOnly": "This deployment stores settings read-only.",
			"settings.notExposed": "This DSH version does not expose this plugin's settings namespace to the configuration page, so the form is unavailable. Edit ~/.dsh/settings.yaml directly, or add the namespace to dsh-host-apiproxy's WEB_SETTINGS_NAMESPACES allowlist and restart.",
			"settings.inherit": "Inherit",
			"settings.on": "On",
			"settings.off": "Off"
		};
		/** Interpolate {name} placeholders in one dictionary entry. */
		function interpolate(template, values) {
			if (values === void 0) return template;
			return template.replace(/\{(\w+)\}/g, (match, name) => {
				const value = values[name];
				return value === void 0 ? match : String(value);
			});
		}
		/** Active dictionary, picked by the document language at call time. */
		function dictionary() {
			return (typeof document !== "undefined" ? document.documentElement.lang : "zh").toLowerCase().startsWith("en") ? { ...en } : { ...zh };
		}
		/** Translate a key with optional {name} template params (current language). */
		function tt(key, values) {
			return interpolate(dictionary()[key], values);
		}
		//#endregion
		//#region src/client/store.ts
		/** Reactive store over one UsageApi instance. */
		var UsageStore = class {
			api;
			snapshot = {
				data: null,
				error: null,
				loading: false,
				refreshing: false
			};
			listeners = /* @__PURE__ */ new Set();
			timer;
			pollMs;
			/** @param api - the API client.
			* @param pollMs - automatic poll interval (default 60s). */
			constructor(api, pollMs = 6e4) {
				this.api = api;
				this.pollMs = pollMs;
			}
			getSnapshot() {
				return this.snapshot;
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			/** Start polling (initial fetch + interval). */
			start() {
				this.fetch();
				this.timer = setInterval(() => {
					this.fetch();
				}, this.pollMs);
				this.timer.unref?.();
			}
			/** Stop polling. */
			stop() {
				if (this.timer !== void 0) clearInterval(this.timer);
				this.timer = void 0;
			}
			/** One background fetch (no spinner; keeps the last good data on failure). */
			async fetch() {
				const snapshot = this.snapshot;
				if (snapshot.loading) return;
				this.publish({
					...snapshot,
					loading: true
				});
				try {
					const data = await this.api.stats();
					this.publish({
						...this.snapshot,
						data,
						error: null,
						loading: false
					});
				} catch (error) {
					this.publish({
						...this.snapshot,
						error: error instanceof Error ? error.message : String(error),
						loading: false
					});
				}
			}
			/** Force a balance refresh, then re-fetch stats. */
			async refresh() {
				const snapshot = this.snapshot;
				if (snapshot.refreshing) return;
				this.publish({
					...snapshot,
					refreshing: true
				});
				try {
					const data = await this.api.refreshBalance();
					this.publish({
						...this.snapshot,
						data,
						error: null,
						refreshing: false
					});
				} catch (error) {
					this.publish({
						...this.snapshot,
						error: error instanceof Error ? error.message : String(error),
						refreshing: false
					});
				}
			}
			publish(next) {
				this.snapshot = next;
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region src/client/store-host.ts
		let current;
		/** Set (or clear) the shared store. */
		function setUsageStore(store) {
			current = store;
		}
		/** The shared store, or undefined before the client entry mounts. */
		function usageStore() {
			return current;
		}
		//#endregion
		//#region src/client/controller.ts
		/** Minimal observable boolean state. */
		var PanelController = class {
			open = false;
			listeners = /* @__PURE__ */ new Set();
			getSnapshot() {
				return { panelOpen: this.open };
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			toggle() {
				this.open = !this.open;
				this.notify();
			}
			close() {
				if (!this.open) return;
				this.open = false;
				this.notify();
			}
			notify() {
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region \0dsh-usage-css:C:\Users\饭团\Documents\测试\dsh-deepseek-usage-dashboard\src\client\panel.module.css.mjs
		const css$2 = ".twb4Gq_entry{color:var(--dsw-alias-label-tertiary,inherit);cursor:pointer;font:inherit;text-align:left;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;width:100%;padding:4px 10px;font-size:12px;line-height:20px;display:flex}.twb4Gq_entry:hover{background:var(--dsw-alias-fill-hover,transparent);color:var(--dsw-alias-label-primary,inherit)}.twb4Gq_entry[data-active=true]{background:var(--dsw-alias-fill-active,var(--dsw-alias-fill-hover,transparent));color:var(--dsw-alias-label-primary,inherit)}.twb4Gq_entryIcon{flex:none;justify-content:center;align-items:center;display:inline-flex}.twb4Gq_entryLabel{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.twb4Gq_view{box-sizing:border-box;width:100%;height:100%;padding:24px;display:none;overflow:auto}html[data-dsh-usage-active=\"\"] .twb4Gq_view{display:block}html[data-dsh-usage-active=\"\"] [data-pane=conversation]>:not([data-dsh-usage-view]){display:none!important}";
		const tagId$2 = "@linxin666/dsh-deepseek-usage-dashboard/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-deepseek-usage-dashboard";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"entry": "twb4Gq_entry",
			"entryIcon": "twb4Gq_entryIcon",
			"entryLabel": "twb4Gq_entryLabel",
			"view": "twb4Gq_view"
		};
		//#endregion
		//#region src/client/sidebar-entry.ts
		/** Inline icon (matches the shell's 16px nav-icon look): a gauge glyph. */
		const ICON = "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M2.5 11.5l3.2-4.2 2.4 2 3.4-5\"/><path d=\"M2.5 13.5h11\"/></svg>";
		/** Find the sidebar shell root element, or undefined while not yet mounted. */
		function sidebarRoot() {
			const column = document.querySelector("[data-pane=\"sidebar\"], [class*=\"sidebarCol\"]");
			if (column === null) return void 0;
			return column.querySelector("[class*=\"logoRow\"]")?.parentElement ?? column.firstElementChild;
		}
		/** The New Session button: nested in the logo row on current shells. */
		function newSessionButton(root) {
			const nested = root.querySelector("button[class*=\"newSession\"]");
			if (nested !== null) return nested;
			for (const child of root.children) if (child.tagName === "BUTTON") return child;
		}
		/** Build the entry row (a detached button; insert once the shell is up). */
		function createEntry(controller) {
			const entry = document.createElement("button");
			entry.type = "button";
			entry.dataset.dshUsageEntry = "";
			entry.className = panel_module_css_default.entry;
			entry.setAttribute("aria-label", zh["entry.label"]);
			entry.setAttribute("title", zh["entry.tooltip"]);
			entry.innerHTML = `<span class="${panel_module_css_default.entryIcon}">${ICON}</span><span class="${panel_module_css_default.entryLabel}">${zh["entry.label"]}</span>`;
			entry.addEventListener("click", () => {
				controller.toggle();
			});
			return entry;
		}
		/** Re-insert the entry after the New Session row (before the browser region). */
		function placeEntry(root, entry) {
			const button = newSessionButton(root);
			if (button === void 0) return false;
			if (entry.parentElement !== root) {
				const row = button.closest("[class*=\"logoRow\"]");
				const base = row !== null && row.parentElement === root ? row : button;
				const family = Array.from(root.children).filter((el) => el instanceof HTMLElement && el.matches("[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-usage-entry]"));
				const anchor = family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling;
				root.insertBefore(entry, anchor);
			}
			return true;
		}
		/**
		* Mount the sidebar entry, waiting for the shell to render and self-healing
		* on later React re-renders.
		* @param controller - the panel controller the entry toggles.
		* @returns disposer removing the entry and its observers.
		*/
		function mountSidebarEntry(controller) {
			const entry = createEntry(controller);
			let root;
			let placed = false;
			let rootObserver;
			const tryPlace = () => {
				if (root !== void 0 && !root.isConnected) {
					rootObserver?.disconnect();
					rootObserver = void 0;
					root = void 0;
					placed = false;
				}
				if (placed) {
					if (document.body.contains(entry)) return;
					rootObserver?.disconnect();
					rootObserver = void 0;
					root = void 0;
					placed = false;
				}
				root ??= sidebarRoot();
				if (root === void 0) return;
				placed = placeEntry(root, entry);
				if (placed && rootObserver === void 0) {
					rootObserver = new MutationObserver(() => {
						if (root === void 0 || !root.isConnected) {
							placed = false;
							tryPlace();
							return;
						}
						if (!root.contains(entry)) placed = placeEntry(root, entry);
					});
					rootObserver.observe(root, {
						childList: true,
						subtree: true
					});
				}
			};
			const waitObserver = new MutationObserver(() => {
				tryPlace();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const unsubscribe = controller.subscribe(() => {
				entry.dataset.active = controller.getSnapshot().panelOpen ? "true" : void 0;
			});
			entry.dataset.active = controller.getSnapshot().panelOpen ? "true" : void 0;
			tryPlace();
			return () => {
				waitObserver.disconnect();
				rootObserver?.disconnect();
				unsubscribe();
				entry.remove();
			};
		}
		//#endregion
		//#region \0dsh-usage-css:C:\Users\饭团\Documents\测试\dsh-deepseek-usage-dashboard\src\client\panel\dashboard.module.css.mjs
		const css$1 = ".Yak0lq_page{--usage-accent:var(--dsw-alias-fill-accent,#5b7cfa);--usage-accent-strong:var(--dsw-alias-label-link,#315efb);box-sizing:border-box;flex-direction:column;gap:28px;width:100%;max-width:1120px;margin:0 auto;display:flex}.Yak0lq_header{backdrop-filter:blur(12px);background:color-mix(in srgb, var(--dsw-alias-fill-subtle,currentColor) 5%, transparent);border:1px solid color-mix(in srgb, currentColor 11%, transparent);box-shadow:0 12px 36px color-mix(in srgb, currentColor 5%, transparent);border-radius:16px;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:12px;padding:18px 20px;display:flex;position:relative;overflow:hidden}.Yak0lq_header:after{background:linear-gradient(90deg, var(--usage-accent), var(--usage-accent-strong));content:\"\";opacity:.85;height:2px;position:absolute;bottom:0;left:20px;right:20px}.Yak0lq_title{color:var(--dsw-alias-label-primary,inherit);align-items:center;gap:10px;margin:0;font-size:20px;font-weight:600;display:flex}.Yak0lq_title:before{background:linear-gradient(135deg, var(--usage-accent), var(--usage-accent-strong));box-shadow:0 0 0 5px color-mix(in srgb, var(--usage-accent) 10%, transparent);content:\"\";border-radius:50%;width:9px;height:9px}.Yak0lq_headerActions{align-items:center;gap:12px;display:flex}.Yak0lq_updated{color:var(--dsw-alias-label-tertiary,inherit);font-size:12px}.Yak0lq_refresh{background:linear-gradient(135deg, var(--usage-accent), var(--usage-accent-strong));box-shadow:0 4px 12px color-mix(in srgb, var(--usage-accent) 22%, transparent);color:var(--dsw-alias-label-on-strong,#fff);cursor:pointer;font:inherit;border:none;border-radius:999px;padding:5px 15px;font-size:12px;line-height:20px;transition:box-shadow .16s,transform .16s}.Yak0lq_refresh:hover:not(:disabled){box-shadow:0 6px 18px color-mix(in srgb, var(--usage-accent) 30%, transparent);transform:translateY(-1px)}.Yak0lq_refresh:disabled{cursor:default;opacity:.6}.Yak0lq_empty{color:var(--dsw-alias-label-tertiary,inherit);text-align:center;padding:40px 0;font-size:13px}.Yak0lq_notice,.Yak0lq_noticeMuted{border-radius:6px;margin:0;padding:8px 12px;font-size:12px}.Yak0lq_notice{background:var(--dsw-alias-fill-warning,transparent);color:var(--dsw-alias-label-warning,inherit)}.Yak0lq_noticeMuted{background:color-mix(in srgb, currentColor 3%, transparent);border:1px solid color-mix(in srgb, currentColor 8%, transparent);color:var(--dsw-alias-label-tertiary,inherit);align-self:flex-start}.Yak0lq_sectionTitle{color:var(--dsw-alias-label-secondary,inherit);align-items:center;gap:8px;margin:0 0 10px;font-size:13px;font-weight:600;display:flex}.Yak0lq_sectionTitle:before{background:linear-gradient(180deg, var(--usage-accent), var(--usage-accent-strong));content:\"\";border-radius:999px;width:3px;height:14px}.Yak0lq_grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;display:grid}.Yak0lq_statCard{backdrop-filter:blur(10px);background:color-mix(in srgb, var(--dsw-alias-fill-subtle,currentColor) 5%, transparent);border:1px solid color-mix(in srgb, currentColor 10%, transparent);box-shadow:0 6px 20px color-mix(in srgb, currentColor 4%, transparent);border-radius:14px;flex-direction:column;gap:5px;min-height:78px;padding:14px 16px;transition:border-color .16s,box-shadow .16s,transform .16s;display:flex;position:relative;overflow:hidden}.Yak0lq_statCard:after{background:linear-gradient(90deg, var(--usage-accent), var(--usage-accent-strong));content:\"\";opacity:0;pointer-events:none;border-radius:999px;width:auto;height:2px;transition:opacity .16s;position:absolute;inset:0 14px auto}.Yak0lq_statCard:hover{border-color:color-mix(in srgb, var(--usage-accent) 28%, transparent);box-shadow:0 9px 24px color-mix(in srgb, var(--usage-accent) 10%, transparent);transform:translateY(-2px)}.Yak0lq_statCard:hover:after,.Yak0lq_statAccent:after{opacity:1}.Yak0lq_statAccent{background:color-mix(in srgb, var(--usage-accent) 9%, transparent);border-color:color-mix(in srgb, var(--usage-accent) 28%, transparent)}.Yak0lq_statPositive{border-color:color-mix(in srgb, var(--dsw-alias-fill-positive,#18a957) 26%, transparent)}.Yak0lq_statDanger{background:color-mix(in srgb, var(--dsw-alias-fill-danger,#f04452) 5%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-fill-danger,#f04452) 34%, transparent)}.Yak0lq_statLabelRow{align-items:center;gap:7px;display:flex}.Yak0lq_statIcon{border:1px solid color-mix(in srgb, currentColor 18%, transparent);box-sizing:border-box;color:var(--dsw-alias-label-tertiary,inherit);border-radius:50%;justify-content:center;align-items:center;width:15px;height:15px;font-size:9px;line-height:1;display:inline-flex}.Yak0lq_statAccent .Yak0lq_statIcon,.Yak0lq_statAccent .Yak0lq_statValue{color:var(--usage-accent-strong)}.Yak0lq_statPositive .Yak0lq_statIcon,.Yak0lq_statPositive .Yak0lq_statValue{color:var(--dsw-alias-label-positive,var(--dsw-alias-fill-positive,#18a957))}.Yak0lq_statDanger .Yak0lq_statIcon,.Yak0lq_statDanger .Yak0lq_statValue{color:var(--dsw-alias-label-danger,var(--dsw-alias-fill-danger,#f04452))}.Yak0lq_statLabel{color:var(--dsw-alias-label-tertiary,inherit);font-size:12px}.Yak0lq_statValue{color:var(--dsw-alias-label-primary,inherit);font-variant-numeric:tabular-nums;font-size:21px;font-weight:600}.Yak0lq_statHint{color:var(--dsw-alias-label-tertiary,inherit);min-height:14px;font-size:11px}.Yak0lq_cacheBar{background:color-mix(in srgb, currentColor 7%, transparent);border-radius:999px;width:100%;height:9px;margin-top:12px;display:flex;overflow:hidden}.Yak0lq_cacheBarEmpty{background:var(--dsw-alias-fill-subtle,transparent);border-radius:4px;width:100%;height:100%}.Yak0lq_cacheBarHit{background:linear-gradient(90deg, var(--usage-accent), var(--usage-accent-strong));height:100%}.Yak0lq_cacheBarMiss{background:var(--dsw-alias-fill-neutral,var(--dsw-alias-fill-strong,#ccc));height:100%}.Yak0lq_twoCol{grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;display:grid}.Yak0lq_estimateCard,.Yak0lq_balanceCard,.Yak0lq_trendCard{backdrop-filter:blur(12px);background:color-mix(in srgb, var(--dsw-alias-fill-subtle,currentColor) 5%, transparent);border:1px solid color-mix(in srgb, currentColor 10%, transparent);box-shadow:0 8px 26px color-mix(in srgb, currentColor 4%, transparent);border-radius:16px;flex-direction:column;gap:8px;padding:19px 20px;display:flex;position:relative}.Yak0lq_estimateCard:before,.Yak0lq_balanceCard:before{background:var(--usage-accent);content:\"\";opacity:.8;border-radius:999px;width:3px;height:28px;position:absolute;top:20px;left:0}.Yak0lq_estimateValue,.Yak0lq_balanceValue{color:var(--usage-accent-strong);font-variant-numeric:tabular-nums;font-size:24px;font-weight:600}.Yak0lq_estimateNote,.Yak0lq_estimateMeta{color:var(--dsw-alias-label-tertiary,inherit);font-size:11px}.Yak0lq_estimateProvenance{color:var(--dsw-alias-label-secondary,inherit);font-size:12px;font-weight:500}.Yak0lq_estimateBand,.Yak0lq_estimateRates{color:var(--dsw-alias-label-tertiary,inherit);font-variant-numeric:tabular-nums;font-size:11px}.Yak0lq_bandBadge{border:1px solid #0000;border-radius:999px;align-self:flex-start;align-items:center;gap:7px;padding:4px 11px;font-size:11px;font-weight:600;line-height:1;display:inline-flex}.Yak0lq_bandBadge:before{content:\"\";border-radius:50%;width:7px;height:7px}.Yak0lq_bandOffPeak{background:color-mix(in srgb, var(--dsw-alias-fill-positive,#18a957) 12%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-fill-positive,#18a957) 36%, transparent);color:var(--dsw-alias-label-positive,var(--dsw-alias-fill-positive,#18a957))}.Yak0lq_bandOffPeak:before{background:var(--dsw-alias-fill-positive,#18a957);box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-fill-positive,#18a957) 18%, transparent)}.Yak0lq_bandPeak{background:color-mix(in srgb, var(--dsw-alias-fill-warning,#f5a623) 12%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-fill-warning,#f5a623) 38%, transparent);color:var(--dsw-alias-label-warning,#b47d1f)}.Yak0lq_bandPeak:before{background:var(--dsw-alias-fill-warning,#f5a623);box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-fill-warning,#f5a623) 20%, transparent)}.Yak0lq_bandNeutral{background:color-mix(in srgb, currentColor 6%, transparent);border-color:color-mix(in srgb, currentColor 14%, transparent);color:var(--dsw-alias-label-secondary,inherit)}.Yak0lq_bandNeutral:before{box-shadow:0 0 0 3px color-mix(in srgb, currentColor 14%, transparent);background:currentColor}.Yak0lq_bandBreakdown{border-top:1px solid color-mix(in srgb, currentColor 8%, transparent);flex-direction:column;gap:4px;margin-top:4px;padding-top:8px;display:flex}.Yak0lq_bandBreakdownLabel{color:var(--dsw-alias-label-tertiary,inherit);font-size:10px;font-weight:600}.Yak0lq_bandBreakdownRow{color:var(--dsw-alias-label-secondary,inherit);font-variant-numeric:tabular-nums;font-size:11px}.Yak0lq_bandBreakdownRowZero{opacity:.55}.Yak0lq_estimateUnpriced{color:var(--dsw-alias-label-warning,inherit);font-size:11px}.Yak0lq_balanceState{color:var(--dsw-alias-label-warning,inherit);margin:0;font-size:12px}.Yak0lq_balanceRows{flex-direction:column;gap:4px;margin:4px 0 0;display:flex}.Yak0lq_balanceRow{justify-content:space-between;font-size:12px;display:flex}.Yak0lq_balanceRow dt{color:var(--dsw-alias-label-tertiary,inherit);margin:0}.Yak0lq_balanceRow dd{color:var(--dsw-alias-label-primary,inherit);font-variant-numeric:tabular-nums;margin:0}.Yak0lq_trendCard{background:linear-gradient(155deg, color-mix(in srgb, var(--usage-accent) 7%, transparent), color-mix(in srgb, currentColor 2%, transparent) 60%, color-mix(in srgb, var(--usage-accent-strong) 3%, transparent));border-color:color-mix(in srgb, var(--usage-accent) 18%, transparent);padding:16px 20px 12px;overflow:hidden}.Yak0lq_trend{color:var(--dsw-alias-label-tertiary,currentColor);position:relative}.Yak0lq_trendChartHeader{justify-content:space-between;align-items:center;gap:14px;min-height:24px;display:flex}.Yak0lq_trendChartTitle{color:var(--dsw-alias-label-secondary,inherit);font-size:12px;font-weight:500}.Yak0lq_trendLegend{color:var(--dsw-alias-label-tertiary,inherit);align-items:center;gap:14px;font-size:10px;display:flex}.Yak0lq_trendLegend span{align-items:center;gap:5px;display:inline-flex}.Yak0lq_trendLegend i{border-radius:50%;width:7px;height:7px;display:inline-block}.Yak0lq_legendTotal{background:var(--usage-accent-strong)}.Yak0lq_legendAverage{background:color-mix(in srgb, currentColor 42%, transparent)}.Yak0lq_trendSummary{border-top:1px solid color-mix(in srgb, currentColor 8%, transparent);justify-content:flex-end;align-items:center;gap:18px;min-height:20px;padding:10px 2px 0;display:flex}.Yak0lq_trendSummary span{color:var(--dsw-alias-label-secondary,inherit);font-variant-numeric:tabular-nums;font-size:11px}.Yak0lq_trendSummary strong{color:var(--dsw-alias-label-primary,inherit);margin-left:4px;font-size:13px}.Yak0lq_trendSvg{width:100%;height:190px;margin-top:5px;display:block;overflow:visible}.Yak0lq_trendGrid line{stroke:currentColor;stroke-dasharray:3 5;stroke-opacity:.16;stroke-width:1px;vector-effect:non-scaling-stroke}.Yak0lq_trendAverageLine{stroke:currentColor;stroke-dasharray:5 5;stroke-opacity:.36;stroke-width:1.25px;vector-effect:non-scaling-stroke}.Yak0lq_trendGrid text,.Yak0lq_trendDate,.Yak0lq_trendPointValue{fill:currentColor;font-variant-numeric:tabular-nums;font-family:inherit;font-size:9px}.Yak0lq_trendDate,.Yak0lq_trendPointValue{dominant-baseline:middle;text-align:center;text-anchor:middle}.Yak0lq_trendPointValue{fill:var(--dsw-alias-label-primary,currentColor);font-size:10px;font-weight:600}.Yak0lq_trendArea{fill:var(--usage-accent);opacity:.16}.Yak0lq_trendLine{fill:none;filter:drop-shadow(0 2px 3px color-mix(in srgb, var(--usage-accent) 28%, transparent));stroke:var(--usage-accent-strong);stroke-linecap:round;stroke-linejoin:round;stroke-width:2.5px;vector-effect:non-scaling-stroke}.Yak0lq_trendPoint circle,.Yak0lq_trendPointLatest circle{fill:var(--dsw-alias-fill-subtle,#fff);stroke:var(--usage-accent-strong);stroke-width:2px;vector-effect:non-scaling-stroke}.Yak0lq_trendPointLatest circle{fill:var(--usage-accent-strong);filter:drop-shadow(0 2px 5px color-mix(in srgb, var(--usage-accent) 40%, transparent))}.Yak0lq_trendMeters{clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;width:1px;height:1px;margin:-1px;position:absolute;overflow:hidden}@media (width<=640px){.Yak0lq_trendCard{padding-inline:10px}.Yak0lq_trendSvg{height:168px}.Yak0lq_trendSummary{gap:10px}}.Yak0lq_footer{background:color-mix(in srgb, currentColor 2%, transparent);border:1px solid color-mix(in srgb, currentColor 7%, transparent);color:var(--dsw-alias-label-tertiary,inherit);border-radius:10px;flex-direction:column;gap:4px;padding:10px 12px;font-size:11px;display:flex}@media (prefers-reduced-motion:reduce){.Yak0lq_refresh,.Yak0lq_statCard{transition:none}}@media (width<=820px){.Yak0lq_grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (width<=480px){.Yak0lq_grid{grid-template-columns:1fr}.Yak0lq_header{align-items:flex-start}}";
		const tagId$1 = "@linxin666/dsh-deepseek-usage-dashboard/dashboard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-deepseek-usage-dashboard";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var dashboard_module_css_default = {
			"balanceCard": "Yak0lq_balanceCard",
			"balanceRow": "Yak0lq_balanceRow",
			"balanceRows": "Yak0lq_balanceRows",
			"balanceState": "Yak0lq_balanceState",
			"balanceValue": "Yak0lq_balanceValue",
			"bandBadge": "Yak0lq_bandBadge",
			"bandBreakdown": "Yak0lq_bandBreakdown",
			"bandBreakdownLabel": "Yak0lq_bandBreakdownLabel",
			"bandBreakdownRow": "Yak0lq_bandBreakdownRow",
			"bandBreakdownRowZero": "Yak0lq_bandBreakdownRowZero",
			"bandNeutral": "Yak0lq_bandNeutral",
			"bandOffPeak": "Yak0lq_bandOffPeak",
			"bandPeak": "Yak0lq_bandPeak",
			"cacheBar": "Yak0lq_cacheBar",
			"cacheBarEmpty": "Yak0lq_cacheBarEmpty",
			"cacheBarHit": "Yak0lq_cacheBarHit",
			"cacheBarMiss": "Yak0lq_cacheBarMiss",
			"empty": "Yak0lq_empty",
			"estimateBand": "Yak0lq_estimateBand",
			"estimateCard": "Yak0lq_estimateCard",
			"estimateMeta": "Yak0lq_estimateMeta",
			"estimateNote": "Yak0lq_estimateNote",
			"estimateProvenance": "Yak0lq_estimateProvenance",
			"estimateRates": "Yak0lq_estimateRates",
			"estimateUnpriced": "Yak0lq_estimateUnpriced",
			"estimateValue": "Yak0lq_estimateValue",
			"footer": "Yak0lq_footer",
			"grid": "Yak0lq_grid",
			"header": "Yak0lq_header",
			"headerActions": "Yak0lq_headerActions",
			"legendAverage": "Yak0lq_legendAverage",
			"legendTotal": "Yak0lq_legendTotal",
			"notice": "Yak0lq_notice",
			"noticeMuted": "Yak0lq_noticeMuted",
			"page": "Yak0lq_page",
			"refresh": "Yak0lq_refresh",
			"sectionTitle": "Yak0lq_sectionTitle",
			"statAccent": "Yak0lq_statAccent",
			"statCard": "Yak0lq_statCard",
			"statDanger": "Yak0lq_statDanger",
			"statHint": "Yak0lq_statHint",
			"statIcon": "Yak0lq_statIcon",
			"statLabel": "Yak0lq_statLabel",
			"statLabelRow": "Yak0lq_statLabelRow",
			"statPositive": "Yak0lq_statPositive",
			"statValue": "Yak0lq_statValue",
			"title": "Yak0lq_title",
			"trend": "Yak0lq_trend",
			"trendArea": "Yak0lq_trendArea",
			"trendAverageLine": "Yak0lq_trendAverageLine",
			"trendCard": "Yak0lq_trendCard",
			"trendChartHeader": "Yak0lq_trendChartHeader",
			"trendChartTitle": "Yak0lq_trendChartTitle",
			"trendDate": "Yak0lq_trendDate",
			"trendGrid": "Yak0lq_trendGrid",
			"trendLegend": "Yak0lq_trendLegend",
			"trendLine": "Yak0lq_trendLine",
			"trendMeters": "Yak0lq_trendMeters",
			"trendPoint": "Yak0lq_trendPoint",
			"trendPointLatest": "Yak0lq_trendPointLatest",
			"trendPointValue": "Yak0lq_trendPointValue",
			"trendSummary": "Yak0lq_trendSummary",
			"trendSvg": "Yak0lq_trendSvg",
			"twoCol": "Yak0lq_twoCol",
			"updated": "Yak0lq_updated"
		};
		//#endregion
		//#region src/client/panel/UsageDashboard.tsx
		/**
		* The API usage dashboard panel: today's token cards, cache hit/miss
		* comparison, output, hit rate, estimated cost, balance, 7-day trend, and
		* the data-source footer. Rendered inside a plain React root (family
		* pattern), so locale comes from the document language, and every color
		* comes from DSH CSS tokens.
		*/
		/** Format an epoch-ms timestamp for display. */
		function formatTime(epochMs) {
			return new Date(epochMs).toLocaleString();
		}
		/** Format a currency amount string with a currency prefix. */
		function formatAmount(total, currency) {
			return `${currency === "CNY" ? "¥" : `${currency} `}${total}`;
		}
		/** Render a micro-unit string as a 6-decimal amount ("812891" → "0.812891"). */
		function microDecimal(micro) {
			const negative = micro.startsWith("-");
			const padded = (negative ? micro.slice(1) : micro).padStart(7, "0");
			const whole = padded.slice(0, -6);
			const fraction = padded.slice(-6);
			return `${negative ? "-" : ""}${whole}.${fraction}`;
		}
		/** One per-million rate with the currency prefix ("¥0.05/1M", two decimals). */
		function rateText(currency, rate) {
			return `${currency === "CNY" ? "¥" : `${currency} `}${rate.toFixed(2)}/1M`;
		}
		/** The user-facing band label for a resolved band id. */
		function bandLabel(t, bandId) {
			if (bandId === "off-peak") return t("panel.currentBandOffPeak");
			if (bandId === "peak") return t("panel.currentBandPeak");
			if (bandId === "all-day") return t("panel.currentBandAllDay");
			return bandId;
		}
		/** The display name of a schedule (the official one reads as a product name). */
		function scheduleName(scheduleId) {
			return scheduleId === "deepseek-2026-08-17" ? "DeepSeek 2026-08-17" : scheduleId;
		}
		/** A labeled stat card with a compact, semantic visual treatment. */
		function StatCard(props) {
			const toneClass = props.tone === "accent" ? dashboard_module_css_default.statAccent : props.tone === "positive" ? dashboard_module_css_default.statPositive : props.tone === "danger" ? dashboard_module_css_default.statDanger : "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${dashboard_module_css_default.statCard} ${toneClass}`.trim(),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: dashboard_module_css_default.statLabelRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: dashboard_module_css_default.statIcon,
							"aria-hidden": "true",
							children: props.icon
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: dashboard_module_css_default.statLabel,
							children: props.label
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: dashboard_module_css_default.statValue,
						children: props.value
					}),
					props.hint !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: dashboard_module_css_default.statHint,
						children: props.hint
					}) : null
				]
			});
		}
		/** The cache hit/miss proportion bar. */
		function CacheBar(props) {
			const total = props.hit + props.miss;
			if (total === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: dashboard_module_css_default.cacheBar,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: dashboard_module_css_default.cacheBarEmpty })
			});
			const hitPercent = props.hit / total * 100;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: dashboard_module_css_default.cacheBar,
				role: "img",
				"aria-label": `hit ${props.hit} / miss ${props.miss}`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: dashboard_module_css_default.cacheBarHit,
					style: { width: `${hitPercent}%` }
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: dashboard_module_css_default.cacheBarMiss,
					style: { width: `${100 - hitPercent}%` }
				})]
			});
		}
		const TREND_WIDTH = 720;
		const TREND_HEIGHT = 178;
		const TREND_LEFT = 58;
		const TREND_RIGHT = 704;
		const TREND_TOP = 20;
		const TREND_BOTTOM = 138;
		/** The 7-day trend as a responsive line and area chart. */
		function TrendChart(props) {
			const max = Math.max(0, ...props.data.map((day) => day.totalTokens));
			const total = props.data.reduce((sum, day) => sum + day.totalTokens, 0);
			const divisor = props.data.length === 0 ? 1 : props.data.length;
			const average = Math.round(total / divisor);
			const averageY = max === 0 ? TREND_BOTTOM : TREND_BOTTOM - 118 * average / max;
			const points = props.data.map((day, index) => {
				const x = props.data.length <= 1 ? 381 : TREND_LEFT + 646 * index / (props.data.length - 1);
				const y = max === 0 ? TREND_BOTTOM : TREND_BOTTOM - 118 * day.totalTokens / max;
				return {
					...day,
					x,
					y
				};
			});
			const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
			const areaPath = points.length === 0 ? "" : `M ${points[0]?.x},${TREND_BOTTOM} L ${linePoints.replaceAll(" ", " L ")} L ${points.at(-1)?.x},${TREND_BOTTOM} Z`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: dashboard_module_css_default.trend,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: dashboard_module_css_default.trendChartHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							className: dashboard_module_css_default.trendChartTitle,
							children: tt("panel.trendChartTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: dashboard_module_css_default.trendLegend,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { className: dashboard_module_css_default.legendTotal }), tt("panel.trendTotalLegend")] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { className: dashboard_module_css_default.legendAverage }), tt("panel.trendAverage")] })]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
						className: dashboard_module_css_default.trendSvg,
						viewBox: `0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`,
						role: "img",
						"aria-label": "7-day token usage",
						preserveAspectRatio: "none",
						children: [
							[
								TREND_TOP,
								79,
								TREND_BOTTOM
							].map((y, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
								className: dashboard_module_css_default.trendGrid,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
									x1: TREND_LEFT,
									x2: TREND_RIGHT,
									y1: y,
									y2: y
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
									x: "4",
									y: y + 4,
									children: index === 0 ? formatCompactCount(max) : index === 1 ? formatCompactCount(Math.round(max / 2)) : "0"
								})]
							}, y)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
								className: dashboard_module_css_default.trendAverageLine,
								x1: TREND_LEFT,
								x2: TREND_RIGHT,
								y1: averageY,
								y2: averageY
							}),
							areaPath !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
								className: dashboard_module_css_default.trendArea,
								d: areaPath
							}) : null,
							linePoints !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("polyline", {
								className: dashboard_module_css_default.trendLine,
								points: linePoints
							}) : null,
							points.map((point, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
								className: index === points.length - 1 ? dashboard_module_css_default.trendPointLatest : dashboard_module_css_default.trendPoint,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
										cx: point.x,
										cy: point.y,
										r: point.totalTokens === 0 ? 3 : 5,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("title", { children: `${point.date}: ${formatCount(point.totalTokens)}` })
									}),
									point.totalTokens > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
										className: dashboard_module_css_default.trendPointValue,
										x: point.x,
										y: Math.max(14, point.y - 10),
										children: formatCompactCount(point.totalTokens)
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
										className: dashboard_module_css_default.trendDate,
										x: point.x,
										y: "168",
										children: point.date.slice(5)
									})
								]
							}, point.date))
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: dashboard_module_css_default.trendSummary,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							tt("panel.trendTotal"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: formatCompactCount(total) })
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							tt("panel.trendAverage"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: formatCompactCount(average) })
						] })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: dashboard_module_css_default.trendMeters,
						"aria-hidden": "false",
						children: props.data.map((day) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							role: "meter",
							"aria-label": `${day.date}: ${formatCount(day.totalTokens)}`,
							"aria-valuemin": 0,
							"aria-valuemax": max,
							"aria-valuenow": day.totalTokens
						}, day.date))
					})
				]
			});
		}
		/** Compact chart labels that stay readable from units through millions. */
		function formatCompactCount(value) {
			if (value < 1e3) return String(value);
			if (value < 1e6) return `${trimDecimal(value / 1e3)}K`;
			if (value < 1e9) return `${trimDecimal(value / 1e6)}M`;
			return `${trimDecimal(value / 1e9)}B`;
		}
		/** One decimal when useful, with trailing .0 removed. */
		function trimDecimal(value) {
			return value.toFixed(1).replace(/\.0$/, "");
		}
		/** The balance detail block (non-null balance, narrowed once). */
		function BalanceDetail(props) {
			const { balance, stale, t } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				stale ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: dashboard_module_css_default.balanceState,
					children: t("panel.balanceStale")
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: dashboard_module_css_default.balanceValue,
					children: balance.infos.length > 0 ? formatAmount(balance.infos[0].totalBalance, balance.infos[0].currency) : "--"
				}),
				balance.infos.map((info) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
					className: dashboard_module_css_default.balanceRows,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: dashboard_module_css_default.balanceRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("panel.granted") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatAmount(info.grantedBalance, info.currency) })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: dashboard_module_css_default.balanceRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("panel.toppedUp") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatAmount(info.toppedUpBalance, info.currency) })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: dashboard_module_css_default.balanceRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("panel.totalBalance") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatAmount(info.totalBalance, info.currency) })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: dashboard_module_css_default.balanceRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("panel.available") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: balance.isAvailable ? "yes" : "no" })]
						})
					]
				}, info.currency))
			] });
		}
		/**
		* The estimated-cost card: amount, current-band badge (off-peak / peak),
		* pricing provenance (official schedule + timezone; internal version moves
		* to a tooltip), the current period and current rates, the peak/off-peak
		* cost split, and the unpriced marker.
		*/
		function EstimateCard(props) {
			const { data, t } = props;
			const prices = data.prices;
			const estimate = data.estimatedCost;
			const schedules = prices.schedules ?? [];
			const bandCosts = estimate.bandCosts ?? [];
			const scheduleIdsUsed = estimate.scheduleIdsUsed ?? [];
			const band = prices.currentBand ?? null;
			const metaTitle = `${t("panel.priceVersion")} ${prices.version}${prices.updatedAt !== null ? ` · ${t("panel.priceUpdated")}: ${new Date(prices.updatedAt).toLocaleString()}` : ""}`;
			const activeSchedule = schedules.find((schedule) => schedule.id === (band?.scheduleId ?? scheduleIdsUsed[0] ?? schedules[0]?.id));
			let badge = null;
			if (band !== null) {
				const schedule = schedules.find((item) => item.id === band.scheduleId);
				const peakList = (schedule?.windows ?? []).filter((window) => (window.bandId ?? window.id) === "peak").map((window) => `${window.start}–${window.end}`).join("、");
				const offPeakList = (schedule?.offPeakSpans ?? []).map((span) => `${span.start}–${span.end}`).join("、");
				const tooltip = peakList !== "" || offPeakList !== "" ? t("panel.windowsTooltip", {
					peak: peakList,
					offpeak: offPeakList
				}) : "";
				badge = {
					bandId: band.bandId,
					label: bandLabel(t, band.bandId),
					tone: band.bandId === "off-peak" ? "off" : band.bandId === "peak" ? "peak" : "neutral",
					title: tooltip
				};
			}
			const currentWindow = band?.window !== void 0 && band?.window !== null ? t("panel.currentWindow", { span: `${band.window.start}–${band.window.end}` }) : null;
			let currentRates = null;
			if (band !== null && activeSchedule !== void 0) {
				const model = activeSchedule.models.find((item) => item.model === "deepseek-v4-flash") ?? activeSchedule.models[0];
				const rates = model?.ratesByBand[band.bandId];
				if (model !== void 0 && rates !== void 0) currentRates = t("panel.currentRates", {
					model: model.model,
					hit: rateText(estimate.currency, rates.cacheHitInputPricePerMillion),
					miss: rateText(estimate.currency, rates.cacheMissInputPricePerMillion),
					out: rateText(estimate.currency, rates.outputPricePerMillion)
				});
			}
			const offPeakHalf = band?.bandId === "off-peak" && band?.scheduleId === "deepseek-2026-08-17";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: dashboard_module_css_default.estimateCard,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: dashboard_module_css_default.estimateValue,
						children: formatAmount(estimate.total, estimate.currency)
					}),
					badge !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: `${dashboard_module_css_default.bandBadge} ${badge.tone === "off" ? dashboard_module_css_default.bandOffPeak : badge.tone === "peak" ? dashboard_module_css_default.bandPeak : dashboard_module_css_default.bandNeutral}`.trim(),
						role: "status",
						"data-band": badge.bandId,
						title: badge.title,
						children: badge.label
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: dashboard_module_css_default.estimateProvenance,
						title: metaTitle,
						children: pricingProvenance(data, t)
					}),
					scheduleIdsUsed.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: dashboard_module_css_default.estimateBand,
						children: t("panel.pricingMultiple")
					}) : null,
					currentWindow !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: dashboard_module_css_default.estimateBand,
						"data-window": "current",
						children: currentWindow
					}) : null,
					currentRates !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: dashboard_module_css_default.estimateRates,
						children: currentRates
					}) : null,
					offPeakHalf ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: dashboard_module_css_default.estimateNote,
						role: "status",
						children: t("panel.offPeakHalfNote")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: dashboard_module_css_default.estimateNote,
						children: t("panel.estimateNote")
					}),
					estimate.unpricedRequestCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: dashboard_module_css_default.estimateUnpriced,
						role: "status",
						children: [
							t("panel.unpriced"),
							" · ",
							t("panel.unpricedDetail", { count: estimate.unpricedRequestCount })
						]
					}) : null,
					bandCosts.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: dashboard_module_css_default.bandBreakdown,
						"aria-label": t("panel.bandBreakdownLabel"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: dashboard_module_css_default.bandBreakdownLabel,
							children: t("panel.bandBreakdownLabel")
						}), bandCosts.map((share) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: share.requestCount === 0 ? `${dashboard_module_css_default.bandBreakdownRow} ${dashboard_module_css_default.bandBreakdownRowZero}` : dashboard_module_css_default.bandBreakdownRow,
							"data-band": share.bandId,
							title: t("panel.bandCostTokens", {
								hit: formatCount(share.cacheHitInputTokens),
								miss: formatCount(share.cacheMissInputTokens),
								out: formatCount(share.outputTokens)
							}),
							children: t("panel.bandCostRow", {
								band: bandLabel(t, share.bandId),
								cost: formatAmount(microDecimal(share.totalMicro), estimate.currency),
								count: formatCount(share.requestCount)
							})
						}, share.bandId))]
					}) : null
				]
			});
		}
		/** The pricing provenance line under the estimate (schedule aware). */
		function pricingProvenance(data, t) {
			const estimate = data.estimatedCost;
			if (data.prices.mode === "legacy") return t("panel.pricingModeLegacy", { date: data.prices.entries[0]?.effectiveFrom ?? "--" });
			const scheduleIdsUsed = estimate.scheduleIdsUsed ?? [];
			const scheduleId = data.prices.currentBand?.scheduleId ?? scheduleIdsUsed[0] ?? (data.prices.schedules ?? [])[0]?.id;
			const schedule = (data.prices.schedules ?? []).find((item) => item.id === scheduleId);
			const name = schedule === void 0 ? "--" : scheduleName(schedule.id);
			const timezone = data.prices.currentBand?.timezone ?? data.prices.timezone ?? "Asia/Shanghai";
			return t("panel.pricingNow", {
				name,
				timezone: timezone === "Asia/Shanghai" ? t("panel.timezoneBeijing", { tz: timezone }) : timezone
			});
		}
		/**
		* Render the usage dashboard.
		* @param props - panel controller and the shared stats store.
		*/
		function UsageDashboard({ store }) {
			const snapshot = (0, react.useSyncExternalStore)((listener) => store.subscribe(listener), () => store.getSnapshot());
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DashboardView, {
				snapshot,
				onRefresh: () => {
					store.refresh();
				}
			});
		}
		/** Pure view over one store snapshot (also used by tests). */
		function DashboardView(props) {
			const { snapshot, onRefresh } = props;
			const data = snapshot.data;
			const t = tt;
			const totalInput = data === null ? 0 : data.daily.cacheHitInputTokens + data.daily.cacheMissInputTokens;
			const cacheHitShare = data === null || totalInput === 0 ? null : data.daily.cacheHitInputTokens / totalInput;
			const cacheMissShare = data === null || totalInput === 0 ? null : data.daily.cacheMissInputTokens / totalInput;
			const failureRate = data === null || data.daily.requestCount === 0 ? 0 : data.daily.failedRequestCount / data.daily.requestCount;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: dashboard_module_css_default.page,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: dashboard_module_css_default.header,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
						className: dashboard_module_css_default.title,
						children: t("panel.title")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: dashboard_module_css_default.headerActions,
						children: [data !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: dashboard_module_css_default.updated,
							children: [
								t("panel.lastUpdated"),
								": ",
								formatTime(data.meta.updatedAt)
							]
						}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: dashboard_module_css_default.refresh,
							disabled: snapshot.refreshing,
							onClick: onRefresh,
							children: t(snapshot.refreshing ? "panel.refreshing" : "panel.refresh")
						})]
					})]
				}), data === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
					className: dashboard_module_css_default.empty,
					role: "status",
					children: snapshot.error !== null ? snapshot.error : "…"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					!data.meta.endpointMatching ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: dashboard_module_css_default.notice,
						role: "status",
						children: t("panel.endpointFiltered", { baseUrl: data.meta.endpointBaseUrl })
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: dashboard_module_css_default.noticeMuted,
						children: t("panel.endpointOk", {
							baseUrl: data.meta.endpointBaseUrl,
							provider: data.meta.providerId
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						"aria-label": t("panel.today"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								className: dashboard_module_css_default.sectionTitle,
								children: t("panel.today")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: dashboard_module_css_default.grid,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCard, {
										label: t("panel.cacheHit"),
										value: formatCount(data.daily.cacheHitInputTokens),
										hint: t("panel.inputShare", { percent: cacheHitShare === null ? "--" : `${(cacheHitShare * 100).toFixed(1)}%` }),
										icon: "⊙",
										tone: "accent"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCard, {
										label: t("panel.cacheMiss"),
										value: formatCount(data.daily.cacheMissInputTokens),
										hint: t("panel.inputShare", { percent: cacheMissShare === null ? "--" : `${(cacheMissShare * 100).toFixed(1)}%` }),
										icon: "⊖"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCard, {
										label: t("panel.output"),
										value: formatCount(data.daily.outputTokens),
										hint: t("panel.tokensUnit"),
										icon: "↗"
									}),
									data.daily.reasoningTokens > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCard, {
										label: t("panel.reasoning"),
										value: formatCount(data.daily.reasoningTokens),
										hint: t("panel.tokensUnit"),
										icon: "◷"
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCard, {
										label: t("panel.hitRate"),
										value: data.daily.cacheHitRate === null ? "--" : `${(data.daily.cacheHitRate * 100).toFixed(1)}%`,
										hint: data.daily.cacheHitRate !== null && data.daily.cacheHitRate >= .9 ? t("panel.excellent") : void 0,
										icon: "✓",
										tone: "positive"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCard, {
										label: t("panel.requestCount"),
										value: formatCount(data.daily.requestCount),
										hint: t("panel.timesUnit"),
										icon: "#"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCard, {
										label: t("panel.failedRequests"),
										value: formatCount(data.daily.failedRequestCount),
										hint: t("panel.failureRate", { rate: `${(failureRate * 100).toFixed(2)}%` }),
										icon: "!",
										tone: data.daily.failedRequestCount > 0 ? "danger" : "positive"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCard, {
										label: t("panel.totalTokens"),
										value: formatCount(data.daily.totalTokens),
										hint: t("panel.totalInput") + ` ${formatCount(data.daily.totalInputTokens)}`,
										icon: "∑",
										tone: "accent"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CacheBar, {
								hit: data.daily.cacheHitInputTokens,
								miss: data.daily.cacheMissInputTokens
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: dashboard_module_css_default.twoCol,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							"aria-label": t("panel.estimateLabel"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								className: dashboard_module_css_default.sectionTitle,
								children: t("panel.estimateLabel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EstimateCard, {
								data,
								t
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							"aria-label": t("panel.balance"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								className: dashboard_module_css_default.sectionTitle,
								children: t("panel.balance")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: dashboard_module_css_default.balanceCard,
								children: data.balance === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: dashboard_module_css_default.balanceState,
									children: data.balanceState.state === "unconfigured" ? t("panel.balanceUnavailable") : t("panel.balanceStale")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BalanceDetail, {
									balance: data.balance,
									stale: data.balanceState.state === "stale",
									t
								})
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						"aria-label": t("panel.trend"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: dashboard_module_css_default.sectionTitle,
							children: t("panel.trend")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: dashboard_module_css_default.trendCard,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrendChart, { data: data.trend.map((day) => ({
								date: day.date,
								totalTokens: day.totalTokens
							})) })
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
						className: dashboard_module_css_default.footer,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							t("panel.dataSource"),
							": ",
							data.meta.dataSource
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							t("panel.lastUpdated"),
							": ",
							formatTime(data.meta.updatedAt)
						] })]
					})
				] })]
			});
		}
		//#endregion
		//#region src/client/mount.tsx
		/**
		* Panel view mounting.
		*
		* The `conversation` slot is single-occupant (ui-conversation) and external
		* plugins cannot declare slots, so the panel takes over the center column at
		* the DOM level: a container is appended inside the `[data-pane="conversation"]`
		* grid item (an extra trailing child React never manages), and a stylesheet
		* rule hides the conversation content while the panel is active. Toggling is
		* a data attribute on <html> — no React involvement, so the conversation
		* subtree underneath stays mounted and stateful. (Family pattern: dsh-ssh.)
		*/
		const CONVERSATION_COLUMN_SELECTOR = "[data-pane=\"conversation\"]";
		const ACTIVE_ATTR = "data-dsh-usage-active";
		/** The sibling panels' activation attributes, removed when this panel opens. */
		const OTHER_ACTIVE_ATTRS = ["data-dsh-taskboard-active", "data-dsh-ssh-active"];
		/** Cross-plugin activation event; detail is the activating panel name. */
		const ACTIVATE_EVENT = "dsh-panel-activate";
		const PANEL_NAME = "usage";
		/** Find the center column, or undefined while the frame is not mounted. */
		function conversationColumn() {
			return document.querySelector(CONVERSATION_COLUMN_SELECTOR) ?? void 0;
		}
		/**
		* Mount the panel React tree into the center column and bind its visibility
		* to the controller's panelOpen state.
		* @param controller - the panel controller driving the view.
		* @param store - the shared stats store.
		* @returns disposer unmounting the tree and restoring the column.
		*/
		function mountPanel(controller, store) {
			let root;
			let container;
			const ensure = () => {
				if (container !== void 0) {
					if (container.isConnected) return;
					root?.unmount();
					root = void 0;
					container.remove();
					container = void 0;
				}
				const column = conversationColumn();
				if (column === void 0) return;
				container = document.createElement("div");
				container.dataset.dshUsageView = "";
				container.className = panel_module_css_default.view;
				column.appendChild(container);
				root = (0, react_dom_client.createRoot)(container);
				root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageDashboard, {
					controller,
					store
				}));
			};
			const waitObserver = new MutationObserver(() => {
				ensure();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const applyActive = () => {
				if (controller.getSnapshot().panelOpen) {
					for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr);
					document.documentElement.setAttribute(ACTIVE_ATTR, "");
					document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }));
				} else document.documentElement.removeAttribute(ACTIVE_ATTR);
			};
			const onOtherActivate = (event) => {
				const detail = event.detail;
				if ((detail === "taskboard" || detail === "ssh") && controller.getSnapshot().panelOpen) controller.close();
			};
			const SIDEBAR_ROW_SELECTOR = "[class*=\"sessionRow\"], [class*=\"projectRow\"], [class*=\"searchResultRow\"], [class*=\"searchResultWorkspace\"], [class*=\"newSession\"]";
			const onClickSidebarRow = (event) => {
				if (!controller.getSnapshot().panelOpen) return;
				const target = event.target;
				if (target === null) return;
				if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.close();
			};
			document.addEventListener("click", onClickSidebarRow, true);
			document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
			const unsubscribe = controller.subscribe(applyActive);
			applyActive();
			ensure();
			return () => {
				document.removeEventListener("click", onClickSidebarRow, true);
				document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
				waitObserver.disconnect();
				unsubscribe();
				document.documentElement.removeAttribute(ACTIVE_ATTR);
				root?.unmount();
				root = void 0;
				container?.remove();
				container = void 0;
			};
		}
		//#endregion
		//#region src/client/dock/DockLine.tsx
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
		/** The one-line style: DSH tokens only, mirrors the shipped stats line. */
		const STYLE = {
			boxSizing: "border-box",
			color: "var(--dsw-alias-label-tertiary)",
			fontSize: "12px",
			fontVariantNumeric: "tabular-nums",
			lineHeight: "20px",
			margin: "0 auto",
			maxWidth: "var(--dsh-chat-content-width)",
			overflow: "hidden",
			padding: "0 var(--dsh-composer-side-clearance)",
			textAlign: "center",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap",
			width: "100%"
		};
		/** Format one currency amount (CNY renders as ¥). */
		function amount(total, currency) {
			return `${currency === "CNY" ? "¥" : `${currency} `}${total}`;
		}
		/** The compact today line for the composer dock. */
		const DockLine = (0, react.memo)(function DockLine() {
			const store = usageStore();
			const data = (0, react.useSyncExternalStore)((listener) => store?.subscribe(listener) ?? (() => void 0), () => store?.getSnapshot() ?? {
				data: null,
				error: null,
				loading: false,
				refreshing: false
			}).data;
			if (data === null) return null;
			const daily = data.daily;
			const balance = data.balance;
			const balanceText = balance !== null && balance.infos.length > 0 ? amount(balance.infos[0].totalBalance, balance.infos[0].currency) : "--";
			const band = data.prices.currentBand ?? null;
			const bandText = band === null ? "" : band.bandId === "off-peak" ? tt("panel.currentBandOffPeak") : band.bandId === "peak" ? tt("panel.currentBandPeak") : band.bandId === "all-day" ? tt("panel.currentBandAllDay") : band.bandId;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: STYLE,
				title: tt("dock.todayTooltip"),
				children: [tt("dock.today", {
					hit: formatCount(daily.cacheHitInputTokens),
					miss: formatCount(daily.cacheMissInputTokens),
					out: formatCount(daily.outputTokens),
					cost: amount(data.estimatedCost.total, data.estimatedCost.currency),
					balance: balanceText
				}), bandText !== "" ? ` · ${bandText}` : null]
			});
		});
		/**
		* Composer-dock entry: adapts the session-scoped `conversation.composer.dock`
		* runtime share (the framework standard kit) to the today line.
		*/
		const DockLineEntry = (0, react.memo)(function DockLineEntry(_props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DockLine, {});
		});
		//#endregion
		//#region src/client/settings/usage-settings-form.ts
		/** Create a minimal snapshot store. */
		function createLocalSnapshotStore(initial) {
			let value = initial;
			const listeners = /* @__PURE__ */ new Set();
			return {
				getSnapshot: () => value,
				set: (next) => {
					value = next;
					for (const listener of listeners) listener();
				},
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				}
			};
		}
		/** Validate one draft price row ('' means "not yet edited"). */
		function priceRowValid(row) {
			if (row.model.trim() === "") return false;
			if (row.currency.trim() === "") return false;
			if (!/^\d{4}-\d{2}-\d{2}$/.test(row.effectiveFrom)) return false;
			for (const price of [
				row.cacheHitInputPricePerMillion,
				row.cacheMissInputPricePerMillion,
				row.outputPricePerMillion
			]) if (!Number.isFinite(price) || price < 0) return false;
			return true;
		}
		/** Structural equality over price rows. */
		function priceRowsEqual(a, b) {
			if (a.length !== b.length) return false;
			return a.every((row, index) => {
				const other = b[index];
				return row.model === other.model && row.cacheHitInputPricePerMillion === other.cacheHitInputPricePerMillion && row.cacheMissInputPricePerMillion === other.cacheMissInputPricePerMillion && row.outputPricePerMillion === other.outputPricePerMillion && row.currency === other.currency && row.effectiveFrom === other.effectiveFrom;
			});
		}
		/** The pristine default price rows (composition defaults). */
		function defaultPriceRows() {
			return [
				{
					model: "deepseek-v4-flash",
					cacheHitInputPricePerMillion: .02,
					cacheMissInputPricePerMillion: 1,
					outputPricePerMillion: 2,
					currency: "CNY",
					effectiveFrom: "2026-04-24"
				},
				{
					model: "deepseek-v4-pro",
					cacheHitInputPricePerMillion: .025,
					cacheMissInputPricePerMillion: 3,
					outputPricePerMillion: 6,
					currency: "CNY",
					effectiveFrom: "2026-04-24"
				},
				{
					model: "deepseek-chat",
					cacheHitInputPricePerMillion: .02,
					cacheMissInputPricePerMillion: 1,
					outputPricePerMillion: 2,
					currency: "CNY",
					effectiveFrom: "2026-04-24"
				},
				{
					model: "deepseek-reasoner",
					cacheHitInputPricePerMillion: .02,
					cacheMissInputPricePerMillion: 1,
					outputPricePerMillion: 2,
					currency: "CNY",
					effectiveFrom: "2026-04-24"
				},
				{
					model: "*",
					cacheHitInputPricePerMillion: .02,
					cacheMissInputPricePerMillion: 1,
					outputPricePerMillion: 2,
					currency: "CNY",
					effectiveFrom: "2026-04-24"
				}
			];
		}
		/**
		* Whether a persisted `prices` config is exactly the pristine default table
		* (model-keyed, order-insensitive) — i.e. the old settings system just
		* persisted its schema default and the user never customized pricing. The
		* host treats such a config as an implicit default and runs the built-in
		* time-aware schedules, so the settings card must report the same effective
		* mode instead of claiming "legacy custom pricing".
		*/
		function isDefaultPriceRows(rows) {
			const keyOf = (row) => JSON.stringify([
				row.model,
				row.cacheHitInputPricePerMillion,
				row.cacheMissInputPricePerMillion,
				row.outputPricePerMillion,
				row.currency,
				row.effectiveFrom
			]);
			const mapOf = (list) => {
				const map = /* @__PURE__ */ new Map();
				for (const row of list) {
					const key = keyOf(row);
					map.set(key, (map.get(key) ?? 0) + 1);
				}
				return map;
			};
			const a = mapOf(rows);
			const b = mapOf(defaultPriceRows());
			if (a.size !== b.size) return false;
			for (const [key, count] of a) if (b.get(key) !== count) return false;
			return true;
		}
		/** Stages one card's edits over one settings namespace and writes on save. */
		var UsageSettingsForm = class {
			scope;
			staged = /* @__PURE__ */ new Map();
			listeners = /* @__PURE__ */ new Set();
			saving = false;
			failed = false;
			/** @param scope - the bound settings scope for this card's namespace. */
			constructor(scope) {
				this.scope = scope;
				scope.subscribe(() => {
					this.publish();
				});
			}
			/** Publish a projection of this form, rebuilt on scope or draft changes. */
			bind() {
				const store = createLocalSnapshotStore(this.projection());
				this.listeners.add(() => {
					store.set(this.projection());
				});
				return store;
			}
			/** The actions the card's slot registration injects. */
			actions() {
				return {
					editEnabled: (text) => this.stageBoolean("enabled", text),
					editProviderId: (text) => this.stageText("providerId", text),
					editRefreshMinutes: (text) => this.stageNumber("balanceRefreshMinutes", text),
					editPrice: (index, patch) => this.editPrice(index, patch),
					addPriceRow: () => this.addPriceRow(),
					removePriceRow: (index) => this.removePriceRow(index),
					resetPrices: () => {
						this.staged.set("prices", { kind: "clear" });
						this.failed = false;
						this.publish();
					},
					save: () => {
						this.save();
					},
					discard: () => {
						if (this.staged.size === 0 && !this.failed) return;
						this.staged.clear();
						this.failed = false;
						this.publish();
					}
				};
			}
			projection() {
				const snapshot = this.scope.getSnapshot();
				const section = snapshot.value ?? {};
				const enabled = this.fieldText(snapshot, "enabled", (value) => typeof value === "boolean" ? String(value) : "");
				const providerId = this.fieldText(snapshot, "providerId", (value) => typeof value === "string" ? value : "");
				const refresh = this.fieldText(snapshot, "balanceRefreshMinutes", (value) => typeof value === "number" ? String(value) : "");
				const prices = this.draftPrices(snapshot, section);
				const overridden = this.userHas(snapshot, "prices");
				const schedules = Array.isArray(section.pricingSchedules) ? section.pricingSchedules : [];
				const customLegacy = Array.isArray(section.prices) && section.prices.length > 0 && !isDefaultPriceRows(section.prices);
				return {
					available: snapshot.status !== "loading",
					exposed: snapshot.status === "ready",
					writable: snapshot.writable,
					dirty: this.isDirty(snapshot),
					invalid: !prices.every(priceRowValid),
					saving: this.saving,
					failed: this.failed,
					enabled,
					providerId,
					balanceRefreshMinutes: refresh,
					pricingMode: schedules.length > 0 || !customLegacy ? "time-aware" : "legacy",
					pricingTimezone: schedules[0]?.timezone ?? "Asia/Shanghai",
					pricingBuiltinDefault: schedules.length === 0 && !customLegacy,
					pricingSchedules: schedules.map((schedule) => ({
						id: schedule.id,
						effectiveFrom: schedule.effectiveFrom,
						currency: schedule.currency ?? "CNY",
						windows: Array.isArray(schedule.windows) ? schedule.windows.map((window) => ({
							id: window.id,
							start: window.start,
							end: window.end,
							bandId: window.bandId
						})) : []
					})),
					prices,
					pricesOverridden: overridden
				};
			}
			/** Whether any staged edit actually differs from the effective section. */
			isDirty(snapshot) {
				if (this.staged.size === 0) return false;
				const section = snapshot.value ?? {};
				for (const [field, edit] of this.staged) {
					const current = section[field];
					if (edit.kind === "clear") {
						if (this.userHas(snapshot, field)) return true;
						continue;
					}
					if (field === "prices") {
						if (!priceRowsEqual(Array.isArray(current) ? current : [], edit.value)) return true;
						continue;
					}
					if (current !== edit.value) return true;
				}
				return false;
			}
			/** Render one scalar field's draft (staged, else the effective section). */
			fieldText(snapshot, field, format) {
				const staged = this.staged.get(field);
				if (staged === void 0) {
					const value = (snapshot.value ?? {})[field];
					return value === void 0 ? "" : format(value);
				}
				if (staged.kind === "clear") return "";
				if (typeof staged.value === "boolean" || typeof staged.value === "string" || typeof staged.value === "number") return String(staged.value);
				return "";
			}
			/** Render the draft price rows (staged array, else the section's rows). */
			draftPrices(snapshot, section) {
				const staged = this.staged.get("prices");
				if (staged !== void 0 && staged.kind === "set") return structuredClone(staged.value);
				const rows = Array.isArray(section.prices) ? section.prices : defaultPriceRows();
				return rows.length > 0 ? structuredClone(rows) : defaultPriceRows();
			}
			userHas(snapshot, field) {
				const user = snapshot.user;
				return typeof user === "object" && user !== null && Object.hasOwn(user, field);
			}
			stageBoolean(field, text) {
				const trimmed = text.trim();
				if (trimmed === "") this.staged.set(field, { kind: "clear" });
				else if (trimmed === "true") this.staged.set(field, {
					kind: "set",
					value: true
				});
				else if (trimmed === "false") this.staged.set(field, {
					kind: "set",
					value: false
				});
				else this.staged.set(field, {
					kind: "set",
					value: trimmed
				});
				this.failed = false;
				this.publish();
			}
			stageText(field, text) {
				const trimmed = text.trim();
				this.staged.set(field, trimmed === "" ? { kind: "clear" } : {
					kind: "set",
					value: trimmed
				});
				this.failed = false;
				this.publish();
			}
			stageNumber(field, text) {
				const trimmed = text.trim();
				if (trimmed === "") this.staged.set(field, { kind: "clear" });
				else {
					const parsed = Number(trimmed);
					this.staged.set(field, Number.isFinite(parsed) ? {
						kind: "set",
						value: parsed
					} : {
						kind: "set",
						value: trimmed
					});
				}
				this.failed = false;
				this.publish();
			}
			editPrice(index, patch) {
				const rows = this.currentDraftRows();
				const row = rows[index];
				if (row === void 0) return;
				rows[index] = {
					...row,
					...patch
				};
				this.staged.set("prices", {
					kind: "set",
					value: rows
				});
				this.failed = false;
				this.publish();
			}
			addPriceRow() {
				const rows = this.currentDraftRows();
				rows.push({
					model: "",
					cacheHitInputPricePerMillion: 0,
					cacheMissInputPricePerMillion: 0,
					outputPricePerMillion: 0,
					currency: "CNY",
					effectiveFrom: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
				});
				this.staged.set("prices", {
					kind: "set",
					value: rows
				});
				this.failed = false;
				this.publish();
			}
			removePriceRow(index) {
				const rows = this.currentDraftRows();
				rows.splice(index, 1);
				this.staged.set("prices", {
					kind: "set",
					value: rows
				});
				this.failed = false;
				this.publish();
			}
			currentDraftRows() {
				const staged = this.staged.get("prices");
				if (staged !== void 0 && staged.kind === "set") return structuredClone(staged.value);
				const section = this.scope.getSnapshot().value ?? {};
				const rows = Array.isArray(section.prices) && section.prices.length > 0 ? section.prices : defaultPriceRows();
				return structuredClone(rows);
			}
			/** Write every staged edit, then re-seed from what the Host accepted. */
			async save() {
				if (this.saving || this.staged.size === 0) return;
				if (this.projection().invalid) return;
				this.saving = true;
				this.failed = false;
				this.publish();
				let landed = true;
				for (const [field, edit] of this.staged) try {
					if (edit.kind === "clear") await this.scope.unset(field);
					else await this.scope.set(field, edit.value);
				} catch {
					landed = false;
				}
				if (landed) this.staged.clear();
				this.saving = false;
				this.failed = !landed;
				this.publish();
			}
			publish() {
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region \0dsh-usage-css:C:\Users\饭团\Documents\测试\dsh-deepseek-usage-dashboard\src\client\settings\settings-card.module.css.mjs
		const css = ".y2tLIa_card{border:1px solid var(--dsw-alias-stroke-default,transparent);border-radius:8px;margin:0;list-style:none}.y2tLIa_cardOpen{border-color:var(--dsw-alias-stroke-strong,transparent)}.y2tLIa_header{cursor:pointer;font:inherit;text-align:left;background:0 0;border:none;justify-content:space-between;align-items:center;gap:8px;width:100%;padding:10px 12px;display:flex}.y2tLIa_headText{flex-direction:column;gap:2px;min-width:0;display:flex}.y2tLIa_name{color:var(--dsw-alias-label-primary,inherit);font-size:13px;font-weight:600}.y2tLIa_description,.y2tLIa_chevron,.y2tLIa_chevronOpen{color:var(--dsw-alias-label-tertiary,inherit);font-size:12px}.y2tLIa_chevronOpen{transform:rotate(180deg)}.y2tLIa_pending{background:var(--dsw-alias-fill-warning,transparent);color:var(--dsw-alias-label-warning,inherit);border-radius:4px;padding:2px 6px;font-size:11px}.y2tLIa_body{border-top:1px solid var(--dsw-alias-stroke-default,transparent);flex-direction:column;gap:10px;padding:12px;display:flex}.y2tLIa_field{flex-direction:column;gap:4px;display:flex}.y2tLIa_scheduleList{margin:0;padding:0;list-style:none}.y2tLIa_scheduleList li{color:var(--dsw-alias-label-secondary,inherit);padding:2px 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}.y2tLIa_scheduleLine{display:block}.y2tLIa_scheduleWindows{color:var(--dsw-alias-label-tertiary,inherit);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;display:block}.y2tLIa_label{color:var(--dsw-alias-label-primary,inherit);font-size:12px;font-weight:600}.y2tLIa_hint{color:var(--dsw-alias-label-tertiary,inherit);margin:0;font-size:11px}.y2tLIa_input,.y2tLIa_select,.y2tLIa_priceInput{background:var(--dsw-alias-fill-subtle,transparent);border:1px solid var(--dsw-alias-stroke-default,transparent);color:var(--dsw-alias-label-primary,inherit);font:inherit;border-radius:6px;padding:5px 8px;font-size:12px}.y2tLIa_select{cursor:pointer}.y2tLIa_notExposed,.y2tLIa_readOnly,.y2tLIa_failed,.y2tLIa_invalid{margin:0;font-size:12px}.y2tLIa_notExposed{color:var(--dsw-alias-label-tertiary,inherit)}.y2tLIa_readOnly{color:var(--dsw-alias-label-warning,inherit)}.y2tLIa_failed,.y2tLIa_invalid{color:var(--dsw-alias-label-danger,var(--dsw-alias-label-warning,inherit))}.y2tLIa_footer{justify-content:flex-end;align-items:center;gap:8px;display:flex}.y2tLIa_save,.y2tLIa_discard,.y2tLIa_reset,.y2tLIa_addRow,.y2tLIa_removeRow{background:var(--dsw-alias-fill-subtle,transparent);border:1px solid var(--dsw-alias-stroke-default,transparent);color:var(--dsw-alias-label-primary,inherit);cursor:pointer;font:inherit;border-radius:6px;padding:3px 10px;font-size:12px;line-height:20px}.y2tLIa_save{background:var(--dsw-alias-fill-strong,transparent);color:var(--dsw-alias-label-on-strong,inherit)}.y2tLIa_save:disabled,.y2tLIa_discard:disabled,.y2tLIa_reset:disabled,.y2tLIa_addRow:disabled,.y2tLIa_removeRow:disabled{cursor:default;opacity:.5}.y2tLIa_pricesHead{align-items:center;gap:8px;display:flex}.y2tLIa_pricesHead .y2tLIa_label{flex:1}.y2tLIa_priceTable{flex-direction:column;gap:4px;display:flex}.y2tLIa_priceRow,.y2tLIa_priceRowHead{grid-template-columns:1.4fr .8fr .8fr .8fr .7fr 1fr auto;gap:4px;display:grid}.y2tLIa_priceRowHead{color:var(--dsw-alias-label-tertiary,inherit);font-size:11px}.y2tLIa_priceInput{width:100%;min-width:0}.y2tLIa_removeRow{padding:3px 8px}.y2tLIa_fallbackHint{color:var(--dsw-alias-label-tertiary,inherit);margin:0;font-size:11px}";
		const tagId = "@linxin666/dsh-deepseek-usage-dashboard/settings-card.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-deepseek-usage-dashboard";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var settings_card_module_css_default = {
			"addRow": "y2tLIa_addRow",
			"body": "y2tLIa_body",
			"card": "y2tLIa_card",
			"cardOpen": "y2tLIa_cardOpen",
			"chevron": "y2tLIa_chevron",
			"chevronOpen": "y2tLIa_chevronOpen",
			"description": "y2tLIa_description",
			"discard": "y2tLIa_discard",
			"failed": "y2tLIa_failed",
			"fallbackHint": "y2tLIa_fallbackHint",
			"field": "y2tLIa_field",
			"footer": "y2tLIa_footer",
			"header": "y2tLIa_header",
			"headText": "y2tLIa_headText",
			"hint": "y2tLIa_hint",
			"input": "y2tLIa_input",
			"invalid": "y2tLIa_invalid",
			"label": "y2tLIa_label",
			"name": "y2tLIa_name",
			"notExposed": "y2tLIa_notExposed",
			"pending": "y2tLIa_pending",
			"priceInput": "y2tLIa_priceInput",
			"priceRow": "y2tLIa_priceRow",
			"priceRowHead": "y2tLIa_priceRowHead",
			"pricesHead": "y2tLIa_pricesHead",
			"priceTable": "y2tLIa_priceTable",
			"readOnly": "y2tLIa_readOnly",
			"removeRow": "y2tLIa_removeRow",
			"reset": "y2tLIa_reset",
			"save": "y2tLIa_save",
			"scheduleLine": "y2tLIa_scheduleLine",
			"scheduleList": "y2tLIa_scheduleList",
			"scheduleWindows": "y2tLIa_scheduleWindows",
			"select": "y2tLIa_select"
		};
		//#endregion
		//#region src/client/settings/UsageSettingsCard.tsx
		/** Bridges the `deepseek-usage` scope onto the card's staged form. */
		var UsageSettingsCardController = class {
			form;
			store;
			/** @param scope - the bound settings scope for the `deepseek-usage` namespace. */
			constructor(scope) {
				this.form = new UsageSettingsForm(scope);
				this.store = this.form.bind();
			}
			/** Build the face the card's slot registration injects. */
			inject() {
				return {
					hooks: { usageSettingsCard: this.store },
					...this.form.actions()
				};
			}
		};
		/** The card chrome (self-contained mirror of the settings card shell). */
		function SettingsCardShell(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const { state } = props;
			if (!state.available) return null;
			const cardClass = open ? `${settings_card_module_css_default.cardOpen} ${settings_card_module_css_default.card}` : settings_card_module_css_default.card;
			if (!state.exposed) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: cardClass,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: settings_card_module_css_default.header,
					"aria-expanded": open,
					onClick: () => {
						setOpen(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: settings_card_module_css_default.headText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: settings_card_module_css_default.name,
							children: props.title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: settings_card_module_css_default.description,
							children: props.description
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: open ? settings_card_module_css_default.chevronOpen : settings_card_module_css_default.chevron,
						children: "▾"
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: settings_card_module_css_default.body,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.notExposed,
						role: "status",
						children: tt("settings.notExposed")
					})
				}) : null]
			});
			const blocked = !state.dirty || state.invalid || state.saving;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: cardClass,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: settings_card_module_css_default.header,
					"aria-expanded": open,
					onClick: () => {
						setOpen(!open);
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: settings_card_module_css_default.headText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: settings_card_module_css_default.name,
								children: props.title
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: settings_card_module_css_default.description,
								children: props.description
							})]
						}),
						state.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: settings_card_module_css_default.pending,
							children: tt("settings.unsaved")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: open ? settings_card_module_css_default.chevronOpen : settings_card_module_css_default.chevron,
							children: "▾"
						})
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_css_default.body,
					children: [
						!state.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: settings_card_module_css_default.readOnly,
							role: "status",
							children: tt("settings.readOnly")
						}) : null,
						props.children,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_css_default.footer,
							children: [
								state.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: settings_card_module_css_default.failed,
									role: "status",
									children: tt("settings.saveFailed")
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_css_default.discard,
									disabled: !state.dirty || state.saving,
									onClick: props.onDiscard,
									children: tt("settings.discard")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_css_default.save,
									disabled: blocked,
									onClick: props.onSave,
									children: tt(!state.saving ? "settings.save" : "settings.saving")
								})
							]
						})
					]
				}) : null]
			});
		}
		/** One text field row. */
		function TextField(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						className: settings_card_module_css_default.label,
						htmlFor: props.id,
						children: props.label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						className: settings_card_module_css_default.input,
						type: "text",
						value: props.text,
						placeholder: props.placeholder ?? "",
						disabled: props.disabled,
						onChange: (event) => {
							props.onEdit(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.hint,
						children: props.hint
					})
				]
			});
		}
		/**
		* Render the deepseek-usage settings card.
		* @param props - locale copy, the card snapshot, and its form actions.
		*/
		function UsageSettingsCard(props) {
			const { t } = props;
			const state = props.useUsageSettingsCard((snapshot) => snapshot);
			const disabled = !state.writable;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(SettingsCardShell, {
				title: t("settings.title"),
				description: t("settings.description"),
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_css_default.field,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: settings_card_module_css_default.label,
								htmlFor: "usage-settings-enabled",
								children: t("settings.enabled")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								id: "usage-settings-enabled",
								className: settings_card_module_css_default.select,
								value: state.enabled,
								disabled,
								onChange: (event) => {
									props.editEnabled(event.target.value);
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: t("settings.inherit")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "true",
										children: t("settings.on")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "false",
										children: t("settings.off")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: settings_card_module_css_default.hint,
								children: t("settings.enabledHint")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
						id: "usage-settings-provider",
						label: t("settings.providerId"),
						hint: t("settings.providerIdHint"),
						text: state.providerId,
						disabled,
						onEdit: props.editProviderId
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextField, {
						id: "usage-settings-refresh",
						label: t("settings.refreshMinutes"),
						hint: t("settings.refreshMinutesHint"),
						text: state.balanceRefreshMinutes,
						disabled,
						onEdit: props.editRefreshMinutes,
						placeholder: "10"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_css_default.field,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: settings_card_module_css_default.label,
								children: t("settings.pricingMode")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: settings_card_module_css_default.hint,
								children: state.pricingMode === "time-aware" ? t("settings.pricingModeSchedules") : t("settings.pricingModeLegacy")
							}),
							state.pricingMode === "time-aware" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: settings_card_module_css_default.hint,
									children: [
										t("settings.pricingTimezone"),
										": ",
										state.pricingTimezone
									]
								}),
								state.pricingBuiltinDefault ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: settings_card_module_css_default.hint,
									role: "status",
									children: t("settings.pricingBuiltinDefault")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									className: settings_card_module_css_default.scheduleList,
									children: state.pricingSchedules.map((schedule) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: settings_card_module_css_default.scheduleLine,
										children: [
											schedule.id,
											" · ",
											schedule.effectiveFrom,
											" · ",
											schedule.currency
										]
									}), schedule.windows.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: settings_card_module_css_default.scheduleWindows,
										children: schedule.windows.map((window) => `${window.id} ${window.start}–${window.end}`).join(" · ")
									}) : null] }, schedule.id))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: settings_card_module_css_default.hint,
									role: "status",
									children: t("settings.pricingOffPeakHint")
								}),
								!state.pricingBuiltinDefault ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: settings_card_module_css_default.hint,
									role: "status",
									children: t("settings.pricingSchedulesHint")
								}) : null
							] }) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_css_default.pricesHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: settings_card_module_css_default.label,
								children: t("settings.prices")
							}),
							state.pricesOverridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: settings_card_module_css_default.reset,
								disabled,
								onClick: props.resetPrices,
								children: t("settings.reset")
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: settings_card_module_css_default.addRow,
								disabled,
								onClick: props.addPriceRow,
								children: t("settings.addRow")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.hint,
						children: t("settings.pricesHint")
					}),
					state.invalid ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.invalid,
						role: "status",
						children: t("settings.invalidPrice")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_css_default.priceTable,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_css_default.priceRowHead,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.model") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.hitPrice") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.missPrice") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.outputPrice") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.currency") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.effectiveFrom") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
							]
						}), state.prices.map((row, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_css_default.priceRow,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									"aria-label": t("settings.model"),
									className: settings_card_module_css_default.priceInput,
									type: "text",
									value: row.model,
									disabled,
									onChange: (event) => {
										props.editPrice(index, { model: event.target.value });
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									"aria-label": t("settings.hitPrice"),
									className: settings_card_module_css_default.priceInput,
									type: "number",
									min: "0",
									step: "0.000001",
									value: row.cacheHitInputPricePerMillion,
									disabled,
									onChange: (event) => {
										props.editPrice(index, { cacheHitInputPricePerMillion: Number(event.target.value) });
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									"aria-label": t("settings.missPrice"),
									className: settings_card_module_css_default.priceInput,
									type: "number",
									min: "0",
									step: "0.000001",
									value: row.cacheMissInputPricePerMillion,
									disabled,
									onChange: (event) => {
										props.editPrice(index, { cacheMissInputPricePerMillion: Number(event.target.value) });
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									"aria-label": t("settings.outputPrice"),
									className: settings_card_module_css_default.priceInput,
									type: "number",
									min: "0",
									step: "0.000001",
									value: row.outputPricePerMillion,
									disabled,
									onChange: (event) => {
										props.editPrice(index, { outputPricePerMillion: Number(event.target.value) });
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									"aria-label": t("settings.currency"),
									className: settings_card_module_css_default.priceInput,
									type: "text",
									value: row.currency,
									disabled,
									onChange: (event) => {
										props.editPrice(index, { currency: event.target.value });
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									"aria-label": t("settings.effectiveFrom"),
									className: settings_card_module_css_default.priceInput,
									type: "text",
									value: row.effectiveFrom,
									disabled,
									onChange: (event) => {
										props.editPrice(index, { effectiveFrom: event.target.value });
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_css_default.removeRow,
									"aria-label": t("settings.removeRow"),
									title: t("settings.removeRow"),
									disabled,
									onClick: () => {
										props.removePriceRow(index);
									},
									children: "×"
								})
							]
						}, `${index}-${row.model}`))]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.fallbackHint,
						children: t("settings.fallbackModel")
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Locale namespace this plugin owns. */
		const NS = "deepseek-usage";
		/** Settings namespace the card edits (the Host plugin registers it). */
		const USAGE_NS = "deepseek-usage";
		/** Required services (fiber inject waiting — the runtime must be up first). */
		const inject = [
			"slots",
			"locale",
			"connection",
			"settingsScope",
			"remote"
		];
		/**
		* Mount the usage dashboard surface.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, "zh", zh), "deepseek-usage: zh dictionary");
			ctx.effect(() => ctx.locale.register(NS, "en", en), "deepseek-usage: en dictionary");
			const store = new UsageStore(new UsageApi());
			setUsageStore(store);
			store.start();
			const controller = new PanelController();
			const disposers = [];
			try {
				disposers.push(mountSidebarEntry(controller));
				disposers.push(mountPanel(controller, store));
			} catch (error) {
				console.warn("[deepseek-usage] mount failed:", error);
			}
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "deepseek-usage-dashboard",
				order: 90,
				locale: NS,
				inject: () => ({})
			}, DockLineEntry));
			const settingsCard = new UsageSettingsCardController(ctx.settingsScope.bind({ namespace: USAGE_NS }));
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: USAGE_NS,
				locale: NS,
				inject: () => settingsCard.inject()
			}, UsageSettingsCard));
			ctx.effect(() => () => {
				for (const dispose of disposers.splice(0)) dispose();
				store.stop();
				setUsageStore(void 0);
			}, "deepseek-usage: ui teardown");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map