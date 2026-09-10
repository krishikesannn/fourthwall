const encoder = new TextEncoder();
// Kept within Cloudflare Workers Free request CPU limits while still avoiding a
// single-pass password hash. Raise this when moving to a paid CPU allocation.
const PBKDF2_ITERATIONS = 50000;
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      ...headers,
    },
  });
const deny = (message, status = 401) => json({ error: message }, status);
const toHex = (bytes) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const random = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

async function digest(value) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}
function readToken(request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)tfw_session=([^;]+)/)?.[1];
  return bearer || cookie || null;
}
async function userFromRequest(request, env) {
  const token = readToken(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    "select u.id, u.email, u.display_name, u.role from sessions s join users u on u.id=s.user_id where s.token_hash=? and s.expires_at > datetime('now')",
  )
    .bind(await digest(token))
    .first();
  return row || null;
}
function cookie(token) {
  return `tfw_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
}
async function body(request) {
  return request.json().catch(() => null);
}
function studio(user) {
  return user && user.role !== "client";
}
async function canAccessProject(env, user, projectId) {
  if (studio(user)) return true;
  return Boolean(
    await env.DB.prepare("select 1 from project_members where project_id=? and user_id=?")
      .bind(projectId, user.id)
      .first(),
  );
}
const FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/zip",
]);
function safeFileName(value) {
  return (
    String(value || "file")
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "file"
  );
}
function storageHeaders(env, mimeType) {
  return {
    authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
    apikey: env.SUPABASE_SECRET_KEY,
    ...(mimeType ? { "content-type": mimeType } : {}),
  };
}
function storageReady(env) {
  return env.SUPABASE_URL && env.SUPABASE_SECRET_KEY && env.SUPABASE_STORAGE_BUCKET;
}
const base64url = (value) =>
  btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
async function razorpayLink(env, invoice, client) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw Error("Razorpay is not configured");
  const response = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: invoice.total,
      currency: invoice.currency,
      reference_id: invoice.id,
      description: `${invoice.invoice_number} · ${invoice.project_name}`,
      customer: { name: client?.display_name || "Client", email: client?.email },
      notify: { email: true, sms: false },
      reminder_enable: true,
      callback_url: env.PUBLIC_APP_URL || "https://fourthwall.pages.dev/",
      callback_method: "get",
      notes: { invoice_id: invoice.id, project_id: invoice.project_id },
    }),
  });
  if (!response.ok)
    throw Error(`Razorpay ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}
async function signedStorageUrl(env, path) {
  const response = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/sign/${env.SUPABASE_STORAGE_BUCKET}/${path}`,
    {
      method: "POST",
      headers: { ...storageHeaders(env), "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600 }),
    },
  );
  if (!response.ok) throw Error("Could not prepare contract file");
  const value = await response.json();
  return `${env.SUPABASE_URL}/storage/v1${value.signedURL}`;
}
function pdfText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/([\\()])/g, "\\$1");
}
function wrapPdf(value, width = 76) {
  const words = pdfText(value).split(/\s+/).filter(Boolean),
    lines = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > width && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines;
}
function proposalPdf(proposal, blocks, branding = {}) {
  const studioName = pdfText(branding.studio_name || "The Fourth Wall"),
    lines = [
      { text: studioName.toUpperCase(), size: 11, font: "F1", gap: 28 },
      { text: pdfText(proposal.title), size: 27, font: "F2", gap: 40 },
      ...wrapPdf(proposal.introduction || "A considered proposal for your next chapter.").map(
        (text) => ({ text, size: 11, font: "F1", gap: 16 }),
      ),
      { text: "SERVICES & INVESTMENT", size: 10, font: "F1", gap: 30 },
    ];
  blocks.forEach((block, index) => {
    lines.push({ text: `${index + 1}. ${pdfText(block.title)}`, size: 15, font: "F2", gap: 22 });
    wrapPdf(block.description, 82)
      .slice(0, 3)
      .forEach((text) => lines.push({ text, size: 9, font: "F1", gap: 13 }));
    lines.push({
      text: new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: proposal.currency || "INR",
        maximumFractionDigits: 0,
      })
        .format((Number(block.amount) || 0) / 100)
        .replace(/[^\x20-\x7e]/g, "INR "),
      size: 11,
      font: "F1",
      gap: 22,
    });
  });
  lines.push({
    text: `TOTAL  ${new Intl.NumberFormat("en-IN").format((Number(proposal.total) || 0) / 100)} ${pdfText(proposal.currency || "INR")}`,
    size: 14,
    font: "F2",
    gap: 30,
  });
  lines.push({ text: "Prepared with care. Valid for 30 days.", size: 9, font: "F1", gap: 15 });
  let y = 748,
    stream = "0.055 0.22 0.196 rg 48 770 499 24 re f\n";
  for (const line of lines.slice(0, 42)) {
    stream += `BT /${line.font} ${line.size} Tf 0.055 0.22 0.196 rg 54 ${Math.max(54, y)} Td (${line.text}) Tj ET\n`;
    y -= line.gap;
  }
  const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>",
    ],
    offsets = [0];
  let output = "%PDF-1.4\n";
  objects.forEach((object, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encoder.encode(output);
}
async function uploadGeneratedPdf(env, proposal, blocks, branding, userId) {
  if (!storageReady(env)) throw Error("Secure file storage is not configured");
  const bytes = proposalPdf(proposal, blocks, branding),
    fileId = crypto.randomUUID(),
    fileName = `${safeFileName(proposal.title)}.pdf`,
    storagePath = `${proposal.project_id}/proposals/${fileId}-${fileName}`,
    endpoint = `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}/${storagePath.split("/").map(encodeURIComponent).join("/")}`,
    stored = await fetch(endpoint, {
      method: "POST",
      headers: { ...storageHeaders(env, "application/pdf"), "x-upsert": "false" },
      body: bytes,
    });
  if (!stored.ok) throw Error(`Proposal PDF upload failed (${stored.status})`);
  await env.DB.batch([
    env.DB.prepare(
      "insert into project_files(id,project_id,storage_path,file_name,mime_type,size_bytes,version,uploaded_by) values(?,?,?,?,?,?,1,?)",
    ).bind(fileId, proposal.project_id, storagePath, fileName, "application/pdf", bytes.byteLength, userId),
    env.DB.prepare("update proposals set pdf_file_id=?,updated_at=current_timestamp where id=?").bind(
      fileId,
      proposal.id,
    ),
  ]);
  return { fileId, fileName, size: bytes.byteLength };
}
async function dropboxSignRequest(env, proposal, client, fileUrl) {
  if (!env.DROPBOX_SIGN_API_KEY) throw Error("Dropbox Sign is not configured");
  const response = await fetch("https://api.hellosign.com/v3/signature_request/send", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${env.DROPBOX_SIGN_API_KEY}:`)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      file_urls: [fileUrl],
      title: proposal.title,
      subject: `Signature requested: ${proposal.title}`,
      message: "Please review and sign your Fourth Wall proposal.",
      signers: [{ email_address: client.email, name: client.display_name, order: 0 }],
      metadata: { proposal_id: proposal.id, project_id: proposal.project_id },
      test_mode: env.DROPBOX_SIGN_TEST_MODE !== "false",
    }),
  });
  if (!response.ok)
    throw Error(`Dropbox Sign ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}
async function googleAccessToken(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
    throw Error("Google Calendar is not configured");
  const now = Math.floor(Date.now() / 1000),
    header = base64url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))),
    claims = base64url(
      encoder.encode(
        JSON.stringify({
          iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          scope: "https://www.googleapis.com/auth/calendar",
          aud: "https://oauth2.googleapis.com/token",
          iat: now,
          exp: now + 3600,
        }),
      ),
    ),
    pem = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n")
      .replace(/-----[^-]+-----/g, "")
      .replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    key = await crypto.subtle.importKey(
      "pkcs8",
      bytes,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    ),
    signature = base64url(
      await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(`${header}.${claims}`)),
    );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  if (!response.ok) throw Error("Google Calendar authorization failed");
  return (await response.json()).access_token;
}
async function googleCalendarEvent(env, meeting, attendees) {
  const token = await googleAccessToken(env),
    calendar = encodeURIComponent(env.GOOGLE_CALENDAR_ID || "primary"),
    end = new Date(
      new Date(meeting.starts_at).getTime() + meeting.duration_minutes * 60000,
    ).toISOString(),
    response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendar}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          summary: meeting.title,
          description: "The Fourth Wall project meeting",
          start: { dateTime: new Date(meeting.starts_at).toISOString() },
          end: { dateTime: end },
          attendees: attendees.map((email) => ({ email })),
          conferenceData: {
            createRequest: {
              requestId: meeting.id,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: "email", minutes: 1440 },
              { method: "popup", minutes: 30 },
            ],
          },
        }),
      },
    );
  if (!response.ok)
    throw Error(`Google Calendar ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}
async function audit(env, user, projectId, action, entityType, entityId, details = {}) {
  await env.DB.prepare(
    "insert into audit_events (id,actor_id,project_id,action,entity_type,entity_id,details) values (?,?,?,?,?,?,?)",
  )
    .bind(
      crypto.randomUUID(),
      user?.id || null,
      projectId || null,
      action,
      entityType,
      entityId || null,
      JSON.stringify(details).slice(0, 5000),
    )
    .run();
}
function projectInput(payload) {
  const name = String(payload?.name || "")
    .trim()
    .slice(0, 160);
  const service = String(payload?.service || "")
    .trim()
    .slice(0, 160);
  const status = ["planning", "active", "complete", "on_hold"].includes(payload?.status)
    ? payload.status
    : "planning";
  const dueDate = payload?.dueDate ? String(payload.dueDate).slice(0, 32) : null;
  const progress = Number.isInteger(Number(payload?.progress))
    ? Math.max(0, Math.min(100, Number(payload.progress)))
    : 0;
  return { name, service, status, dueDate, progress };
}
function clientAccessInput(payload) {
  const email = String(payload?.email || "")
    .trim()
    .toLowerCase()
    .slice(0, 200);
  const displayName = String(payload?.displayName || email.split("@")[0] || "Client")
    .trim()
    .slice(0, 120);
  const code = String(payload?.code || "").trim();
  return { email, displayName, code };
}

function escapeEmailHtml(value) {
  return String(value || "").replace(
    /[&<>\"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
}

// Notification delivery is intentionally best-effort: a temporary email-provider
// problem must never prevent a genuine lead from being saved in D1.
async function notifyStudioOfInquiry(env, inquiry) {
  if (!env.RESEND_API_KEY || !env.INQUIRY_NOTIFICATION_TO || !env.INQUIRY_FROM_EMAIL) return;
  const lines = [
    ["Name", inquiry.name],
    ["Email", inquiry.email],
    ["Phone", inquiry.phone || "Not provided"],
    ["Company", inquiry.company || "Not provided"],
    ["Service", inquiry.service || "General inquiry"],
    ["Project details", inquiry.details],
  ];
  const text = lines.map(([label, value]) => `${label}: ${value}`).join("\n\n");
  const html = lines
    .map(
      ([label, value]) =>
        `<p><strong>${escapeEmailHtml(label)}:</strong><br>${escapeEmailHtml(value).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.INQUIRY_FROM_EMAIL,
        to: [env.INQUIRY_NOTIFICATION_TO],
        reply_to: inquiry.email,
        subject: `New website inquiry — ${inquiry.name}`,
        text,
        html: `<h1>New website inquiry</h1>${html}`,
      }),
    });
    if (!response.ok)
      console.error("Inquiry email notification failed", response.status, await response.text());
  } catch (error) {
    console.error(
      "Inquiry email notification failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}
async function sendWeeklyDigests(env) {
  if (!env.RESEND_API_KEY || !env.INQUIRY_FROM_EMAIL) return;
  const users = await env.DB.prepare(
    "select u.id,u.email,u.display_name from notification_preferences np join users u on u.id=np.user_id where np.weekly_digest=1",
  ).all();
  for (const user of users.results) {
    const projects = await env.DB.prepare(
      "select p.id,p.name,p.progress,p.status from projects p join project_members pm on pm.project_id=p.id where pm.user_id=? and p.status!='complete'",
    )
      .bind(user.id)
      .all();
    const updates = await env.DB.prepare(
      "select pu.title,p.name project_name from project_updates pu join projects p on p.id=pu.project_id join project_members pm on pm.project_id=p.id where pm.user_id=? and pu.visible_to_client=1 and pu.created_at>=datetime('now','-7 days') order by pu.created_at desc limit 20",
    )
      .bind(user.id)
      .all();
    const text = [
      `Hello ${user.display_name},`,
      `Your weekly Fourth Wall digest`,
      ...projects.results.map((p) => `${p.name}: ${p.progress}% complete (${p.status})`),
      ...updates.results.map((u) => `${u.project_name}: ${u.title}`),
    ].join("\n\n");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.INQUIRY_FROM_EMAIL,
        to: [user.email],
        subject: "Your weekly Fourth Wall project digest",
        text,
      }),
    });
    if (!response.ok) console.error("Weekly digest failed", user.id, response.status);
  }
}
async function createSession(env, userId) {
  const token = random();
  const expires = new Date(Date.now() + 7 * 86400000).toISOString();
  await env.DB.prepare("insert into sessions (id,user_id,token_hash,expires_at) values (?,?,?,?)")
    .bind(crypto.randomUUID(), userId, await digest(token), expires)
    .run();
  return token;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS")
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
          "access-control-allow-headers": "content-type,authorization,x-file-name,x-deliverable-id",
        },
      });
    if (url.pathname === "/api/health") return json({ ok: true, service: "the-fourth-wall-api" });

    if (url.pathname === "/api/auth/bootstrap" && request.method === "POST") {
      if (
        !env.BOOTSTRAP_SECRET ||
        request.headers.get("x-bootstrap-secret") !== env.BOOTSTRAP_SECRET
      )
        return deny("Not allowed", 403);
      const existing = await env.DB.prepare("select id from users limit 1").first();
      if (existing) return deny("Workspace has already been initialized", 409);
      const { email, password, displayName = "Studio owner" } = (await body(request)) || {};
      if (
        !/^\S+@\S+\.\S+$/.test(email || "") ||
        typeof password !== "string" ||
        password.length < 12
      )
        return deny("Use a valid email and a password of at least 12 characters", 400);
      const salt = random();
      await env.DB.prepare(
        "insert into users (id,email,display_name,role,password_salt,password_hash) values (?,?,?,?,?,?)",
      )
        .bind(
          crypto.randomUUID(),
          email.trim().toLowerCase(),
          displayName.trim(),
          "admin",
          salt,
          await passwordHash(password, salt),
        )
        .run();
      return json({ ok: true }, 201);
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const { email, password } = (await body(request)) || {};
      const user = await env.DB.prepare("select * from users where email=?")
        .bind(
          String(email || "")
            .trim()
            .toLowerCase(),
        )
        .first();
      if (
        !user ||
        typeof password !== "string" ||
        (await passwordHash(password, user.password_salt)) !== user.password_hash
      )
        return deny("Invalid email or password");
      const token = await createSession(env, user.id);
      return json(
        {
          user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role },
          token,
        },
        200,
        { "set-cookie": cookie(token) },
      );
    }

    if (url.pathname === "/api/auth/client-login" && request.method === "POST") {
      const { email, code } = clientAccessInput(await body(request));
      if (!/^\S+@\S+\.\S+$/.test(email) || code.length < 6)
        return deny("Use your client email and project access code", 400);
      const rows = await env.DB.prepare(
        "select u.id,u.email,u.display_name,u.role,pac.project_id,pac.access_salt,pac.access_hash from project_access_codes pac join users u on u.id=pac.user_id where u.email=? and u.role='client'",
      )
        .bind(email)
        .all();
      let access = null;
      for (const row of rows.results) {
        if (row.access_hash === (await passwordHash(code, row.access_salt))) {
          access = row;
          break;
        }
      }
      if (!access) return deny("That email and access code do not match");
      const token = await createSession(env, access.id);
      return json(
        {
          user: {
            id: access.id,
            email: access.email,
            displayName: access.display_name,
            role: access.role,
          },
          projectId: access.project_id,
          token,
        },
        200,
        { "set-cookie": cookie(token) },
      );
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const token = readToken(request);
      if (token)
        await env.DB.prepare("delete from sessions where token_hash=?")
          .bind(await digest(token))
          .run();
      return json({ ok: true }, 200, {
        "set-cookie": "tfw_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      });
    }
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const user = await userFromRequest(request, env);
      return user ? json({ user }) : deny("Sign in required");
    }
    if (url.pathname === "/api/search" && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required");
      const term = `%${String(url.searchParams.get("q") || "")
        .trim()
        .slice(0, 100)}%`;
      if (term === "%%") return json({ results: [] });
      const projectScope = studio(user)
        ? ""
        : " and p.id in (select project_id from project_members where user_id=?)";
      const projectQuery = env.DB.prepare(
        `select p.id,p.name title,p.service subtitle,'project' type,p.id project_id from projects p where (p.name like ? or p.service like ?)${projectScope} limit 20`,
      );
      const projects = await (
        studio(user) ? projectQuery.bind(term, term) : projectQuery.bind(term, term, user.id)
      ).all();
      const fileQuery = env.DB.prepare(
        `select pf.id,pf.file_name title,p.name subtitle,'file' type,pf.project_id from project_files pf join projects p on p.id=pf.project_id where pf.file_name like ?${projectScope} limit 20`,
      );
      const files = await (
        studio(user) ? fileQuery.bind(term) : fileQuery.bind(term, user.id)
      ).all();
      let results = [...projects.results, ...files.results];
      if (studio(user)) {
        const leads = await env.DB.prepare(
          "select id,name title,coalesce(company,email) subtitle,'lead' type,null project_id from inquiries where name like ? or company like ? or email like ? limit 20",
        )
          .bind(term, term, term)
          .all();
        results.push(...leads.results);
      }
      return json({ results: results.slice(0, 40) });
    }
    if (url.pathname === "/api/audit" && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required");
      const projectId = url.searchParams.get("projectId");
      if (projectId && !(await canAccessProject(env, user, projectId)))
        return deny("Project access required", 403);
      const sql = studio(user)
        ? `select ae.*,u.display_name actor_name from audit_events ae left join users u on u.id=ae.actor_id ${projectId ? "where ae.project_id=?" : ""} order by ae.created_at desc limit 100`
        : "select ae.*,u.display_name actor_name from audit_events ae left join users u on u.id=ae.actor_id where ae.project_id in (select project_id from project_members where user_id=?) order by ae.created_at desc limit 100";
      const rows = await (
        studio(user)
          ? projectId
            ? env.DB.prepare(sql).bind(projectId)
            : env.DB.prepare(sql)
          : env.DB.prepare(sql).bind(user.id)
      ).all();
      return json({ events: rows.results });
    }
    if (url.pathname === "/api/operations" && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const [contacts, team, templates, leads, announcements] = await Promise.all([
        env.DB.prepare(
          "select * from client_contacts order by coalesce(renewal_at,'9999'),name",
        ).all(),
        env.DB.prepare(
          "select u.id,u.display_name,u.email,u.role,tp.team_role,tp.active from users u left join team_profiles tp on tp.user_id=u.id where u.role!='client' order by u.display_name",
        ).all(),
        env.DB.prepare("select * from update_templates order by name").all(),
        env.DB.prepare(
          "select la.*,i.name lead_name,u.display_name author_name from lead_activities la join inquiries i on i.id=la.inquiry_id join users u on u.id=la.created_by order by la.created_at desc limit 100",
        ).all(),
        env.DB.prepare("select * from announcements order by published_at desc limit 50").all(),
      ]);
      return json({
        contacts: contacts.results,
        team: team.results,
        templates: templates.results,
        leadActivities: leads.results,
        announcements: announcements.results,
      });
    }
    if (url.pathname === "/api/contacts" && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const p = await body(request),
        name = String(p?.name || "")
          .trim()
          .slice(0, 160),
        email = String(p?.email || "")
          .trim()
          .toLowerCase()
          .slice(0, 200);
      if (!name || !/^\S+@\S+\.\S+$/.test(email))
        return deny("Name and valid email are required", 400);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "insert into client_contacts(id,name,email,phone,company,key_date,renewal_at,notes,created_by) values(?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          name,
          email,
          String(p?.phone || "").slice(0, 60) || null,
          String(p?.company || "").slice(0, 160) || null,
          p?.keyDate || null,
          p?.renewalAt || null,
          String(p?.notes || "").slice(0, 3000) || null,
          user.id,
        )
        .run();
      await audit(env, user, null, "created", "client_contact", id, { name });
      return json({ id }, 201);
    }
    const leadActivityMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)\/activities$/);
    if (leadActivityMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const p = await body(request),
        kind = ["note", "call", "email", "follow_up"].includes(p?.kind) ? p.kind : "note",
        note = String(p?.note || "")
          .trim()
          .slice(0, 3000);
      if (!note && !p?.followUpAt) return deny("Add a note or follow-up date", 400);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "insert into lead_activities(id,inquiry_id,kind,note,follow_up_at,created_by) values(?,?,?,?,?,?)",
      )
        .bind(id, leadActivityMatch[1], kind, note || null, p?.followUpAt || null, user.id)
        .run();
      await audit(env, user, null, "logged", "lead_activity", id, {
        inquiryId: leadActivityMatch[1],
        kind,
      });
      return json({ id }, 201);
    }
    if (url.pathname === "/api/update-templates" && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const p = await body(request),
        name = String(p?.name || "")
          .trim()
          .slice(0, 120),
        title = String(p?.title || "")
          .trim()
          .slice(0, 160),
        text = String(p?.body || "")
          .trim()
          .slice(0, 5000);
      if (!name || !title || !text) return deny("Name, title and text are required", 400);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "insert into update_templates(id,name,title,body,created_by) values(?,?,?,?,?)",
      )
        .bind(id, name, title, text, user.id)
        .run();
      return json({ id }, 201);
    }
    if (url.pathname === "/api/announcements" && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required");
      const rows = await env.DB.prepare(
        "select a.*,case when ar.user_id is null then 0 else 1 end is_read from announcements a left join announcement_reads ar on ar.announcement_id=a.id and ar.user_id=? order by a.published_at desc limit 30",
      )
        .bind(user.id)
        .all();
      return json({ announcements: rows.results });
    }
    if (url.pathname === "/api/announcements" && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const p = await body(request),
        title = String(p?.title || "")
          .trim()
          .slice(0, 160),
        text = String(p?.body || "")
          .trim()
          .slice(0, 5000);
      if (!title || !text) return deny("Title and message are required", 400);
      const id = crypto.randomUUID();
      await env.DB.prepare("insert into announcements(id,title,body,created_by) values(?,?,?,?)")
        .bind(id, title, text, user.id)
        .run();
      await audit(env, user, null, "published", "announcement", id, { title });
      return json({ id }, 201);
    }
    if (url.pathname === "/api/settings/notifications" && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required");
      const row = await env.DB.prepare("select * from notification_preferences where user_id=?")
        .bind(user.id)
        .first();
      return json({
        preferences: row || {
          email_updates: 1,
          weekly_digest: 0,
          message_alerts: 1,
          approval_alerts: 1,
        },
      });
    }
    if (url.pathname === "/api/settings/notifications" && request.method === "PATCH") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required");
      const p = await body(request),
        v = (k) => (p?.[k] ? 1 : 0);
      await env.DB.prepare(
        "insert into notification_preferences(user_id,email_updates,weekly_digest,message_alerts,approval_alerts,updated_at) values(?,?,?,?,?,current_timestamp) on conflict(user_id) do update set email_updates=excluded.email_updates,weekly_digest=excluded.weekly_digest,message_alerts=excluded.message_alerts,approval_alerts=excluded.approval_alerts,updated_at=current_timestamp",
      )
        .bind(
          user.id,
          v("emailUpdates"),
          v("weeklyDigest"),
          v("messageAlerts"),
          v("approvalAlerts"),
        )
        .run();
      return json({ ok: true });
    }
    const onboardingMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/onboarding$/);
    if (onboardingMatch && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user || !(await canAccessProject(env, user, onboardingMatch[1])))
        return deny("Project access required", 403);
      const items = await env.DB.prepare(
        "select * from project_onboarding_items where project_id=? order by sort_order",
      )
        .bind(onboardingMatch[1])
        .all();
      const intake = await env.DB.prepare(
        "select * from intake_responses where project_id=? order by submitted_at desc limit 1",
      )
        .bind(onboardingMatch[1])
        .first();
      return json({ items: items.results, intake });
    }
    if (onboardingMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!user || !(await canAccessProject(env, user, onboardingMatch[1])))
        return deny("Project access required", 403);
      const p = await body(request);
      if (!p?.answers || typeof p.answers !== "object")
        return deny("Questionnaire answers are required", 400);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "insert into intake_responses(id,project_id,user_id,answers) values(?,?,?,?)",
      )
        .bind(id, onboardingMatch[1], user.id, JSON.stringify(p.answers).slice(0, 10000))
        .run();
      await audit(env, user, onboardingMatch[1], "submitted", "intake", id);
      return json({ id }, 201);
    }
    if (url.pathname === "/api/webhooks/razorpay" && request.method === "POST") {
      if (!env.RAZORPAY_WEBHOOK_SECRET) return deny("Webhook is not configured", 503);
      const raw = await request.text(),
        actual = request.headers.get("x-razorpay-signature") || "",
        expected = await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw);
      if (actual.length !== expected.length || !actual.split("").every((c, i) => c === expected[i]))
        return deny("Invalid webhook signature", 401);
      const event = JSON.parse(raw),
        link = event?.payload?.payment_link?.entity;
      if (event?.event === "payment_link.paid" && link?.id) {
        const invoice = await env.DB.prepare(
          "select id,project_id from invoices where payment_link_id=?",
        )
          .bind(link.id)
          .first();
        if (invoice) {
          await env.DB.prepare(
            "update invoices set status='paid',paid_at=current_timestamp,updated_at=current_timestamp where id=?",
          )
            .bind(invoice.id)
            .run();
          await audit(env, null, invoice.project_id, "paid", "invoice", invoice.id, {
            provider: "razorpay",
            paymentLinkId: link.id,
          });
        }
      }
      return json({ ok: true });
    }
    if (url.pathname === "/api/webhooks/dropbox-sign" && request.method === "POST") {
      if (!env.DROPBOX_SIGN_API_KEY) return deny("Webhook is not configured", 503);
      const form = await request.formData(),
        event = JSON.parse(String(form.get("json") || "{}")),
        eventType = String(event?.event?.event_type || ""),
        eventTime = String(event?.event?.event_time || ""),
        eventHash = String(event?.event?.event_hash || ""),
        expected = await digest(`${eventTime}${eventType}${env.DROPBOX_SIGN_API_KEY}`);
      if (!eventHash || eventHash !== expected) return deny("Invalid webhook signature", 401);
      const requestId = event?.signature_request?.signature_request_id;
      if (eventType === "signature_request_all_signed" && requestId) {
        const proposal = await env.DB.prepare(
          "select id,project_id from proposals where signature_request_id=?",
        )
          .bind(requestId)
          .first();
        if (proposal) {
          await env.DB.prepare(
            "update proposals set status='signed',signed_at=current_timestamp,updated_at=current_timestamp where id=?",
          )
            .bind(proposal.id)
            .run();
          await audit(env, null, proposal.project_id, "signed", "proposal", proposal.id, {
            provider: "dropbox_sign",
            requestId,
          });
        }
      }
      return new Response("Hello API Event Received", { status: 200 });
    }
    const commercialMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/commercial$/);
    if (commercialMatch && request.method === "GET") {
      const user = await userFromRequest(request, env),
        projectId = commercialMatch[1];
      if (!user || !(await canAccessProject(env, user, projectId)))
        return deny("Project access required", 403);
      const [invoices, proposals, meetings, availability, serviceTemplates] = await Promise.all([
        env.DB.prepare(
          "select * from invoices where project_id=? and (?=1 or status!='draft') order by created_at desc",
        )
          .bind(projectId, studio(user) ? 1 : 0)
          .all(),
        env.DB.prepare(
          "select * from proposals where project_id=? and (?=1 or status!='draft') order by created_at desc",
        )
          .bind(projectId, studio(user) ? 1 : 0)
          .all(),
        env.DB.prepare("select * from meetings where project_id=? order by starts_at desc")
          .bind(projectId)
          .all(),
        env.DB.prepare(
          "select id,weekday,start_time,end_time,active from studio_availability order by weekday,start_time",
        ).all(),
        studio(user)
          ? env.DB.prepare(
              "select id,title,description,amount,currency from proposal_service_templates where active=1 order by created_at",
            ).all()
          : Promise.resolve({ results: [] }),
      ]);
      return json({
        invoices: invoices.results,
        proposals: proposals.results,
        meetings: meetings.results,
        availability: availability.results,
        serviceTemplates: serviceTemplates.results,
        providers: {
          razorpay: Boolean(env.RAZORPAY_KEY_ID),
          dropboxSign: Boolean(env.DROPBOX_SIGN_API_KEY),
          googleCalendar: Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
        },
      });
    }
    if (url.pathname === "/api/availability" && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required", 401);
      const rows = await env.DB.prepare(
        "select id,weekday,start_time,end_time,active from studio_availability order by weekday,start_time",
      ).all();
      return json({
        timeZone: env.STUDIO_TIME_ZONE || "Asia/Kolkata",
        rules: rows.results,
      });
    }
    if (url.pathname === "/api/availability" && request.method === "PUT") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const p = await body(request),
        rules = (Array.isArray(p?.rules) ? p.rules : []).slice(0, 28).map((rule) => ({
          id: String(rule.id || crypto.randomUUID()),
          weekday: Number(rule.weekday),
          startTime: String(rule.startTime || rule.start_time || ""),
          endTime: String(rule.endTime || rule.end_time || ""),
          active: rule.active === false || Number(rule.active) === 0 ? 0 : 1,
        }));
      if (
        !rules.length ||
        rules.some(
          (rule) =>
            !Number.isInteger(rule.weekday) ||
            rule.weekday < 0 ||
            rule.weekday > 6 ||
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.startTime) ||
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.endTime) ||
            rule.startTime >= rule.endTime,
        )
      )
        return deny("Add at least one valid availability window", 400);
      await env.DB.batch([
        env.DB.prepare("delete from studio_availability"),
        ...rules.map((rule) =>
          env.DB.prepare(
            "insert into studio_availability(id,weekday,start_time,end_time,active,created_by) values(?,?,?,?,?,?)",
          ).bind(rule.id, rule.weekday, rule.startTime, rule.endTime, rule.active, user.id),
        ),
      ]);
      await audit(env, user, null, "updated", "studio_availability", "weekly-hours", {
        rules: rules.length,
      });
      return json({ ok: true });
    }
    const invoicesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/invoices$/);
    if (invoicesMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const p = await body(request),
        projectId = invoicesMatch[1],
        source = p?.source === "tracked_time" ? "tracked_time" : "fixed";
      let items = Array.isArray(p?.items) ? p.items.slice(0, 30) : [];
      if (source === "tracked_time") {
        const minutes =
            (
              await env.DB.prepare(
                "select coalesce(sum(minutes),0) total from time_entries where project_id=?",
              )
                .bind(projectId)
                .first()
            )?.total || 0,
          rate = Math.max(0, Math.round(Number(p?.hourlyRate) || 0));
        items = [
          {
            description: `Tracked studio time (${Math.round(minutes / 6) / 10} hours)`,
            quantity: 1,
            unitAmount: Math.round((minutes * rate) / 60),
          },
        ];
      }
      items = items
        .map((x, i) => ({
          description: String(x.description || "Service")
            .trim()
            .slice(0, 300),
          quantity: Math.max(1, Math.round(Number(x.quantity) || 1)),
          unitAmount: Math.max(0, Math.round(Number(x.unitAmount) || 0)),
          sortOrder: i,
        }))
        .filter((x) => x.unitAmount > 0);
      if (!items.length) return deny("Add at least one invoice item", 400);
      const subtotal = items.reduce((sum, x) => sum + x.quantity * x.unitAmount, 0),
        tax = Math.max(0, Math.round(Number(p?.tax) || 0)),
        total = subtotal + tax,
        id = crypto.randomUUID(),
        number = `TFW-${new Date().getUTCFullYear()}-${id.slice(0, 6).toUpperCase()}`;
      await env.DB.batch([
        env.DB.prepare(
          "insert into invoices(id,project_id,invoice_number,currency,subtotal,tax,total,status,source,due_date,created_by) values(?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          id,
          projectId,
          number,
          String(p?.currency || "INR").slice(0, 3),
          subtotal,
          tax,
          total,
          p?.sendNow ? "sent" : "draft",
          source,
          p?.dueDate || null,
          user.id,
        ),
        ...items.map((x) =>
          env.DB.prepare(
            "insert into invoice_items(id,invoice_id,description,quantity,unit_amount,sort_order) values(?,?,?,?,?,?)",
          ).bind(crypto.randomUUID(), id, x.description, x.quantity, x.unitAmount, x.sortOrder),
        ),
      ]);
      await audit(env, user, projectId, "created", "invoice", id, { number, total, source });
      return json({ id, invoiceNumber: number, total }, 201);
    }
    const paymentMatch = url.pathname.match(/^\/api\/invoices\/([^/]+)\/payment-link$/);
    if (paymentMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required");
      const invoice = await env.DB.prepare(
        "select i.*,p.name project_name from invoices i join projects p on p.id=i.project_id where i.id=?",
      )
        .bind(paymentMatch[1])
        .first();
      if (!invoice || !(await canAccessProject(env, user, invoice.project_id)))
        return deny("Invoice not found", 404);
      if (invoice.status === "paid") return json({ url: invoice.checkout_url, status: "paid" });
      const client = await env.DB.prepare(
        "select u.email,u.display_name from project_members pm join users u on u.id=pm.user_id where pm.project_id=? and u.role='client' limit 1",
      )
        .bind(invoice.project_id)
        .first();
      try {
        const link = await razorpayLink(env, invoice, client);
        await env.DB.prepare(
          "update invoices set payment_provider='razorpay',payment_link_id=?,checkout_url=?,status='sent',updated_at=current_timestamp where id=?",
        )
          .bind(link.id, link.short_url, invoice.id)
          .run();
        await audit(env, user, invoice.project_id, "payment_link_created", "invoice", invoice.id, {
          provider: "razorpay",
        });
        return json({ url: link.short_url, status: link.status });
      } catch (error) {
        return deny(error.message, 503);
      }
    }
    const proposalsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/proposals$/);
    if (proposalsMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const p = await body(request),
        title = String(p?.title || "")
          .trim()
          .slice(0, 255),
        blocks = (Array.isArray(p?.blocks) ? p.blocks : []).slice(0, 30).map((x, i) => ({
          title: String(x.title || "Service").slice(0, 180),
          description: String(x.description || "").slice(0, 3000),
          amount: Math.max(0, Math.round(Number(x.amount) || 0)),
          sortOrder: i,
        }));
      if (!title || !blocks.length)
        return deny("Proposal title and service blocks are required", 400);
      if (p?.pdfFileId) {
        const file = await env.DB.prepare(
          "select 1 from project_files where id=? and project_id=? and mime_type='application/pdf'",
        )
          .bind(p.pdfFileId, proposalsMatch[1])
          .first();
        if (!file) return deny("Choose a project PDF", 400);
      }
      const id = crypto.randomUUID(),
        total = blocks.reduce((n, x) => n + x.amount, 0);
      await env.DB.batch([
        env.DB.prepare(
          "insert into proposals(id,project_id,title,introduction,currency,total,status,pdf_file_id,created_by) values(?,?,?,?,?,?,?,?,?)",
        ).bind(
          id,
          proposalsMatch[1],
          title,
          String(p?.introduction || "").slice(0, 5000),
          String(p?.currency || "INR").slice(0, 3),
          total,
          p?.sendNow ? "sent" : "draft",
          p?.pdfFileId || null,
          user.id,
        ),
        ...blocks.map((x) =>
          env.DB.prepare(
            "insert into proposal_blocks(id,proposal_id,title,description,amount,sort_order) values(?,?,?,?,?,?)",
          ).bind(crypto.randomUUID(), id, x.title, x.description, x.amount, x.sortOrder),
        ),
      ]);
      await audit(env, user, proposalsMatch[1], "created", "proposal", id, { title, total });
      let generated = null;
      if (storageReady(env) && !p?.pdfFileId) {
        try {
          const branding =
            (await env.DB.prepare("select * from studio_branding where id=1").first()) || {};
          generated = await uploadGeneratedPdf(
            env,
            {
              id,
              project_id: proposalsMatch[1],
              title,
              introduction: String(p?.introduction || "").slice(0, 5000),
              currency: String(p?.currency || "INR").slice(0, 3),
              total,
            },
            blocks,
            branding,
            user.id,
          );
          await audit(env, user, proposalsMatch[1], "generated", "proposal_pdf", generated.fileId);
        } catch (error) {
          console.error("Proposal PDF generation failed", error);
        }
      }
      return json({ id, total, generated }, 201);
    }
    const proposalPdfMatch = url.pathname.match(/^\/api\/proposals\/([^/]+)\/generate-pdf$/);
    if (proposalPdfMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const proposal = await env.DB.prepare("select * from proposals where id=?")
        .bind(proposalPdfMatch[1])
        .first();
      if (!proposal) return deny("Proposal not found", 404);
      const [blocks, branding] = await Promise.all([
        env.DB.prepare("select * from proposal_blocks where proposal_id=? order by sort_order")
          .bind(proposal.id)
          .all(),
        env.DB.prepare("select * from studio_branding where id=1").first(),
      ]);
      try {
        const generated = await uploadGeneratedPdf(
          env,
          proposal,
          blocks.results,
          branding || {},
          user.id,
        );
        await audit(env, user, proposal.project_id, "generated", "proposal_pdf", generated.fileId);
        return json({ generated }, 201);
      } catch (error) {
        return deny(error.message, 503);
      }
    }
    if (url.pathname === "/api/proposal-services" && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const p = await body(request),
        title = String(p?.title || "").trim().slice(0, 180),
        amount = Math.max(0, Math.round(Number(p?.amount) || 0));
      if (!title) return deny("Service title is required", 400);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "insert into proposal_service_templates(id,title,description,amount,currency,created_by) values(?,?,?,?,?,?)",
      )
        .bind(
          id,
          title,
          String(p?.description || "").slice(0, 3000),
          amount,
          String(p?.currency || "INR").slice(0, 3),
          user.id,
        )
        .run();
      await audit(env, user, null, "created", "proposal_service_template", id, { title, amount });
      return json({ id }, 201);
    }
    const signRequestMatch = url.pathname.match(/^\/api\/proposals\/([^/]+)\/send-signature$/);
    if (signRequestMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const proposal = await env.DB.prepare(
        "select pr.*,pf.storage_path from proposals pr left join project_files pf on pf.id=pr.pdf_file_id where pr.id=?",
      )
        .bind(signRequestMatch[1])
        .first();
      if (!proposal?.storage_path) return deny("Attach a proposal PDF first", 400);
      const client = await env.DB.prepare(
        "select u.email,u.display_name from project_members pm join users u on u.id=pm.user_id where pm.project_id=? and u.role='client' limit 1",
      )
        .bind(proposal.project_id)
        .first();
      if (!client) return deny("Add a client to this project first", 409);
      try {
        const sent = await dropboxSignRequest(
            env,
            proposal,
            client,
            await signedStorageUrl(env, proposal.storage_path),
          ),
          requestId = sent.signature_request.signature_request_id;
        await env.DB.prepare(
          "update proposals set signature_request_id=?,status='sent',updated_at=current_timestamp where id=?",
        )
          .bind(requestId, proposal.id)
          .run();
        await audit(env, user, proposal.project_id, "sent_for_signature", "proposal", proposal.id, {
          provider: "dropbox_sign",
          requestId,
        });
        return json({ requestId });
      } catch (error) {
        return deny(error.message, 503);
      }
    }
    const meetingsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/meetings$/);
    if (meetingsMatch && request.method === "POST") {
      const user = await userFromRequest(request, env),
        projectId = meetingsMatch[1];
      if (!user || !(await canAccessProject(env, user, projectId)))
        return deny("Project access required", 403);
      const p = await body(request),
        startsAt = new Date(p?.startsAt),
        duration = Math.max(15, Math.min(240, Number(p?.durationMinutes) || 30)),
        title = String(p?.title || "Project check-in")
          .trim()
          .slice(0, 180);
      if (Number.isNaN(startsAt.valueOf()) || startsAt.getTime() < Date.now())
        return deny("Choose a future meeting time", 400);
      const offset = Number(env.STUDIO_UTC_OFFSET_MINUTES || 330),
        localStart = new Date(startsAt.getTime() + offset * 60000),
        weekday = localStart.getUTCDay(),
        startMinutes = localStart.getUTCHours() * 60 + localStart.getUTCMinutes(),
        endMinutes = startMinutes + duration,
        windows = (
          await env.DB.prepare(
            "select start_time,end_time from studio_availability where weekday=? and active=1",
          )
            .bind(weekday)
            .all()
        ).results,
        withinHours = windows.some((window) => {
          const [startHour, startMinute] = window.start_time.split(":").map(Number),
            [endHour, endMinute] = window.end_time.split(":").map(Number);
          return startMinutes >= startHour * 60 + startMinute && endMinutes <= endHour * 60 + endMinute;
        });
      if (!withinHours)
        return deny(`Choose a time within studio availability (${env.STUDIO_TIME_ZONE || "Asia/Kolkata"})`, 409);
      const conflict = await env.DB.prepare(
        "select id from meetings where status in ('requested','confirmed') and julianday(?) < julianday(starts_at,'+' || duration_minutes || ' minutes') and julianday(?,'+' || ? || ' minutes') > julianday(starts_at) limit 1",
      )
        .bind(startsAt.toISOString(), startsAt.toISOString(), duration)
        .first();
      if (conflict) return deny("That time is no longer available. Choose another slot.", 409);
      const id = crypto.randomUUID(),
        meeting = {
          id,
          project_id: projectId,
          title,
          starts_at: startsAt.toISOString(),
          duration_minutes: duration,
        };
      const attendees = (
        await env.DB.prepare(
          "select distinct u.email from project_members pm join users u on u.id=pm.user_id where pm.project_id=?",
        )
          .bind(projectId)
          .all()
      ).results.map((x) => x.email);
      try {
        const event = await googleCalendarEvent(env, meeting, attendees),
          joinUrl = event.hangoutLink || event.htmlLink;
        await env.DB.prepare(
          "insert into meetings(id,project_id,title,starts_at,duration_minutes,status,meeting_provider,join_url,calendar_event_id,booked_by) values(?,?,?,?,?,'confirmed','google_calendar',?,?,?)",
        )
          .bind(id, projectId, title, meeting.starts_at, duration, joinUrl, event.id, user.id)
          .run();
        await audit(env, user, projectId, "booked", "meeting", id, {
          provider: "google_calendar",
          startsAt: meeting.starts_at,
        });
        return json({ id, joinUrl, status: "confirmed" }, 201);
      } catch (error) {
        return deny(error.message, 503);
      }
    }
    if (url.pathname === "/api/analytics" && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const [leads, projects, overdue, time] = await Promise.all([
        env.DB.prepare(
          "select substr(created_at,1,7) month,count(*) total,sum(case when status='closed' then 1 else 0 end) closed from inquiries group by month order by month desc limit 12",
        ).all(),
        env.DB.prepare(
          "select service,count(*) projects,avg(julianday(updated_at)-julianday(created_at)) avg_days from projects group by service",
        ).all(),
        env.DB.prepare(
          "select count(*) total from projects where due_date<date('now') and status!='complete'",
        ).first(),
        env.DB.prepare(
          "select p.name,sum(coalesce(te.minutes,cast((julianday('now')-julianday(te.started_at))*1440 as integer))) minutes from time_entries te join projects p on p.id=te.project_id group by p.id order by minutes desc",
        ).all(),
      ]);
      return json({
        leads: leads.results,
        projects: projects.results,
        overdue: overdue?.total || 0,
        time: time.results,
      });
    }
    if (url.pathname === "/api/export" && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required");
      const projectId = url.searchParams.get("projectId");
      if (projectId && !(await canAccessProject(env, user, projectId)))
        return deny("Project access required", 403);
      const projects = projectId
        ? [await env.DB.prepare("select * from projects where id=?").bind(projectId).first()]
        : studio(user)
          ? (await env.DB.prepare("select * from projects").all()).results
          : (
              await env.DB.prepare(
                "select p.* from projects p join project_members pm on pm.project_id=p.id where pm.user_id=?",
              )
                .bind(user.id)
                .all()
            ).results;
      const result = {
        exportedAt: new Date().toISOString(),
        account: { id: user.id, email: user.email, role: user.role },
        projects: [],
      };
      for (const p of projects.filter(Boolean)) {
        const [files, messages, deliverables] = await Promise.all([
          env.DB.prepare(
            "select id,file_name,mime_type,size_bytes,version,created_at from project_files where project_id=?",
          )
            .bind(p.id)
            .all(),
          env.DB.prepare(
            "select body,sender_id,created_at from project_messages where project_id=?",
          )
            .bind(p.id)
            .all(),
          env.DB.prepare("select * from deliverables where project_id=?").bind(p.id).all(),
        ]);
        result.projects.push({
          ...p,
          files: files.results,
          messages: messages.results,
          deliverables: deliverables.results,
        });
      }
      if (studio(user)) {
        result.contacts = (await env.DB.prepare("select * from client_contacts").all()).results;
        result.inquiries = (await env.DB.prepare("select * from inquiries").all()).results;
      }
      return new Response(JSON.stringify(result, null, 2), {
        headers: {
          "content-type": "application/json",
          "content-disposition": `attachment; filename="fourth-wall-export-${Date.now()}.json"`,
          "access-control-allow-origin": "*",
        },
      });
    }
    const insightsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/insights$/);
    if (insightsMatch && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user || !(await canAccessProject(env, user, insightsMatch[1])))
        return deny("Project access required", 403);
      const guidelines = await env.DB.prepare(
        "select * from brand_guidelines where project_id=? order by sort_order",
      )
        .bind(insightsMatch[1])
        .all();
      const times = studio(user)
        ? await env.DB.prepare(
            "select te.*,u.display_name from time_entries te join users u on u.id=te.user_id where te.project_id=? order by te.started_at desc limit 100",
          )
            .bind(insightsMatch[1])
            .all()
        : { results: [] };
      return json({ guidelines: guidelines.results, timeEntries: times.results });
    }
    const timeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/time-entries$/);
    if (timeMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const p = await body(request);
      if (p?.action === "stop") {
        const row = await env.DB.prepare(
          "select id,started_at from time_entries where project_id=? and user_id=? and stopped_at is null order by started_at desc limit 1",
        )
          .bind(timeMatch[1], user.id)
          .first();
        if (!row) return deny("No running timer", 409);
        await env.DB.prepare(
          "update time_entries set stopped_at=current_timestamp,minutes=max(1,cast((julianday('now')-julianday(started_at))*1440 as integer)) where id=?",
        )
          .bind(row.id)
          .run();
        await audit(env, user, timeMatch[1], "stopped", "time_entry", row.id);
        return json({ id: row.id });
      }
      const id = crypto.randomUUID();
      const running = await env.DB.prepare(
        "select 1 from time_entries where user_id=? and stopped_at is null",
      )
        .bind(user.id)
        .first();
      if (running) return deny("Stop your current timer first", 409);
      await env.DB.prepare(
        "insert into time_entries(id,project_id,user_id,description,started_at) values(?,?,?,?,current_timestamp)",
      )
        .bind(id, timeMatch[1], user.id, String(p?.description || "").slice(0, 500) || null)
        .run();
      await audit(env, user, timeMatch[1], "started", "time_entry", id);
      return json({ id }, 201);
    }
    const guidelineMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/guidelines$/);
    if (guidelineMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const p = await body(request),
        title = String(p?.title || "")
          .trim()
          .slice(0, 180),
        text = String(p?.content || "")
          .trim()
          .slice(0, 20000);
      if (!title || !text) return deny("Title and guideline content are required", 400);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "insert into brand_guidelines(id,project_id,title,content,sort_order,created_by) values(?,?,?,?,?,?)",
      )
        .bind(id, guidelineMatch[1], title, text, Number(p?.sortOrder) || 0, user.id)
        .run();
      await audit(env, user, guidelineMatch[1], "created", "brand_guideline", id, { title });
      return json({ id }, 201);
    }
    if (url.pathname === "/api/settings/profile" && request.method === "PATCH") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required");
      const p = await body(request),
        language = ["en", "hi"].includes(p?.language) ? p.language : "en",
        theme = p?.theme === "dark" ? "dark" : "light";
      await env.DB.prepare(
        "insert into user_settings(user_id,language,biometric_lock,theme,updated_at) values(?,?,?,?,current_timestamp) on conflict(user_id) do update set language=excluded.language,biometric_lock=excluded.biometric_lock,theme=excluded.theme,updated_at=current_timestamp",
      )
        .bind(user.id, language, p?.biometricLock ? 1 : 0, theme)
        .run();
      return json({ ok: true });
    }
    const testimonialMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/testimonial$/);
    if (testimonialMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!user || !(await canAccessProject(env, user, testimonialMatch[1])))
        return deny("Project access required", 403);
      const eligible = await env.DB.prepare(
        "select 1 from projects where id=? and (status='complete' or exists(select 1 from milestones where project_id=projects.id and status='complete'))",
      )
        .bind(testimonialMatch[1])
        .first();
      if (!eligible) return deny("Testimonials open after a milestone is completed", 409);
      const p = await body(request),
        rating = Math.max(1, Math.min(5, Number(p?.rating) || 5)),
        quote = String(p?.quote || "")
          .trim()
          .slice(0, 3000);
      if (!quote) return deny("Please share a short testimonial", 400);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "insert into testimonials(id,project_id,user_id,rating,quote,referral_name,referral_email) values(?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          testimonialMatch[1],
          user.id,
          rating,
          quote,
          String(p?.referralName || "").slice(0, 160) || null,
          String(p?.referralEmail || "").slice(0, 200) || null,
        )
        .run();
      await audit(env, user, testimonialMatch[1], "submitted", "testimonial", id, { rating });
      return json({ id }, 201);
    }
    if (url.pathname === "/api/inquiries" && request.method === "POST") {
      const payload = await body(request);
      if (!payload || payload.website) return json({ ok: true }, 202);
      const name = String(payload.name || "")
        .trim()
        .slice(0, 120);
      const email = String(payload.email || "")
        .trim()
        .toLowerCase()
        .slice(0, 200);
      const details = String(payload.details || "")
        .trim()
        .slice(0, 5000);
      if (!name || !/^\S+@\S+\.\S+$/.test(email) || !details)
        return deny("Please provide your name, a valid email, and project details.", 400);
      const inquiry = {
        id: crypto.randomUUID(),
        name,
        email,
        details,
        phone: String(payload.phone || "")
          .trim()
          .slice(0, 60),
        company: String(payload.company || "")
          .trim()
          .slice(0, 160),
        service: String(payload.service || "")
          .trim()
          .slice(0, 160),
      };
      await env.DB.prepare(
        "insert into inquiries (id,name,email,phone,company,service,details) values (?,?,?,?,?,?,?)",
      )
        .bind(
          inquiry.id,
          inquiry.name,
          inquiry.email,
          inquiry.phone,
          inquiry.company,
          inquiry.service,
          inquiry.details,
        )
        .run();
      await notifyStudioOfInquiry(env, inquiry);
      return json({ ok: true, message: "Inquiry received." }, 201);
    }
    if (url.pathname === "/api/inquiries" && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const rows = await env.DB.prepare(
        "select id,name,email,phone,company,service,details,source,status,created_at from inquiries order by created_at desc",
      ).all();
      return json({ inquiries: rows.results });
    }
    const inquiryMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)$/);
    if (inquiryMatch && request.method === "PATCH") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const payload = await body(request);
      const status = payload?.status;
      if (!["new", "contacted", "qualified", "closed"].includes(status))
        return deny("Invalid inquiry status", 400);
      const result = await env.DB.prepare("update inquiries set status=? where id=?")
        .bind(status, inquiryMatch[1])
        .run();
      return result.meta.changes ? json({ ok: true }) : deny("Inquiry not found", 404);
    }
    if (url.pathname === "/api/projects" && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required");
      const query = studio(user)
        ? env.DB.prepare("select p.* from projects p order by p.updated_at desc")
        : env.DB.prepare(
            "select p.* from projects p join project_members pm on pm.project_id=p.id where pm.user_id=? order by p.updated_at desc",
          ).bind(user.id);
      const rows = await query.all();
      return json({ projects: rows.results });
    }
    if (url.pathname === "/api/projects" && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const input = projectInput(await body(request));
      if (!input.name || !input.service) return deny("Project name and service are required", 400);
      const id = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(
          "insert into projects (id,name,service,status,due_date,progress,created_by) values (?,?,?,?,?,?,?)",
        ).bind(id, input.name, input.service, input.status, input.dueDate, input.progress, user.id),
        env.DB.prepare("insert into project_members (project_id,user_id,role) values (?,?,?)").bind(
          id,
          user.id,
          "owner",
        ),
      ]);
      const checklist = await env.DB.prepare(
        "select oti.title,oti.sort_order from onboarding_template_items oti join onboarding_templates ot on ot.id=oti.template_id where ot.active=1 order by oti.sort_order",
      ).all();
      if (checklist.results.length)
        await env.DB.batch(
          checklist.results.map((item) =>
            env.DB.prepare(
              "insert into project_onboarding_items(id,project_id,title,sort_order) values(?,?,?,?)",
            ).bind(crypto.randomUUID(), id, item.title, item.sort_order),
          ),
        );
      await audit(env, user, id, "created", "project", id, { name: input.name });
      return json({ project: { id, ...input } }, 201);
    }
    const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user || !(await canAccessProject(env, user, projectMatch[1])))
        return deny("Project access required", 403);
      const project = await env.DB.prepare("select * from projects where id=?")
        .bind(projectMatch[1])
        .first();
      if (!project) return deny("Project not found", 404);
      const deliverables = await env.DB.prepare(
        "select id,title,status,sort_order,approver_id,approved_by,approved_at from deliverables where project_id=? order by sort_order,created_at",
      )
        .bind(projectMatch[1])
        .all();
      const approvals = await env.DB.prepare(
        "select da.id,da.deliverable_id,da.decision,da.note,da.typed_signature,da.created_at,u.display_name decided_by from deliverable_approvals da join users u on u.id=da.decided_by where da.project_id=? order by da.created_at desc",
      )
        .bind(projectMatch[1])
        .all();
      return json({
        project,
        deliverables: deliverables.results.map((item) => ({
          ...item,
          approval_history: approvals.results.filter((entry) => entry.deliverable_id === item.id),
        })),
      });
    }
    if (projectMatch && request.method === "PATCH") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const input = projectInput(await body(request));
      if (!input.name || !input.service) return deny("Project name and service are required", 400);
      const result = await env.DB.prepare(
        "update projects set name=?,service=?,status=?,due_date=?,progress=?,updated_at=current_timestamp where id=?",
      )
        .bind(
          input.name,
          input.service,
          input.status,
          input.dueDate,
          input.progress,
          projectMatch[1],
        )
        .run();
      if (result.meta.changes)
        await audit(env, user, projectMatch[1], "updated", "project", projectMatch[1], input);
      return result.meta.changes
        ? json({ project: { id: projectMatch[1], ...input } })
        : deny("Project not found", 404);
    }
    const clientAccessMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/client-access$/);
    if (clientAccessMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const project = await env.DB.prepare("select id from projects where id=?")
        .bind(clientAccessMatch[1])
        .first();
      if (!project) return deny("Project not found", 404);
      const input = clientAccessInput(await body(request));
      if (!/^\S+@\S+\.\S+$/.test(input.email) || input.code.length < 6 || input.code.length > 128)
        return deny("Use a valid client email and a code of at least 6 characters", 400);
      let client = await env.DB.prepare("select id,email,role from users where email=?")
        .bind(input.email)
        .first();
      if (client && client.role !== "client")
        return deny("That email belongs to a studio user", 409);
      if (!client) {
        const id = crypto.randomUUID();
        const salt = random();
        await env.DB.prepare(
          "insert into users (id,email,display_name,role,password_salt,password_hash) values (?,?,?,?,?,?)",
        )
          .bind(
            id,
            input.email,
            input.displayName,
            "client",
            salt,
            await passwordHash(random(), salt),
          )
          .run();
        client = { id, email: input.email, role: "client" };
      }
      const codeSalt = random();
      const codeHash = await passwordHash(input.code, codeSalt);
      await env.DB.batch([
        env.DB.prepare(
          "insert into project_members (project_id,user_id,role) values (?,?,?) on conflict(project_id,user_id) do update set role=excluded.role",
        ).bind(clientAccessMatch[1], client.id, "client"),
        env.DB.prepare(
          "insert into project_access_codes (project_id,user_id,access_salt,access_hash,rotated_at) values (?,?,?,?,current_timestamp) on conflict(project_id,user_id) do update set access_salt=excluded.access_salt,access_hash=excluded.access_hash,rotated_at=current_timestamp",
        ).bind(clientAccessMatch[1], client.id, codeSalt, codeHash),
      ]);
      return json({ ok: true, client: { id: client.id, email: client.email } }, 201);
    }
    const updateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/updates$/);
    const deliverableMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/deliverables$/);
    const workspaceMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/workspace$/);
    if (workspaceMatch && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user || !(await canAccessProject(env, user, workspaceMatch[1])))
        return deny("Project access required", 403);
      const projectId = workspaceMatch[1];
      const [milestones, tasks, messages, moodboards] = await Promise.all([
        env.DB.prepare("select * from milestones where project_id=? order by due_date,created_at")
          .bind(projectId)
          .all(),
        studio(user)
          ? env.DB.prepare(
              "select t.*,u.display_name assignee_name from project_tasks t left join users u on u.id=t.assignee_id where t.project_id=? order by t.status,t.due_date",
            )
              .bind(projectId)
              .all()
          : Promise.resolve({ results: [] }),
        env.DB.prepare(
          "select m.*,u.display_name sender_name,pf.file_name,pf.mime_type,case when mr.user_id is null then 0 else 1 end is_read,(select group_concat(ru.display_name,', ') from message_reads rr join users ru on ru.id=rr.user_id where rr.message_id=m.id and rr.user_id!=m.sender_id) read_by from project_messages m join users u on u.id=m.sender_id left join project_files pf on pf.id=m.file_id left join message_reads mr on mr.message_id=m.id and mr.user_id=? where m.project_id=? order by m.created_at desc limit 100",
        )
          .bind(user.id, projectId)
          .all(),
        env.DB.prepare(
          "select mb.*,pf.file_name,pf.mime_type,mr.reaction from moodboards mb left join project_files pf on pf.id=mb.file_id left join moodboard_reactions mr on mr.moodboard_id=mb.id and mr.user_id=? where mb.project_id=? order by mb.created_at desc",
        )
          .bind(user.id, projectId)
          .all(),
      ]);
      const unread = messages.results.filter(
        (message) => !message.is_read && message.sender_id !== user.id,
      );
      if (unread.length)
        await env.DB.batch(
          unread.map((message) =>
            env.DB.prepare(
              "insert into message_reads(message_id,user_id) values(?,?) on conflict(message_id,user_id) do nothing",
            ).bind(message.id, user.id),
          ),
        );
      return json({
        milestones: milestones.results,
        tasks: tasks.results,
        messages: messages.results.map((message) => ({
          ...message,
          is_read: message.sender_id === user.id ? !!message.read_by : true,
        })),
        moodboards: moodboards.results,
      });
    }
    const collaborationMatch = url.pathname.match(
      /^\/api\/projects\/([^/]+)\/(milestones|tasks|messages|moodboards)$/,
    );
    if (collaborationMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!user || !(await canAccessProject(env, user, collaborationMatch[1])))
        return deny("Project access required", 403);
      const projectId = collaborationMatch[1],
        type = collaborationMatch[2],
        payload = await body(request),
        id = crypto.randomUUID();
      if (type !== "messages" && !studio(user)) return deny("Studio access required", 403);
      if (type === "messages") {
        const text = String(payload?.body || "")
          .trim()
          .slice(0, 5000);
        if (!text) return deny("Message is required", 400);
        if (
          payload?.fileId &&
          !(await env.DB.prepare("select 1 from project_files where id=? and project_id=?")
            .bind(payload.fileId, projectId)
            .first())
        )
          return deny("Attachment not found", 404);
        await env.DB.prepare(
          "insert into project_messages(id,project_id,body,file_id,sender_id) values(?,?,?,?,?)",
        )
          .bind(id, projectId, text, payload?.fileId || null, user.id)
          .run();
      } else if (type === "milestones") {
        const title = String(payload?.title || "")
          .trim()
          .slice(0, 180);
        if (!title) return deny("Milestone title is required", 400);
        await env.DB.prepare(
          "insert into milestones(id,project_id,title,due_date,status,waiting_on,created_by) values(?,?,?,?,?,?,?)",
        )
          .bind(
            id,
            projectId,
            title,
            payload?.dueDate || null,
            "upcoming",
            ["client", "studio"].includes(payload?.waitingOn) ? payload.waitingOn : null,
            user.id,
          )
          .run();
      } else if (type === "tasks") {
        const title = String(payload?.title || "")
          .trim()
          .slice(0, 180);
        if (!title) return deny("Task title is required", 400);
        await env.DB.prepare(
          "insert into project_tasks(id,project_id,title,assignee_id,due_date,waiting_on_client,created_by) values(?,?,?,?,?,?,?)",
        )
          .bind(
            id,
            projectId,
            title,
            payload?.assigneeId || null,
            payload?.dueDate || null,
            payload?.waitingOnClient ? 1 : 0,
            user.id,
          )
          .run();
      } else {
        const title = String(payload?.title || "")
          .trim()
          .slice(0, 180);
        if (!title || !payload?.fileId) return deny("Moodboard title and file are required", 400);
        if (
          !(await env.DB.prepare("select 1 from project_files where id=? and project_id=?")
            .bind(payload.fileId, projectId)
            .first())
        )
          return deny("Moodboard file not found", 404);
        await env.DB.prepare(
          "insert into moodboards(id,project_id,title,file_id,note,created_by) values(?,?,?,?,?,?)",
        )
          .bind(
            id,
            projectId,
            title,
            payload.fileId,
            String(payload?.note || "")
              .trim()
              .slice(0, 3000) || null,
            user.id,
          )
          .run();
      }
      await audit(env, user, projectId, "created", type.slice(0, -1), id, {});
      return json({ id }, 201);
    }
    const reactionMatch = url.pathname.match(/^\/api\/moodboards\/([^/]+)\/reactions$/);
    if (reactionMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required");
      const board = await env.DB.prepare("select project_id from moodboards where id=?")
        .bind(reactionMatch[1])
        .first();
      if (!board || !(await canAccessProject(env, user, board.project_id)))
        return deny("Moodboard not found", 404);
      const payload = await body(request);
      if (!["love", "consider", "pass"].includes(payload?.reaction))
        return deny("Invalid reaction", 400);
      await env.DB.prepare(
        "insert into moodboard_reactions(moodboard_id,user_id,reaction) values(?,?,?) on conflict(moodboard_id,user_id) do update set reaction=excluded.reaction,created_at=current_timestamp",
      )
        .bind(reactionMatch[1], user.id, payload.reaction)
        .run();
      await audit(env, user, board.project_id, "reacted", "moodboard", reactionMatch[1], {
        reaction: payload.reaction,
      });
      return json({ ok: true });
    }
    const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && request.method === "PATCH") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const task = await env.DB.prepare("select project_id from project_tasks where id=?")
        .bind(taskMatch[1])
        .first();
      if (!task) return deny("Task not found", 404);
      const p = await body(request),
        status = ["todo", "doing", "done"].includes(p?.status) ? p.status : "todo";
      await env.DB.prepare(
        "update project_tasks set status=?,assignee_id=?,due_date=?,waiting_on_client=? where id=?",
      )
        .bind(
          status,
          p?.assigneeId || null,
          p?.dueDate || null,
          p?.waitingOnClient ? 1 : 0,
          taskMatch[1],
        )
        .run();
      await audit(env, user, task.project_id, "updated", "task", taskMatch[1], { status });
      return json({ ok: true });
    }
    const deliverableItemMatch = url.pathname.match(/^\/api\/deliverables\/([^/]+)$/);
    if (deliverableItemMatch && request.method === "PATCH") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const item = await env.DB.prepare("select project_id from deliverables where id=?")
        .bind(deliverableItemMatch[1])
        .first();
      if (!item) return deny("Deliverable not found", 404);
      const p = await body(request),
        status = ["draft", "in_review", "approved"].includes(p?.status) ? p.status : "draft",
        title = String(p?.title || "")
          .trim()
          .slice(0, 180);
      await env.DB.prepare(
        "update deliverables set title=case when ?='' then title else ? end,status=?,approver_id=?,updated_at=current_timestamp where id=?",
      )
        .bind(title, title, status, p?.approverId || null, deliverableItemMatch[1])
        .run();
      await audit(env, user, item.project_id, "updated", "deliverable", deliverableItemMatch[1], {
        status,
      });
      return json({ ok: true });
    }
    const permissionMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/permissions$/);
    if (permissionMatch && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const rows = await env.DB.prepare(
        "select u.id,u.display_name,u.email,tp.team_role,pp.can_edit,pp.can_upload,pp.can_invoice from users u left join team_profiles tp on tp.user_id=u.id left join project_permissions pp on pp.user_id=u.id and pp.project_id=? where u.role!='client' order by u.display_name",
      )
        .bind(permissionMatch[1])
        .all();
      return json({ members: rows.results });
    }
    if (permissionMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (user?.role !== "admin") return deny("Admin access required", 403);
      const p = await body(request);
      await env.DB.batch([
        env.DB.prepare(
          "insert into project_members(project_id,user_id,role) values(?,?,?) on conflict(project_id,user_id) do update set role=excluded.role",
        ).bind(permissionMatch[1], p?.userId, "studio_member"),
        env.DB.prepare(
          "insert into project_permissions(project_id,user_id,can_edit,can_upload,can_invoice) values(?,?,?,?,?) on conflict(project_id,user_id) do update set can_edit=excluded.can_edit,can_upload=excluded.can_upload,can_invoice=excluded.can_invoice",
        ).bind(
          permissionMatch[1],
          p?.userId,
          p?.canEdit ? 1 : 0,
          p?.canUpload ? 1 : 0,
          p?.canInvoice ? 1 : 0,
        ),
      ]);
      await audit(env, user, permissionMatch[1], "updated", "project_permission", p?.userId);
      return json({ ok: true });
    }
    const reviewsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/reviews$/);
    if (reviewsMatch && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user || !(await canAccessProject(env, user, reviewsMatch[1])))
        return deny("Project access required", 403);
      const rows = await env.DB.prepare(
        "select dc.*,u.display_name author_name,pf.file_name,pf.mime_type from design_comments dc join users u on u.id=dc.created_by join project_files pf on pf.id=dc.file_id where dc.project_id=? order by dc.file_id,dc.created_at",
      )
        .bind(reviewsMatch[1])
        .all();
      return json({ comments: rows.results });
    }
    if (reviewsMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!user || !(await canAccessProject(env, user, reviewsMatch[1])))
        return deny("Project access required", 403);
      const payload = await body(request),
        text = String(payload?.body || "")
          .trim()
          .slice(0, 3000);
      if (!text) return deny("Comment is required", 400);
      const file = await env.DB.prepare(
        "select 1 from project_files where id=? and project_id=? and mime_type in('image/jpeg','image/png','image/webp','application/pdf')",
      )
        .bind(payload?.fileId, reviewsMatch[1])
        .first();
      if (!file) return deny("Reviewable file not found", 404);
      if (payload?.parentId) {
        const parent = await env.DB.prepare(
          "select 1 from design_comments where id=? and project_id=? and file_id=?",
        )
          .bind(payload.parentId, reviewsMatch[1], payload.fileId)
          .first();
        if (!parent) return deny("Parent comment not found", 404);
      }
      const id = crypto.randomUUID(),
        x = payload?.parentId ? null : Math.max(0, Math.min(100, Number(payload?.pinX) || 0)),
        y = payload?.parentId ? null : Math.max(0, Math.min(100, Number(payload?.pinY) || 0));
      await env.DB.prepare(
        "insert into design_comments(id,project_id,file_id,parent_id,page_number,pin_x,pin_y,body,created_by) values(?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          reviewsMatch[1],
          payload.fileId,
          payload?.parentId || null,
          Math.max(1, Number(payload?.pageNumber) || 1),
          x,
          y,
          text,
          user.id,
        )
        .run();
      await audit(env, user, reviewsMatch[1], "commented", "design_comment", id, {
        fileId: payload.fileId,
      });
      return json({ id }, 201);
    }
    const resolveMatch = url.pathname.match(/^\/api\/design-comments\/([^/]+)\/resolve$/);
    if (resolveMatch && request.method === "PATCH") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const comment = await env.DB.prepare("select project_id from design_comments where id=?")
        .bind(resolveMatch[1])
        .first();
      if (!comment) return deny("Comment not found", 404);
      await env.DB.prepare(
        "update design_comments set resolved_at=current_timestamp,resolved_by=? where id=?",
      )
        .bind(user.id, resolveMatch[1])
        .run();
      await audit(env, user, comment.project_id, "resolved", "design_comment", resolveMatch[1]);
      return json({ ok: true });
    }
    const calendarMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/content-posts$/);
    if (calendarMatch && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user || !(await canAccessProject(env, user, calendarMatch[1])))
        return deny("Project access required", 403);
      const month = String(url.searchParams.get("month") || "").slice(0, 7);
      const rows = await env.DB.prepare(
        "select cp.*,(select decision from content_feedback where post_id=cp.id order by created_at desc limit 1) latest_decision,(select comment from content_feedback where post_id=cp.id order by created_at desc limit 1) latest_comment from content_posts cp where cp.project_id=? and (?='' or substr(cp.publish_at,1,7)=?) order by cp.publish_at",
      )
        .bind(calendarMatch[1], month, month)
        .all();
      return json({ posts: rows.results });
    }
    if (calendarMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const payload = await body(request),
        title = String(payload?.title || "")
          .trim()
          .slice(0, 180),
        channel = String(payload?.channel || "")
          .trim()
          .slice(0, 80),
        publishAt = String(payload?.publishAt || "").slice(0, 32);
      if (!title || !channel || !publishAt)
        return deny("Title, channel and publish date are required", 400);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "insert into content_posts(id,project_id,title,channel,publish_at,caption,status,created_by) values(?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          calendarMatch[1],
          title,
          channel,
          publishAt,
          String(payload?.caption || "")
            .trim()
            .slice(0, 5000) || null,
          payload?.sendForApproval ? "in_review" : "draft",
          user.id,
        )
        .run();
      await audit(env, user, calendarMatch[1], "created", "content_post", id, { title });
      return json({ id }, 201);
    }
    const feedbackMatch = url.pathname.match(/^\/api\/content-posts\/([^/]+)\/feedback$/);
    if (feedbackMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required");
      const post = await env.DB.prepare("select project_id from content_posts where id=?")
        .bind(feedbackMatch[1])
        .first();
      if (!post || !(await canAccessProject(env, user, post.project_id)))
        return deny("Post not found", 404);
      const payload = await body(request),
        decision = payload?.decision,
        comment =
          String(payload?.comment || "")
            .trim()
            .slice(0, 3000) || null;
      if (!["approved", "changes_requested"].includes(decision))
        return deny("Choose approve or request changes", 400);
      if (decision === "changes_requested" && !comment)
        return deny("Describe the requested change", 400);
      const id = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(
          "insert into content_feedback(id,post_id,decision,comment,created_by) values(?,?,?,?,?)",
        ).bind(id, feedbackMatch[1], decision, comment, user.id),
        env.DB.prepare(
          "update content_posts set status=?,updated_at=current_timestamp where id=?",
        ).bind(decision, feedbackMatch[1]),
      ]);
      await audit(env, user, post.project_id, decision, "content_post", feedbackMatch[1], {
        comment,
      });
      return json({ id }, 201);
    }
    if (deliverableMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const payload = await body(request);
      const title = String(payload?.title || "")
        .trim()
        .slice(0, 180);
      if (!title) return deny("Deliverable title is required", 400);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "insert into deliverables (id,project_id,title,status,sort_order) values (?,?,?,?,?)",
      )
        .bind(id, deliverableMatch[1], title, "draft", Number(payload?.sortOrder) || 0)
        .run();
      await audit(env, user, deliverableMatch[1], "created", "deliverable", id, { title });
      return json({ deliverable: { id, title, status: "draft" } }, 201);
    }
    const filesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/files$/);
    if (filesMatch && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user || !(await canAccessProject(env, user, filesMatch[1])))
        return deny("Project access required", 403);
      const rows = await env.DB.prepare(
        "select pf.id,pf.project_id,pf.deliverable_id,pf.file_name,pf.mime_type,pf.size_bytes,pf.version,pf.created_at,u.display_name uploaded_by from project_files pf join users u on u.id=pf.uploaded_by where pf.project_id=? order by pf.created_at desc",
      )
        .bind(filesMatch[1])
        .all();
      return json({ files: rows.results });
    }
    if (filesMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!user || !(await canAccessProject(env, user, filesMatch[1])))
        return deny("Project access required", 403);
      if (!storageReady(env)) return deny("File storage is not configured", 503);
      const mimeType = String(request.headers.get("content-type") || "")
        .split(";")[0]
        .toLowerCase();
      const length = Number(request.headers.get("content-length") || 0);
      if (!FILE_TYPES.has(mimeType)) return deny("Use a JPG, PNG, WebP, PDF, or ZIP file", 415);
      if (length > 26214400) return deny("Files must be 25 MB or smaller", 413);
      const deliverableId = request.headers.get("x-deliverable-id") || null;
      if (deliverableId) {
        const belongs = await env.DB.prepare(
          "select 1 from deliverables where id=? and project_id=?",
        )
          .bind(deliverableId, filesMatch[1])
          .first();
        if (!belongs) return deny("Deliverable not found", 404);
      }
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 26214400)
        return deny("Files must be between 1 byte and 25 MB", 413);
      const fileName = safeFileName(
        decodeURIComponent(request.headers.get("x-file-name") || "file"),
      );
      const versionRow = deliverableId
        ? await env.DB.prepare(
            "select coalesce(max(version),0)+1 next from project_files where deliverable_id=?",
          )
            .bind(deliverableId)
            .first()
        : { next: 1 };
      const id = crypto.randomUUID(),
        version = Number(versionRow?.next || 1);
      const storagePath = `${filesMatch[1]}/${deliverableId || "shared"}/${id}-${fileName}`;
      const endpoint = `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
      const stored = await fetch(endpoint, {
        method: "POST",
        headers: { ...storageHeaders(env, mimeType), "x-upsert": "false" },
        body: bytes,
      });
      if (!stored.ok) {
        console.error("Storage upload failed", stored.status, await stored.text());
        return deny("The file could not be stored", 502);
      }
      try {
        await env.DB.prepare(
          "insert into project_files (id,project_id,deliverable_id,storage_path,file_name,mime_type,size_bytes,version,uploaded_by) values (?,?,?,?,?,?,?,?,?)",
        )
          .bind(
            id,
            filesMatch[1],
            deliverableId,
            storagePath,
            fileName,
            mimeType,
            bytes.byteLength,
            version,
            user.id,
          )
          .run();
      } catch (error) {
        await fetch(endpoint, { method: "DELETE", headers: storageHeaders(env) });
        throw error;
      }
      await audit(env, user, filesMatch[1], "uploaded", "file", id, {
        fileName,
        version,
        deliverableId,
      });
      return json(
        {
          file: {
            id,
            projectId: filesMatch[1],
            deliverableId,
            fileName,
            mimeType,
            sizeBytes: bytes.byteLength,
            version,
          },
        },
        201,
      );
    }
    const assetsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/brand-assets$/);
    if (assetsMatch && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user || !(await canAccessProject(env, user, assetsMatch[1])))
        return deny("Project access required", 403);
      const archive = url.searchParams.get("archive") === "1";
      const rows = await env.DB.prepare(
        `select ba.id,ba.kind,ba.name,ba.token_value,ba.version,ba.is_latest,ba.archived_at,ba.created_at,pf.id file_id,pf.file_name,pf.mime_type,pf.size_bytes from brand_assets ba left join project_files pf on pf.id=ba.file_id where ba.project_id=? and ${archive ? "ba.archived_at is not null" : "ba.is_latest=1 and ba.archived_at is null"} order by ba.kind,ba.name,ba.version desc`,
      )
        .bind(assetsMatch[1])
        .all();
      return json({ assets: rows.results });
    }
    if (assetsMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const payload = await body(request),
        kind = payload?.kind;
      const name = String(payload?.name || "")
          .trim()
          .slice(0, 160),
        tokenValue =
          String(payload?.tokenValue || "")
            .trim()
            .slice(0, 500) || null;
      if (!["logo", "font", "color", "template"].includes(kind) || !name)
        return deny("Asset name and valid type are required", 400);
      const fileId = payload?.fileId || null;
      if (kind !== "color" && !fileId) return deny("Upload a file for this asset", 400);
      if (kind === "color" && !tokenValue) return deny("Add a colour token value", 400);
      if (fileId) {
        const file = await env.DB.prepare("select 1 from project_files where id=? and project_id=?")
          .bind(fileId, assetsMatch[1])
          .first();
        if (!file) return deny("Project file not found", 404);
      }
      const previous = await env.DB.prepare(
        "select coalesce(max(version),0) version from brand_assets where project_id=? and kind=? and lower(name)=lower(?)",
      )
        .bind(assetsMatch[1], kind, name)
        .first();
      const id = crypto.randomUUID(),
        version = Number(previous?.version || 0) + 1;
      await env.DB.batch([
        env.DB.prepare(
          "update brand_assets set is_latest=0,archived_at=coalesce(archived_at,current_timestamp) where project_id=? and kind=? and lower(name)=lower(?) and is_latest=1",
        ).bind(assetsMatch[1], kind, name),
        env.DB.prepare(
          "insert into brand_assets (id,project_id,file_id,kind,name,token_value,version,created_by) values (?,?,?,?,?,?,?,?)",
        ).bind(id, assetsMatch[1], fileId, kind, name, tokenValue, version, user.id),
      ]);
      await audit(env, user, assetsMatch[1], "published", "brand_asset", id, {
        kind,
        name,
        version,
      });
      return json({ asset: { id, kind, name, tokenValue, fileId, version, isLatest: true } }, 201);
    }
    const fileDownloadMatch = url.pathname.match(/^\/api\/files\/([^/]+)\/download$/);
    if (fileDownloadMatch && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required");
      const file = await env.DB.prepare("select * from project_files where id=?")
        .bind(fileDownloadMatch[1])
        .first();
      if (!file || !(await canAccessProject(env, user, file.project_id)))
        return deny("File not found", 404);
      const endpoint = `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}/${file.storage_path.split("/").map(encodeURIComponent).join("/")}`;
      const stored = await fetch(endpoint, { headers: storageHeaders(env) });
      if (!stored.ok) return deny("The file could not be downloaded", 502);
      return new Response(stored.body, {
        headers: {
          "content-type": file.mime_type,
          "content-length": String(file.size_bytes),
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
          "cache-control": "private, no-store",
          "access-control-allow-origin": "*",
        },
      });
    }
    const approvalMatch = url.pathname.match(/^\/api\/deliverables\/([^/]+)\/approvals$/);
    if (approvalMatch && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required");
      const deliverable = await env.DB.prepare("select project_id from deliverables where id=?")
        .bind(approvalMatch[1])
        .first();
      if (!deliverable || !(await canAccessProject(env, user, deliverable.project_id)))
        return deny("Deliverable not found", 404);
      const rows = await env.DB.prepare(
        "select a.id,a.decision,a.note,a.typed_signature,a.created_at,u.display_name decided_by from deliverable_approvals a join users u on u.id=a.decided_by where a.deliverable_id=? order by a.created_at desc",
      )
        .bind(approvalMatch[1])
        .all();
      return json({ approvals: rows.results });
    }
    if (approvalMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!user) return deny("Sign in required");
      const deliverable = await env.DB.prepare("select project_id from deliverables where id=?")
        .bind(approvalMatch[1])
        .first();
      if (!deliverable || !(await canAccessProject(env, user, deliverable.project_id)))
        return deny("Deliverable not found", 404);
      const payload = await body(request),
        decision = payload?.decision;
      if (!["approved", "changes_requested"].includes(decision))
        return deny("Choose approve or request changes", 400);
      const note =
        String(payload?.note || "")
          .trim()
          .slice(0, 3000) || null;
      const signature =
        String(payload?.typedSignature || "")
          .trim()
          .slice(0, 160) || null;
      if (decision === "approved" && !signature) return deny("Type your name to approve", 400);
      const id = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(
          "insert into deliverable_approvals (id,project_id,deliverable_id,decision,note,typed_signature,decided_by) values (?,?,?,?,?,?,?)",
        ).bind(id, deliverable.project_id, approvalMatch[1], decision, note, signature, user.id),
        env.DB.prepare(
          "update deliverables set status=?,approved_by=?,approved_at=case when ?='approved' then current_timestamp else null end,updated_at=current_timestamp where id=?",
        ).bind(
          decision === "approved" ? "approved" : "in_review",
          decision === "approved" ? user.id : null,
          decision,
          approvalMatch[1],
        ),
      ]);
      await audit(env, user, deliverable.project_id, decision, "deliverable", approvalMatch[1], {
        note,
        typedSignature: Boolean(signature),
      });
      return json({ approval: { id, decision, note, typedSignature: signature } }, 201);
    }
    if (updateMatch && request.method === "GET") {
      const user = await userFromRequest(request, env);
      if (!user || !(await canAccessProject(env, user, updateMatch[1])))
        return deny("Project access required", 403);
      const sql = studio(user)
        ? "select pu.*,pf.file_name attachment_name from project_updates pu left join project_files pf on pf.id=pu.attachment_file_id where pu.project_id=? order by pu.created_at desc"
        : "select pu.*,pf.file_name attachment_name from project_updates pu left join project_files pf on pf.id=pu.attachment_file_id where pu.project_id=? and pu.visible_to_client=1 and (pu.scheduled_at is null or pu.scheduled_at<=current_timestamp) order by pu.created_at desc";
      const rows = await env.DB.prepare(sql).bind(updateMatch[1]).all();
      return json({ updates: rows.results });
    }
    if (updateMatch && request.method === "POST") {
      const user = await userFromRequest(request, env);
      if (!studio(user)) return deny("Studio access required", 403);
      const payload = await body(request);
      const title = String(payload?.title || "Studio update")
        .trim()
        .slice(0, 160);
      const text = String(payload?.body || "")
        .trim()
        .slice(0, 5000);
      if (!text) return deny("Update text is required", 400);
      if (payload?.attachmentFileId) {
        const file = await env.DB.prepare("select 1 from project_files where id=? and project_id=?")
          .bind(payload.attachmentFileId, updateMatch[1])
          .first();
        if (!file) return deny("Attachment not found", 404);
      }
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "insert into project_updates (id,project_id,title,body,visible_to_client,requires_approval,created_by,attachment_file_id,scheduled_at) values (?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          updateMatch[1],
          title,
          text,
          payload?.visibleToClient === false ? 0 : 1,
          payload?.requiresApproval ? 1 : 0,
          user.id,
          payload?.attachmentFileId || null,
          payload?.scheduledAt || null,
        )
        .run();
      await audit(env, user, updateMatch[1], "posted", "project_update", id, {
        title,
        visibleToClient: payload?.visibleToClient !== false,
      });
      return json({ update: { id, title, body: text } }, 201);
    }
    return deny("Not found", 404);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sendWeeklyDigests(env));
  },
};
