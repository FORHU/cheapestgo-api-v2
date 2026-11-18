# Hotel search is cached for five minutes

**Status:** accepted · 2026-11-18

`HotelsService.search` called the supplier on every request. Redis has been in this service for
some time, but only three things used it — Google POI details, and OAuth state in two auth
routes — so the belief that "caching is integrated" was true of the service and false of the
thing travellers wait for. Every search on `dev.cheapestgo.com` and `v2.cheapestgo.com` was a
live supplier round trip, including the second identical one a minute later.

**An identical hotel search is answered from Redis for five minutes.** Identical means the whole
question — destination, canonical city, dates, adults, children, rooms, currency, country, and
the `rung` and `bbox` that cut a city answer back to a borough. Anything less in the key serves
one traveller the answer to somebody else's question, which is worse than being slow.

**The whole finished result is cached and replayed as a stream.** `/hotels/search/stream` sends
two passes: a first answer that stops the spinner, then a collecting pass that adds hotels and
fills in pictures. The cache stores the state after both, and a hit replays it in the same SSE
shape, so no client changes to read it. A search abandoned part-way is not cached — a partial
answer stored as a complete one would be served to everybody for the next five minutes.

**Five minutes, and the number lives on the server.** It is the window in which a traveller
compares a few properties and in which several people search the same city. A client may decide
when to re-ask; it may not decide how old an answer may be. See **Freshness Window** in
CONTEXT.md.

## Considered Options

**Caching in the clients** was rejected as the primary fix, having been the first plan. It makes
Back instant, which is the reported complaint, and it leaves the first search exactly as slow
and puts the freshness rule in each client to be re-invented and to drift. Freshness is one
policy about prices and belongs in one place. The client work still happens — see Consequences
— but as view state, not as a second opinion about how old a price may be.

**Caching only the first pass** was rejected. It keeps the collecting pass live, which sounds
safer, and the collecting pass is the slow half; caching the cheap part and re-running the
expensive one gets the trade backwards.

**Caching the supplier response rather than the answer** was rejected on effort for benefit. One
supplier answer could serve several differently-filtered queries, which is appealing, and every
request would still pay for enrichment, filtering and streaming — a hit would be faster, not
fast.

**A longer window** was rejected. Fifteen minutes saves more calls and sends more travellers to
a changed price at checkout. Prebook catches it and re-quotes, so nobody is ever charged the
stale figure, but "the price went up while you were reading" is a sentence to say rarely.

## Consequences

**A traveller can be shown a price that has moved**, and that is accepted deliberately because
two things catch it before money does. Prebook returns `409 PRICE_CHANGED` with the server's
price and `use-hotel-checkout.ts` re-quotes automatically, once; and api-v2 charges from the
saved prebook quote, never from the figure the page displayed. The failure mode is an honest
"this went up, still want it?", not a surprise on a card statement.

**Back-navigation is still a rebuild until the web app keeps its results.** The cache makes each
pass cheap; it does not stop the page remounting, reopening the stream and re-rendering the map.
`search/page.tsx` fetches into component state from a `useEffect` and does not use React Query,
so the 60-second `staleTime` in `query-client.ts` has never applied to search. That is a second,
smaller change: paint what is already held, refresh behind it.

**`REDIS_URL` comes from the host, not from the deploy workflow**, which that workflow says in
its header. Dev therefore has a working Redis already — unlike `GOOGLE_NATIVE_CLIENT_IDS`, which
the workflow never published and which left native Google sign-in dead on dev. Worth stating
because the two look alike and are not.
