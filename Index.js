const express = require('express');
const WebSocket = require('ws');
const app = express();
const port = process.env.PORT || 3000;

// Servidor WebSocket
const wss = new WebSocket.Server({ port: process.env.WS_PORT || 3001 });

wss.on('connection', function connection(ws) {
  console.log('✅ Cliente conectado!');
  
  ws.on('message', function incoming(message) {
    console.log('📩 Mensagem:', message.toString());
  });
  
  ws.send('✅ Conectado ao servidor!');
});

// API
app.use(express.json());
app.use(express.text());

let usuarios = [];
let banidos = [];

app.get('/secure', (req, res) => {
  res.json({ wss: `wss://${req.headers.host.split(':')[0]}` });
});

app.get('/usernames', (req, res) => {
  res.send(usuarios.join('\n'));
});

app.post('/usernames', (req, res) => {
  if (req.body) {
    usuarios.push(req.body);
    console.log('👤 Usuário:', req.body);
  }
  res.send('OK');
});

app.get('/blacklisted', (req, res) => {
  res.send(banidos.join('\n'));
});

app.get('/announcements', (req, res) => {
  res.send('Servidor funcionando! 🚀');
});

app.post('/logs', (req, res) => {
  console.log('📝 Log:', req.body);
  res.send('OK');
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});
