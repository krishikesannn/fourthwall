const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const worker = fs.readFileSync("cloudflare/src/index.js", "utf8");

test("non-admin studio members have project-scoped global search", () => {
  const search = worker.slice(
    worker.indexOf('url.pathname === "/api/search"'),
    worker.indexOf('url.pathname === "/api/audit"'),
  );
  assert.match(search, /const globalProjectAccess = user\.role === "admin"/);
  assert.match(search, /p\.id in \(select project_id from project_members where user_id=\?\)/);
  assert.match(search, /projectQuery\.bind\(term, term, user\.id\)/);
  assert.match(search, /fileQuery\.bind\(term, user\.id\)/);
});

test("non-admin studio members have project-scoped audit history", () => {
  const audit = worker.slice(
    worker.indexOf('url.pathname === "/api/audit"'),
    worker.indexOf('url.pathname === "/api/operations"'),
  );
  assert.match(audit, /const globalAuditAccess = user\.role === "admin"/);
  assert.match(audit, /ae\.project_id in \(select project_id from project_members where user_id=\?\)/);
  assert.match(audit, /env\.DB\.prepare\(sql\)\.bind\(user\.id\)/);
  assert.match(audit, /canAccessProject\(env, user, projectId\)/);
});
