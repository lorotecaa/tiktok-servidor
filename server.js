const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const path = require('path'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const TIKFINITY_WEBSOCKET_URL = 'ws://localhost:21213/';
let tikfinitySocket;

let participantes = [];
let subastaActiva = false;

// --- CONFIGURACIÓN DE EXPRESS PARA SERVIR LA PÁGINA WEB ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// ------------------------------------------------------------


function connectToTikfinity() {
    if (tikfinitySocket && (tikfinitySocket.readyState === WebSocket.OPEN || tikfinitySocket.readyState === WebSocket.CONNECTING)) {
        io.emit('conexion_exitosa', 'Conectado a TikFinity');
        return;
    }
    if (tikfinitySocket && tikfinitySocket.readyState === WebSocket.CONNECTING) return;

    console.log('Intentando conectar con el puente de TikFinity...');
    tikfinitySocket = new WebSocket(TIKFINITY_WEBSOCKET_URL);

    tikfinitySocket.on('open', () => {
        console.log('✅ Conexión exitosa con la API de TikFinity.');
        io.emit('conexion_exitosa', 'Conectado a TikFinity');
    });

    tikfinitySocket.on('message', (data) => {
        if (!subastaActiva) return;

        const message = JSON.parse(data.toString());

        if (message.event === 'gift') {
            const giftData = message.data;

            // --- FILTRO ANTI-DOBLES ---
            if (!giftData.repeatEnd) return; // Ignora los eventos de animación

            const donacion = { usuario: giftData.nickname, cantidad: giftData.diamondCount * giftData.repeatCount };
            
            const existingUser = participantes.find(p => p.usuario === donacion.usuario);
            if (existingUser) {
                existingUser.cantidad += donacion.cantidad;
            } else {
                participantes.push(donacion);
            }
        }
        
        participantes.sort((a, b) => b.cantidad - a.sort);
        io.emit('actualizar_lista', participantes);
    });

    tikfinitySocket.on('error', (err) => io.emit('conexion_error', 'No se pudo conectar a TikFinity.'));
    tikfinitySocket.on('close', () => {
        io.emit('conexion_desconectada');
        tikfinitySocket = null;
    });
}

io.on('connection', (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);

    socket.on('iniciar_subasta', () => {
        console.log('RECIBIDA ORDEN DE INICIAR SUBASTA. Limpiando lista...');
        participantes = [];
        subastaActiva = true;
        io.emit('actualizar_lista', participantes);
        connectToTikfinity();
    });
    
    socket.on('finalizar_subasta', () => {
        console.log('RECIBIDA ORDEN DE FINALIZAR SUBASTA');
        subastaActiva = false;
    });

    socket.on('disconnect', () => console.log(`Cliente desconectado: ${socket.id}`));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});