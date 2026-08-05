const express = require('express');
const app = express();
const port = 3000;

// WebSocket na mesma porta
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server: app });

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

app.use(express.text());

let activeUsers = {};
const blacklisted = [];
let currentAnnouncement = "Bem-vindo ao Dex Notifier!";

app.get('/secure', (req, res) => {
    res.json({ wss: `wss://${req.get('host')}` });
});

app.get('/usernames', (req, res) => {
    res.send(Object.keys(activeUsers).join('\n'));
});

app.post('/usernames', (req, res) => {
    if (req.body && req.body !== '') {
        activeUsers[req.body] = Date.now();
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
    if (req.body) currentAnnouncement = req.body;
    res.send('OK');
});

app.post('/logs', (req, res) => {
    console.log('[LOG]', req.body);
    res.send('OK');
});

wss.on('connection', (ws) => {
    console.log('✅ Cliente conectado via WebSocket');
    ws.on('message', (message) => {
        console.log('📩 Mensagem:', message.toString());
    });
    ws.on('close', () => {
        console.log('❌ Cliente desconectado');
    });
});

function sendSpotting(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

app.listen(port, () => {
    console.log(`✅ Servidor rodando na porta ${port}`);
});

// Simular envio a cada 10s
setInterval(() => {
    const brainrots = ["Strawberry Elephant", "Headless Horseman", "Meowl", "Skibidi Toilet", "John Pork"];
    const random = brainrots[Math.floor(Math.random() * brainrots.length)];
    sendSpotting({
        type: "spotting",
        pet: { display_name: random },
        raw_name: random,
        generation: Math.floor(Math.random() * 500000000) + 10000000,
        owner_username: "Servidor",
        job_id: "test-" + Date.now()
    });
}, 10000);
