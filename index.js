const express = require('express');
const WebSocket = require('ws');
const app = express();
const port = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.text({ type: '*/*' }));
app.use(express.json());

let activeUsers = {};
const blacklisted = [];
let currentAnnouncement = "Bem-vindo ao Vex Notifier!";
let clients = [];

// ---------- HTTP ----------
app.get('/secure', (req, res) => {
    const host = req.get('host');
    res.json({ wss: `wss://${host}` });
});

app.get('/usernames', (req, res) => {
    // limpa usuários antigos (mais de 5 min sem ping)
    const now = Date.now();
    for (const [name, ts] of Object.entries(activeUsers)) {
        if (now - ts > 5 * 60 * 1000) delete activeUsers[name];
    }
    res.send(Object.keys(activeUsers).join('\n'));
});

app.post('/usernames', (req, res) => {
    if (req.body && req.body !== '') {
        activeUsers[req.body.trim()] = Date.now();
    }
    res.send('OK');
});

app.get('/blacklisted', (req, res) => {
    res.send(blacklisted.join('\n'));
});

app.get('/announcements', (req, res) => {
    res.send(currentAnnouncement);
});

app.post('/announcements', (req, res) => {
    if (req.body) currentAnnouncement = String(req.body);
    res.send('OK');
});

// ---------- LOGS → BROADCAST ----------
app.post('/logs', (req, res) => {
    const raw = (req.body || '').toString().trim();
    console.log('[LOG]', raw);

    // Formato esperado do cliente: "Name | generation | owner | jobId"
    // Ex: "Strawberry Elephant | 25000000 | Player123 | abc-123-def"
    const parts = raw.split('|').map(p => p.trim());
    if (parts.length >= 3) {
        const name       = parts[0] || 'Unknown';
        const generation = Number(parts[1]) || 0;
        const owner      = parts[2] || 'Unknown';
        const jobId      = parts[3] || '';

        const spotting = {
            type: "spotting",
            pet: {
                display_name: name,
                og: false
            },
            generation: generation,
            owner_username: owner,
            job_id: jobId,
            og: false,
            raw_name: name
        };

        broadcast(JSON.stringify(spotting));
        console.log('[BROADCAST]', name, generation, owner);
    }

    res.send('OK');
});

// ---------- WebSocket ----------
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${port}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Cliente conectado. Total:', clients.length + 1);
    clients.push(ws);

    ws.on('close', () => {
        clients = clients.filter(c => c !== ws);
        console.log('Cliente desconectado. Total:', clients.length);
    });

    ws.on('error', () => {
        clients = clients.filter(c => c !== ws);
    });
});

function broadcast(msg) {
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(msg);
            } catch (e) {
                // ignora
            }
        }
    });
}
