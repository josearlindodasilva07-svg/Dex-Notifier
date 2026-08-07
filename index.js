const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const app = express();
app.use(express.json());

const KEYS_FILE = 'keys.json';
const BANNED_FILE = 'banned.json';

let keys = {};
let banned = {};

function loadData() {
    try {
        if (fs.existsSync(KEYS_FILE)) {
            keys = JSON.parse(fs.readFileSync(KEYS_FILE));
        }
    } catch (e) { keys = {}; }
    
    try {
        if (fs.existsSync(BANNED_FILE)) {
            banned = JSON.parse(fs.readFileSync(BANNED_FILE));
        }
    } catch (e) { banned = {}; }
}

function saveKeys() {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

function saveBanned() {
    fs.writeFileSync(BANNED_FILE, JSON.stringify(banned, null, 2));
}

loadData();

app.post('/verify-key', (req, res) => {
    const { key, username, hwid } = req.body;
    
    if (!keys[key]) {
        return res.json({ success: false, message: 'Key inválida' });
    }
    
    if (banned[key]) {
        return res.json({ success: false, message: 'Key banida', banned: true });
    }
    
    if (keys[key].expires < Date.now()) {
        return res.json({ success: false, message: 'Key expirada', expired: true });
    }
    
    if (keys[key].usedBy && keys[key].usedBy !== username) {
        return res.json({ success: false, message: 'Key em uso' });
    }
    
    if (keys[key].hwid && keys[key].hwid !== hwid) {
        return res.json({ success: false, message: 'Key em outro dispositivo' });
    }
    
    keys[key].usedBy = username;
    keys[key].usedAt = Date.now();
    keys[key].hwid = hwid;
    saveKeys();
    
    const daysLeft = Math.floor((keys[key].expires - Date.now()) / (24 * 60 * 60 * 1000));
    
    res.json({ 
        success: true,
        daysLeft: daysLeft,
        expires: keys[key].expires
    });
});

app.post('/generate-key', (req, res) => {
    const { adminKey, days } = req.body;
    
    if (adminKey !== 'ADMIN_123') {
        return res.json({ success: false });
    }
    
    const duration = days || 30;
    const key = crypto.randomBytes(16).toString('hex').toUpperCase();
    
    keys[key] = {
        key: key,
        created: Date.now(),
        expires: Date.now() + (duration * 24 * 60 * 60 * 1000),
        durationDays: duration,
        usedBy: null,
        usedAt: null,
        hwid: null
    };
    
    saveKeys();
    
    res.json({ 
        success: true, 
        key: key,
        days: duration
    });
});

app.post('/ban-key', (req, res) => {
    const { adminKey, key } = req.body;
    
    if (adminKey !== 'ADMIN_123') {
        return res.json({ success: false });
    }
    
    if (!keys[key]) {
        return res.json({ success: false });
    }
    
    banned[key] = {
        bannedAt: Date.now(),
        usedBy: keys[key].usedBy || 'Nunca usada'
    };
    
    saveBanned();
    res.json({ success: true });
});

app.post('/renew-key', (req, res) => {
    const { adminKey, key, extraDays } = req.body;
    
    if (adminKey !== 'ADMIN_123') {
        return res.json({ success: false });
    }
    
    if (!keys[key]) {
        return res.json({ success: false });
    }
    
    const days = extraDays || 30;
    const now = Date.now();
    
    if (keys[key].expires < now) {
        keys[key].expires = now + (days * 24 * 60 * 60 * 1000);
    } else {
        keys[key].expires = keys[key].expires + (days * 24 * 60 * 60 * 1000);
    }
    
    keys[key].durationDays = keys[key].durationDays + days;
    saveKeys();
    
    res.json({ success: true });
});

app.listen(3000, () => {
    console.log('🚀 Servidor rodando na porta 3000');
    console.log('📊 Total de keys: ' + Object.keys(keys).length);
});
