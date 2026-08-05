const express = require('express');
const app = express();
const port = 3000;

// ============ WEBSOCKET ============
const WebSocket = require('ws');

// Cria o servidor WebSocket na MESMA porta (3000)
const wss = new WebSocket.Server({ server: app });

// ============ MIDDLEWARE ============
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

app.use(express.text());

// ============ VARIÁVEIS ============
let activeUsers = {};
const blacklisted = [];
let currentAnnouncement = "Bem-vindo ao Dex Notifier!";

// ============ ROTAS HTTP ============
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

// ============ WEBSOCKET EVENTOS ============
wss.on('connection', (ws) => {
    console.log('✅ Cliente conectado via WebSocket');
    
    ws.on('message', (message) => {
        console.log('📩 Mensagem recebida:', message.toString());
    });

    ws.on('close', () => {
        console.log('❌ Cliente desconectado do WebSocket');
    });
});

// Função para enviar dados para todos os clientes
function sendSpotting(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// ============ INICIAR SERVIDOR ============
app.listen(port, () => {
    console.log(`✅ Servidor rodando na porta ${port}`);
});

// Simular envio de dados a cada 10 segundos (para teste)
setInterval(() => {
    const brainrots = [
        "Strawberry Elephant", "Headless Horseman", "Meowl", 
        "Skibidi Toilet", "John Pork", "Dragon Cannelloni",
        "La Supreme Combinasion", "Cerberus", "Ginger Gerat"
    ];
    const random = brainrots[Math.floor(Math.random() * brainrots.length)];
    const gen = Math.floor(Math.random() * 500000000) + 10000000;
    
    sendSpotting({
        type: "spotting",
        pet: { display_name: random },
        raw_name: random,
        generation: gen,
        owner_username: "Servidor",
        job_id: "test-" + Date.now()
    });
    console.log(`📤 Enviado: ${random} - $${gen}/s`);
}, 10000);
