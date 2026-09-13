const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('cloudflare/src/index.js', 'utf8');
const start = source.indexOf('function pdfText(');
const end = source.indexOf('const CRC_TABLE');
const context = vm.createContext({ TextEncoder, Intl, encoder: new TextEncoder() });
vm.runInContext(`${source.slice(start, end)}; globalThis.renderProposal = proposalPdf;`, context);

test('proposal PDF bytes contain configured studio name, footer, and accent', () => {
  const bytes = context.renderProposal(
    { title: 'Brand Direction', introduction: 'A tailored proposal.', total: 125000, currency: 'INR' },
    [{ title: 'Strategy', description: 'Research and positioning.', amount: 125000 }],
    { studio_name: 'Fourth Wall Editions', accent_color: '#FF0000', email_footer: 'Private proposal for Acme.' },
  );
  const pdf = Buffer.from(bytes).toString('latin1');
  assert.match(pdf, /FOURTH WALL EDITIONS/);
  assert.match(pdf, /Private proposal for Acme\./);
  assert.match(pdf, /1\.000 0\.000 0\.000 rg 48 770 499 24 re f/);
});

test('invalid accent values fall back to antique gold', () => {
  assert.equal(vm.runInContext(`pdfRgb('javascript:bad')`, context), '0.722 0.573 0.275');
});
