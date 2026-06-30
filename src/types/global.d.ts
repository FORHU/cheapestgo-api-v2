// Force Response.json() to return Promise<any> (WHATWG spec intent)
// @types/node 18+ tightened this to unknown, causing noise in API-layer code.
declare interface Body {
    json(): Promise<any>;
}
