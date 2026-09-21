const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// Runs the real Worker source with a stubbed database and a stubbed email provider.
function loadWorker(fetchStub) {
  const source = fs
    .readFileSync('cloudflare/src/index.js', 'utf8')
    .replace(/^export default/m, 'module.exports =');
  const module = { exports: {} };
  new Function('module', 'fetch', 'console', source)(module, fetchStub, {
    error() {},
    log() {},
    warn() {},
  });
  return module.exports;
}

function makeEnv(extra = {}) {
  const inserts = [];
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              inserts.push({ sql, args });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return { env: { DB, ...extra }, inserts };
}

const emailConfig = {
  RESEND_API_KEY: 'test-key',
  INQUIRY_NOTIFICATION_TO: 'studio@example.test',
  INQUIRY_FROM_EMAIL: 'The Fourth Wall <alerts@example.test>',
};

function postInquiry(worker, env, payload) {
  return worker.fetch(
    new Request('https://api.example.test/api/inquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    env,
    {},
  );
}

const valid = {
  name: 'Asha Rao',
  email: 'asha@example.test',
  details: 'A brand identity for a tea shop.',
  service: 'Branding',
};

test('an inquiry is saved and emailed to the studio, with the visitor as reply-to', async () => {
  const calls = [];
  const worker = loadWorker(async (url, options) => {
    calls.push({ url, options });
    return new Response('{}', { status: 200 });
  });
  const { env, inserts } = makeEnv(emailConfig);
  const response = await postInquiry(worker, env, valid);
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.equal(result.ok, true);
  assert.equal(result.emailed, true);
  assert.equal(inserts.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].options.headers.authorization, 'Bearer test-key');
  const sent = JSON.parse(calls[0].options.body);
  assert.deepEqual(sent.to, ['studio@example.test']);
  assert.equal(sent.reply_to, 'asha@example.test');
  assert.match(sent.text, /A brand identity for a tea shop\./);
});

test('with no email provider configured the inquiry is still saved and the visitor is told it was not emailed', async () => {
  const worker = loadWorker(async () => {
    throw new Error('the email provider must not be called');
  });
  const { env, inserts } = makeEnv();
  const response = await postInquiry(worker, env, valid);
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.equal(result.emailed, false);
  assert.equal(inserts.length, 1);
});

test('a rejected email still saves the inquiry and reports emailed false', async () => {
  const worker = loadWorker(async () => new Response('rejected', { status: 403 }));
  const { env, inserts } = makeEnv(emailConfig);
  const response = await postInquiry(worker, env, valid);
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.equal(result.emailed, false);
  assert.equal(inserts.length, 1);
});

test('a network failure to the email provider still saves the inquiry', async () => {
  const worker = loadWorker(async () => {
    throw new Error('network down');
  });
  const { env, inserts } = makeEnv(emailConfig);
  const response = await postInquiry(worker, env, valid);

  assert.equal(response.status, 201);
  assert.equal((await response.json()).emailed, false);
  assert.equal(inserts.length, 1);
});

test('invalid inquiries and honeypot submissions store and email nothing', async () => {
  let emailed = 0;
  const worker = loadWorker(async () => {
    emailed += 1;
    return new Response('{}', { status: 200 });
  });
  const { env, inserts } = makeEnv(emailConfig);

  const empty = await postInquiry(worker, env, {});
  const badEmail = await postInquiry(worker, env, { ...valid, email: 'not-an-email' });
  const spam = await postInquiry(worker, env, { ...valid, website: 'http://spam.example' });

  assert.equal(empty.status, 400);
  assert.equal(badEmail.status, 400);
  assert.equal(spam.status, 202);
  assert.equal(inserts.length, 0);
  assert.equal(emailed, 0);
});

test('inquiry email HTML escapes visitor-supplied text', async () => {
  let body;
  const worker = loadWorker(async (url, options) => {
    body = JSON.parse(options.body);
    return new Response('{}', { status: 200 });
  });
  const { env } = makeEnv(emailConfig);
  await postInquiry(worker, env, { ...valid, details: '<script>alert(1)</script>' });

  assert.doesNotMatch(body.html, /<script>/);
  assert.match(body.html, /&lt;script&gt;/);
});
