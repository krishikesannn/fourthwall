const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const smoke = fs.readFileSync("scripts/smoke-production.mjs", "utf8");
const workflow = fs.readFileSync(".github/workflows/production-smoke.yml", "utf8");

test("production smoke check covers public, PWA, health, and authorization boundaries", () => {
  assert.match(smoke, /hero-cover-seamless\\\.png/);
  assert.match(smoke, /\/pwa\/manifest\.json/);
  assert.match(smoke, /\/api\/health/);
  assert.match(smoke, /\/api\/projects/);
  assert.match(smoke, /\/api\/search\?q=private/);
  assert.match(smoke, /\/api\/audit/);
  assert.match(smoke, /response\.status === 401/);
  assert.match(smoke, /\[200, 204\]\.includes\(cors\.status\)/);
  assert.match(smoke, /access-control-allow-origin/);
  assert.match(smoke, /access-control-allow-methods/);
});

test("production smoke workflow runs regularly and manually with bounded execution", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron: "17 \*\/6 \* \* \*"/);
  assert.match(workflow, /timeout-minutes: 5/);
  assert.match(workflow, /node scripts\/smoke-production\.mjs/);
});
