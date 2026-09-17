/**
 * The deadlines a flight search runs against, in one place.
 *
 * A search crosses three of them — the provider's own per-attempt timeout, the
 * orchestrator's ceiling on that provider, and the browser's abort. They used to be
 * three numbers chosen independently, and two of them landed on 12s: `searchFlights`
 * raced the whole of `searchDuffel` — retries included — against the same 12s that
 * `searchDuffel` allows for a *single* attempt. The retry ladder could never deliver,
 * and a first attempt a few hundred milliseconds slow came back as zero offers with
 * `success: true`, which the results page renders as the ordinary "No flights found".
 *
 * Deriving each deadline from the one below it is what stops them drifting back apart.
 */

/** One attempt's own network deadline, passed to `AbortSignal.timeout`. */
export const PROVIDER_ATTEMPT_TIMEOUT_MS = 12_000;

/**
 * How long to wait before each retry. Its length IS the retry count.
 *
 * One retry, not two. A second retry only starts after the ladder has already spent
 * 26 seconds, and nothing it returns arrives while the traveller is still watching.
 */
export const PROVIDER_RETRY_BACKOFF_MS: readonly number[] = [2_000];

/** Every attempt timing out, every backoff waited — the longest a healthy adapter runs. */
export const PROVIDER_WORST_CASE_MS =
    (PROVIDER_RETRY_BACKOFF_MS.length + 1) * PROVIDER_ATTEMPT_TIMEOUT_MS +
    PROVIDER_RETRY_BACKOFF_MS.reduce((a, b) => a + b, 0);

/**
 * The orchestrator's ceiling on a provider. This is a circuit breaker for an adapter
 * that ignores its own deadline, NOT a second opinion on how long a search may take —
 * which is why it sits above the ladder rather than inside it.
 */
export const PROVIDER_CEILING_MS = PROVIDER_WORST_CASE_MS + 3_000;

/** The browser's abort. Must outlast the server, or a slow success is never seen. */
export const CLIENT_SEARCH_TIMEOUT_MS = PROVIDER_CEILING_MS + 5_000;

/** When the browser starts telling the user the search is taking a while. */
export const CLIENT_SLOW_SEARCH_MS = 15_000;
