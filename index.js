const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());

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
        adminKey: 'ADMIN2024',
        adminKeyActive: true
    });
}

let keys = loadJSON('keys.json');
let config = loadJSON('config.json');

// VERIFICAR KEY
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

// CRIAR KEY
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

// LISTAR KEYS
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

// BANIR KEY
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

// DESBANIR KEY
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

// RENOVAR KEY
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

// DESATIVAR KEY ADM
app.post('/disable-admin', (req, res) => {
    const { adminKey } = req.body;
    
    if (adminKey !== config.adminKey) {
        return res.json({ success: false, message: 'Admin key inválida' });
    }
    
    config.adminKeyActive = false;
    saveJSON('config.json', config);
    res.json({ success: true, message: 'Admin Key desativada!' });
});

// CRIAR NOVA KEY ADM
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

// ============================================
// INICIA O SERVIDOR NA PORTA 8080
// ============================================
const PORT = 8080;
app.listen(PORT, () => {
    console.log('\n🚀 Servidor rodando na porta ' + PORT);
    console.log('👑 Admin Key: ' + config.adminKey);
    console.log('📊 Total de keys: ' + Object.keys(keys).length);
});
