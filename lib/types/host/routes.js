/**
 * The /api/deepseek-usage route family.
 *
 * Every route passes the DSH browser-trust fence first — the same Host /
 * Origin / Sec-Fetch-Site checks the official /api gate applies
 * (`dsh-client-connection`'s api-request-trust; the predicate itself is not
 * exported by the SDK, so this module reproduces its documented semantics
 * verbatim) — plus a loopback socket check. Balance detail is served ONLY
 * to loopback clients; unpaired LAN clients are refused outright. POST
 * routes require `application/json`, request bodies are size-capped, and no
 * response ever carries the API key, raw DeepSeek internals, or headers.
 */
/** Maximum JSON request body (refresh has no meaningful payload). */
export const MAX_BODY_BYTES = 8 * 1024;
/** Route prefix owned by this plugin. */
export const USAGE_API_PREFIX = '/api/deepseek-usage';
/**
 * Whether the request's socket peer is loopback (127/8, ::1, v4-mapped).
 */
export function isLoopbackSocket(req) {
    const address = req.socket.remoteAddress;
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
/** Whether a normalized hostname names the loopback authority (127/8, ::1, localhost). */
function isLoopbackHostname(hostname) {
    if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1')
        return true;
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
    if (ipv4 !== null) {
        return Number.parseInt(ipv4[1], 10) === 127;
    }
    return false;
}
/**
 * The DSH browser-trust fence, reproduced from the official
 * api-request-trust semantics (Host must be loopback — no trustedHosts are
 * declared by this plugin; `sec-fetch-site` must not be cross-site; a
 * present Origin must be same-host). DNS-rebinding defense: over plain HTTP
 * a browser attaches no Origin/Fetch-Metadata to reads, so the Host check is
 * the one rebinding cannot forge.
 */
export function isTrustedUsageRequest(req) {
    const host = req.headers.host;
    if (typeof host !== 'string')
        return false;
    let hostUrl;
    try {
        hostUrl = new URL(`http://${host}`);
    }
    catch {
        return false;
    }
    if (!isLoopbackHostname(hostUrl.hostname))
        return false;
    if (req.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = req.headers.origin;
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === hostUrl.host;
    }
    catch {
        return false;
    }
}
/** The combined gate: trust fence + loopback socket. */
export function isLoopbackClient(req) {
    return isLoopbackSocket(req) && isTrustedUsageRequest(req);
}
/** Write one JSON response with a no-referrer policy. */
export function writeJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'referrer-policy': 'no-referrer',
    });
    res.end(payload);
}
/** Read a request body with a hard size cap (undefined when over/undecipherable). */
async function readCappedBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        size += buffer.length;
        if (size > MAX_BODY_BYTES)
            return undefined;
        chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
}
/** Refuse a request whose content type is not application/json. */
function hasJsonContentType(req) {
    const contentType = req.headers['content-type'];
    if (typeof contentType !== 'string')
        return false;
    return contentType.split(';')[0].trim().toLowerCase() === 'application/json';
}
/**
 * Build the /api/deepseek-usage route family.
 * @param deps - store, balance watch, endpoint facts, pricing.
 * @returns the exact routes to register on webServer.
 */
export function makeUsageRoutes(deps) {
    const { store, balance } = deps;
    /** Guard helper: fence + method check, writing the refusal itself. */
    const guard = (req, res, method) => {
        if (!isLoopbackClient(req)) {
            writeJson(res, 403, { error: 'forbidden: loopback-only' });
            return false;
        }
        if (req.method !== method) {
            writeJson(res, 405, { error: `method not allowed: ${req.method}` });
            return false;
        }
        return true;
    };
    /** Assemble the sanitized stats payload (balance only for loopback clients). */
    const statsPayload = (req) => {
        const today = deps.trendDayKeys()[deps.trendDayKeys().length - 1];
        const trend = deps.trendDayKeys().map(dayKey => store.dailyStats(dayKey));
        const daily = trend[trend.length - 1];
        const endpoint = deps.endpoint();
        const status = balance.getStatus();
        return {
            daily,
            trend,
            estimatedCost: deps.estimateDayCost(today),
            prices: deps.prices(),
            balance: isLoopbackClient(req) ? status.snapshot : null,
            balanceOmitted: !isLoopbackClient(req),
            balanceState: {
                state: status.state,
                lastSuccessAt: status.lastSuccessAt,
                lastErrorCode: status.lastErrorCode,
            },
            meta: {
                timezone: 'Asia/Shanghai',
                dataSource: 'session logs via sessionProjections + sessionQuery (exact provider usage only)',
                endpointBaseUrl: endpoint.baseUrl,
                endpointMatching: endpoint.matches,
                providerId: endpoint.providerId,
                updatedAt: deps.now?.() ?? Date.now(),
            },
        };
    };
    return [
        {
            kind: 'exact',
            path: `${USAGE_API_PREFIX}/stats`,
            handler: async (req, res) => {
                if (!guard(req, res, 'GET'))
                    return;
                writeJson(res, 200, statsPayload(req));
            },
        },
        {
            kind: 'exact',
            path: `${USAGE_API_PREFIX}/refresh`,
            handler: async (req, res) => {
                if (!guard(req, res, 'POST'))
                    return;
                // POST requires application/json (requirement); the payload itself is
                // ignored — refresh carries no parameters, so nothing client-supplied
                // ever reaches the balance fetch.
                if (!hasJsonContentType(req)) {
                    writeJson(res, 415, { error: 'content-type must be application/json' });
                    return;
                }
                const body = await readCappedBody(req);
                if (body === undefined) {
                    writeJson(res, 413, { error: 'request body too large' });
                    return;
                }
                const status = await balance.refreshNow();
                writeJson(res, 200, {
                    balance: status.snapshot,
                    balanceState: {
                        state: status.state,
                        lastSuccessAt: status.lastSuccessAt,
                        lastErrorCode: status.lastErrorCode,
                    },
                });
            },
        },
    ];
}
