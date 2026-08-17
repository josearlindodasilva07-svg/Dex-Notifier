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
let serverLogs = [];
const recentSpotting = new Map();
const SPOTTING_TTL_MS = 15000;
let latestSpotting = null;

function broadcastToUsers(payload, except = null) {
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    clients.forEach(client => {
        if (client !== except && client.role !== 'scanner' && client.readyState === WebSocket.OPEN) {
            try { client.send(message); } catch (_) {}
        }
    });
}

function isDuplicateSpotting(data) {
    const now = Date.now();
    for (const [key, time] of recentSpotting) {
        if (now - time > SPOTTING_TTL_MS) recentSpotting.delete(key);
    }
    const key = data.event_id || [
        data.job_id,
        data.raw_name || data.name || (data.pet && (data.pet.display_name || data.pet.name)),
        data.generation
    ].join('|');
    if (!key || key === '||') return false;
    if (recentSpotting.has(key)) return true;
    recentSpotting.set(key, now);
    return false;
}

// ============================================
// BLACKLIST DE JOGADORES (PERSISTENTE)
// ============================================

// Blacklist padrAAo (jAA inclui alguns jogadores conhecidos)
const DEFAULT_BLACKLIST = [
    "script_2158",
    "kejshswh",
    // Adicione aqui os jogadores que vocAAa quer banir
];

// Inicializa com a lista padrAAo
blacklisted.push(...DEFAULT_BLACKLIST);

// ============================================
// FUNAaAaES DA BLACKLIST
// ============================================

function isPlayerBlacklisted(playerName) {
    return blacklisted.some(name => name.toLowerCase() === playerName.toLowerCase());
}

function addToBlacklist(playerName) {
    if (!isPlayerBlacklisted(playerName)) {
        blacklisted.push(playerName);
        console.log(`[BLACKLIST] AA34a ${playerName} adicionado A  blacklist`);
        return true;
    }
    return false;
}

function removeFromBlacklist(playerName) {
    const index = blacklisted.findIndex(name => name.toLowerCase() === playerName.toLowerCase());
    if (index !== -1) {
        blacklisted.splice(index, 1);
        console.log(`[BLACKLIST] AA34a ${playerName} removido da blacklist`);
        return true;
    }
    return false;
}

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
    if (req.body && req.body !== '') {
        const username = req.body;
        
        // VERIFICA SE O USUAARIO ESTAA NA BLACKLIST
        if (isPlayerBlacklisted(username)) {
            console.log(`[BLACKLIST] AA AA Tentativa de conexAAo de ${username} (BANIDO)`);
            res.status(403).send('BLACKLISTED');
            return;
        }
        
        activeUsers[username] = Date.now();
        console.log(`[USERS] AA34a ${username} conectado`);
        
        // Notifica todos os clients sobre o novo usuAArio
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'user_joined',
                    username: username
                }));
            }
        });
    }
    res.send('OK');
});

app.get('/blacklisted', (req, res) => {
    res.send(blacklisted.join('\n'));
});

// ADICIONAR Aa BLACKLIST
app.post('/blacklisted/add', (req, res) => {
    const username = req.body;
    if (username && username !== '') {
        if (addToBlacklist(username)) {
            // Remove o usuAArio da lista de ativos se estiver conectado
            if (activeUsers[username]) {
                activeUsers[username] = undefined;
                console.log(`[USERS] AAA ${username} removido dos ativos (BANIDO)`);
            }
            res.send(`AAa ${username} adicionado A  blacklist`);
        } else {
            res.send(`AA A A A ${username} jAA estAA na blacklist`);
        }
    } else {
        res.status(400).send('AAA Nome de usuAArio invAAlido');
    }
});

// REMOVER DA BLACKLIST
app.post('/blacklisted/remove', (req, res) => {
    const username = req.body;
    if (username && username !== '') {
        if (removeFromBlacklist(username)) {
            res.send(`AAa ${username} removido da blacklist`);
        } else {
            res.send(`AA A A A ${username} nAAo estAA na blacklist`);
        }
    } else {
        res.status(400).send('AAA Nome de usuAArio invAAlido');
    }
});

app.get('/announcements', (req, res) => {
    res.send(currentAnnouncement);
});

app.post('/announcements', (req, res) => {
    if (req.body) currentAnnouncement = req.body;
    res.send('OK');
});

// LOGS com mais informaAAAAes
app.post('/logs', (req, res) => {
    const logData = req.body;
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${logData}`;
    
    console.log('[LOG]', logEntry);
    serverLogs.push(logEntry);
    
    // MantAAm apenas os AAoltimos 1000 logs
    if (serverLogs.length > 1000) {
        serverLogs.shift();
    }
    
    // Envia para todos os clientes conectados
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(logData);
        }
    });
    res.send('OK');
});

// Rota para ver os logs (protegido por chave)
app.get('/logs', (req, res) => {
    const senderKey = req.query.sender_key;
    if (senderKey === '12345') {
        res.send(serverLogs.join('\n'));
    } else {
        res.status(403).send('Acesso negado');
    }
});

// Rota para ver a lista de usuAArios ativos
app.get('/active-users', (req, res) => {
    const now = Date.now();
    const active = {};
    
    // Remove usuAArios inativos hAA mais de 5 minutos
    for (const [user, time] of Object.entries(activeUsers)) {
        if (now - time < 300000) { // 5 minutos
            active[user] = time;
        }
    }
    activeUsers = active;
    
    res.json({
        count: Object.keys(activeUsers).length,
        users: Object.keys(activeUsers)
    });
});

// Rota de status do servidor
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
    console.log(`AAa Servidor rodando na porta ${port}`);
    console.log(`AA aa1 Blacklist carregada: ${blacklisted.length} jogadores`);
    console.log(`AA a A ${Object.keys(activeUsers).length} usuAArios ativos`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Cliente conectado ao WebSocket');
    // Clientes sao usuarios por padrao; spotting identifica um Scanner Bot.
    ws.role = 'user';
    clients.push(ws);
    
    ws.on('close', () => {
        clients = clients.filter(client => client !== ws);
        console.log('AAA Cliente desconectado do WebSocket');
    });
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // Qualquer VEX pode descobrir; o servidor deduplica e retransmite a todos.
            if (data.type === 'spotting' || data.type === 'vex_discovery') {
                const eventId = String(data.event_id || [
                    data.job_id || '',
                    data.raw_name || data.name || (data.pet && (data.pet.display_name || data.pet.name)) || '',
                    data.generation || '',
                    data.owner_username || data.owner || ''
                ].join('|'));
                data.type = 'vex_discovery';
                data.event_id = eventId;
                if (!isDuplicateSpotting(data)) {
                    latestSpotting = data;
                    broadcastToUsers(data, ws);
                }
                return;
            }

            // Verifica se e um comando de blacklist via WebSocket
            if (data.type === 'blacklist_add' && data.username) {
                if (addToBlacklist(data.username)) {
                    // Remove o usuAArio da lista de ativos
                    if (activeUsers[data.username]) {
                        activeUsers[data.username] = undefined;
                    }
                    ws.send(JSON.stringify({
                        type: 'blacklist_update',
                        action: 'add',
                        username: data.username,
                        success: true
                    }));
                }
            } else if (data.type === 'blacklist_remove' && data.username) {
                if (removeFromBlacklist(data.username)) {
                    ws.send(JSON.stringify({
                        type: 'blacklist_update',
                        action: 'remove',
                        username: data.username,
                        success: true
                    }));
                }
            } else {
                // Encaminha mensagens normais somente para usuarios.
                broadcastToUsers(message.toString(), ws);
            }
        } catch (e) {
            // Se nao for JSON, encaminha como texto somente para usuarios.
            broadcastToUsers(message.toString(), ws);
        }
    });
});

// ============================================
// LIMPEZA DE USUAARIOS INATIVOS (a cada 30 segundos)
// ============================================

setInterval(() => {
    const now = Date.now();
    let changed = false;
    
    for (const [user, time] of Object.entries(activeUsers)) {
        if (now - time > 300000) { // 5 minutos
            activeUsers[user] = undefined;
            changed = true;
            console.log(`[USERS] AA aA ${user} removido por inatividade`);
        }
    }
    
    if (changed) {
        console.log(`[USERS] AA a A ${Object.keys(activeUsers).length} usuAArios ativos`);
    }
}, 30000);

console.log(`AAa WebSocket rodando na porta ${port}`);
console.log(`AA aA Endpoints disponAAveis:`);
console.log(`   GET  /secure`);
console.log(`   GET  /usernames`);
console.log(`   POST /usernames`);
console.log(`   GET  /blacklisted`);
console.log(`   POST /blacklisted/add`);
console.log(`   POST /blacklisted/remove`);
console.log(`   GET  /announcements`);
console.log(`   POST /announcements`);
console.log(`   POST /logs`);
console.log(`   GET  /active-users`);
console.log(`   GET  /status`);
