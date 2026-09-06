const encoder = new TextEncoder();
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
const deny = (message, status = 401) => json({ error: message }, status);
const toHex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const random = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

async function digest(value) { return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value))); }
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: encoder.encode(salt), iterations: 210000, hash: "SHA-256" }, key, 256);
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,authorization" } });
    if (url.pathname === "/api/health") return json({ ok: true, service: "the-fourth-wall-api" });

    if (url.pathname === "/api/auth/bootstrap" && request.method === "POST") {
      if (!env.BOOTSTRAP_SECRET || request.headers.get("x-bootstrap-secret") !== env.BOOTSTRAP_SECRET) return deny("Not allowed", 403);
      const existing = await env.DB.prepare("select id from users limit 1").first();
      if (existing) return deny("Workspace has already been initialized", 409);
      const { email, password, displayName = "Studio owner" } = await request.json();
      if (!/^\S+@\S+\.\S+$/.test(email || "") || typeof password !== "string" || password.length < 12) return deny("Use a valid email and a password of at least 12 characters", 400);
      const salt = random();
      await env.DB.prepare("insert into users (id,email,display_name,role,password_salt,password_hash) values (?,?,?,?,?,?)").bind(crypto.randomUUID(), email.trim().toLowerCase(), displayName.trim(), "admin", salt, await passwordHash(password, salt)).run();
      return json({ ok: true }, 201);
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const { email, password } = await request.json();
      const user = await env.DB.prepare("select * from users where email=?").bind(String(email || "").trim().toLowerCase()).first();
      if (!user || typeof password !== "string" || (await passwordHash(password, user.password_salt)) !== user.password_hash) return deny("Invalid email or password");
      const token = random();
      const expires = new Date(Date.now() + 7 * 86400000).toISOString();
      await env.DB.prepare("insert into sessions (id,user_id,token_hash,expires_at) values (?,?,?,?)").bind(crypto.randomUUID(), user.id, await digest(token), expires).run();
      return json({ user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } }, 200, { "set-cookie": cookie(token) });
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const token = readToken(request); if (token) await env.DB.prepare("delete from sessions where token_hash=?").bind(await digest(token)).run();
      return json({ ok: true }, 200, { "set-cookie": "tfw_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });
    }
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const user = await userFromRequest(request, env); return user ? json({ user }) : deny("Sign in required");
    }
    return deny("Not found", 404);
  }
};
