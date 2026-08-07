const express = require('express');
const WebSocket = require('ws');
const app = express();
const port = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

app.use(express.text());

let activeUsers = {};
const blacklisted = [];
let currentAnnouncement = "";
let clients = [];

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
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(req.body);
        }
    });
    res.send('OK');
});

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${port}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('✅ Cliente conectado');
    clients.push(ws);
    
    ws.on('close', () => {
        clients = clients.filter(client => client !== ws);
        console.log('❌ Cliente desconectado');
    });
    
    ws.on('message', (message) => {
        console.log('[WS] 📩', message.toString());
        clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message.toString());
            }
        });
    });
});

console.log(`✅ WebSocket rodando na porta ${port}`);
