import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The API usage dashboard panel: today's token cards, cache hit/miss
 * comparison, output, hit rate, estimated cost, balance, 7-day trend, and
 * the data-source footer. Rendered inside a plain React root (family
 * pattern), so locale comes from the document language, and every color
 * comes from DSH CSS tokens.
 */
import { useSyncExternalStore } from 'react';
import { formatCount } from "../api.js";
import { tt } from "../locales.js";
import css from './dashboard.module.css';
/** Format an epoch-ms timestamp for display. */
function formatTime(epochMs) {
    return new Date(epochMs).toLocaleString();
}
/** Format a currency amount string with a currency prefix. */
function formatAmount(total, currency) {
    return `${currency === 'CNY' ? '¥' : `${currency} `}${total}`;
}
/** Render a micro-unit string as a 6-decimal amount ("812891" → "0.812891"). */
function microDecimal(micro) {
    const negative = micro.startsWith('-');
    const digits = negative ? micro.slice(1) : micro;
    const padded = digits.padStart(7, '0');
    const whole = padded.slice(0, -6);
    const fraction = padded.slice(-6);
    return `${negative ? '-' : ''}${whole}.${fraction}`;
}
/** One per-million rate with the currency prefix ("¥0.05/1M", two decimals). */
function rateText(currency, rate) {
    return `${currency === 'CNY' ? '¥' : `${currency} `}${rate.toFixed(2)}/1M`;
}
/** The user-facing band label for a resolved band id. */
function bandLabel(t, bandId) {
    if (bandId === 'off-peak')
        return t('panel.currentBandOffPeak');
    if (bandId === 'peak')
        return t('panel.currentBandPeak');
    if (bandId === 'all-day')
        return t('panel.currentBandAllDay');
    return bandId;
}
/** The display name of a schedule (the official one reads as a product name). */
function scheduleName(scheduleId) {
    return scheduleId === 'deepseek-2026-08-17' ? 'DeepSeek 2026-08-17' : scheduleId;
}
/** A labeled stat card with a compact, semantic visual treatment. */
function StatCard(props) {
    const toneClass = props.tone === 'accent'
        ? css.statAccent
        : props.tone === 'positive'
            ? css.statPositive
            : props.tone === 'danger'
                ? css.statDanger
                : '';
    return (_jsxs("div", { className: `${css.statCard} ${toneClass}`.trim(), children: [_jsxs("span", { className: css.statLabelRow, children: [_jsx("span", { className: css.statIcon, "aria-hidden": "true", children: props.icon }), _jsx("span", { className: css.statLabel, children: props.label })] }), _jsx("span", { className: css.statValue, children: props.value }), props.hint !== undefined ? _jsx("span", { className: css.statHint, children: props.hint }) : null] }));
}
/** The cache hit/miss proportion bar. */
function CacheBar(props) {
    const total = props.hit + props.miss;
    if (total === 0) {
        return _jsx("div", { className: css.cacheBar, children: _jsx("div", { className: css.cacheBarEmpty }) });
    }
    const hitPercent = (props.hit / total) * 100;
    return (_jsxs("div", { className: css.cacheBar, role: "img", "aria-label": `hit ${props.hit} / miss ${props.miss}`, children: [_jsx("div", { className: css.cacheBarHit, style: { width: `${hitPercent}%` } }), _jsx("div", { className: css.cacheBarMiss, style: { width: `${100 - hitPercent}%` } })] }));
}
const TREND_WIDTH = 720;
const TREND_HEIGHT = 178;
const TREND_LEFT = 58;
const TREND_RIGHT = 704;
const TREND_TOP = 20;
const TREND_BOTTOM = 138;
/** The 7-day trend as a responsive line and area chart. */
function TrendChart(props) {
    const max = Math.max(0, ...props.data.map(day => day.totalTokens));
    const total = props.data.reduce((sum, day) => sum + day.totalTokens, 0);
    const divisor = props.data.length === 0 ? 1 : props.data.length;
    const average = Math.round(total / divisor);
    const averageY = max === 0
        ? TREND_BOTTOM
        : TREND_BOTTOM - ((TREND_BOTTOM - TREND_TOP) * average) / max;
    const points = props.data.map((day, index) => {
        const x = props.data.length <= 1
            ? (TREND_LEFT + TREND_RIGHT) / 2
            : TREND_LEFT + ((TREND_RIGHT - TREND_LEFT) * index) / (props.data.length - 1);
        const y = max === 0
            ? TREND_BOTTOM
            : TREND_BOTTOM - ((TREND_BOTTOM - TREND_TOP) * day.totalTokens) / max;
        return { ...day, x, y };
    });
    const linePoints = points.map(point => `${point.x},${point.y}`).join(' ');
    const areaPath = points.length === 0
        ? ''
        : `M ${points[0]?.x},${TREND_BOTTOM} L ${linePoints.replaceAll(' ', ' L ')} L ${points.at(-1)?.x},${TREND_BOTTOM} Z`;
    return (_jsxs("div", { className: css.trend, children: [_jsxs("div", { className: css.trendChartHeader, children: [_jsx("strong", { className: css.trendChartTitle, children: tt('panel.trendChartTitle') }), _jsxs("div", { className: css.trendLegend, children: [_jsxs("span", { children: [_jsx("i", { className: css.legendTotal }), tt('panel.trendTotalLegend')] }), _jsxs("span", { children: [_jsx("i", { className: css.legendAverage }), tt('panel.trendAverage')] })] })] }), _jsxs("svg", { className: css.trendSvg, viewBox: `0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`, role: "img", "aria-label": "7-day token usage", preserveAspectRatio: "none", children: [[TREND_TOP, (TREND_TOP + TREND_BOTTOM) / 2, TREND_BOTTOM].map((y, index) => (_jsxs("g", { className: css.trendGrid, children: [_jsx("line", { x1: TREND_LEFT, x2: TREND_RIGHT, y1: y, y2: y }), _jsx("text", { x: "4", y: y + 4, children: index === 0 ? formatCompactCount(max) : index === 1 ? formatCompactCount(Math.round(max / 2)) : '0' })] }, y))), _jsx("line", { className: css.trendAverageLine, x1: TREND_LEFT, x2: TREND_RIGHT, y1: averageY, y2: averageY }), areaPath !== '' ? _jsx("path", { className: css.trendArea, d: areaPath }) : null, linePoints !== '' ? _jsx("polyline", { className: css.trendLine, points: linePoints }) : null, points.map((point, index) => (_jsxs("g", { className: index === points.length - 1 ? css.trendPointLatest : css.trendPoint, children: [_jsx("circle", { cx: point.x, cy: point.y, r: point.totalTokens === 0 ? 3 : 5, children: _jsx("title", { children: `${point.date}: ${formatCount(point.totalTokens)}` }) }), point.totalTokens > 0
                                ? _jsx("text", { className: css.trendPointValue, x: point.x, y: Math.max(14, point.y - 10), children: formatCompactCount(point.totalTokens) })
                                : null, _jsx("text", { className: css.trendDate, x: point.x, y: "168", children: point.date.slice(5) })] }, point.date)))] }), _jsxs("div", { className: css.trendSummary, children: [_jsxs("span", { children: [tt('panel.trendTotal'), " ", _jsx("strong", { children: formatCompactCount(total) })] }), _jsxs("span", { children: [tt('panel.trendAverage'), " ", _jsx("strong", { children: formatCompactCount(average) })] })] }), _jsx("div", { className: css.trendMeters, "aria-hidden": "false", children: props.data.map(day => (_jsx("div", { role: "meter", "aria-label": `${day.date}: ${formatCount(day.totalTokens)}`, "aria-valuemin": 0, "aria-valuemax": max, "aria-valuenow": day.totalTokens }, day.date))) })] }));
}
/** Compact chart labels that stay readable from units through millions. */
function formatCompactCount(value) {
    if (value < 1_000)
        return String(value);
    if (value < 1_000_000)
        return `${trimDecimal(value / 1_000)}K`;
    if (value < 1_000_000_000)
        return `${trimDecimal(value / 1_000_000)}M`;
    return `${trimDecimal(value / 1_000_000_000)}B`;
}
/** One decimal when useful, with trailing .0 removed. */
function trimDecimal(value) {
    return value.toFixed(1).replace(/\.0$/, '');
}
/** The balance detail block (non-null balance, narrowed once). */
function BalanceDetail(props) {
    const { balance, stale, t } = props;
    return (_jsxs(_Fragment, { children: [stale ? _jsx("p", { className: css.balanceState, children: t('panel.balanceStale') }) : null, _jsx("span", { className: css.balanceValue, children: balance.infos.length > 0
                    ? formatAmount(balance.infos[0].totalBalance, balance.infos[0].currency)
                    : '--' }), balance.infos.map(info => (_jsxs("dl", { className: css.balanceRows, children: [_jsxs("div", { className: css.balanceRow, children: [_jsx("dt", { children: t('panel.granted') }), _jsx("dd", { children: formatAmount(info.grantedBalance, info.currency) })] }), _jsxs("div", { className: css.balanceRow, children: [_jsx("dt", { children: t('panel.toppedUp') }), _jsx("dd", { children: formatAmount(info.toppedUpBalance, info.currency) })] }), _jsxs("div", { className: css.balanceRow, children: [_jsx("dt", { children: t('panel.totalBalance') }), _jsx("dd", { children: formatAmount(info.totalBalance, info.currency) })] }), _jsxs("div", { className: css.balanceRow, children: [_jsx("dt", { children: t('panel.available') }), _jsx("dd", { children: balance.isAvailable ? 'yes' : 'no' })] })] }, info.currency)))] }));
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
    // Defensive: an older Host (v0.1.0 payload) lacks these fields entirely —
    // the card must degrade, never crash, during a mixed-version transition.
    const schedules = prices.schedules ?? [];
    const bandCosts = estimate.bandCosts ?? [];
    const band = prices.currentBand ?? null;
    // Internal pricing-config identity — SECONDARY metadata, tooltip only.
    const metaTitle = `${t('panel.priceVersion')} ${prices.version}${prices.updatedAt !== null
        ? ` · ${t('panel.priceUpdated')}: ${new Date(prices.updatedAt).toLocaleString()}`
        : ''}`;
    // The active schedule (the current instant's, falling back to the day's).
    const activeSchedule = schedules.find(schedule => schedule.id === (band?.scheduleId ?? estimate.scheduleIdsUsed[0] ?? schedules[0]?.id));
    // Band badge: label + tone (green off-peak / amber peak / neutral).
    let badge = null;
    if (band !== null) {
        const schedule = schedules.find(item => item.id === band.scheduleId);
        const peakList = (schedule?.windows ?? [])
            .filter(window => (window.bandId ?? window.id) === 'peak')
            .map(window => `${window.start}–${window.end}`)
            .join('、');
        const offPeakList = (schedule?.offPeakSpans ?? [])
            .map(span => `${span.start}–${span.end}`)
            .join('、');
        const tooltip = peakList !== '' || offPeakList !== ''
            ? t('panel.windowsTooltip', { peak: peakList, offpeak: offPeakList })
            : '';
        badge = {
            bandId: band.bandId,
            label: bandLabel(t, band.bandId),
            tone: band.bandId === 'off-peak' ? 'off' : band.bandId === 'peak' ? 'peak' : 'neutral',
            title: tooltip,
        };
    }
    // The current period ("当前时段：00:00–09:00").
    const currentWindow = band?.window !== undefined && band?.window !== null
        ? t('panel.currentWindow', { span: `${band.window.start}–${band.window.end}` })
        : null;
    // The current band's rates of the primary model ("当前费率（deepseek-v4-flash）：…").
    let currentRates = null;
    if (band !== null && activeSchedule !== undefined) {
        const model = activeSchedule.models.find(item => item.model === 'deepseek-v4-flash') ?? activeSchedule.models[0];
        const rates = model?.ratesByBand[band.bandId];
        if (model !== undefined && rates !== undefined) {
            currentRates = t('panel.currentRates', {
                model: model.model,
                hit: rateText(estimate.currency, rates.cacheHitInputPricePerMillion),
                miss: rateText(estimate.currency, rates.cacheMissInputPricePerMillion),
                out: rateText(estimate.currency, rates.outputPricePerMillion),
            });
        }
    }
    // Off-peak = exactly half of peak — a fact of the OFFICIAL schedule only.
    const offPeakHalf = band?.bandId === 'off-peak' && band?.scheduleId === 'deepseek-2026-08-17';
    return (_jsxs("div", { className: css.estimateCard, children: [_jsx("span", { className: css.estimateValue, children: formatAmount(estimate.total, estimate.currency) }), badge !== null
                ? (_jsx("span", { className: `${css.bandBadge} ${badge.tone === 'off' ? css.bandOffPeak : badge.tone === 'peak' ? css.bandPeak : css.bandNeutral}`.trim(), role: "status", "data-band": badge.bandId, title: badge.title, children: badge.label }))
                : null, _jsx("span", { className: css.estimateProvenance, title: metaTitle, children: pricingProvenance(data, t) }), estimate.scheduleIdsUsed.length > 1
                ? _jsx("span", { className: css.estimateBand, children: t('panel.pricingMultiple') })
                : null, currentWindow !== null
                ? _jsx("span", { className: css.estimateBand, "data-window": "current", children: currentWindow })
                : null, currentRates !== null
                ? _jsx("span", { className: css.estimateRates, children: currentRates })
                : null, offPeakHalf
                ? _jsx("span", { className: css.estimateNote, role: "status", children: t('panel.offPeakHalfNote') })
                : null, _jsx("span", { className: css.estimateNote, children: t('panel.estimateNote') }), estimate.unpricedRequestCount > 0
                ? (_jsxs("span", { className: css.estimateUnpriced, role: "status", children: [t('panel.unpriced'), " \u00B7 ", t('panel.unpricedDetail', { count: estimate.unpricedRequestCount })] }))
                : null, bandCosts.length > 0
                ? (_jsxs("div", { className: css.bandBreakdown, "aria-label": t('panel.bandBreakdownLabel'), children: [_jsx("span", { className: css.bandBreakdownLabel, children: t('panel.bandBreakdownLabel') }), bandCosts.map(share => (_jsx("span", { className: share.requestCount === 0 ? `${css.bandBreakdownRow} ${css.bandBreakdownRowZero}` : css.bandBreakdownRow, "data-band": share.bandId, title: t('panel.bandCostTokens', {
                                hit: formatCount(share.cacheHitInputTokens),
                                miss: formatCount(share.cacheMissInputTokens),
                                out: formatCount(share.outputTokens),
                            }), children: t('panel.bandCostRow', {
                                band: bandLabel(t, share.bandId),
                                cost: formatAmount(microDecimal(share.totalMicro), estimate.currency),
                                count: formatCount(share.requestCount),
                            }) }, share.bandId)))] }))
                : null] }));
}
/** The pricing provenance line under the estimate (schedule aware). */
function pricingProvenance(data, t) {
    const estimate = data.estimatedCost;
    if (data.prices.mode === 'legacy') {
        const date = data.prices.entries[0]?.effectiveFrom ?? '--';
        return t('panel.pricingModeLegacy', { date });
    }
    const scheduleId = data.prices.currentBand?.scheduleId
        ?? estimate.scheduleIdsUsed[0]
        ?? (data.prices.schedules ?? [])[0]?.id;
    const schedule = (data.prices.schedules ?? []).find(item => item.id === scheduleId);
    const name = schedule === undefined ? '--' : scheduleName(schedule.id);
    const timezone = data.prices.currentBand?.timezone ?? data.prices.timezone;
    const timezoneText = timezone === 'Asia/Shanghai' ? t('panel.timezoneBeijing', { tz: timezone }) : timezone;
    return t('panel.pricingNow', { name, timezone: timezoneText });
}
/**
 * Render the usage dashboard.
 * @param props - panel controller and the shared stats store.
 */
export function UsageDashboard({ store }) {
    const snapshot = useSyncExternalStore((listener) => store.subscribe(listener), () => store.getSnapshot());
    return _jsx(DashboardView, { snapshot: snapshot, onRefresh: () => { void store.refresh(); } });
}
/** Pure view over one store snapshot (also used by tests). */
export function DashboardView(props) {
    const { snapshot, onRefresh } = props;
    const data = snapshot.data;
    const t = tt;
    const totalInput = data === null ? 0 : data.daily.cacheHitInputTokens + data.daily.cacheMissInputTokens;
    const cacheHitShare = data === null || totalInput === 0 ? null : data.daily.cacheHitInputTokens / totalInput;
    const cacheMissShare = data === null || totalInput === 0 ? null : data.daily.cacheMissInputTokens / totalInput;
    const failureRate = data === null || data.daily.requestCount === 0
        ? 0
        : data.daily.failedRequestCount / data.daily.requestCount;
    return (_jsxs("div", { className: css.page, children: [_jsxs("header", { className: css.header, children: [_jsx("h1", { className: css.title, children: t('panel.title') }), _jsxs("div", { className: css.headerActions, children: [data !== null
                                ? (_jsxs("span", { className: css.updated, children: [t('panel.lastUpdated'), ": ", formatTime(data.meta.updatedAt)] }))
                                : null, _jsx("button", { type: "button", className: css.refresh, disabled: snapshot.refreshing, onClick: onRefresh, children: t(snapshot.refreshing ? 'panel.refreshing' : 'panel.refresh') })] })] }), data === null
                ? (_jsx("section", { className: css.empty, role: "status", children: snapshot.error !== null ? snapshot.error : '…' }))
                : (_jsxs(_Fragment, { children: [!data.meta.endpointMatching
                            ? (_jsx("p", { className: css.notice, role: "status", children: t('panel.endpointFiltered', { baseUrl: data.meta.endpointBaseUrl }) }))
                            : (_jsx("p", { className: css.noticeMuted, children: t('panel.endpointOk', { baseUrl: data.meta.endpointBaseUrl, provider: data.meta.providerId }) })), _jsxs("section", { "aria-label": t('panel.today'), children: [_jsx("h2", { className: css.sectionTitle, children: t('panel.today') }), _jsxs("div", { className: css.grid, children: [_jsx(StatCard, { label: t('panel.cacheHit'), value: formatCount(data.daily.cacheHitInputTokens), hint: t('panel.inputShare', { percent: cacheHitShare === null ? '--' : `${(cacheHitShare * 100).toFixed(1)}%` }), icon: "\u2299", tone: "accent" }), _jsx(StatCard, { label: t('panel.cacheMiss'), value: formatCount(data.daily.cacheMissInputTokens), hint: t('panel.inputShare', { percent: cacheMissShare === null ? '--' : `${(cacheMissShare * 100).toFixed(1)}%` }), icon: "\u2296" }), _jsx(StatCard, { label: t('panel.output'), value: formatCount(data.daily.outputTokens), hint: t('panel.tokensUnit'), icon: "\u2197" }), data.daily.reasoningTokens > 0
                                            ? _jsx(StatCard, { label: t('panel.reasoning'), value: formatCount(data.daily.reasoningTokens), hint: t('panel.tokensUnit'), icon: "\u25F7" })
                                            : null, _jsx(StatCard, { label: t('panel.hitRate'), value: data.daily.cacheHitRate === null ? '--' : `${(data.daily.cacheHitRate * 100).toFixed(1)}%`, hint: data.daily.cacheHitRate !== null && data.daily.cacheHitRate >= 0.9 ? t('panel.excellent') : undefined, icon: "\u2713", tone: "positive" }), _jsx(StatCard, { label: t('panel.requestCount'), value: formatCount(data.daily.requestCount), hint: t('panel.timesUnit'), icon: "#" }), _jsx(StatCard, { label: t('panel.failedRequests'), value: formatCount(data.daily.failedRequestCount), hint: t('panel.failureRate', { rate: `${(failureRate * 100).toFixed(2)}%` }), icon: "!", tone: data.daily.failedRequestCount > 0 ? 'danger' : 'positive' }), _jsx(StatCard, { label: t('panel.totalTokens'), value: formatCount(data.daily.totalTokens), hint: t('panel.totalInput') + ` ${formatCount(data.daily.totalInputTokens)}`, icon: "\u2211", tone: "accent" })] }), _jsx(CacheBar, { hit: data.daily.cacheHitInputTokens, miss: data.daily.cacheMissInputTokens })] }), _jsxs("div", { className: css.twoCol, children: [_jsxs("section", { "aria-label": t('panel.estimateLabel'), children: [_jsx("h2", { className: css.sectionTitle, children: t('panel.estimateLabel') }), _jsx(EstimateCard, { data: data, t: t })] }), _jsxs("section", { "aria-label": t('panel.balance'), children: [_jsx("h2", { className: css.sectionTitle, children: t('panel.balance') }), _jsx("div", { className: css.balanceCard, children: data.balance === null
                                                ? (_jsx("p", { className: css.balanceState, children: data.balanceState.state === 'unconfigured' ? t('panel.balanceUnavailable') : t('panel.balanceStale') }))
                                                : (_jsx(BalanceDetail, { balance: data.balance, stale: data.balanceState.state === 'stale', t: t })) })] })] }), _jsxs("section", { "aria-label": t('panel.trend'), children: [_jsx("h2", { className: css.sectionTitle, children: t('panel.trend') }), _jsx("div", { className: css.trendCard, children: _jsx(TrendChart, { data: data.trend.map(day => ({ date: day.date, totalTokens: day.totalTokens })) }) })] }), _jsxs("footer", { className: css.footer, children: [_jsxs("span", { children: [t('panel.dataSource'), ": ", data.meta.dataSource] }), _jsxs("span", { children: [t('panel.lastUpdated'), ": ", formatTime(data.meta.updatedAt)] })] })] }))] }));
}
