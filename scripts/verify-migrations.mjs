import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const migrationsDir = path.resolve("cloudflare", "migrations");
const config = path.resolve("cloudflare", "wrangler.toml");
const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort((left, right) => left.localeCompare(right));

if (!files.length) throw new Error("No database migrations were found");
files.forEach((file, index) => {
  const match = file.match(/^(\d{4})_[a-z0-9_]+\.sql$/);
  if (!match) throw new Error(`Migration name is invalid: ${file}`);
  const expected = String(index + 1).padStart(4, "0");
  if (match[1] !== expected)
    throw new Error(`Migration sequence is incomplete: expected ${expected}, found ${match[1]}`);
});

for (const file of files) {
  const sql = await readFile(path.join(migrationsDir, file), "utf8");
  if (/\b(drop\s+(table|database)|truncate)\b/i.test(sql))
    throw new Error(`${file} contains a destructive schema operation`);
  if (!sql.trim()) throw new Error(`${file} is empty`);
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "fourthwall-migrations-"));
const persistPath = path.join(temporaryRoot, "state");
const executable = process.execPath;
const wranglerCli = path.resolve("node_modules", "wrangler", "bin", "wrangler.js");
const environment = {
  ...process.env,
  WRANGLER_LOG_PATH: path.join(temporaryRoot, "wrangler.log"),
  NO_COLOR: "1",
};

function run(argumentsList) {
  const result = spawnSync(executable, [wranglerCli, ...argumentsList], {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    throw new Error(output.slice(-6000) || `Command failed with status ${result.status}`);
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

try {
  run([
    "d1",
    "migrations",
    "apply",
    "the-fourth-wall",
    "--local",
    "--config",
    config,
    "--persist-to",
    persistPath,
  ]);
  const verification = run([
    "d1",
    "execute",
    "the-fourth-wall",
    "--local",
    "--config",
    config,
    "--persist-to",
    persistPath,
    "--command",
    "pragma foreign_key_check; select count(*) table_count from sqlite_master where type='table' and name not like '_cf_%'; select count(*) migration_count from d1_migrations;",
  ]);
  const tableCount = Number(verification.match(/"table_count"\s*:\s*(\d+)/)?.[1]);
  const migrationCount = Number(verification.match(/"migration_count"\s*:\s*(\d+)/)?.[1]);
  if (!Number.isFinite(tableCount) || tableCount < 30)
    throw new Error(`Clean schema created only ${tableCount || 0} application tables`);
  if (migrationCount !== files.length)
    throw new Error(`Migration ledger has ${migrationCount || 0} entries; expected ${files.length}`);
  console.log(
    `Migration verification passed: ${files.length} ordered migrations, ${tableCount} tables, no foreign-key violations.`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
