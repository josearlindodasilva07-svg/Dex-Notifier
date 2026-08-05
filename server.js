const express = require('express');
const app = express();
const port = 3000;

// ============ ROTA PRINCIPAL (RAIZ) ============
app.get('/', (req, res) => {
    res.send('Servidor Dex-Notifier está rodando! 🚀');
});

// ============ ROTAS DO DEX NOTIFIER ============
app.get('/secure', (req, res) => {
    res.json({ wss: `wss://${req.get('host')}` });
});

app.get('/usernames', (req, res) => {
    res.send('Usuários ativos:\n');
});

app.get('/blacklisted', (req, res) => {
    res.send('');
});

app.get('/announcements', (req, res) => {
    res.send('Bem-vindo ao Dex Notifier!');
});

app.post('/logs', (req, res) => {
    console.log('[LOG]', req.body);
    res.send('OK');
});

// ============ INICIAR SERVIDOR ============
app.listen(port, () => {
    console.log(`✅ Servidor rodando na porta ${port}`);
});
