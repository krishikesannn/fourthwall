const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (path) => fs.readFileSync(path, "utf8");
const worker = read("cloudflare/src/index.js");
const app = read("pwa/app.js");
const migration = read("cloudflare/migrations/0015_proposal_builder.sql");

test("proposal builder stores reusable priced service blocks", () => {
  assert.match(migration, /table if not exists proposal_service_templates/);
  assert.match(migration, /service-brand-strategy/);
  assert.match(worker, /\/api\/proposal-services/);
  assert.match(worker, /Studio access required/);
});

test("proposal builder generates and securely stores a branded PDF", () => {
  assert.match(worker, /function proposalPdf/);
  assert.match(worker, /uploadGeneratedPdf/);
  assert.match(worker, /application\/pdf/);
  assert.match(worker, /proposal_pdf/);
  assert.match(app, /CREATE PROPOSAL \+ PDF/);
  assert.match(app, /generateProposalPdf/);
});

test("Dropbox Sign completion webhook verifies events and marks proposals signed", () => {
  assert.match(worker, /\/api\/webhooks\/dropbox-sign/);
  assert.match(worker, /event_hash/);
  assert.match(worker, /signature_request_all_signed/);
  assert.match(worker, /status='signed'/);
});
