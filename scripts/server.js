const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'workspace.json');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@thefourthwall.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const sessions = new Map();
const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' };

function initialData() { return { inquiries: [], projects: [
  { id: crypto.randomUUID(), name: 'HarshaLucknowi', service: 'Brand identity & social media', status: 'Active', dueDate: '2026-09-30', progress: 68, updatedAt: new Date().toISOString(), clientEmail: 'client@harshalucknowi.com', clientCode: 'HARSHALIVE', deliverables: ['Brand identity system', 'Social content plan', 'Website design'], updates: [{ date: '2026-09-02', title: 'Social campaign is in review', detail: 'The next set of campaign visuals is ready for feedback.' }, { date: '2026-08-28', title: 'Identity system approved', detail: 'Core brand assets have been finalised and organised.' }] },
  { id: crypto.randomUUID(), name: 'The Fourth Wall', service: 'Website development', status: 'Active', dueDate: '2026-09-15', progress: 84, updatedAt: new Date().toISOString(), clientEmail: 'hello@thefourthwall.local', clientCode: 'FOURTHWALL', deliverables: ['Website experience', 'Inquiry workflow', 'Studio dashboard'], updates: [{ date: '2026-09-02', title: 'Studio app delivered', detail: 'Client and team workspaces are ready for review.' }] }
] }; }
function readData() { try { const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); data.projects = data.projects.map(project => { const defaults = project.name === 'HarshaLucknowi' ? { clientEmail: 'client@harshalucknowi.com', clientCode: 'HARSHALIVE', deliverables: ['Brand identity system', 'Social content plan', 'Website design'], updates: [{ date: '2026-09-02', title: 'Social campaign is in review', detail: 'The next set of campaign visuals is ready for feedback.' }] } : {}; return { clientEmail: '', clientCode: '', deliverables: [], updates: [], ...defaults, ...project }; }); return data; } catch { const data = initialData(); writeData(data); return data; } }
function writeData(data) { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function sendJson(res, status, payload, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(payload)); }
function parseBody(req) { return new Promise((resolve, reject) => { let body = ''; req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); }); req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); } }); }); }
function clean(value, max = 5000) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function getSession(req) { const cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(v => v.trim().split('='))); const session = sessions.get(cookies.tfw_session); if (session && session.expiresAt > Date.now()) return session; return null; }
function requireAdmin(req, res) { if (!getSession(req)) { sendJson(res, 401, { error: 'Please sign in to continue.' }); return false; } return true; }
function requireClient(req, res) { const session = getSession(req); if (!session || !session.projectId) { sendJson(res, 401, { error: 'Please sign in to continue.' }); return null; } return session; }

async function handleApi(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/api/inquiries') {
    try {
      const body = await parseBody(req); const inquiry = { id: crypto.randomUUID(), name: clean(body.name, 120), email: clean(body.email, 200), phone: clean(body.phone, 60), company: clean(body.company, 160), service: clean(body.service, 160), details: clean(body.details), status: 'New', createdAt: new Date().toISOString() };
      if (!inquiry.name || !/^\S+@\S+\.\S+$/.test(inquiry.email) || !inquiry.details) return sendJson(res, 400, { error: 'Please provide your name, a valid email, and project details.' });
      const data = readData(); data.inquiries.unshift(inquiry); writeData(data); return sendJson(res, 201, { message: 'Inquiry received.', inquiry: { id: inquiry.id, name: inquiry.name } });
    } catch { return sendJson(res, 400, { error: 'We could not process that inquiry.' }); }
  }
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    try {
      const body = await parseBody(req);
      if (clean(body.email, 200) !== ADMIN_EMAIL || body.password !== ADMIN_PASSWORD) return sendJson(res, 401, { error: 'Incorrect email or password.' });
      const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { email: ADMIN_EMAIL, expiresAt: Date.now() + 28800000 });
      return sendJson(res, 200, { email: ADMIN_EMAIL }, { 'Set-Cookie': `tfw_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800` });
    } catch { return sendJson(res, 400, { error: 'We could not sign you in.' }); }
  }
  if (req.method === 'POST' && pathname === '/api/auth/logout') { const cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(v => v.trim().split('='))); sessions.delete(cookies.tfw_session); return sendJson(res, 200, { ok: true }, { 'Set-Cookie': 'tfw_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }); }
  if (req.method === 'GET' && pathname === '/api/auth/session') return sendJson(res, 200, { user: getSession(req) || null });
  if (req.method === 'POST' && pathname === '/api/client/login') {
    try { const body = await parseBody(req); const project = readData().projects.find(item => clean(item.clientEmail, 200).toLowerCase() === clean(body.email, 200).toLowerCase() && item.clientCode === clean(body.code, 100)); if (!project) return sendJson(res, 401, { error: 'That email and project code do not match.' }); const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { projectId: project.id, email: project.clientEmail, expiresAt: Date.now() + 28800000 }); return sendJson(res, 200, { project: project.name }, { 'Set-Cookie': `tfw_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800` }); } catch { return sendJson(res, 400, { error: 'We could not sign you in.' }); }
  }
  if (pathname === '/api/client/project') { const session = requireClient(req, res); if (!session) return; const project = readData().projects.find(item => item.id === session.projectId); return project ? sendJson(res, 200, { project }) : sendJson(res, 404, { error: 'Project not found.' }); }
  if (!pathname.startsWith('/api/admin/') || !requireAdmin(req, res)) return pathname.startsWith('/api/admin/') ? undefined : sendJson(res, 404, { error: 'Not found.' });
  const data = readData();
  if (req.method === 'GET' && pathname === '/api/admin/workspace') return sendJson(res, 200, { ...data, summary: { newInquiries: data.inquiries.filter(i => i.status === 'New').length, activeProjects: data.projects.filter(p => p.status === 'Active').length, totalInquiries: data.inquiries.length } });
  if (req.method === 'PATCH' && pathname.startsWith('/api/admin/inquiries/')) {
    try { const body = await parseBody(req); const item = data.inquiries.find(i => i.id === pathname.split('/').pop()); if (!item) return sendJson(res, 404, { error: 'Inquiry not found.' }); if (['New', 'Contacted', 'Qualified', 'Closed'].includes(body.status)) item.status = body.status; writeData(data); return sendJson(res, 200, { inquiry: item }); } catch { return sendJson(res, 400, { error: 'We could not update that inquiry.' }); }
  }
  if (req.method === 'POST' && pathname === '/api/admin/projects') {
    try { const body = await parseBody(req); const project = { id: crypto.randomUUID(), name: clean(body.name, 160), service: clean(body.service, 160), status: ['Active', 'Planning', 'Complete'].includes(body.status) ? body.status : 'Planning', dueDate: clean(body.dueDate, 20), progress: Math.min(100, Math.max(0, Number(body.progress) || 0)), clientEmail: clean(body.clientEmail, 200).toLowerCase(), clientCode: clean(body.clientCode, 100), deliverables: [], updates: [], updatedAt: new Date().toISOString() }; if (!project.name || !project.service) return sendJson(res, 400, { error: 'Project name and service are required.' }); if ((project.clientEmail && !project.clientCode) || (!project.clientEmail && project.clientCode)) return sendJson(res, 400, { error: 'Add both a client email and a project access code, or leave both blank.' }); data.projects.unshift(project); writeData(data); return sendJson(res, 201, { project }); } catch { return sendJson(res, 400, { error: 'We could not create that project.' }); }
  }
  return sendJson(res, 404, { error: 'Not found.' });
}
function serveFile(filePath, res) { fs.readFile(filePath, (err, data) => { if (err) return send404(res, 'file'); res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache, no-store, must-revalidate' }); res.end(data); }); }
function send404(res, pathname) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(`404 - ${pathname} was not found.`); }
const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname);
  const filePath = path.resolve(ROOT_DIR, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
  if (!filePath.startsWith(ROOT_DIR + path.sep)) return send404(res, pathname);
  fs.stat(filePath, (err, stats) => { if (!err && stats.isFile()) return serveFile(filePath, res); const htmlPath = `${filePath}.html`; fs.stat(htmlPath, (htmlErr, htmlStats) => !htmlErr && htmlStats.isFile() ? serveFile(htmlPath, res) : send404(res, pathname)); });
});
server.listen(PORT, () => console.log(`✦ The Fourth Wall app is running at http://localhost:${PORT}`));
