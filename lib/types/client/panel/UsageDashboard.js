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
/** A labeled stat card. */
function StatCard(props) {
    return (_jsxs("div", { className: props.accent === true ? `${css.statCard} ${css.statAccent}` : css.statCard, children: [_jsx("span", { className: css.statLabel, children: props.label }), _jsx("span", { className: css.statValue, children: props.value }), props.hint !== undefined ? _jsx("span", { className: css.statHint, children: props.hint }) : null] }));
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
/** The 7-day trend as a CSS bar chart. */
function TrendChart(props) {
    const max = Math.max(1, ...props.data.map(day => day.totalTokens));
    return (_jsx("div", { className: css.trend, children: props.data.map(day => (_jsxs("div", { className: css.trendCol, children: [_jsx("div", { className: css.trendBarWrap, children: _jsx("div", { className: css.trendBar, style: { height: `${Math.max(2, (day.totalTokens / max) * 100)}%` }, title: `${day.date}: ${formatCount(day.totalTokens)}` }) }), _jsx("span", { className: css.trendLabel, children: day.date.slice(5) })] }, day.date))) }));
}
/** The balance detail block (non-null balance, narrowed once). */
function BalanceDetail(props) {
    const { balance, stale, t } = props;
    return (_jsxs(_Fragment, { children: [stale ? _jsx("p", { className: css.balanceState, children: t('panel.balanceStale') }) : null, _jsx("span", { className: css.balanceValue, children: balance.infos.length > 0
                    ? formatAmount(balance.infos[0].totalBalance, balance.infos[0].currency)
                    : '--' }), balance.infos.map(info => (_jsxs("dl", { className: css.balanceRows, children: [_jsxs("div", { className: css.balanceRow, children: [_jsx("dt", { children: t('panel.granted') }), _jsx("dd", { children: formatAmount(info.grantedBalance, info.currency) })] }), _jsxs("div", { className: css.balanceRow, children: [_jsx("dt", { children: t('panel.toppedUp') }), _jsx("dd", { children: formatAmount(info.toppedUpBalance, info.currency) })] }), _jsxs("div", { className: css.balanceRow, children: [_jsx("dt", { children: t('panel.totalBalance') }), _jsx("dd", { children: formatAmount(info.totalBalance, info.currency) })] }), _jsxs("div", { className: css.balanceRow, children: [_jsx("dt", { children: t('panel.available') }), _jsx("dd", { children: balance.isAvailable ? 'yes' : 'no' })] })] }, info.currency)))] }));
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
    return (_jsxs("div", { className: css.page, children: [_jsxs("header", { className: css.header, children: [_jsx("h1", { className: css.title, children: t('panel.title') }), _jsxs("div", { className: css.headerActions, children: [data !== null
                                ? (_jsxs("span", { className: css.updated, children: [t('panel.lastUpdated'), ": ", formatTime(data.meta.updatedAt)] }))
                                : null, _jsx("button", { type: "button", className: css.refresh, disabled: snapshot.refreshing, onClick: onRefresh, children: t(snapshot.refreshing ? 'panel.refreshing' : 'panel.refresh') })] })] }), data === null
                ? (_jsx("section", { className: css.empty, role: "status", children: snapshot.error !== null ? snapshot.error : '…' }))
                : (_jsxs(_Fragment, { children: [!data.meta.endpointMatching
                            ? (_jsx("p", { className: css.notice, role: "status", children: t('panel.endpointFiltered', { baseUrl: data.meta.endpointBaseUrl }) }))
                            : (_jsx("p", { className: css.noticeMuted, children: t('panel.endpointOk', { baseUrl: data.meta.endpointBaseUrl, provider: data.meta.providerId }) })), _jsxs("section", { "aria-label": t('panel.today'), children: [_jsx("h2", { className: css.sectionTitle, children: t('panel.today') }), _jsxs("div", { className: css.grid, children: [_jsx(StatCard, { label: t('panel.cacheHit'), value: formatCount(data.daily.cacheHitInputTokens) }), _jsx(StatCard, { label: t('panel.cacheMiss'), value: formatCount(data.daily.cacheMissInputTokens) }), _jsx(StatCard, { label: t('panel.output'), value: formatCount(data.daily.outputTokens) }), data.daily.reasoningTokens > 0
                                            ? _jsx(StatCard, { label: t('panel.reasoning'), value: formatCount(data.daily.reasoningTokens) })
                                            : null, _jsx(StatCard, { label: t('panel.hitRate'), value: data.daily.cacheHitRate === null ? '--' : `${(data.daily.cacheHitRate * 100).toFixed(1)}%` }), _jsx(StatCard, { label: t('panel.requestCount'), value: formatCount(data.daily.requestCount) }), _jsx(StatCard, { label: t('panel.failedRequests'), value: formatCount(data.daily.failedRequestCount) }), _jsx(StatCard, { label: t('panel.totalTokens'), value: formatCount(data.daily.totalTokens), hint: t('panel.totalInput') + ` ${formatCount(data.daily.totalInputTokens)}`, accent: true })] }), _jsx(CacheBar, { hit: data.daily.cacheHitInputTokens, miss: data.daily.cacheMissInputTokens })] }), _jsxs("div", { className: css.twoCol, children: [_jsxs("section", { "aria-label": t('panel.estimateLabel'), children: [_jsx("h2", { className: css.sectionTitle, children: t('panel.estimateLabel') }), _jsxs("div", { className: css.estimateCard, children: [_jsx("span", { className: css.estimateValue, children: formatAmount(data.estimatedCost.total, data.estimatedCost.currency) }), _jsx("span", { className: css.estimateNote, children: t('panel.estimateNote') }), _jsxs("span", { className: css.estimateMeta, children: [t('panel.priceVersion'), ": ", data.prices.version, data.prices.updatedAt !== null ? ` · ${t('panel.priceUpdated')}: ${new Date(data.prices.updatedAt).toLocaleString()}` : ''] })] })] }), _jsxs("section", { "aria-label": t('panel.balance'), children: [_jsx("h2", { className: css.sectionTitle, children: t('panel.balance') }), _jsx("div", { className: css.balanceCard, children: data.balance === null
                                                ? (_jsx("p", { className: css.balanceState, children: data.balanceState.state === 'unconfigured' ? t('panel.balanceUnavailable') : t('panel.balanceStale') }))
                                                : (_jsx(BalanceDetail, { balance: data.balance, stale: data.balanceState.state === 'stale', t: t })) })] })] }), _jsxs("section", { "aria-label": t('panel.trend'), children: [_jsx("h2", { className: css.sectionTitle, children: t('panel.trend') }), _jsx("div", { className: css.trendCard, children: _jsx(TrendChart, { data: data.trend.map(day => ({ date: day.date, totalTokens: day.totalTokens })) }) })] }), _jsxs("footer", { className: css.footer, children: [_jsxs("span", { children: [t('panel.dataSource'), ": ", data.meta.dataSource] }), _jsxs("span", { children: [t('panel.lastUpdated'), ": ", formatTime(data.meta.updatedAt)] })] })] }))] }));
}
