// node run.js <case> [<case> ...]   — runs cases in order, writes results/<case>.json
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const cases = require('./cases');

(async () => {
  const names = process.argv.slice(2);
  fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
  for (const name of names) {
    const t0 = Date.now();
    let out;
    try {
      out = await cases[name]();
    } catch (err) {
      out = { error: err.message, step: err.step };
    } finally {
      L.clearFaults();
    }
    // The session token is for chaining cases in-process; it never goes into a results file.
    if (out.forLater) delete out.forLater.token;
    out.case = name;
    out.seconds = Math.round((Date.now() - t0) / 1000);
    fs.writeFileSync(path.join(__dirname, 'results', `${name}.json`), JSON.stringify(out, null, 1));
    const v = out.v ?? {};
    console.log(`\n=== ${name} (${out.seconds}s) — ${out.error ? 'ERROR ' + out.error : v.pass ? 'PASS' : 'FAIL'}`);
    if (!out.error) {
      console.log('steps   ', JSON.stringify(out.steps));
      console.log('stripe  ', JSON.stringify(out.st.stripe));
      console.log('session ', JSON.stringify(out.st.session));
      console.log('events  ', out.st.events.join(' | '));
      console.log('sale    ', JSON.stringify(out.st.sale));
      console.log('duffel  ', JSON.stringify(out.st.duffelOrder), 'orders since start:', JSON.stringify(out.orders));
      console.log('verdict ', JSON.stringify(v));
      console.log('expected', out.expect);
    }
  }
  await L.prisma.$disconnect();
})();
