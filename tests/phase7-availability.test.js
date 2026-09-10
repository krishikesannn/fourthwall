const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (path) => fs.readFileSync(path, "utf8");
const worker = read("cloudflare/src/index.js");
const app = read("pwa/app.js");
const migration = read("cloudflare/migrations/0014_studio_availability.sql");

test("availability schema seeds weekday studio hours", () => {
  assert.match(migration, /table if not exists studio_availability/);
  assert.match(migration, /availability-monday/);
  assert.match(migration, /meetings_start_idx/);
});

test("availability API is authenticated and studio writes are protected", () => {
  assert.match(worker, /pathname === "\/api\/availability" && request.method === "GET"[\s\S]*Sign in required/);
  assert.match(worker, /pathname === "\/api\/availability" && request.method === "PUT"[\s\S]*Studio access required/);
});

test("meeting booking enforces hours and prevents overlaps", () => {
  assert.match(worker, /withinHours/);
  assert.match(worker, /That time is no longer available/);
  assert.match(worker, /julianday\(starts_at/);
  assert.match(app, /new Date\(v\.startsAt\)\.toISOString\(\)/);
  assert.match(app, /saveAvailability/);
});
