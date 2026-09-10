const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const worker = fs.readFileSync("cloudflare/src/index.js", "utf8");
const app = fs.readFileSync("pwa/app.js", "utf8");

test("analytics reports paid revenue grouped by service", () => {
  assert.match(worker, /where i\.status='paid' group by p\.service,i\.currency/);
  assert.match(worker, /revenue: revenue\.results/);
  assert.match(app, /Paid revenue by service/);
});

test("time tracking reports weekly totals globally and per project", () => {
  assert.match(worker, /strftime\('%Y-W%W',te\.started_at\)/);
  assert.match(worker, /strftime\('%Y-W%W',started_at\)/);
  assert.match(worker, /weeklyTime: weeklyTime\.results/);
  assert.match(app, /Weekly studio time/);
  assert.match(app, /WEEKLY TOTALS/);
});
