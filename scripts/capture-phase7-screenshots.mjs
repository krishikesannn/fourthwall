import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const browserPath =
  process.env.TFW_BROWSER || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 12000 + (process.pid % 20000);
const outputDir = path.resolve("docs", "screenshots", "phase-7");
const profileDir = await mkdtemp(path.join(tmpdir(), "tfw-phase7-review-"));
const appUrl = "http://localhost:3000/pwa/index.html?api=http://127.0.0.1:8787/api";

await mkdir(outputDir, { recursive: true });
const browser = spawn(
  browserPath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--window-size=1440,1000",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let tabs;
for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    tabs = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    if (tabs.length) break;
  } catch {}
  await pause(250);
}
if (!tabs?.length) throw new Error("Chrome DevTools did not become ready");
const page =
  tabs.find((tab) => tab.type === "page" && tab.url === "about:blank") ||
  tabs.find((tab) => tab.type === "page" && !tab.url.startsWith("chrome-extension://"));
if (!page) throw new Error("No controllable browser page was found");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});
function cdp(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, label) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(expression)) return;
    await pause(125);
  }
  const diagnostic = await evaluate(
    "JSON.stringify({url:location.href,title:document.title,text:document.body?.innerText?.slice(0,240)})",
  );
  throw new Error(`Timed out waiting for ${label}: ${diagnostic}`);
}
async function viewport(width, height, mobile = false) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
  await evaluate("window.scrollTo(0,0)");
  await pause(150);
}
async function screenshot(name, fullPage = false) {
  await pause(500);
  let params = { format: "png", captureBeyondViewport: fullPage };
  if (fullPage) {
    const metrics = await cdp("Page.getLayoutMetrics");
    params.clip = {
      x: 0,
      y: 0,
      width: metrics.cssContentSize.width,
      height: Math.min(metrics.cssContentSize.height, 14000),
      scale: 1,
    };
  }
  const capture = await cdp("Page.captureScreenshot", params);
  await writeFile(path.join(outputDir, name), Buffer.from(capture.data, "base64"));
}
async function scrollToHeading(text) {
  await evaluate(`(() => { const target=[...document.querySelectorAll('section')].find((node)=>node.innerText.includes(${JSON.stringify(text)})); if(!target) return false; target.scrollIntoView({block:'start'}); return true; })()`);
  await pause(200);
}

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Runtime.evaluate", { expression: `location.href=${JSON.stringify(appUrl)}` });
  await pause(300);
  await waitFor("location.href.startsWith('http://localhost:3000/pwa/index.html')", "app navigation");
  await waitFor("document.readyState !== 'loading'", "app document");
  await evaluate("localStorage.clear()");
  await cdp("Page.reload", { ignoreCache: true });
  await waitFor("document.querySelector('#loginForm') !== null", "login screen");
  await viewport(390, 844, true);
  await screenshot("01-login-mobile.png");

  await evaluate("document.querySelector('[data-mode=studio]').click()");
  await evaluate(`(() => { const f=document.querySelector('#loginForm'); f.elements.email.value='studio@local.test'; f.elements.password.value='EditorialStudio2026!'; f.requestSubmit(); })()`);
  await waitFor("document.body.innerText.includes('Good morning')", "studio overview");
  await viewport(1440, 1000, false);
  await screenshot("02-studio-overview-desktop.png");

  await evaluate("openLeadPipeline()");
  await waitFor("document.querySelector('dialog[open] .pipeline') !== null", "lead pipeline");
  await screenshot("03-lead-pipeline-desktop.png");
  await evaluate("document.querySelector('dialog[open]').close()");

  await evaluate("openOperations()");
  await waitFor("document.querySelector('dialog[open] .operations') !== null", "studio operations");
  await screenshot("04-studio-operations-desktop.png");
  await evaluate("(() => { const target=[...document.querySelectorAll('dialog[open] h3')].find((node)=>node.textContent.trim()==='White-label branding'); if(!target) return false; target.scrollIntoView({block:'start'}); return true; })()");
  await screenshot("04b-studio-branding-desktop.png");
  await evaluate("document.querySelector('dialog[open]').close()");

  await evaluate("openAnalytics()");
  await waitFor("document.querySelector('dialog[open]')?.innerText.includes('STUDIO ANALYTICS')", "studio analytics");
  await screenshot("04c-studio-analytics-desktop.png");
  await evaluate("document.querySelector('dialog[open]').close()");

  await evaluate("go('projects')");
  await waitFor("document.body.innerText.includes('Saffron House')", "project list");
  await evaluate("openProject('5b123f6a-80f9-4d4c-ac6b-c5213b524d20')");
  await waitFor("document.body.innerText.includes('PROJECT DELIVERY')", "project editor");
  await screenshot("05-studio-project-delivery-desktop.png");
  await scrollToHeading("DESIGN REVIEW");
  await screenshot("06-review-and-calendar-desktop.png");
  await scrollToHeading("INVOICES & PAYMENTS");
  await screenshot("07-commercial-desk-desktop.png");

  await evaluate("signout()");
  await waitFor("document.querySelector('#loginForm') !== null", "client login");
  await viewport(390, 844, true);
  await evaluate("document.querySelector('[data-mode=client]').click()");
  await evaluate(`(() => { const f=document.querySelector('#loginForm'); f.elements.email.value='client@saffron.local'; f.elements.code.value='SAFFRON26'; f.requestSubmit(); })()`);
  await waitFor("document.body.innerText.includes('SAFFRON HOUSE') || document.body.innerText.includes('Saffron House')", "client project");
  await evaluate("window.scrollTo(0,0)");
  await screenshot("08-client-space-mobile.png");
  await scrollToHeading("BRAND ASSET LIBRARY");
  await screenshot("08b-client-brand-library-mobile.png");
  await scrollToHeading("PROJECT TIMELINE");
  await screenshot("09-client-collaboration-mobile.png");
  await scrollToHeading("DESIGN REVIEW");
  await screenshot("10-client-review-calendar-mobile.png");
  await scrollToHeading("INVOICES & PAYMENTS");
  await screenshot("11-client-commercial-mobile.png");
  await scrollToHeading("BRAND GUIDELINES");
  await screenshot("12-client-guidelines-mobile.png");
  await evaluate("openNotificationSettings()");
  await waitFor("document.querySelector('dialog[open]')?.innerText.includes('Notifications')", "notification settings");
  await screenshot("13-client-notifications-mobile.png");

  const bodyLength = await evaluate("document.body.innerText.trim().length");
  const overlay = await evaluate(
    "Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay'))",
  );
  if (!bodyLength || overlay) throw new Error("Rendered app failed the visual readiness check");
  console.log(`Captured 16 Phase 7 screenshots in ${outputDir}`);
} finally {
  socket.close();
  browser.kill();
}
