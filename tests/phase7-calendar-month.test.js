const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const worker = fs.readFileSync("cloudflare/src/index.js", "utf8");
const app = fs.readFileSync("pwa/app.js", "utf8");
const sw = fs.readFileSync("pwa/sw.js", "utf8");

test("calendar API validates month and returns the selected month", () => {
  assert.match(worker, /\^\\d\{4\}-\(0\[1-9\]\|1\[0-2\]\)\$/);
  assert.match(worker, /month: month \|\| new Date\(\)\.toISOString\(\)\.slice\(0, 7\)/);
});

test("studio calendar lifecycle transitions are role protected", () => {
  assert.match(worker, /contentPostMatch.*request\.method === "PATCH"[\s\S]*Studio access required/);
  assert.match(worker, /"scheduled", "published"/);
  assert.match(app, /setContentStatus/);
});

test("client and studio receive an offline-ready navigable month view", () => {
  assert.match(app, /function calendarMonthView/);
  assert.match(app, /calendar-weekdays/);
  assert.match(app, /changeContentMonth\(-1\)/);
  assert.match(app, /changeContentMonth\(1\)/);
  assert.match(sw, /calendar\.css/);
});
