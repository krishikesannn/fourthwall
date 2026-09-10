const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const worker = fs.readFileSync("cloudflare/src/index.js", "utf8");
const app = fs.readFileSync("pwa/app.js", "utf8");
const migration = fs.readFileSync("cloudflare/migrations/0016_operational_reminders.sql", "utf8");
const config = fs.readFileSync("cloudflare/wrangler.toml", "utf8");

test("owners can configure white-label PDF and email branding", () => {
  assert.match(worker, /pathname === "\/api\/studio-branding" && request\.method === "PATCH"/);
  assert.match(worker, /canManageTeam\(env, user\)/);
  assert.match(worker, /insert into studio_branding/);
  assert.match(worker, /branding\.studio_name/);
  assert.match(worker, /branding\.email_footer/);
  assert.match(app, /White-label branding/);
  assert.match(app, /updateStudioBranding/);
});

test("daily scheduler sends deduplicated renewal and meeting reminders", () => {
  assert.match(migration, /renewal_reminder_sent_at/);
  assert.match(worker, /function sendOperationalReminders/);
  assert.match(worker, /renewal_reminder_sent_at is null/);
  assert.match(worker, /reminder_sent_at is null/);
  assert.match(worker, /update meetings set reminder_sent_at=current_timestamp/);
  assert.match(config, /crons = \["0 4 \* \* \*"\]/);
  assert.match(worker, /getUTCDay\(\) === 1/);
});
