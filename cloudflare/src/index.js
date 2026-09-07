const encoder = new TextEncoder();
// Kept within Cloudflare Workers Free request CPU limits while still avoiding a
// single-pass password hash. Raise this when moving to a paid CPU allocation.
const PBKDF2_ITERATIONS = 50000;
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...headers } });
const deny = (message, status = 401) => json({ error: message }, status);
const toHex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const random = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

async function digest(value) { return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value))); }
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: encoder.encode(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, 256);
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
  const row = await env.DB.prepare("select u.id, u.email, u.display_name, u.role from sessions s join users u on u.id=s.user_id where s.token_hash=? and s.expires_at > datetime('now')").bind(await digest(token)).first();
  return row || null;
}
function cookie(token) { return `tfw_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`; }
async function body(request) { return request.json().catch(() => null); }
function studio(user) { return user && user.role !== "client"; }
async function canAccessProject(env, user, projectId) {
  if (studio(user)) return true;
  return Boolean(await env.DB.prepare("select 1 from project_members where project_id=? and user_id=?").bind(projectId, user.id).first());
}
function projectInput(payload) {
  const name = String(payload?.name || "").trim().slice(0, 160);
  const service = String(payload?.service || "").trim().slice(0, 160);
  const status = ["planning", "active", "complete", "on_hold"].includes(payload?.status) ? payload.status : "planning";
  const dueDate = payload?.dueDate ? String(payload.dueDate).slice(0, 32) : null;
  const progress = Number.isInteger(Number(payload?.progress)) ? Math.max(0, Math.min(100, Number(payload.progress))) : 0;
  return { name, service, status, dueDate, progress };
}
function clientAccessInput(payload) {
  const email = String(payload?.email || "").trim().toLowerCase().slice(0, 200);
  const displayName = String(payload?.displayName || email.split("@")[0] || "Client").trim().slice(0, 120);
  const code = String(payload?.code || "").trim();
  return { email, displayName, code };
}

function escapeEmailHtml(value) {
  return String(value || "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
}

// Notification delivery is intentionally best-effort: a temporary email-provider
// problem must never prevent a genuine lead from being saved in D1.
async function notifyStudioOfInquiry(env, inquiry) {
  if (!env.RESEND_API_KEY || !env.INQUIRY_NOTIFICATION_TO || !env.INQUIRY_FROM_EMAIL) return;
  const lines = [
    ["Name", inquiry.name], ["Email", inquiry.email], ["Phone", inquiry.phone || "Not provided"],
    ["Company", inquiry.company || "Not provided"], ["Service", inquiry.service || "General inquiry"],
    ["Project details", inquiry.details]
  ];
  const text = lines.map(([label, value]) => `${label}: ${value}`).join("\n\n");
  const html = lines.map(([label, value]) => `<p><strong>${escapeEmailHtml(label)}:</strong><br>${escapeEmailHtml(value).replace(/\n/g, "<br>")}</p>`).join("");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.INQUIRY_FROM_EMAIL,
        to: [env.INQUIRY_NOTIFICATION_TO],
        reply_to: inquiry.email,
        subject: `New website inquiry — ${inquiry.name}`,
        text,
        html: `<h1>New website inquiry</h1>${html}`
      })
    });
    if (!response.ok) console.error("Inquiry email notification failed", response.status, await response.text());
  } catch (error) {
    console.error("Inquiry email notification failed", error instanceof Error ? error.message : String(error));
  }
}
async function createSession(env, userId) {
  const token = random();
  const expires = new Date(Date.now() + 7 * 86400000).toISOString();
  await env.DB.prepare("insert into sessions (id,user_id,token_hash,expires_at) values (?,?,?,?)").bind(crypto.randomUUID(), userId, await digest(token), expires).run();
  return token;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PATCH,OPTIONS", "access-control-allow-headers": "content-type,authorization" } });
    if (url.pathname === "/api/health") return json({ ok: true, service: "the-fourth-wall-api" });

    if (url.pathname === "/api/auth/bootstrap" && request.method === "POST") {
      if (!env.BOOTSTRAP_SECRET || request.headers.get("x-bootstrap-secret") !== env.BOOTSTRAP_SECRET) return deny("Not allowed", 403);
      const existing = await env.DB.prepare("select id from users limit 1").first();
      if (existing) return deny("Workspace has already been initialized", 409);
      const { email, password, displayName = "Studio owner" } = await body(request) || {};
      if (!/^\S+@\S+\.\S+$/.test(email || "") || typeof password !== "string" || password.length < 12) return deny("Use a valid email and a password of at least 12 characters", 400);
      const salt = random();
      await env.DB.prepare("insert into users (id,email,display_name,role,password_salt,password_hash) values (?,?,?,?,?,?)").bind(crypto.randomUUID(), email.trim().toLowerCase(), displayName.trim(), "admin", salt, await passwordHash(password, salt)).run();
      return json({ ok: true }, 201);
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const { email, password } = await body(request) || {};
      const user = await env.DB.prepare("select * from users where email=?").bind(String(email || "").trim().toLowerCase()).first();
      if (!user || typeof password !== "string" || (await passwordHash(password, user.password_salt)) !== user.password_hash) return deny("Invalid email or password");
      const token = await createSession(env, user.id);
      return json({ user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role }, token }, 200, { "set-cookie": cookie(token) });
    }

    if (url.pathname === "/api/auth/client-login" && request.method === "POST") {
      const { email, code } = clientAccessInput(await body(request));
      if (!/^\S+@\S+\.\S+$/.test(email) || code.length < 6) return deny("Use your client email and project access code", 400);
      const rows = await env.DB.prepare("select u.id,u.email,u.display_name,u.role,pac.project_id,pac.access_salt,pac.access_hash from project_access_codes pac join users u on u.id=pac.user_id where u.email=? and u.role='client'").bind(email).all();
      let access = null;
      for (const row of rows.results) {
        if (row.access_hash === await passwordHash(code, row.access_salt)) { access = row; break; }
      }
      if (!access) return deny("That email and access code do not match");
      const token = await createSession(env, access.id);
      return json({ user: { id: access.id, email: access.email, displayName: access.display_name, role: access.role }, projectId: access.project_id, token }, 200, { "set-cookie": cookie(token) });
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const token = readToken(request); if (token) await env.DB.prepare("delete from sessions where token_hash=?").bind(await digest(token)).run();
      return json({ ok: true }, 200, { "set-cookie": "tfw_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });
    }
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const user = await userFromRequest(request, env); return user ? json({ user }) : deny("Sign in required");
    }
    if (url.pathname === "/api/inquiries" && request.method === "POST") {
      const payload = await body(request);
      if (!payload || payload.website) return json({ ok: true }, 202);
      const name = String(payload.name || "").trim().slice(0, 120);
      const email = String(payload.email || "").trim().toLowerCase().slice(0, 200);
      const details = String(payload.details || "").trim().slice(0, 5000);
      if (!name || !/^\S+@\S+\.\S+$/.test(email) || !details) return deny("Please provide your name, a valid email, and project details.", 400);
      const inquiry = {
        id: crypto.randomUUID(), name, email, details,
        phone: String(payload.phone || "").trim().slice(0, 60),
        company: String(payload.company || "").trim().slice(0, 160),
        service: String(payload.service || "").trim().slice(0, 160)
      };
      await env.DB.prepare("insert into inquiries (id,name,email,phone,company,service,details) values (?,?,?,?,?,?,?)")
        .bind(inquiry.id, inquiry.name, inquiry.email, inquiry.phone, inquiry.company, inquiry.service, inquiry.details).run();
      await notifyStudioOfInquiry(env, inquiry);
      return json({ ok: true, message: "Inquiry received." }, 201);
    }
    if (url.pathname === "/api/inquiries" && request.method === "GET") {
      const user = await userFromRequest(request, env); if (!studio(user)) return deny("Studio access required", 403);
      const rows = await env.DB.prepare("select id,name,email,phone,company,service,details,source,status,created_at from inquiries order by created_at desc").all();
      return json({ inquiries: rows.results });
    }
    const inquiryMatch = url.pathname.match(/^\/api\/inquiries\/([^/]+)$/);
    if (inquiryMatch && request.method === "PATCH") {
      const user = await userFromRequest(request, env); if (!studio(user)) return deny("Studio access required", 403);
      const payload = await body(request); const status = payload?.status;
      if (!["new", "contacted", "qualified", "closed"].includes(status)) return deny("Invalid inquiry status", 400);
      const result = await env.DB.prepare("update inquiries set status=? where id=?").bind(status, inquiryMatch[1]).run();
      return result.meta.changes ? json({ ok: true }) : deny("Inquiry not found", 404);
    }
    if (url.pathname === "/api/projects" && request.method === "GET") {
      const user = await userFromRequest(request, env); if (!user) return deny("Sign in required");
      const query = studio(user)
        ? env.DB.prepare("select p.* from projects p order by p.updated_at desc")
        : env.DB.prepare("select p.* from projects p join project_members pm on pm.project_id=p.id where pm.user_id=? order by p.updated_at desc").bind(user.id);
      const rows = await query.all(); return json({ projects: rows.results });
    }
    if (url.pathname === "/api/projects" && request.method === "POST") {
      const user = await userFromRequest(request, env); if (!studio(user)) return deny("Studio access required", 403);
      const input = projectInput(await body(request));
      if (!input.name || !input.service) return deny("Project name and service are required", 400);
      const id = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("insert into projects (id,name,service,status,due_date,progress,created_by) values (?,?,?,?,?,?,?)").bind(id, input.name, input.service, input.status, input.dueDate, input.progress, user.id),
        env.DB.prepare("insert into project_members (project_id,user_id,role) values (?,?,?)").bind(id, user.id, "owner")
      ]);
      return json({ project: { id, ...input } }, 201);
    }
    const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && request.method === "GET") {
      const user = await userFromRequest(request, env); if (!user || !(await canAccessProject(env, user, projectMatch[1]))) return deny("Project access required", 403);
      const project = await env.DB.prepare("select * from projects where id=?").bind(projectMatch[1]).first();
      if (!project) return deny("Project not found", 404);
      const deliverables = await env.DB.prepare("select id,title,status,sort_order,approved_at from deliverables where project_id=? order by sort_order,created_at").bind(projectMatch[1]).all();
      return json({ project, deliverables: deliverables.results });
    }
    if (projectMatch && request.method === "PATCH") {
      const user = await userFromRequest(request, env); if (!studio(user)) return deny("Studio access required", 403);
      const input = projectInput(await body(request));
      if (!input.name || !input.service) return deny("Project name and service are required", 400);
      const result = await env.DB.prepare("update projects set name=?,service=?,status=?,due_date=?,progress=?,updated_at=current_timestamp where id=?").bind(input.name, input.service, input.status, input.dueDate, input.progress, projectMatch[1]).run();
      return result.meta.changes ? json({ project: { id: projectMatch[1], ...input } }) : deny("Project not found", 404);
    }
    const clientAccessMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/client-access$/);
    if (clientAccessMatch && request.method === "POST") {
      const user = await userFromRequest(request, env); if (!studio(user)) return deny("Studio access required", 403);
      const project = await env.DB.prepare("select id from projects where id=?").bind(clientAccessMatch[1]).first();
      if (!project) return deny("Project not found", 404);
      const input = clientAccessInput(await body(request));
      if (!/^\S+@\S+\.\S+$/.test(input.email) || input.code.length < 6 || input.code.length > 128) return deny("Use a valid client email and a code of at least 6 characters", 400);
      let client = await env.DB.prepare("select id,email,role from users where email=?").bind(input.email).first();
      if (client && client.role !== "client") return deny("That email belongs to a studio user", 409);
      if (!client) {
        const id = crypto.randomUUID(); const salt = random();
        await env.DB.prepare("insert into users (id,email,display_name,role,password_salt,password_hash) values (?,?,?,?,?,?)").bind(id, input.email, input.displayName, "client", salt, await passwordHash(random(), salt)).run();
        client = { id, email: input.email, role: "client" };
      }
      const codeSalt = random(); const codeHash = await passwordHash(input.code, codeSalt);
      await env.DB.batch([
        env.DB.prepare("insert into project_members (project_id,user_id,role) values (?,?,?) on conflict(project_id,user_id) do update set role=excluded.role").bind(clientAccessMatch[1], client.id, "client"),
        env.DB.prepare("insert into project_access_codes (project_id,user_id,access_salt,access_hash,rotated_at) values (?,?,?,?,current_timestamp) on conflict(project_id,user_id) do update set access_salt=excluded.access_salt,access_hash=excluded.access_hash,rotated_at=current_timestamp").bind(clientAccessMatch[1], client.id, codeSalt, codeHash)
      ]);
      return json({ ok: true, client: { id: client.id, email: client.email } }, 201);
    }
    const updateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/updates$/);
    const deliverableMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/deliverables$/);
    if (deliverableMatch && request.method === "POST") {
      const user = await userFromRequest(request, env); if (!studio(user)) return deny("Studio access required", 403);
      const payload = await body(request); const title = String(payload?.title || "").trim().slice(0, 180);
      if (!title) return deny("Deliverable title is required", 400);
      const id = crypto.randomUUID();
      await env.DB.prepare("insert into deliverables (id,project_id,title,status,sort_order) values (?,?,?,?,?)").bind(id, deliverableMatch[1], title, "draft", Number(payload?.sortOrder) || 0).run();
      return json({ deliverable: { id, title, status: "draft" } }, 201);
    }
    if (updateMatch && request.method === "GET") {
      const user = await userFromRequest(request, env); if (!user || !(await canAccessProject(env, user, updateMatch[1]))) return deny("Project access required", 403);
      const sql = studio(user) ? "select * from project_updates where project_id=? order by created_at desc" : "select * from project_updates where project_id=? and visible_to_client=1 order by created_at desc";
      const rows = await env.DB.prepare(sql).bind(updateMatch[1]).all(); return json({ updates: rows.results });
    }
    if (updateMatch && request.method === "POST") {
      const user = await userFromRequest(request, env); if (!studio(user)) return deny("Studio access required", 403);
      const payload = await body(request); const title = String(payload?.title || "Studio update").trim().slice(0, 160); const text = String(payload?.body || "").trim().slice(0, 5000);
      if (!text) return deny("Update text is required", 400);
      const id = crypto.randomUUID(); await env.DB.prepare("insert into project_updates (id,project_id,title,body,visible_to_client,requires_approval,created_by) values (?,?,?,?,?,?,?)").bind(id, updateMatch[1], title, text, payload?.visibleToClient === false ? 0 : 1, payload?.requiresApproval ? 1 : 0, user.id).run();
      return json({ update: { id, title, body: text } }, 201);
    }
    return deny("Not found", 404);
  }
};
