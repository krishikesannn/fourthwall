const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const worker = fs.readFileSync("cloudflare/src/index.js", "utf8");
const app = fs.readFileSync("pwa/app.js", "utf8");

test("project archive remains scoped by project authorization", () => {
  assert.match(worker, /projectId && !\(await canAccessProject/);
  assert.match(worker, /Choose one project for a file archive/);
  assert.match(worker, /where project_id=\?/);
});

test("client export ZIP contains project JSON and private storage files", () => {
  assert.match(worker, /function createZip/);
  assert.match(worker, /project-export\.json/);
  assert.match(worker, /storageObject\(env, file\.storage_path\)/);
  assert.match(worker, /"content-type": "application\/zip"/);
  assert.match(worker, /50 \* 1024 \* 1024/);
  assert.match(app, /EXPORT PROJECT \+ FILES \(\.ZIP\)/);
  assert.match(app, /downloadProjectArchive/);
});
