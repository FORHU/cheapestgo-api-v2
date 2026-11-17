// Fault injection for the sandbox E2E run. Preloaded into a private API copy (node -r).
//
// Wraps global fetch and, for Duffel calls only, applies the rules in FAULT_FILE:
//   { "rules": [ { "method": "POST", "path": "^/air/orders$", "action": "...", "times": 1, ... } ] }
// Actions:
//   throw-before     the request never leaves; fetch throws as a dropped connection would
//   throw-after      the request reaches Duffel (the order is really made), then fetch throws
//                    as if our 130s timeout fired before the answer came back
//   respond          answer with { status, body } without calling Duffel
//   strip-documents  forward, then remove the order's ticket documents (ticketing delayed)
//   raise-total      forward, then multiply data.total_amount by `factor` (fare rose)
// Every applied fault is appended to FAULT_LOG, so the run records what was injected.
const fs = require('fs');
const FAULT_FILE = process.env.FAULT_FILE;
const FAULT_LOG = process.env.FAULT_LOG;
const realFetch = globalThis.fetch;

function readRules() {
  try { return JSON.parse(fs.readFileSync(FAULT_FILE, 'utf8')).rules ?? []; } catch { return []; }
}
function writeRules(rules) { fs.writeFileSync(FAULT_FILE, JSON.stringify({ rules }, null, 1)); }
function log(entry) { if (FAULT_LOG) fs.appendFileSync(FAULT_LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n'); }

globalThis.fetch = async function faultyFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  if (!url.startsWith('https://api.duffel.com')) return realFetch(input, init);

  const method = (init.method ?? 'GET').toUpperCase();
  const path = new URL(url).pathname;
  const rules = readRules();
  const i = rules.findIndex((r) => r.times > 0 && r.method === method && new RegExp(r.path).test(path));
  if (i < 0) return realFetch(input, init);

  const rule = rules[i];
  rule.times -= 1;
  writeRules(rules);
  log({ method, path, action: rule.action });

  if (rule.action === 'throw-before') {
    throw new TypeError('fetch failed (injected: connection dropped before the request went out)');
  }
  if (rule.action === 'respond') {
    return new Response(JSON.stringify(rule.body ?? {}), { status: rule.status ?? 500, headers: { 'content-type': 'application/json' } });
  }

  const res = await realFetch(input, init);
  if (rule.action === 'throw-after') {
    const text = await res.text();
    log({ method, path, note: 'real response withheld', status: res.status, orderId: (() => { try { return JSON.parse(text).data?.id; } catch { return null; } })() });
    const err = new DOMException('The operation was aborted due to timeout (injected after the request reached Duffel)', 'TimeoutError');
    throw err;
  }
  const json = await res.json();
  if (rule.action === 'strip-documents' && json?.data) {
    log({ method, path, note: 'documents stripped', orderId: json.data.id, had: (json.data.documents ?? []).length });
    json.data.documents = [];
  }
  if (rule.action === 'scale' && json?.data?.[rule.field] != null) {
    const before = json.data[rule.field];
    json.data[rule.field] = (Number(before) * rule.factor).toFixed(2);
    log({ method, path, note: `${rule.field} scaled`, before, after: json.data[rule.field] });
  }
  if (rule.action === 'raise-total' && json?.data?.total_amount) {
    const before = json.data.total_amount;
    json.data.total_amount = (Number(before) * (rule.factor ?? 1.5)).toFixed(2);
    log({ method, path, note: 'total raised', before, after: json.data.total_amount });
  }
  return new Response(JSON.stringify(json), { status: res.status, headers: { 'content-type': 'application/json' } });
};
