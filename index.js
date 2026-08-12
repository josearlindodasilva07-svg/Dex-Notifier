const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Chave de administrador — defina via variável de ambiente em produção.
// Protege: ver logs, adicionar/remover da blacklist (HTTP e WebSocket).
const ADMIN_KEY = process.env.ADMIN_KEY || '12345';
const BLACKLIST_FILE = path.join(__dirname, 'blacklist.json');

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

app.use(express.text());

let activeUsers = {};
let blacklisted = [];
let currentAnnouncement = "";
let clients = [];
let serverLogs = [];

// ============================================
// BLACKLIST DE JOGADORES (PERSISTENTE EM DISCO)
// ============================================

const DEFAULT_BLACKLIST = [
    "kakhaga",
    "kejshswh",
];

function loadBlacklist() {
    try {
        if (fs.existsSync(BLACKLIST_FILE)) {
            const raw = fs.readFileSync(BLACKLIST_FILE, 'utf8');
            blacklisted = JSON.parse(raw);
            return;
        }
    } catch (e) {
        console.error('[BLACKLIST] Falha ao ler blacklist.json, usando padrão:', e.message);
    }
    blacklisted = [...DEFAULT_BLACKLIST];
    saveBlacklist();
}

function saveBlacklist() {
    try {
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklisted, null, 2));
    } catch (e) {
        console.error('[BLACKLIST] Falha ao salvar blacklist.json:', e.message);
    }
}

function isValidUsername(name) {
    return typeof name === 'string' && name.length > 0 && name.length <= 32;
}

function isPlayerBlacklisted(playerName) {
    return blacklisted.some(name => name.toLowerCase() === playerName.toLowerCase());
}

function addToBlacklist(playerName) {
    if (!isPlayerBlacklisted(playerName)) {
        blacklisted.push(playerName);
        saveBlacklist();
        console.log(`[BLACKLIST] + ${playerName} adicionado à blacklist`);
        return true;
    }
    return false;
}

function removeFromBlacklist(playerName) {
    const index = blacklisted.findIndex(name => name.toLowerCase() === playerName.toLowerCase());
    if (index !== -1) {
        blacklisted.splice(index, 1);
        saveBlacklist();
        console.log(`[BLACKLIST] - ${playerName} removido da blacklist`);
        return true;
    }
    return false;
}

function requireAdminKey(req, res, next) {
    const key = req.query.key || req.headers['x-admin-key'];
    if (key !== ADMIN_KEY) {
        return res.status(403).send('Acesso negado');
    }
    next();
}

loadBlacklist();

// ============================================
// ROTAS DA API
// ============================================

app.get('/secure', (req, res) => {
    res.json({ wss: `wss://${req.get('host')}` });
});

app.get('/usernames', (req, res) => {
    res.send(Object.keys(activeUsers).join('\n'));
});

app.post('/usernames', (req, res) => {
    const username = req.body;
    if (!isValidUsername(username)) {
        return res.status(400).send('Nome de usuário inválido');
    }

    if (isPlayerBlacklisted(username)) {
        console.log(`[BLACKLIST] Tentativa de conexão de ${username} (BANIDO)`);
        return res.status(403).send('BLACKLISTED');
    }

    activeUsers[username] = Date.now();
    console.log(`[USERS] + ${username} conectado`);

    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'user_joined',
                username: username
            }));
        }
    });

    res.send('OK');
});

app.get('/blacklisted', (req, res) => {
    res.send(blacklisted.join('\n'));
});

// Rotas de escrita da blacklist agora exigem a chave de admin
app.post('/blacklisted/add', requireAdminKey, (req, res) => {
    const username = req.body;
    if (!isValidUsername(username)) {
        return res.status(400).send('Nome de usuário inválido');
    }
    if (addToBlacklist(username)) {
        delete activeUsers[username];
        console.log(`[USERS] x ${username} removido dos ativos (BANIDO)`);
        res.send(`${username} adicionado à blacklist`);
    } else {
        res.send(`${username} já está na blacklist`);
    }
});

app.post('/blacklisted/remove', requireAdminKey, (req, res) => {
    const username = req.body;
    if (!isValidUsername(username)) {
        return res.status(400).send('Nome de usuário inválido');
    }
    if (removeFromBlacklist(username)) {
        res.send(`${username} removido da blacklist`);
    } else {
        res.send(`${username} não está na blacklist`);
    }
});

app.get('/announcements', (req, res) => {
    res.send(currentAnnouncement);
});

app.post('/announcements', requireAdminKey, (req, res) => {
    if (req.body) currentAnnouncement = req.body;
    res.send('OK');
});

app.post('/logs', (req, res) => {
    const logData = req.body;
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${logData}`;

    console.log('[LOG]', logEntry);
    serverLogs.push(logEntry);

    if (serverLogs.length > 1000) {
        serverLogs.shift();
    }

    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(logData);
        }
    });
    res.send('OK');
});

app.get('/logs', requireAdminKey, (req, res) => {
    res.send(serverLogs.join('\n'));
});

app.get('/active-users', (req, res) => {
    const now = Date.now();
    for (const [user, time] of Object.entries(activeUsers)) {
        if (now - time >= 300000) {
            delete activeUsers[user];
        }
    }

    res.json({
        count: Object.keys(activeUsers).length,
        users: Object.keys(activeUsers)
    });
});

app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        activeUsers: Object.keys(activeUsers).length,
        blacklisted: blacklisted.length,
        clients: clients.length,
        logs: serverLogs.length,
        uptime: process.uptime()
    });
});

// ============================================
// SERVIDOR
// ============================================

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${port}`);
    console.log(`Blacklist carregada: ${blacklisted.length} jogadores`);
    console.log(`${Object.keys(activeUsers).length} usuários ativos`);
    if (ADMIN_KEY === '12345') {
        console.log('AVISO: ADMIN_KEY não configurada — usando valor padrão inseguro. Defina a variável de ambiente ADMIN_KEY.');
    }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Cliente conectado ao WebSocket');
    clients.push(ws);

    ws.on('close', () => {
        clients = clients.filter(client => client !== ws);
        console.log('Cliente desconectado do WebSocket');
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'blacklist_add' && isValidUsername(data.username)) {
                if (data.key !== ADMIN_KEY) {
                    ws.send(JSON.stringify({ type: 'error', message: 'unauthorized' }));
                    return;
                }
                if (addToBlacklist(data.username)) {
                    delete activeUsers[data.username];
                    ws.send(JSON.stringify({
                        type: 'blacklist_update',
                        action: 'add',
                        username: data.username,
                        success: true
                    }));
                }
            } else if (data.type === 'blacklist_remove' && isValidUsername(data.username)) {
                if (data.key !== ADMIN_KEY) {
                    ws.send(JSON.stringify({ type: 'error', message: 'unauthorized' }));
                    return;
                }
                if (removeFromBlacklist(data.username)) {
                    ws.send(JSON.stringify({
                        type: 'blacklist_update',
                        action: 'remove',
                        username: data.username,
                        success: true
                    }));
                }
            } else {
                clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(message.toString());
                    }
                });
            }
        } catch (e) {
            clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(message.toString());
                }
            });
        }
    });
});

// ============================================
// LIMPEZA DE USUÁRIOS INATIVOS (a cada 30 segundos)
// ============================================

setInterval(() => {
    const now = Date.now();
    let changed = false;

    for (const [user, time] of Object.entries(activeUsers)) {
        if (now - time > 300000) {
            delete activeUsers[user];
            changed = true;
            console.log(`[USERS] ${user} removido por inatividade`);
        }
    }

    if (changed) {
        console.log(`[USERS] ${Object.keys(activeUsers).length} usuários ativos`);
    }
}, 30000);

console.log(`Endpoints disponíveis:`);
console.log(`   GET  /secure`);
console.log(`   GET  /usernames`);
console.log(`   POST /usernames`);
console.log(`   GET  /blacklisted`);
console.log(`   POST /blacklisted/add   (?key=ADMIN_KEY)`);
console.log(`   POST /blacklisted/remove (?key=ADMIN_KEY)`);
console.log(`   GET  /announcements`);
console.log(`   POST /announcements     (?key=ADMIN_KEY)`);
console.log(`   POST /logs`);
console.log(`   GET  /logs              (?key=ADMIN_KEY)`);
console.log(`   GET  /active-users`);
console.log(`   GET  /status`);
