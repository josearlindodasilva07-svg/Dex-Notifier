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

// ============================================
// BLACKLIST DE JOGADORES (PERSISTENTE)
// ============================================

// Blacklist padrÃ£o (jÃ¡ inclui alguns jogadores conhecidos)
const DEFAULT_BLACKLIST = [
    "brainrot_21599",
    "jogador_traidor",
    // Adicione aqui os jogadores que vocÃª quer banir
];

// Inicializa com a lista padrÃ£o
blacklisted.push(...DEFAULT_BLACKLIST);

// ============================================
// FUNÃ‡Ã•ES DA BLACKLIST
// ============================================

function isPlayerBlacklisted(playerName) {
    return blacklisted.some(name => name.toLowerCase() === playerName.toLowerCase());
}

function addToBlacklist(playerName) {
    if (!isPlayerBlacklisted(playerName)) {
        blacklisted.push(playerName);
        console.log(`[BLACKLIST] âž• ${playerName} adicionado Ã  blacklist`);
        return true;
    }
    return false;
}

function removeFromBlacklist(playerName) {
    const index = blacklisted.findIndex(name => name.toLowerCase() === playerName.toLowerCase());
    if (index !== -1) {
        blacklisted.splice(index, 1);
        console.log(`[BLACKLIST] âž– ${playerName} removido da blacklist`);
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
        
        // VERIFICA SE O USUÃRIO ESTÃ NA BLACKLIST
        if (isPlayerBlacklisted(username)) {
            console.log(`[BLACKLIST] ðŸš« Tentativa de conexÃ£o de ${username} (BANIDO)`);
            res.status(403).send('BLACKLISTED');
            return;
        }
        
        activeUsers[username] = Date.now();
        console.log(`[USERS] âž• ${username} conectado`);
        
        // Notifica todos os clients sobre o novo usuÃ¡rio
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

// ADICIONAR Ã€ BLACKLIST
app.post('/blacklisted/add', (req, res) => {
    const username = req.body;
    if (username && username !== '') {
        if (addToBlacklist(username)) {
            // Remove o usuÃ¡rio da lista de ativos se estiver conectado
            if (activeUsers[username]) {
                activeUsers[username] = undefined;
                console.log(`[USERS] âŒ ${username} removido dos ativos (BANIDO)`);
            }
            res.send(`âœ… ${username} adicionado Ã  blacklist`);
        } else {
            res.send(`âš ï¸ ${username} jÃ¡ estÃ¡ na blacklist`);
        }
    } else {
        res.status(400).send('âŒ Nome de usuÃ¡rio invÃ¡lido');
    }
});

// REMOVER DA BLACKLIST
app.post('/blacklisted/remove', (req, res) => {
    const username = req.body;
    if (username && username !== '') {
        if (removeFromBlacklist(username)) {
            res.send(`âœ… ${username} removido da blacklist`);
        } else {
            res.send(`âš ï¸ ${username} nÃ£o estÃ¡ na blacklist`);
        }
    } else {
        res.status(400).send('âŒ Nome de usuÃ¡rio invÃ¡lido');
    }
});

app.get('/announcements', (req, res) => {
    res.send(currentAnnouncement);
});

app.post('/announcements', (req, res) => {
    if (req.body) currentAnnouncement = req.body;
    res.send('OK');
});

// LOGS com mais informaÃ§Ãµes
app.post('/logs', (req, res) => {
    const logData = req.body;
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${logData}`;
    
    console.log('[LOG]', logEntry);
    serverLogs.push(logEntry);
    
    // MantÃ©m apenas os Ãºltimos 1000 logs
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

// Rota para ver a lista de usuÃ¡rios ativos
app.get('/active-users', (req, res) => {
    const now = Date.now();
    const active = {};
    
    // Remove usuÃ¡rios inativos hÃ¡ mais de 5 minutos
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
    console.log(`âœ… Servidor rodando na porta ${port}`);
    console.log(`ðŸ“‹ Blacklist carregada: ${blacklisted.length} jogadores`);
    console.log(`ðŸ‘¥ ${Object.keys(activeUsers).length} usuÃ¡rios ativos`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('âœ… Cliente conectado ao WebSocket');
    clients.push(ws);
    
    ws.on('close', () => {
        clients = clients.filter(client => client !== ws);
        console.log('âŒ Cliente desconectado do WebSocket');
    });
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // Verifica se Ã© um comando de blacklist via WebSocket
            if (data.type === 'blacklist_add' && data.username) {
                if (addToBlacklist(data.username)) {
                    // Remove o usuÃ¡rio da lista de ativos
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
                // Encaminha mensagens normais para outros clientes
                clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(message.toString());
                    }
                });
            }
        } catch (e) {
            // Se nÃ£o for JSON, encaminha como texto
            clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(message.toString());
                }
            });
        }
    });
});

// ============================================
// LIMPEZA DE USUÃRIOS INATIVOS (a cada 30 segundos)
// ============================================

setInterval(() => {
    const now = Date.now();
    let changed = false;
    
    for (const [user, time] of Object.entries(activeUsers)) {
        if (now - time > 300000) { // 5 minutos
            activeUsers[user] = undefined;
            changed = true;
            console.log(`[USERS] ðŸ• ${user} removido por inatividade`);
        }
    }
    
    if (changed) {
        console.log(`[USERS] ðŸ‘¥ ${Object.keys(activeUsers).length} usuÃ¡rios ativos`);
    }
}, 30000);

console.log(`âœ… WebSocket rodando na porta ${port}`);
console.log(`ðŸ“¡ Endpoints disponÃ­veis:`);
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
