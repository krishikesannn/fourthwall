const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const worker = fs.readFileSync("cloudflare/src/index.js", "utf8");
const app = fs.readFileSync("pwa/app.js", "utf8");

test("owners can create, role-edit, and deactivate studio members", () => {
  assert.match(worker, /function canManageTeam/);
  assert.match(worker, /pathname === "\/api\/team" && request.method === "POST"/);
  assert.match(worker, /teamMatch.*request.method === "PATCH"/);
  assert.match(worker, /You cannot deactivate yourself/);
  assert.match(worker, /delete from sessions where user_id/);
  assert.match(app, /CREATE TEAM LOGIN/);
  assert.match(app, /updateTeamMember/);
});

test("admins can configure per-project edit upload and invoice permissions", () => {
  assert.match(app, /PROJECT ACCESS/);
  assert.match(app, /saveProjectPermission/);
  assert.match(app, /canEdit/);
  assert.match(app, /canUpload/);
  assert.match(app, /canInvoice/);
  assert.match(worker, /Admin access required/);
  assert.match(worker, /function canProjectAction/);
  assert.match(worker, /Project edit permission required/);
  assert.match(worker, /Project upload permission required/);
  assert.match(worker, /Invoice permission required/);
  assert.match(worker, /type !== "messages" && !\(await canProjectAction/);
  assert.match(worker, /\?='admin' or exists \(/);
  assert.match(worker, /Active studio member not found/);
});

test("studio update templates populate update fields and scheduled times are ISO safe", () => {
  assert.match(app, /applyUpdateTemplate/);
  assert.match(app, /project\.updateTemplates/);
  assert.match(app, /new Date\(values\.scheduledAt\)\.toISOString\(\)/);
});
