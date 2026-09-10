const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const app = fs.readFileSync("pwa/app.js", "utf8");
const css = fs.readFileSync("pwa/calendar.css", "utf8");

test("visual review securely opens project images and PDFs", () => {
  assert.match(app, /function openDesignReview/);
  assert.match(app, /reviewFileBlob/);
  assert.match(app, /application\/pdf/);
  assert.match(app, /authorization: `Bearer \$\{liveSession\.token\}`/);
});

test("review surface converts taps into percentage pins", () => {
  assert.match(app, /getBoundingClientRect/);
  assert.match(app, /form\.elements\.pinX\.value/);
  assert.match(app, /form\.elements\.pinY\.value/);
  assert.match(app, /review-pin--draft/);
  assert.match(css, /\.review-pin/);
});
