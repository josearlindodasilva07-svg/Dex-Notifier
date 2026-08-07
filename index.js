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
app.use(express.json());

let activeUsers = {};
let currentAnnouncement = "";
let clients = [];
let serverLogs = [];
const userIPCache = {};
const userIDCache = {};

// ============================================
// 🚫 BLACKLIST (ID + NOME + IP)
// ============================================

// BLACKLIST POR ID (MAIS EFICAZ - IMPEDE OUTRA CONTA)
const blacklistedIDs = [
    // ============================================
    // COLOQUE AQUI OS IDS DOS JOGADORES BANIDOS
    // ============================================
    // 123456789,  // Exemplo: ID do jogador
    // 987654321,  // Exemplo: ID de outro jogador
];

// BLACKLIST POR NOME (FALLBACK)
const blacklistedNames = [
    // ============================================
    // COLOQUE AQUI OS NOMES DOS JOGADORES BANIDOS
    // ============================================
    "Dark_Hacker_X",
    "Troll_Master_BR",
    "Exploit_King_77",
    "Script_Kid_2024",
    "Cheater_Pro_MAX",
    "Toxic_Player_01",
    "Spam_Bot_999",
    "Fake_Admin_007",
    "Bug_Abuser_Legend",
    "Dupe_User_666",
    "Alt_Account_123",
    "Smurf_Troll_BR",
    "VEX_Cheater_01",
    "Ban_Evader_X",
    "Bypass_User_99",
    "Griefer_BR_2024",
    "Cheat_User_Pro",
    "Exploit_Lord_X",
    "Hacker_God_666",
    "Troll_King_BR",
];

// BLACKLIST POR IP
const ipBlacklist = [
    // ============================================
    // COLOQUE AQUI OS IPS BANIDOS
    // ============================================
    // "189.45.23.100",
    // "201.56.78.200",
];

// ============================================
// FUNÇÕES DE VERIFICAÇÃO
// ============================================

function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || req.ip;
}

function isPlayerBlacklistedByName(playerName) {
    return blacklistedNames.some(name => name.toLowerCase() === playerName.toLowerCase());
}

function isPlayerBlacklistedByID(playerID) {
    return blacklistedIDs.some(id => id === playerID);
}

function isPlayerBlacklisted(playerName, playerID) {
    return isPlayerBlacklistedByName(playerName) || isPlayerBlacklistedByID(playerID);
}

function isIPBlacklisted(ip) {
    return ipBlacklist.some(bannedIP => bannedIP === ip);
}

// ============================================
// FUNÇÕES PARA ADICIONAR/REMOVER
// ============================================

function addToBlacklistByName(playerName) {
    if (!isPlayerBlacklistedByName(playerName)) {
        blacklistedNames.push(playerName);
        console.log(`[BLACKLIST] ➕ ${playerName} adicionado à blacklist por nome`);
        return true;
    }
    return false;
}

function addToBlacklistByID(playerID) {
    if (!isPlayerBlacklistedByID(playerID)) {
        blacklistedIDs.push(playerID);
        console.log(`[BLACKLIST] ➕ ID ${playerID} adicionado à blacklist`);
        return true;
    }
    return false;
}

function addIPToBlacklist(ip) {
    if (!isIPBlacklisted(ip)) {
        ipBlacklist.push(ip);
        console.log(`[BLACKLIST] ➕ IP ${ip} adicionado à blacklist`);
        return true;
    }
    return false;
}

function removeFromBlacklistByName(playerName) {
    const index = blacklistedNames.findIndex(name => name.toLowerCase() === playerName.toLowerCase());
    if (index !== -1) {
        blacklistedNames.splice(index, 1);
        console.log(`[BLACKLIST] ➖ ${playerName} removido da blacklist por nome`);
        return true;
    }
    return false;
}

function removeFromBlacklistByID(playerID) {
    const index = blacklistedIDs.indexOf(playerID);
    if (index !== -1) {
        blacklistedIDs.splice(index, 1);
        console.log(`[BLACKLIST] ➖ ID ${playerID} removido da blacklist`);
        return true;
    }
    return false;
}

function removeIPFromBlacklist(ip) {
    const index = ipBlacklist.indexOf(ip);
    if (index !== -1) {
        ipBlacklist.splice(index, 1);
        console.log(`[BLACKLIST] ➖ IP ${ip} removido da blacklist`);
        return true;
    }
    return false;
}

// ============================================
// FUNÇÃO PARA PEGAR ID DO ROBLOX
// ============================================

async function getRobloxUserID(username) {
    try {
        const response = await fetch(`https://api.roblox.com/users/get-by-username?username=${username}`);
        const data = await response.json();
        return data.Id || null;
    } catch (e) {
        return null;
    }
}

// ============================================
// ROTAS DA API
// ============================================

app.get('/secure', (req, res) => {
    res.json({ wss: `wss://${req.get('host')}` });
});

// ============================================
// ROTA DE USUÁRIOS (VERIFICA ID + NOME + IP)
// ============================================

app.post('/usernames', async (req, res) => {
    if (req.body && req.body !== '') {
        const username = req.body;
        const clientIP = getClientIP(req);
        
        // PEGA O ID DO ROBLOX
        let userID = null;
        try {
            const id = await getRobloxUserID(username);
            if (id) userID = id;
        } catch(e) {}
        
        // SALVA IP E ID
        userIPCache[username] = clientIP;
        if (userID) userIDCache[username] = userID;
        
        // VERIFICA IP
        if (isIPBlacklisted(clientIP)) {
            console.log(`[BLACKLIST] 🚫 IP ${clientIP} (${username}) TENTOU CONECTAR`);
            res.status(403).send('IP_BLACKLISTED');
            return;
        }
        
        // VERIFICA POR ID (MAIS IMPORTANTE)
        if (userID && isPlayerBlacklistedByID(userID)) {
            console.log(`[BLACKLIST] 🚫 ID ${userID} (${username}) TENTOU CONECTAR`);
            res.status(403).send('ID_BLACKLISTED');
            return;
        }
        
        // VERIFICA POR NOME
        if (isPlayerBlacklistedByName(username)) {
            console.log(`[BLACKLIST] 🚫 ${username} (ID: ${userID}) TENTOU CONECTAR`);
            res.status(403).send('BLACKLISTED');
            return;
        }
        
        activeUsers[username] = Date.now();
        console.log(`[USERS] ➕ ${username} (ID: ${userID}) conectado (IP: ${clientIP})`);
        
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'user_joined',
                    username: username,
                    id: userID,
                    ip: clientIP
                }));
            }
        });
    }
    res.send('OK');
});

app.get('/usernames', (req, res) => {
    res.send(Object.keys(activeUsers).join('\n'));
});

// ============================================
// ROTA PARA VER ID DE UM USUÁRIO
// ============================================

app.get('/get-id/:username', (req, res) => {
    const username = req.params.username;
    const id = userIDCache[username];
    
    if (id) {
        res.json({ 
            username: username, 
            id: id,
            online: activeUsers[username] ? true : false
        });
    } else {
        res.status(404).json({ 
            error: 'ID não encontrado para este usuário' 
        });
    }
});

// ============================================
// ROTA PARA VER IP DE UM USUÁRIO
// ============================================

app.get('/get-ip/:username', (req, res) => {
    const username = req.params.username;
    const ip = userIPCache[username];
    
    if (ip) {
        res.json({ 
            username: username, 
            ip: ip,
            id: userIDCache[username] || null,
            online: activeUsers[username] ? true : false
        });
    } else {
        res.status(404).json({ 
            error: 'IP não encontrado para este usuário' 
        });
    }
});

// ============================================
// ROTA PARA BANIR POR NOME (PEGA ID E IP AUTO)
// ============================================

app.post('/ban-by-name', async (req, res) => {
    const username = req.body;
    
    if (!username || username === '') {
        return res.status(400).send('❌ Nome de usuário obrigatório');
    }
    
    const ip = userIPCache[username];
    let userID = userIDCache[username];
    
    // Tenta pegar o ID se não tiver no cache
    if (!userID) {
        try {
            const id = await getRobloxUserID(username);
            if (id) userID = id;
        } catch(e) {}
    }
    
    let responses = [];
    
    // BANE POR NOME
    if (addToBlacklistByName(username)) {
        responses.push(`✅ ${username} banido por nome`);
    } else {
        responses.push(`⚠️ ${username} já estava na blacklist por nome`);
    }
    
    // BANE POR ID (SE TIVER)
    if (userID) {
        if (addToBlacklistByID(userID)) {
            responses.push(`✅ ID ${userID} banido`);
        } else {
            responses.push(`⚠️ ID ${userID} já estava na blacklist`);
        }
    } else {
        responses.push(`⚠️ ID não encontrado para ${username}`);
    }
    
    // BANE POR IP (SE TIVER)
    if (ip) {
        if (addIPToBlacklist(ip)) {
            responses.push(`✅ IP ${ip} banido`);
        } else {
            responses.push(`⚠️ IP ${ip} já estava na blacklist`);
        }
    } else {
        responses.push(`⚠️ IP não encontrado para ${username}`);
    }
    
    // REMOVE DA LISTA DE ATIVOS
    if (activeUsers[username]) {
        activeUsers[username] = undefined;
        responses.push(`✅ ${username} removido dos ativos`);
    }
    
    res.send(responses.join('\n'));
});

// ============================================
// ROTA PARA BANIR POR ID
// ============================================

app.post('/ban-by-id', (req, res) => {
    const userID = parseInt(req.body);
    
    if (!userID || isNaN(userID)) {
        return res.status(400).send('❌ ID inválido');
    }
    
    if (addToBlacklistByID(userID)) {
        // Remove todos os usuários com esse ID
        let removed = [];
        for (const [user, id] of Object.entries(userIDCache)) {
            if (id === userID) {
                activeUsers[user] = undefined;
                removed.push(user);
            }
        }
        res.send(`✅ ID ${userID} banido! ${removed.length} usuários removidos: ${removed.join(', ')}`);
    } else {
        res.send(`⚠️ ID ${userID} já estava na blacklist`);
    }
});

// ============================================
// ROTA PARA BANIR POR IP
// ============================================

app.post('/ban-by-ip', (req, res) => {
    const ip = req.body;
    
    if (!ip || ip === '') {
        return res.status(400).send('❌ IP obrigatório');
    }
    
    if (addIPToBlacklist(ip)) {
        let removed = [];
        for (const [user, userIP] of Object.entries(userIPCache)) {
            if (userIP === ip) {
                activeUsers[user] = undefined;
                removed.push(user);
            }
        }
        res.send(`✅ IP ${ip} banido! ${removed.length} usuários removidos: ${removed.join(', ')}`);
    } else {
        res.send(`⚠️ IP ${ip} já estava na blacklist`);
    }
});

// ============================================
// ROTA PARA VER A BLACKLIST COMPLETA
// ============================================

app.get('/blacklisted', (req, res) => {
    const result = {
        by_name: blacklistedNames,
        by_id: blacklistedIDs,
        by_ip: ipBlacklist
    };
    res.json(result);
});

// ============================================
// ROTAS PARA ADICIONAR/REMOVER DA BLACKLIST
// ============================================

app.post('/blacklisted/add', (req, res) => {
    const username = req.body;
    if (username && username !== '') {
        if (addToBlacklistByName(username)) {
            if (activeUsers[username]) {
                activeUsers[username] = undefined;
            }
            res.send(`✅ ${username} adicionado à blacklist`);
        } else {
            res.send(`⚠️ ${username} já está na blacklist`);
        }
    } else {
        res.status(400).send('❌ Nome de usuário inválido');
    }
});

app.post('/blacklisted/remove', (req, res) => {
    const username = req.body;
    if (username && username !== '') {
        if (removeFromBlacklistByName(username)) {
            res.send(`✅ ${username} removido da blacklist`);
        } else {
            res.send(`⚠️ ${username} não está na blacklist`);
        }
    } else {
        res.status(400).send('❌ Nome de usuário inválido');
    }
});

app.post('/blacklist/id/add', (req, res) => {
    const userID = parseInt(req.body);
    if (userID && !isNaN(userID)) {
        if (addToBlacklistByID(userID)) {
            res.send(`✅ ID ${userID} adicionado à blacklist`);
        } else {
            res.send(`⚠️ ID ${userID} já está na blacklist`);
        }
    } else {
        res.status(400).send('❌ ID inválido');
    }
});

app.post('/blacklist/id/remove', (req, res) => {
    const userID = parseInt(req.body);
    if (userID && !isNaN(userID)) {
        if (removeFromBlacklistByID(userID)) {
            res.send(`✅ ID ${userID} removido da blacklist`);
        } else {
            res.send(`⚠️ ID ${userID} não está na blacklist`);
        }
    } else {
        res.status(400).send('❌ ID inválido');
    }
});

app.post('/blacklist/ip/add', (req, res) => {
    const ip = req.body;
    if (ip && ip !== '') {
        if (addIPToBlacklist(ip)) {
            res.send(`✅ IP ${ip} adicionado à blacklist`);
        } else {
            res.send(`⚠️ IP ${ip} já está na blacklist`);
        }
    } else {
        res.status(400).send('❌ IP inválido');
    }
});

app.post('/blacklist/ip/remove', (req, res) => {
    const ip = req.body;
    if (ip && ip !== '') {
        if (removeIPFromBlacklist(ip)) {
            res.send(`✅ IP ${ip} removido da blacklist`);
        } else {
            res.send(`⚠️ IP ${ip} não está na blacklist`);
        }
    } else {
        res.status(400).send('❌ IP inválido');
    }
});

// ============================================
// ROTA DE ANÚNCIOS
// ============================================

app.get('/announcements', (req, res) => {
    res.send(currentAnnouncement);
});

app.post('/announcements', (req, res) => {
    if (req.body) currentAnnouncement = req.body;
    res.send('OK');
});

// ============================================
// ROTA DE LOGS
// ============================================

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

app.get('/logs', (req, res) => {
    const senderKey = req.query.sender_key;
    if (senderKey === '12345') {
        res.send(serverLogs.join('\n'));
    } else {
        res.status(403).send('Acesso negado');
    }
});

// ============================================
// ROTA DE USUÁRIOS ATIVOS
// ============================================

app.get('/active-users', (req, res) => {
    const now = Date.now();
    const active = {};
    
    for (const [user, time] of Object.entries(activeUsers)) {
        if (now - time < 300000) {
            active[user] = time;
        }
    }
    activeUsers = active;
    
    const usersInfo = {};
    for (const user of Object.keys(active)) {
        usersInfo[user] = {
            id: userIDCache[user] || 'ID desconhecido',
            ip: userIPCache[user] || 'IP desconhecido'
        };
    }
    
    res.json({
        count: Object.keys(active).length,
        users: usersInfo
    });
});

// ============================================
// ROTA DE STATUS
// ============================================

app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        activeUsers: Object.keys(activeUsers).length,
        blacklisted_by_name: blacklistedNames.length,
        blacklisted_by_id: blacklistedIDs.length,
        blacklisted_by_ip: ipBlacklist.length,
        clients: clients.length,
        logs: serverLogs.length,
        uptime: process.uptime()
    });
});

// ============================================
// SERVIDOR
// ============================================

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${port}`);
    console.log(`📋 Blacklist por NOME: ${blacklistedNames.length}`);
    console.log(`📋 Blacklist por ID: ${blacklistedIDs.length}`);
    console.log(`📋 Blacklist por IP: ${ipBlacklist.length}`);
    console.log(`👥 ${Object.keys(activeUsers).length} usuários ativos`);
    console.log('');
    console.log(`📡 Endpoints disponíveis:`);
    console.log(`   GET  /secure`);
    console.log(`   GET  /usernames`);
    console.log(`   POST /usernames`);
    console.log(`   GET  /get-id/:username`);
    console.log(`   GET  /get-ip/:username`);
    console.log(`   POST /ban-by-name    (BANE NOME + ID + IP AUTO)`);
    console.log(`   POST /ban-by-id      (BANE POR ID)`);
    console.log(`   POST /ban-by-ip      (BANE POR IP)`);
    console.log(`   GET  /blacklisted    (VER TODOS BANIDOS)`);
    console.log(`   POST /blacklisted/add`);
    console.log(`   POST /blacklisted/remove`);
    console.log(`   POST /blacklist/id/add`);
    console.log(`   POST /blacklist/id/remove`);
    console.log(`   POST /blacklist/ip/add`);
    console.log(`   POST /blacklist/ip/remove`);
    console.log(`   GET  /announcements`);
    console.log(`   POST /announcements`);
    console.log(`   POST /logs`);
    console.log(`   GET  /active-users`);
    console.log(`   GET  /status`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('✅ Cliente conectado ao WebSocket');
    clients.push(ws);
    
    ws.on('close', () => {
        clients = clients.filter(client => client !== ws);
        console.log('❌ Cliente desconectado do WebSocket');
    });
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'blacklist_add' && data.username) {
                if (addToBlacklistByName(data.username)) {
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
                if (removeFromBlacklistByName(data.username)) {
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

setInterval(() => {
    const now = Date.now();
    let changed = false;
    
    for (const [user, time] of Object.entries(activeUsers)) {
        if (now - time > 300000) {
            activeUsers[user] = undefined;
            changed = true;
            console.log(`[USERS] 🕐 ${user} removido por inatividade`);
        }
    }
    
    if (changed) {
        console.log(`[USERS] 👥 ${Object.keys(activeUsers).length} usuários ativos`);
    }
}, 30000);

console.log(`✅ WebSocket rodando na porta ${port}`);
