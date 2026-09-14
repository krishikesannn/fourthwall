const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = fs.readFileSync('pwa/app.js', 'utf8');
const css = fs.readFileSync('pwa/editor.css', 'utf8');

test('every draggable lead also exposes a named keyboard and touch stage control', () => {
  assert.match(app, /draggable="true"/);
  assert.match(app, /<label>Move to stage<select aria-label="Move/);
  assert.match(app, /onchange="movePipelineLead/);
  assert.match(css, /\.pipeline-lead select[^}]*min-height: 44px/s);
});

test('keyboard stage changes use the same persisted status action as drops', () => {
  const functionBody = app.slice(app.indexOf('async function movePipelineLead'), app.indexOf('async function addLeadNote'));
  assert.match(functionBody, /await status\(id, next\)/);
  assert.match(functionBody, /openLeadPipeline\(\)/);
});
