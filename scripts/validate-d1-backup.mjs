import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const [, , sourceArgument, outputArgument] = process.argv;

if (!sourceArgument || !outputArgument) {
  throw new Error("Usage: node scripts/validate-d1-backup.mjs <export.sql> <output-directory>");
}

const source = resolve(sourceArgument);
const outputDirectory = resolve(outputArgument);
const sql = await readFile(source);
const text = sql.toString("utf8");

if (sql.byteLength < 512) throw new Error("D1 export is unexpectedly small");
if (!/CREATE TABLE/i.test(text)) throw new Error("D1 export contains no table definitions");
if (!/INSERT INTO/i.test(text)) throw new Error("D1 export contains no table data");
if (!/(COMMIT|END TRANSACTION)/i.test(text)) throw new Error("D1 export appears incomplete");

const checksum = createHash("sha256").update(sql).digest("hex");
const archiveName = `${basename(source)}.gz`;
const createdAt = new Date().toISOString();

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDirectory, archiveName), gzipSync(sql, { level: 9 })),
  writeFile(resolve(outputDirectory, `${basename(source)}.sha256`), `${checksum}  ${basename(source)}\n`),
  writeFile(
    resolve(outputDirectory, "backup-metadata.json"),
    `${JSON.stringify({ createdAt, source: basename(source), bytes: sql.byteLength, sha256: checksum }, null, 2)}\n`,
  ),
]);

console.log(`Validated D1 backup: ${sql.byteLength} bytes, sha256 ${checksum}`);
