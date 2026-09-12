const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const verifier = fs.readFileSync("scripts/verify-migrations.mjs", "utf8");
const workflow = fs.readFileSync(".github/workflows/migration-integrity.yml", "utf8");

test("migration verifier enforces ordering, safety, clean apply, and referential integrity", () => {
  assert.match(verifier, /Migration sequence is incomplete/);
  assert.match(verifier, /destructive schema operation/);
  assert.match(verifier, /d1[\s\S]*migrations[\s\S]*apply/);
  assert.match(verifier, /pragma foreign_key_check/);
  assert.match(verifier, /migration_count/);
  assert.match(verifier, /tableCount < 30/);
});

test("migration workflow gates migration changes and supports manual verification", () => {
  assert.match(workflow, /cloudflare\/migrations\/\*\*/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /timeout-minutes: 10/);
  assert.match(workflow, /node scripts\/verify-migrations\.mjs/);
});
