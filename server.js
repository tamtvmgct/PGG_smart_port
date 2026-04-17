const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Path to data file
const DATA_PATH = path.join(__dirname, 'data', 'pgg-store.json');
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, JSON.stringify({ auditLog: [], containers: [], yardSlots: [] }));

let db = JSON.parse(fs.readFileSync(DATA_PATH));
const persist = () => fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2));

// Security Middleware (Simple path protection)
// In a real app we'd use cookies/JWT but here we rely on the UI checking localStorage
// But we want to ensure that direct hits to /index.html and /gnt.html are at least redirected if no token hint
// However, serving static files is passive. We'll add a tiny script to the HTML files themselves for the Redirect.
app.use(express.static(__dirname));

// AUTH API
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    // Mock credentials
    if (username === 'admin' && password === 'admin123') return res.json({ ok:true, token: 'tok_admin_' + Date.now(), session: { role: 'ADMIN', name: 'Port Admin' } });
    if (username === 'gxt' && password === 'gxt123') return res.json({ ok:true, token: 'tok_gxt_' + Date.now(), session: { role: 'GXT', name: 'GXT User' } });
    if (username === 'gnt' && password === 'gnt123') return res.json({ ok:true, token: 'tok_gnt_' + Date.now(), session: { role: 'GNT', name: 'GNT User' } });
    res.status(401).json({ ok:false, error: 'Unauthorized' });
});

// CORE APIs
app.get('/api/health', (req, res) => res.json({ ok: true, version: 'V6.1-GOLD', env: process.env.NODE_ENV || 'production' }));
app.get('/api/audit', (req, res) => res.json({ ok: true, auditLog: db.auditLog }));
app.get('/api/containers', (req, res) => res.json({ ok: true, containers: db.containers }));

app.post('/api/containers', (req, res) => {
    const container = { 
        ...req.body, 
        status: 'REGISTERED', 
        registeredAt: Date.now(),
        isoValid: true // Backend default for now
    };
    db.containers.push(container);
    db.auditLog.unshift({ kind: 'CONTAINER_REGISTERED', at: Date.now(), containerId: container.containerId, by: 'gxt.system' });
    persist();
    res.json({ ok: true, container });
});

app.post('/api/yard/assign', (req, res) => {
    const { containerId } = req.body;
    // Simple logic: fill next slot
    const pos = { block: 'A', bay: 1, row: 1, tier: db.yardSlots.length + 1, key: `A-01-01-${db.yardSlots.length + 1}` };
    db.yardSlots.push({ ...pos, containerId });
    db.auditLog.unshift({ kind: 'YARD_AUTO_ASSIGN', at: Date.now(), containerId, position: pos.key, by: 'admin.system' });
    persist();
    res.json({ ok: true, position: pos });
});

app.get('/api/yard/block/:id', (req, res) => {
    const blockId = req.params.id;
    const items = db.yardSlots.filter(s => s.block === blockId);
    res.json({ ok: true, block: { id: blockId, name: `Block ${blockId}`, items } });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
wss.on('connection', ws => {
    console.log('WS: Unified terminal connected');
});

server.listen(port, () => {
    console.log(`========================================`);
    console.log(`  PIMS PRO V6.1 GOLD — READY TO DEPLOY  `);
    console.log(`  Listening on port ${port}            `);
    console.log(`========================================`);
});
