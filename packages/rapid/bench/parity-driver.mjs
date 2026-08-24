// Drives autocannon over a list of targets from ONE node process (its
// programmatic API), so there is no shell-function-in-subshell PATH
// flakiness. Prints a table of avg req/s. Targets are passed as a JSON
// arg: [{label, url}, ...]; rounds/connections/duration via env.
import autocannon from 'autocannon';

const targets = JSON.parse(process.argv[2] ?? '[]');
const ROUNDS = Number(process.env.ROUNDS ?? '3');
const CONN = Number(process.env.CONN ?? '50');
const DUR = Number(process.env.DUR ?? '10');

const run = (url) =>
  new Promise((resolve, reject) => {
    autocannon({ url, connections: CONN, duration: DUR }, (err, res) => {
      if (err) reject(err);
      else resolve(Math.round(res.requests.average));
    });
  });

const results = {}; // label -> [round values]
for (let r = 0; r < ROUNDS; r++) {
  for (const t of targets) {
    // sequential: one load test at a time, so servers never contend
    const v = await run(t.url);
    (results[t.label] ??= []).push(v);
  }
}

const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
const out = targets.map((t) => ({
  label: t.label,
  rounds: results[t.label],
  avg: avg(results[t.label]),
}));
console.log(JSON.stringify(out, null, 0));
