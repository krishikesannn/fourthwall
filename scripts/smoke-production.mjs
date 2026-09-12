const site = (process.env.TFW_SITE_URL || "https://fourthwall.pages.dev").replace(/\/$/, "");
const api = (process.env.TFW_API_URL || "https://fourthwall.krishikesannn.workers.dev").replace(
  /\/$/,
  "",
);

async function request(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
        ...options,
      });
      if (response.status >= 500 && attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function checkPage(pathname, assertions) {
  const response = await request(`${site}${pathname}`);
  check(response.ok, `${pathname} returned ${response.status}`);
  const text = await response.text();
  for (const [pattern, label] of assertions)
    check(pattern.test(text), `${pathname} is missing ${label}`);
  return response;
}

await checkPage("/", [
  [/<title>The Fourth Wall/i, "the public homepage title"],
  [/hero-cover-seamless\.png/i, "the transparent parchment hero"],
  [/href="pwa\//i, "the client/studio login link"],
]);
await checkPage("/pwa/", [
  [/<link rel="manifest" href="manifest\.json"/i, "the PWA manifest"],
  [/id="app"/i, "the PWA app mount"],
]);

const manifestResponse = await request(`${site}/pwa/manifest.json`);
check(manifestResponse.ok, `PWA manifest returned ${manifestResponse.status}`);
const manifest = await manifestResponse.json();
check(manifest.name === "The Fourth Wall", "PWA manifest has the wrong app name");
check(manifest.display === "standalone", "PWA manifest is not installable in standalone mode");

const workerHealth = await request(`${api}/api/health`);
check(workerHealth.ok, `Worker health returned ${workerHealth.status}`);
const health = await workerHealth.json();
check(health.ok === true, "Worker health payload is not healthy");

for (const pathname of ["/api/projects", "/api/search?q=private", "/api/audit"]) {
  const response = await request(`${api}${pathname}`);
  check(
    response.status === 401,
    `${pathname} should reject anonymous access with 401, received ${response.status}`,
  );
}

const cors = await request(`${api}/api/health`, {
  method: "OPTIONS",
  headers: { origin: site, "access-control-request-method": "GET" },
});
check([200, 204].includes(cors.status), `Worker preflight returned ${cors.status}`);
check(
  cors.headers.get("access-control-allow-origin") === "*",
  "Worker preflight is missing its allowed origin header",
);
check(
  cors.headers.get("access-control-allow-methods")?.includes("PATCH"),
  "Worker preflight is missing required API methods",
);

console.log("Production smoke check passed: homepage, PWA, Worker health, and auth boundaries.");
