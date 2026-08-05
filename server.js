const express = require('express');
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

app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Servidor HTTP rodando na porta ${port}`);
});
