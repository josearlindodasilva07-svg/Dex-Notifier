const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});
app.use(express.text());
app.use(express.json());

// ============================================
// SISTEMA DE KEYS
// ============================================
function loadJSON(file) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file));
        }
    } catch (e) {}
    return {};
}

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

if (!fs.existsSync('keys.json')) {
    saveJSON('keys.json', {});
}

if (!fs.existsSync('config.json')) {
    saveJSON('config.json', {
        adminKey: 'GODENOTKEY1',
        adminKeyActive: true
    });
}

let keys = loadJSON('keys.json');
let config = loadJSON('config.json');

// ============================================
// HUB - VARIÁVEIS
// ============================================
let activeUsers = {};
let blacklisted = [];
let currentAnnouncement = "";
let clients = [];

// ============================================
// ROTAS DO HUB
// ============================================
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

// ============================================
// ROTAS DE KEYS
// ============================================
app.post('/verify', (req, res) => {
    const { key, username } = req.body;
    const cleanKey = key.toUpperCase().trim();
    
    if (cleanKey === config.adminKey) {
        if (!config.adminKeyActive) {
            return res.json({ success: false, message: 'Sistema desativado' });
        }
        return res.json({ success: true, message: 'Admin Key - Sempre ativa!' });
    }
    
    if (!keys[cleanKey]) {
        return res.json({ success: false, message: 'Key inválida' });
    }
    
    const keyData = keys[cleanKey];
    
    if (keyData.banido) {
        return res.json({ success: false, message: 'Key banida' });
    }
    
    if (keyData.expiracao) {
        const expires = new Date(keyData.expiracao);
        if (expires < new Date()) {
            return res.json({ success: false, message: 'Key expirada' });
        }
    }
    
    if (keyData.usuarioVinculado) {
        if (keyData.usuarioVinculado !== username) {
            keyData.banido = true;
            keyData.banidoEm = new Date().toLocaleString();
            saveJSON('keys.json', keys);
            return res.json({ 
                success: false, 
                message: `Key banida! Esta key pertence a ${keyData.usuarioVinculado}`
            });
        }
    }
    
    if (keyData.usadoPor && keyData.usadoPor !== username) {
        keyData.banido = true;
        keyData.banidoEm = new Date().toLocaleString();
        saveJSON('keys.json', keys);
        return res.json({ success: false, message: 'Key banida! Já foi usada por outro' });
    }
    
    keyData.usadoPor = username;
    keyData.usadoEm = new Date().toLocaleString();
    saveJSON('keys.json', keys);
    
    res.json({ success: true, message: 'Key válida!' });
});

app.post('/create-key', (req, res) => {
    const { adminKey, key, days, usuario } = req.body;
    const cleanKey = key.toUpperCase().trim();
    
    if (adminKey !== config.adminKey) {
        return res.json({ success: false, message: 'Admin key inválida' });
    }
    
    if (keys[cleanKey]) {
        return res.json({ success: false, message: 'Key já existe!' });
    }
    
    const now = new Date();
    const expires = new Date(now);
    expires.setDate(expires.getDate() + (days || 30));
    
    keys[cleanKey] = {
        criado: now.toLocaleString(),
        expiracao: expires.toLocaleString(),
        dias: days || 30,
        usuarioVinculado: usuario || null,
        usadoPor: null,
        usadoEm: null,
        banido: false,
        banidoEm: null
    };
    
    saveJSON('keys.json', keys);
    res.json({ 
        success: true, 
        message: `Key ${cleanKey} criada!`,
        key: cleanKey 
    });
});

app.post('/list-keys', (req, res) => {
    const { adminKey } = req.body;
    
    if (adminKey !== config.adminKey) {
        return res.json({ success: false, message: 'Admin key inválida' });
    }
    
    const list = {};
    for (const [k, v] of Object.entries(keys)) {
        const exp = new Date(v.expiracao);
        const now = new Date();
        const daysLeft = Math.floor((exp - now) / (1000 * 60 * 60 * 24));
        
        list[k] = {
            key: k,
            status: v.banido ? 'BANIDA' : (daysLeft < 0 ? 'EXPIRADA' : 'ATIVA'),
            usuarioVinculado: v.usuarioVinculado || 'Livre',
            usadoPor: v.usadoPor || 'Nunca usado',
            expira: v.expiracao,
            diasRestantes: daysLeft
        };
    }
    
    res.json({ success: true, keys: list });
});

app.post('/ban-key', (req, res) => {
    const { adminKey, key } = req.body;
    const cleanKey = key.toUpperCase().trim();
    
    if (adminKey !== config.adminKey) {
        return res.json({ success: false, message: 'Admin key inválida' });
    }
    
    if (!keys[cleanKey]) {
        return res.json({ success: false, message: 'Key não encontrada' });
    }
    
    keys[cleanKey].banido = true;
    keys[cleanKey].banidoEm = new Date().toLocaleString();
    saveJSON('keys.json', keys);
    res.json({ success: true, message: `Key ${cleanKey} banida!` });
});

app.post('/unban-key', (req, res) => {
    const { adminKey, key } = req.body;
    const cleanKey = key.toUpperCase().trim();
    
    if (adminKey !== config.adminKey) {
        return res.json({ success: false, message: 'Admin key inválida' });
    }
    
    if (!keys[cleanKey]) {
        return res.json({ success: false, message: 'Key não encontrada' });
    }
    
    keys[cleanKey].banido = false;
    keys[cleanKey].banidoEm = null;
    saveJSON('keys.json', keys);
    res.json({ success: true, message: `Key ${cleanKey} desbanida!` });
});

app.post('/renew-key', (req, res) => {
    const { adminKey, key, extraDays } = req.body;
    const cleanKey = key.toUpperCase().trim();
    
    if (adminKey !== config.adminKey) {
        return res.json({ success: false, message: 'Admin key inválida' });
    }
    
    if (!keys[cleanKey]) {
        return res.json({ success: false, message: 'Key não encontrada' });
    }
    
    const days = extraDays || 30;
    const now = new Date();
    const currentExpires = new Date(keys[cleanKey].expiracao);
    
    if (currentExpires < now) {
        const newExpires = new Date(now);
        newExpires.setDate(newExpires.getDate() + days);
        keys[cleanKey].expiracao = newExpires.toLocaleString();
    } else {
        const newExpires = new Date(currentExpires);
        newExpires.setDate(newExpires.getDate() + days);
        keys[cleanKey].expiracao = newExpires.toLocaleString();
    }
    
    keys[cleanKey].dias = keys[cleanKey].dias + days;
    saveJSON('keys.json', keys);
    res.json({ success: true, message: `Key renovada! +${days} dias` });
});

app.post('/disable-admin', (req, res) => {
    const { adminKey } = req.body;
    
    if (adminKey !== config.adminKey) {
        return res.json({ success: false, message: 'Admin key inválida' });
    }
    
    config.adminKeyActive = false;
    saveJSON('config.json', config);
    res.json({ success: true, message: 'Admin Key desativada!' });
});

app.post('/new-admin', (req, res) => {
    const { adminKey, newAdminKey } = req.body;
    
    if (adminKey !== config.adminKey) {
        return res.json({ success: false, message: 'Admin key inválida' });
    }
    
    config.adminKey = newAdminKey.toUpperCase().trim();
    config.adminKeyActive = true;
    saveJSON('config.json', config);
    res.json({ success: true, message: 'Nova Admin Key criada!', adminKey: config.adminKey });
});

app.post('/enable-admin', (req, res) => {
    const { adminKey } = req.body;
    
    if (adminKey !== config.adminKey) {
        return res.json({ success: false, message: 'Admin key inválida' });
    }
    
    config.adminKeyActive = true;
    saveJSON('config.json', config);
    res.json({ success: true, message: 'Admin Key reativada!' });
});

// ============================================
// WEBSOCKET
// ============================================
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`\n🚀 Servidor rodando na porta ${port}`);
    console.log(`👑 Admin Key: ${config.adminKey}`);
    console.log(`📊 Total de keys: ${Object.keys(keys).length}`);
    console.log(`🌐 WebSocket: wss://${require('os').hostname()}:${port}`);
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
        console.log('[WS] 📩', message.toString());
        clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message.toString());
            }
        });
    });
});

console.log(`✅ WebSocket rodando na porta ${port}`);
