const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'db.json');
const PUBLIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]
]);

const readDb = async () => JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
const writeDb = async db => {
  const temporary = `${DATA_FILE}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(db, null, 2));
  await fs.rename(temporary, DATA_FILE);
};
const sendJson = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};
const getBody = req => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 1_000_000) reject(new Error('Request body too large')); });
  req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); } });
  req.on('error', reject);
});

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { status: 'ok', service: 'savor-api', time: new Date().toISOString() });
  const db = await readDb();
  if (req.method === 'GET' && url.pathname === '/api/dashboard') return sendJson(res, 200, { restaurant: db.restaurant, agents: db.agents, recommendations: db.recommendations, openTaskCount: db.tasks.filter(task => task.status !== 'complete').length });
  if (req.method === 'GET' && url.pathname === '/api/agents') return sendJson(res, 200, db.agents);
  if (req.method === 'GET' && url.pathname === '/api/recommendations') return sendJson(res, 200, db.recommendations);
  if (req.method === 'GET' && url.pathname === '/api/tasks') return sendJson(res, 200, db.tasks);

  const approveMatch = url.pathname.match(/^\/api\/recommendations\/([^/]+)\/approve$/);
  if (req.method === 'POST' && approveMatch) {
    const recommendation = db.recommendations.find(item => item.id === approveMatch[1]);
    if (!recommendation) return sendJson(res, 404, { error: 'Recommendation not found' });
    if (recommendation.status === 'approved') return sendJson(res, 200, { recommendation, message: 'Already approved' });
    recommendation.status = 'approved';
    recommendation.approvedAt = new Date().toISOString();
    db.tasks.push({ id: crypto.randomUUID(), description: recommendation.title, agentId: recommendation.workflow[1] || recommendation.agentId, sourceRecommendationId: recommendation.id, status: 'active', createdAt: recommendation.approvedAt });
    await writeDb(db);
    return sendJson(res, 200, { recommendation, message: 'Recommendation approved and task delegated' });
  }

  if (req.method === 'POST' && url.pathname === '/api/tasks') {
    const body = await getBody(req);
    const agent = db.agents.find(item => item.id === body.agentId);
    if (!body.description?.trim()) return sendJson(res, 400, { error: 'Description is required' });
    if (!agent) return sendJson(res, 400, { error: 'A valid agentId is required' });
    const task = { id: crypto.randomUUID(), description: body.description.trim(), agentId: agent.id, status: 'active', createdAt: new Date().toISOString() };
    db.tasks.push(task); agent.activeTasks += 1; agent.activity = task.description;
    await writeDb(db);
    return sendJson(res, 201, task);
  }

  if (req.method === 'PATCH' && url.pathname === '/api/settings/optimization') {
    const body = await getBody(req);
    if (typeof body.enabled !== 'boolean') return sendJson(res, 400, { error: 'enabled must be a boolean' });
    db.restaurant.optimizationEnabled = body.enabled;
    db.restaurant.metrics.projectedProfit = body.enabled ? 2340 : 2160;
    await writeDb(db);
    return sendJson(res, 200, db.restaurant);
  }

  if (req.method === 'POST' && url.pathname === '/api/profit/scenario') {
    const pendingValue = db.recommendations.filter(item => item.status === 'pending').reduce((sum, item) => sum + item.expectedImpact, 0);
    const uplift = Math.min(265, Math.round(pendingValue * 0.23));
    return sendJson(res, 200, { baseline: db.restaurant.metrics.projectedProfit, uplift, projectedProfit: db.restaurant.metrics.projectedProfit + uplift, assumptions: ['Current reservations', 'Menu contribution margin', 'Vendor availability', 'Local demand signals'] });
  }
  return sendJson(res, 404, { error: 'API route not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const publicFile = PUBLIC_FILES.get(url.pathname);
    if (!publicFile) return sendJson(res, 404, { error: 'Not found' });
    const [filename, contentType] = publicFile;
    const contents = await fs.readFile(path.join(ROOT, filename));
    res.writeHead(200, { 'Content-Type': contentType }); res.end(contents);
  } catch (error) {
    console.error(error);
    sendJson(res, error.message === 'Invalid JSON' ? 400 : 500, { error: error.message || 'Internal server error' });
  }
});

server.listen(PORT, () => console.log(`Savor is running at http://localhost:${PORT}`));
