const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('cloudflare/migrations/0013_commercial_workspace.sql');
const worker=read('cloudflare/src/index.js');
const app=read('pwa/app.js');

test('commercial schema covers invoices proposals signatures and meetings',()=>{
  for(const table of ['invoices','invoice_items','proposals','proposal_blocks','meetings'])assert.match(migration,new RegExp(`table if not exists ${table}`));
  assert.match(migration,/payment_link_id text unique/);
  assert.match(migration,/signature_request_id text unique/);
});

test('commercial APIs are project scoped and role protected',()=>{
  assert.match(worker,/commercialMatch.*canAccessProject/s);
  assert.match(worker,/invoicesMatch.*studio\(user\)/s);
  assert.match(worker,/proposalsMatch.*studio\(user\)/s);
  assert.match(worker,/meetingsMatch.*canAccessProject/s);
});

test('providers use verified server-side production APIs',()=>{
  assert.match(worker,/api\.razorpay\.com\/v1\/payment_links/);
  assert.match(worker,/x-razorpay-signature/);
  assert.match(worker,/api\.hellosign\.com\/v3\/signature_request\/send/);
  assert.match(worker,/oauth2\.googleapis\.com\/token/);
  assert.match(worker,/conferenceDataVersion=1&sendUpdates=all/);
});

test('client and studio expose invoices e-sign and booking flows',()=>{
  for(const token of ['PAY BY CARD / UPI','SEND FOR E-SIGN','BOOK WITH GOOGLE CALENDAR','createInvoice','createProposal','bookMeeting'])assert.match(app,new RegExp(token));
  assert.match(read('pwa/sw.js'),/fourth-wall-v10/);
});
