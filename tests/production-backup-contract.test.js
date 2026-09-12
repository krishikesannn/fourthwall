const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const workflow = fs.readFileSync(".github/workflows/production-backup.yml", "utf8");
const validator = fs.readFileSync("scripts/validate-d1-backup.mjs", "utf8");
const runbook = fs.readFileSync("docs/production-backup-recovery.md", "utf8");

test("backup workflow is scheduled, manual, private, and fails safely", () => {
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN:.*secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /d1 export the-fourth-wall/);
  assert.match(workflow, /--remote/);
  assert.match(workflow, /retention-days: 7/);
  assert.match(workflow, /if-no-files-found: error/);
});

test("backup validator rejects partial exports and produces integrity evidence", () => {
  assert.match(validator, /unexpectedly small/);
  assert.match(validator, /CREATE TABLE/);
  assert.match(validator, /INSERT INTO/);
  assert.match(validator, /appears incomplete/);
  assert.match(validator, /sha256/);
  assert.match(validator, /gzipSync/);
});

test("recovery guidance protects production and requires verification", () => {
  assert.match(runbook, /Never test restoration against production/);
  assert.match(runbook, /Verify its checksum/);
  assert.match(runbook, /pause writes first/i);
  assert.match(runbook, /rollback possible/i);
});

test("validator packages complete exports and rejects corrupted ones", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fourthwall-backup-test-"));
  const source = path.join(temporaryRoot, "production-backup.sql");
  const output = path.join(temporaryRoot, "output");
  const completeSql = [
    "BEGIN TRANSACTION;",
    "CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL);",
    ...Array.from({ length: 20 }, (_, index) =>
      `INSERT INTO projects VALUES ('project-${index}', 'Project ${index}');`,
    ),
    "COMMIT;",
  ].join("\n");

  try {
    fs.writeFileSync(source, completeSql);
    const valid = spawnSync(process.execPath, ["scripts/validate-d1-backup.mjs", source, output], {
      encoding: "utf8",
    });
    assert.equal(valid.status, 0, valid.stderr);
    assert.ok(fs.statSync(path.join(output, "production-backup.sql.gz")).size > 0);
    assert.match(fs.readFileSync(path.join(output, "production-backup.sql.sha256"), "utf8"), /^[a-f0-9]{64}/);

    fs.writeFileSync(source, "CREATE TABLE incomplete (id TEXT);");
    const invalid = spawnSync(process.execPath, ["scripts/validate-d1-backup.mjs", source, output], {
      encoding: "utf8",
    });
    assert.notEqual(invalid.status, 0);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
