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
const FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "application/zip"]);
function safeFileName(value) {
  return String(value || "file").normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "file";
}
function storageHeaders(env, mimeType) {
  return { authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, apikey: env.SUPABASE_SECRET_KEY, ...(mimeType ? { "content-type": mimeType } : {}) };
}
function storageReady(env) { return env.SUPABASE_URL && env.SUPABASE_SECRET_KEY && env.SUPABASE_STORAGE_BUCKET; }
async function audit(env, user, projectId, action, entityType, entityId, details = {}) {
  await env.DB.prepare("insert into audit_events (id,actor_id,project_id,action,entity_type,entity_id,details) values (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), user?.id || null, projectId || null, action, entityType, entityId || null, JSON.stringify(details).slice(0, 5000)).run();
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
    if (request.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PATCH,OPTIONS", "access-control-allow-headers": "content-type,authorization,x-file-name,x-deliverable-id" } });
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
    if (url.pathname === "/api/search" && request.method === "GET") {
      const user = await userFromRequest(request, env); if (!user) return deny("Sign in required");
      const term = `%${String(url.searchParams.get("q") || "").trim().slice(0, 100)}%`;
      if (term === "%%") return json({ results: [] });
      const projectScope = studio(user) ? "" : " and p.id in (select project_id from project_members where user_id=?)";
      const projectQuery = env.DB.prepare(`select p.id,p.name title,p.service subtitle,'project' type,p.id project_id from projects p where (p.name like ? or p.service like ?)${projectScope} limit 20`);
      const projects = await (studio(user) ? projectQuery.bind(term, term) : projectQuery.bind(term, term, user.id)).all();
      const fileQuery = env.DB.prepare(`select pf.id,pf.file_name title,p.name subtitle,'file' type,pf.project_id from project_files pf join projects p on p.id=pf.project_id where pf.file_name like ?${projectScope} limit 20`);
      const files = await (studio(user) ? fileQuery.bind(term) : fileQuery.bind(term, user.id)).all();
      let results = [...projects.results, ...files.results];
      if (studio(user)) {
        const leads = await env.DB.prepare("select id,name title,coalesce(company,email) subtitle,'lead' type,null project_id from inquiries where name like ? or company like ? or email like ? limit 20").bind(term, term, term).all();
        results.push(...leads.results);
      }
      return json({ results: results.slice(0, 40) });
    }
    if (url.pathname === "/api/audit" && request.method === "GET") {
      const user = await userFromRequest(request, env); if (!user) return deny("Sign in required");
      const projectId = url.searchParams.get("projectId");
      if (projectId && !(await canAccessProject(env, user, projectId))) return deny("Project access required", 403);
      const sql = studio(user)
        ? `select ae.*,u.display_name actor_name from audit_events ae left join users u on u.id=ae.actor_id ${projectId ? "where ae.project_id=?" : ""} order by ae.created_at desc limit 100`
        : "select ae.*,u.display_name actor_name from audit_events ae left join users u on u.id=ae.actor_id where ae.project_id in (select project_id from project_members where user_id=?) order by ae.created_at desc limit 100";
      const rows = await (studio(user) ? (projectId ? env.DB.prepare(sql).bind(projectId) : env.DB.prepare(sql)) : env.DB.prepare(sql).bind(user.id)).all();
      return json({ events: rows.results });
    }
    if(url.pathname==="/api/operations"&&request.method==="GET"){
      const user=await userFromRequest(request,env);if(!studio(user))return deny("Studio access required",403);
      const [contacts,team,templates,leads,announcements]=await Promise.all([
        env.DB.prepare("select * from client_contacts order by coalesce(renewal_at,'9999'),name").all(),
        env.DB.prepare("select u.id,u.display_name,u.email,u.role,tp.team_role,tp.active from users u left join team_profiles tp on tp.user_id=u.id where u.role!='client' order by u.display_name").all(),
        env.DB.prepare("select * from update_templates order by name").all(),
        env.DB.prepare("select la.*,i.name lead_name,u.display_name author_name from lead_activities la join inquiries i on i.id=la.inquiry_id join users u on u.id=la.created_by order by la.created_at desc limit 100").all(),
        env.DB.prepare("select * from announcements order by published_at desc limit 50").all()
      ]);return json({contacts:contacts.results,team:team.results,templates:templates.results,leadActivities:leads.results,announcements:announcements.results});
    }
    if(url.pathname==="/api/contacts"&&request.method==="POST"){
      const user=await userFromRequest(request,env);if(!studio(user))return deny("Studio access required",403);const p=await body(request),name=String(p?.name||"").trim().slice(0,160),email=String(p?.email||"").trim().toLowerCase().slice(0,200);if(!name||!/^\S+@\S+\.\S+$/.test(email))return deny("Name and valid email are required",400);const id=crypto.randomUUID();await env.DB.prepare("insert into client_contacts(id,name,email,phone,company,key_date,renewal_at,notes,created_by) values(?,?,?,?,?,?,?,?,?)").bind(id,name,email,String(p?.phone||"").slice(0,60)||null,String(p?.company||"").slice(0,160)||null,p?.keyDate||null,p?.renewalAt||null,String(p?.notes||"").slice(0,3000)||null,user.id).run();await audit(env,user,null,"created","client_contact",id,{name});return json({id},201);
    }
    const leadActivityMatch=url.pathname.match(/^\/api\/inquiries\/([^/]+)\/activities$/);
    if(leadActivityMatch&&request.method==="POST"){
      const user=await userFromRequest(request,env);if(!studio(user))return deny("Studio access required",403);const p=await body(request),kind=["note","call","email","follow_up"].includes(p?.kind)?p.kind:"note",note=String(p?.note||"").trim().slice(0,3000);if(!note&&!p?.followUpAt)return deny("Add a note or follow-up date",400);const id=crypto.randomUUID();await env.DB.prepare("insert into lead_activities(id,inquiry_id,kind,note,follow_up_at,created_by) values(?,?,?,?,?,?)").bind(id,leadActivityMatch[1],kind,note||null,p?.followUpAt||null,user.id).run();await audit(env,user,null,"logged","lead_activity",id,{inquiryId:leadActivityMatch[1],kind});return json({id},201);
    }
    if(url.pathname==="/api/update-templates"&&request.method==="POST"){
      const user=await userFromRequest(request,env);if(!studio(user))return deny("Studio access required",403);const p=await body(request),name=String(p?.name||"").trim().slice(0,120),title=String(p?.title||"").trim().slice(0,160),text=String(p?.body||"").trim().slice(0,5000);if(!name||!title||!text)return deny("Name, title and text are required",400);const id=crypto.randomUUID();await env.DB.prepare("insert into update_templates(id,name,title,body,created_by) values(?,?,?,?,?)").bind(id,name,title,text,user.id).run();return json({id},201);
    }
    if(url.pathname==="/api/announcements"&&request.method==="GET"){
      const user=await userFromRequest(request,env);if(!user)return deny("Sign in required");const rows=await env.DB.prepare("select a.*,case when ar.user_id is null then 0 else 1 end is_read from announcements a left join announcement_reads ar on ar.announcement_id=a.id and ar.user_id=? order by a.published_at desc limit 30").bind(user.id).all();return json({announcements:rows.results});
    }
    if(url.pathname==="/api/announcements"&&request.method==="POST"){
      const user=await userFromRequest(request,env);if(!studio(user))return deny("Studio access required",403);const p=await body(request),title=String(p?.title||"").trim().slice(0,160),text=String(p?.body||"").trim().slice(0,5000);if(!title||!text)return deny("Title and message are required",400);const id=crypto.randomUUID();await env.DB.prepare("insert into announcements(id,title,body,created_by) values(?,?,?,?)").bind(id,title,text,user.id).run();await audit(env,user,null,"published","announcement",id,{title});return json({id},201);
    }
    if(url.pathname==="/api/settings/notifications"&&request.method==="GET"){
      const user=await userFromRequest(request,env);if(!user)return deny("Sign in required");const row=await env.DB.prepare("select * from notification_preferences where user_id=?").bind(user.id).first();return json({preferences:row||{email_updates:1,weekly_digest:0,message_alerts:1,approval_alerts:1}});
    }
    if(url.pathname==="/api/settings/notifications"&&request.method==="PATCH"){
      const user=await userFromRequest(request,env);if(!user)return deny("Sign in required");const p=await body(request),v=k=>p?.[k]?1:0;await env.DB.prepare("insert into notification_preferences(user_id,email_updates,weekly_digest,message_alerts,approval_alerts,updated_at) values(?,?,?,?,?,current_timestamp) on conflict(user_id) do update set email_updates=excluded.email_updates,weekly_digest=excluded.weekly_digest,message_alerts=excluded.message_alerts,approval_alerts=excluded.approval_alerts,updated_at=current_timestamp").bind(user.id,v("emailUpdates"),v("weeklyDigest"),v("messageAlerts"),v("approvalAlerts")).run();return json({ok:true});
    }
    const onboardingMatch=url.pathname.match(/^\/api\/projects\/([^/]+)\/onboarding$/);
    if(onboardingMatch&&request.method==="GET"){
      const user=await userFromRequest(request,env);if(!user||!(await canAccessProject(env,user,onboardingMatch[1])))return deny("Project access required",403);const items=await env.DB.prepare("select * from project_onboarding_items where project_id=? order by sort_order").bind(onboardingMatch[1]).all();const intake=await env.DB.prepare("select * from intake_responses where project_id=? order by submitted_at desc limit 1").bind(onboardingMatch[1]).first();return json({items:items.results,intake});
    }
    if(onboardingMatch&&request.method==="POST"){
      const user=await userFromRequest(request,env);if(!user||!(await canAccessProject(env,user,onboardingMatch[1])))return deny("Project access required",403);const p=await body(request);if(!p?.answers||typeof p.answers!=="object")return deny("Questionnaire answers are required",400);const id=crypto.randomUUID();await env.DB.prepare("insert into intake_responses(id,project_id,user_id,answers) values(?,?,?,?)").bind(id,onboardingMatch[1],user.id,JSON.stringify(p.answers).slice(0,10000)).run();await audit(env,user,onboardingMatch[1],"submitted","intake",id);return json({id},201);
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
      const checklist=await env.DB.prepare("select oti.title,oti.sort_order from onboarding_template_items oti join onboarding_templates ot on ot.id=oti.template_id where ot.active=1 order by oti.sort_order").all();
      if(checklist.results.length)await env.DB.batch(checklist.results.map(item=>env.DB.prepare("insert into project_onboarding_items(id,project_id,title,sort_order) values(?,?,?,?)").bind(crypto.randomUUID(),id,item.title,item.sort_order)));
      await audit(env, user, id, "created", "project", id, { name: input.name });
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
      if (result.meta.changes) await audit(env, user, projectMatch[1], "updated", "project", projectMatch[1], input);
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
    const workspaceMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/workspace$/);
    if (workspaceMatch && request.method === "GET") {
      const user = await userFromRequest(request, env); if (!user || !(await canAccessProject(env, user, workspaceMatch[1]))) return deny("Project access required", 403);
      const projectId = workspaceMatch[1];
      const [milestones, tasks, messages, moodboards] = await Promise.all([
        env.DB.prepare("select * from milestones where project_id=? order by due_date,created_at").bind(projectId).all(),
        studio(user) ? env.DB.prepare("select t.*,u.display_name assignee_name from project_tasks t left join users u on u.id=t.assignee_id where t.project_id=? order by t.status,t.due_date").bind(projectId).all() : Promise.resolve({ results: [] }),
        env.DB.prepare("select m.*,u.display_name sender_name,case when mr.user_id is null then 0 else 1 end is_read from project_messages m join users u on u.id=m.sender_id left join message_reads mr on mr.message_id=m.id and mr.user_id=? where m.project_id=? order by m.created_at desc limit 100").bind(user.id,projectId).all(),
        env.DB.prepare("select mb.*,pf.file_name,pf.mime_type,mr.reaction from moodboards mb left join project_files pf on pf.id=mb.file_id left join moodboard_reactions mr on mr.moodboard_id=mb.id and mr.user_id=? where mb.project_id=? order by mb.created_at desc").bind(user.id,projectId).all()
      ]);
      return json({ milestones: milestones.results, tasks: tasks.results, messages: messages.results, moodboards: moodboards.results });
    }
    const collaborationMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/(milestones|tasks|messages|moodboards)$/);
    if (collaborationMatch && request.method === "POST") {
      const user = await userFromRequest(request, env); if (!user || !(await canAccessProject(env,user,collaborationMatch[1]))) return deny("Project access required",403);
      const projectId=collaborationMatch[1], type=collaborationMatch[2], payload=await body(request), id=crypto.randomUUID();
      if (type!=="messages"&&!studio(user)) return deny("Studio access required",403);
      if (type==="messages") {
        const text=String(payload?.body||"").trim().slice(0,5000); if(!text) return deny("Message is required",400);
        await env.DB.prepare("insert into project_messages(id,project_id,body,file_id,sender_id) values(?,?,?,?,?)").bind(id,projectId,text,payload?.fileId||null,user.id).run();
      } else if(type==="milestones") {
        const title=String(payload?.title||"").trim().slice(0,180); if(!title)return deny("Milestone title is required",400);
        await env.DB.prepare("insert into milestones(id,project_id,title,due_date,status,waiting_on,created_by) values(?,?,?,?,?,?,?)").bind(id,projectId,title,payload?.dueDate||null,"upcoming",["client","studio"].includes(payload?.waitingOn)?payload.waitingOn:null,user.id).run();
      } else if(type==="tasks") {
        const title=String(payload?.title||"").trim().slice(0,180); if(!title)return deny("Task title is required",400);
        await env.DB.prepare("insert into project_tasks(id,project_id,title,assignee_id,due_date,waiting_on_client,created_by) values(?,?,?,?,?,?,?)").bind(id,projectId,title,payload?.assigneeId||null,payload?.dueDate||null,payload?.waitingOnClient?1:0,user.id).run();
      } else {
        const title=String(payload?.title||"").trim().slice(0,180); if(!title||!payload?.fileId)return deny("Moodboard title and file are required",400);
        await env.DB.prepare("insert into moodboards(id,project_id,title,file_id,note,created_by) values(?,?,?,?,?,?)").bind(id,projectId,title,payload.fileId,String(payload?.note||"").trim().slice(0,3000)||null,user.id).run();
      }
      await audit(env,user,projectId,"created",type.slice(0,-1),id,{}); return json({id},201);
    }
    const reactionMatch=url.pathname.match(/^\/api\/moodboards\/([^/]+)\/reactions$/);
    if(reactionMatch&&request.method==="POST"){
      const user=await userFromRequest(request,env);if(!user)return deny("Sign in required");const board=await env.DB.prepare("select project_id from moodboards where id=?").bind(reactionMatch[1]).first();if(!board||!(await canAccessProject(env,user,board.project_id)))return deny("Moodboard not found",404);
      const payload=await body(request);if(!["love","consider","pass"].includes(payload?.reaction))return deny("Invalid reaction",400);
      await env.DB.prepare("insert into moodboard_reactions(moodboard_id,user_id,reaction) values(?,?,?) on conflict(moodboard_id,user_id) do update set reaction=excluded.reaction,created_at=current_timestamp").bind(reactionMatch[1],user.id,payload.reaction).run();await audit(env,user,board.project_id,"reacted","moodboard",reactionMatch[1],{reaction:payload.reaction});return json({ok:true});
    }
    const reviewsMatch=url.pathname.match(/^\/api\/projects\/([^/]+)\/reviews$/);
    if(reviewsMatch&&request.method==="GET"){
      const user=await userFromRequest(request,env);if(!user||!(await canAccessProject(env,user,reviewsMatch[1])))return deny("Project access required",403);
      const rows=await env.DB.prepare("select dc.*,u.display_name author_name,pf.file_name,pf.mime_type from design_comments dc join users u on u.id=dc.created_by join project_files pf on pf.id=dc.file_id where dc.project_id=? order by dc.file_id,dc.created_at").bind(reviewsMatch[1]).all();return json({comments:rows.results});
    }
    if(reviewsMatch&&request.method==="POST"){
      const user=await userFromRequest(request,env);if(!user||!(await canAccessProject(env,user,reviewsMatch[1])))return deny("Project access required",403);const payload=await body(request),text=String(payload?.body||"").trim().slice(0,3000);if(!text)return deny("Comment is required",400);
      const file=await env.DB.prepare("select 1 from project_files where id=? and project_id=? and mime_type in('image/jpeg','image/png','image/webp','application/pdf')").bind(payload?.fileId,reviewsMatch[1]).first();if(!file)return deny("Reviewable file not found",404);
      if(payload?.parentId){const parent=await env.DB.prepare("select 1 from design_comments where id=? and project_id=? and file_id=?").bind(payload.parentId,reviewsMatch[1],payload.fileId).first();if(!parent)return deny("Parent comment not found",404)}
      const id=crypto.randomUUID(),x=payload?.parentId?null:Math.max(0,Math.min(100,Number(payload?.pinX)||0)),y=payload?.parentId?null:Math.max(0,Math.min(100,Number(payload?.pinY)||0));
      await env.DB.prepare("insert into design_comments(id,project_id,file_id,parent_id,page_number,pin_x,pin_y,body,created_by) values(?,?,?,?,?,?,?,?,?)").bind(id,reviewsMatch[1],payload.fileId,payload?.parentId||null,Math.max(1,Number(payload?.pageNumber)||1),x,y,text,user.id).run();await audit(env,user,reviewsMatch[1],"commented","design_comment",id,{fileId:payload.fileId});return json({id},201);
    }
    const resolveMatch=url.pathname.match(/^\/api\/design-comments\/([^/]+)\/resolve$/);
    if(resolveMatch&&request.method==="PATCH"){
      const user=await userFromRequest(request,env);if(!studio(user))return deny("Studio access required",403);const comment=await env.DB.prepare("select project_id from design_comments where id=?").bind(resolveMatch[1]).first();if(!comment)return deny("Comment not found",404);await env.DB.prepare("update design_comments set resolved_at=current_timestamp,resolved_by=? where id=?").bind(user.id,resolveMatch[1]).run();await audit(env,user,comment.project_id,"resolved","design_comment",resolveMatch[1]);return json({ok:true});
    }
    const calendarMatch=url.pathname.match(/^\/api\/projects\/([^/]+)\/content-posts$/);
    if(calendarMatch&&request.method==="GET"){
      const user=await userFromRequest(request,env);if(!user||!(await canAccessProject(env,user,calendarMatch[1])))return deny("Project access required",403);const month=String(url.searchParams.get("month")||"").slice(0,7);const rows=await env.DB.prepare("select cp.*,(select decision from content_feedback where post_id=cp.id order by created_at desc limit 1) latest_decision,(select comment from content_feedback where post_id=cp.id order by created_at desc limit 1) latest_comment from content_posts cp where cp.project_id=? and (?='' or substr(cp.publish_at,1,7)=?) order by cp.publish_at").bind(calendarMatch[1],month,month).all();return json({posts:rows.results});
    }
    if(calendarMatch&&request.method==="POST"){
      const user=await userFromRequest(request,env);if(!studio(user))return deny("Studio access required",403);const payload=await body(request),title=String(payload?.title||"").trim().slice(0,180),channel=String(payload?.channel||"").trim().slice(0,80),publishAt=String(payload?.publishAt||"").slice(0,32);if(!title||!channel||!publishAt)return deny("Title, channel and publish date are required",400);const id=crypto.randomUUID();await env.DB.prepare("insert into content_posts(id,project_id,title,channel,publish_at,caption,status,created_by) values(?,?,?,?,?,?,?,?)").bind(id,calendarMatch[1],title,channel,publishAt,String(payload?.caption||"").trim().slice(0,5000)||null,payload?.sendForApproval?"in_review":"draft",user.id).run();await audit(env,user,calendarMatch[1],"created","content_post",id,{title});return json({id},201);
    }
    const feedbackMatch=url.pathname.match(/^\/api\/content-posts\/([^/]+)\/feedback$/);
    if(feedbackMatch&&request.method==="POST"){
      const user=await userFromRequest(request,env);if(!user)return deny("Sign in required");const post=await env.DB.prepare("select project_id from content_posts where id=?").bind(feedbackMatch[1]).first();if(!post||!(await canAccessProject(env,user,post.project_id)))return deny("Post not found",404);const payload=await body(request),decision=payload?.decision,comment=String(payload?.comment||"").trim().slice(0,3000)||null;if(!["approved","changes_requested"].includes(decision))return deny("Choose approve or request changes",400);if(decision==="changes_requested"&&!comment)return deny("Describe the requested change",400);const id=crypto.randomUUID();await env.DB.batch([env.DB.prepare("insert into content_feedback(id,post_id,decision,comment,created_by) values(?,?,?,?,?)").bind(id,feedbackMatch[1],decision,comment,user.id),env.DB.prepare("update content_posts set status=?,updated_at=current_timestamp where id=?").bind(decision,feedbackMatch[1])]);await audit(env,user,post.project_id,decision,"content_post",feedbackMatch[1],{comment});return json({id},201);
    }
    if (deliverableMatch && request.method === "POST") {
      const user = await userFromRequest(request, env); if (!studio(user)) return deny("Studio access required", 403);
      const payload = await body(request); const title = String(payload?.title || "").trim().slice(0, 180);
      if (!title) return deny("Deliverable title is required", 400);
      const id = crypto.randomUUID();
      await env.DB.prepare("insert into deliverables (id,project_id,title,status,sort_order) values (?,?,?,?,?)").bind(id, deliverableMatch[1], title, "draft", Number(payload?.sortOrder) || 0).run();
      await audit(env, user, deliverableMatch[1], "created", "deliverable", id, { title });
      return json({ deliverable: { id, title, status: "draft" } }, 201);
    }
    const filesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/files$/);
    if (filesMatch && request.method === "GET") {
      const user = await userFromRequest(request, env); if (!user || !(await canAccessProject(env, user, filesMatch[1]))) return deny("Project access required", 403);
      const rows = await env.DB.prepare("select pf.id,pf.project_id,pf.deliverable_id,pf.file_name,pf.mime_type,pf.size_bytes,pf.version,pf.created_at,u.display_name uploaded_by from project_files pf join users u on u.id=pf.uploaded_by where pf.project_id=? order by pf.created_at desc").bind(filesMatch[1]).all();
      return json({ files: rows.results });
    }
    if (filesMatch && request.method === "POST") {
      const user = await userFromRequest(request, env); if (!user || !(await canAccessProject(env, user, filesMatch[1]))) return deny("Project access required", 403);
      if (!storageReady(env)) return deny("File storage is not configured", 503);
      const mimeType = String(request.headers.get("content-type") || "").split(";")[0].toLowerCase();
      const length = Number(request.headers.get("content-length") || 0);
      if (!FILE_TYPES.has(mimeType)) return deny("Use a JPG, PNG, WebP, PDF, or ZIP file", 415);
      if (length > 26214400) return deny("Files must be 25 MB or smaller", 413);
      const deliverableId = request.headers.get("x-deliverable-id") || null;
      if (deliverableId) {
        const belongs = await env.DB.prepare("select 1 from deliverables where id=? and project_id=?").bind(deliverableId, filesMatch[1]).first();
        if (!belongs) return deny("Deliverable not found", 404);
      }
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 26214400) return deny("Files must be between 1 byte and 25 MB", 413);
      const fileName = safeFileName(decodeURIComponent(request.headers.get("x-file-name") || "file"));
      const versionRow = deliverableId ? await env.DB.prepare("select coalesce(max(version),0)+1 next from project_files where deliverable_id=?").bind(deliverableId).first() : { next: 1 };
      const id = crypto.randomUUID(), version = Number(versionRow?.next || 1);
      const storagePath = `${filesMatch[1]}/${deliverableId || "shared"}/${id}-${fileName}`;
      const endpoint = `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
      const stored = await fetch(endpoint, { method: "POST", headers: { ...storageHeaders(env, mimeType), "x-upsert": "false" }, body: bytes });
      if (!stored.ok) { console.error("Storage upload failed", stored.status, await stored.text()); return deny("The file could not be stored", 502); }
      try {
        await env.DB.prepare("insert into project_files (id,project_id,deliverable_id,storage_path,file_name,mime_type,size_bytes,version,uploaded_by) values (?,?,?,?,?,?,?,?,?)").bind(id, filesMatch[1], deliverableId, storagePath, fileName, mimeType, bytes.byteLength, version, user.id).run();
      } catch (error) {
        await fetch(endpoint, { method: "DELETE", headers: storageHeaders(env) }); throw error;
      }
      await audit(env, user, filesMatch[1], "uploaded", "file", id, { fileName, version, deliverableId });
      return json({ file: { id, projectId: filesMatch[1], deliverableId, fileName, mimeType, sizeBytes: bytes.byteLength, version } }, 201);
    }
    const assetsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/brand-assets$/);
    if (assetsMatch && request.method === "GET") {
      const user = await userFromRequest(request, env); if (!user || !(await canAccessProject(env, user, assetsMatch[1]))) return deny("Project access required", 403);
      const archive = url.searchParams.get("archive") === "1";
      const rows = await env.DB.prepare(`select ba.id,ba.kind,ba.name,ba.token_value,ba.version,ba.is_latest,ba.archived_at,ba.created_at,pf.id file_id,pf.file_name,pf.mime_type,pf.size_bytes from brand_assets ba left join project_files pf on pf.id=ba.file_id where ba.project_id=? and ${archive ? "ba.archived_at is not null" : "ba.is_latest=1 and ba.archived_at is null"} order by ba.kind,ba.name,ba.version desc`).bind(assetsMatch[1]).all();
      return json({ assets: rows.results });
    }
    if (assetsMatch && request.method === "POST") {
      const user = await userFromRequest(request, env); if (!studio(user)) return deny("Studio access required", 403);
      const payload = await body(request), kind = payload?.kind;
      const name = String(payload?.name || "").trim().slice(0, 160), tokenValue = String(payload?.tokenValue || "").trim().slice(0, 500) || null;
      if (!["logo", "font", "color", "template"].includes(kind) || !name) return deny("Asset name and valid type are required", 400);
      const fileId = payload?.fileId || null;
      if (kind !== "color" && !fileId) return deny("Upload a file for this asset", 400);
      if (kind === "color" && !tokenValue) return deny("Add a colour token value", 400);
      if (fileId) {
        const file = await env.DB.prepare("select 1 from project_files where id=? and project_id=?").bind(fileId, assetsMatch[1]).first();
        if (!file) return deny("Project file not found", 404);
      }
      const previous = await env.DB.prepare("select coalesce(max(version),0) version from brand_assets where project_id=? and kind=? and lower(name)=lower(?)").bind(assetsMatch[1], kind, name).first();
      const id = crypto.randomUUID(), version = Number(previous?.version || 0) + 1;
      await env.DB.batch([
        env.DB.prepare("update brand_assets set is_latest=0,archived_at=coalesce(archived_at,current_timestamp) where project_id=? and kind=? and lower(name)=lower(?) and is_latest=1").bind(assetsMatch[1], kind, name),
        env.DB.prepare("insert into brand_assets (id,project_id,file_id,kind,name,token_value,version,created_by) values (?,?,?,?,?,?,?,?)").bind(id, assetsMatch[1], fileId, kind, name, tokenValue, version, user.id)
      ]);
      await audit(env, user, assetsMatch[1], "published", "brand_asset", id, { kind, name, version });
      return json({ asset: { id, kind, name, tokenValue, fileId, version, isLatest: true } }, 201);
    }
    const fileDownloadMatch = url.pathname.match(/^\/api\/files\/([^/]+)\/download$/);
    if (fileDownloadMatch && request.method === "GET") {
      const user = await userFromRequest(request, env); if (!user) return deny("Sign in required");
      const file = await env.DB.prepare("select * from project_files where id=?").bind(fileDownloadMatch[1]).first();
      if (!file || !(await canAccessProject(env, user, file.project_id))) return deny("File not found", 404);
      const endpoint = `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}/${file.storage_path.split("/").map(encodeURIComponent).join("/")}`;
      const stored = await fetch(endpoint, { headers: storageHeaders(env) });
      if (!stored.ok) return deny("The file could not be downloaded", 502);
      return new Response(stored.body, { headers: { "content-type": file.mime_type, "content-length": String(file.size_bytes), "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`, "cache-control": "private, no-store", "access-control-allow-origin": "*" } });
    }
    const approvalMatch = url.pathname.match(/^\/api\/deliverables\/([^/]+)\/approvals$/);
    if (approvalMatch && request.method === "GET") {
      const user = await userFromRequest(request, env); if (!user) return deny("Sign in required");
      const deliverable = await env.DB.prepare("select project_id from deliverables where id=?").bind(approvalMatch[1]).first();
      if (!deliverable || !(await canAccessProject(env, user, deliverable.project_id))) return deny("Deliverable not found", 404);
      const rows = await env.DB.prepare("select a.id,a.decision,a.note,a.typed_signature,a.created_at,u.display_name decided_by from deliverable_approvals a join users u on u.id=a.decided_by where a.deliverable_id=? order by a.created_at desc").bind(approvalMatch[1]).all();
      return json({ approvals: rows.results });
    }
    if (approvalMatch && request.method === "POST") {
      const user = await userFromRequest(request, env); if (!user) return deny("Sign in required");
      const deliverable = await env.DB.prepare("select project_id from deliverables where id=?").bind(approvalMatch[1]).first();
      if (!deliverable || !(await canAccessProject(env, user, deliverable.project_id))) return deny("Deliverable not found", 404);
      const payload = await body(request), decision = payload?.decision;
      if (!["approved", "changes_requested"].includes(decision)) return deny("Choose approve or request changes", 400);
      const note = String(payload?.note || "").trim().slice(0, 3000) || null;
      const signature = String(payload?.typedSignature || "").trim().slice(0, 160) || null;
      if (decision === "approved" && !signature) return deny("Type your name to approve", 400);
      const id = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("insert into deliverable_approvals (id,project_id,deliverable_id,decision,note,typed_signature,decided_by) values (?,?,?,?,?,?,?)").bind(id, deliverable.project_id, approvalMatch[1], decision, note, signature, user.id),
        env.DB.prepare("update deliverables set status=?,approved_by=?,approved_at=case when ?='approved' then current_timestamp else null end,updated_at=current_timestamp where id=?").bind(decision === "approved" ? "approved" : "in_review", decision === "approved" ? user.id : null, decision, approvalMatch[1])
      ]);
      await audit(env, user, deliverable.project_id, decision, "deliverable", approvalMatch[1], { note, typedSignature: Boolean(signature) });
      return json({ approval: { id, decision, note, typedSignature: signature } }, 201);
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
      await audit(env, user, updateMatch[1], "posted", "project_update", id, { title, visibleToClient: payload?.visibleToClient !== false });
      return json({ update: { id, title, body: text } }, 201);
    }
    return deny("Not found", 404);
  }
};
