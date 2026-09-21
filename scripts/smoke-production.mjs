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
  [/href="contact\.html"/i, "the inquiry link"],
]);
const homeHtml = await (await request(`${site}/`)).text();
check(
  !/href="(pwa\/|portal\.html|admin\.html)/i.test(homeHtml),
  "the homepage still links to a login page",
);

// Login is switched off: every entry point must send visitors back to the homepage.
for (const pathname of ["/pwa/", "/portal.html", "/admin.html"]) {
  const response = await request(`${site}${pathname}`, { redirect: "manual" });
  check(
    [301, 302, 307, 308].includes(response.status),
    `${pathname} should redirect to the homepage, received ${response.status}`,
  );
  check(
    /^(https?:\/\/[^/]+)?\/$/.test(response.headers.get("location") || ""),
    `${pathname} should redirect to the homepage`,
  );
}

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

// The contact form posts cross-origin to the Worker, so the browser preflight must allow POST + JSON.
const inquiryCors = await request(`${api}/api/inquiries`, {
  method: "OPTIONS",
  headers: {
    origin: site,
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type",
  },
});
check([200, 204].includes(inquiryCors.status), `Inquiry preflight returned ${inquiryCors.status}`);
check(
  inquiryCors.headers.get("access-control-allow-methods")?.includes("POST"),
  "Inquiry preflight does not allow POST",
);
check(
  inquiryCors.headers.get("access-control-allow-headers")?.toLowerCase().includes("content-type"),
  "Inquiry preflight does not allow the JSON content-type header",
);

// An empty inquiry is rejected by validation before anything is stored or emailed.
const emptyInquiry = await request(`${api}/api/inquiries`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: site },
  body: "{}",
});
check(
  emptyInquiry.status === 400,
  `An empty inquiry should be rejected with 400, received ${emptyInquiry.status}`,
);

console.log(
  "Production smoke check passed: homepage, login redirects, Worker health, inquiry endpoint, and auth boundaries.",
);
