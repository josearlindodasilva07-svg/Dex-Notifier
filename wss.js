const WebSocket = require('ws');
const port = process.env.WS_PORT || 8080;

const wss = new WebSocket.Server({ port: port, host: '0.0.0.0' });

console.log(`✅ WebSocket rodando na porta ${port}`);

let clients = [];

wss.on('connection', (ws) => {
    console.log('✅ Cliente conectado ao WebSocket');
    clients.push(ws);

    ws.on('message', (message) => {
        console.log('📩 Mensagem:', message.toString());
    });

    ws.on('close', () => {
        clients = clients.filter(c => c !== ws);
        console.log('❌ Cliente desconectado');
    });
});

function sendSpotting(data) {
    const msg = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// Simular brainrots
setInterval(() => {
    const brainrots = ["Strawberry Elephant", "Headless Horseman", "Meowl", "Skibidi Toilet", "John Pork"];
    const random = brainrots[Math.floor(Math.random() * brainrots.length)];
    sendSpotting({
        type: "spotting",
        pet: { display_name: random },
        raw_name: random,
        generation: Math.floor(Math.random() * 100000000) + 10000000,
        owner_username: "Usuario" + Math.floor(Math.random() * 1000),
        job_id: "mock-job-id-" + Date.now()
    });
}, 5000);
