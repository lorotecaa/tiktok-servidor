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

function connectToTikfinity() {
    if (tikfinitySocket && (tikfinitySocket.readyState === WebSocket.OPEN || tikfinitySocket.readyState === WebSocket.CONNECTING)) {
        io.emit('conexion_exitosa', 'Conectado a TikFinity');
        return;
    }
    if (tikfinitySocket && tikfinitySocket.readyState === WebSocket.CONNECTING) return;

    tikfinitySocket = new WebSocket(TIKFINITY_WEBSOCKET_URL);

    tikfinitySocket.on('open', () => {
        io.emit('conexion_exitosa', 'Conectado a TikFinity');
    });

    tikfinitySocket.on('message', (data) => {
        if (!subastaActiva) return;

        const message = JSON.parse(data.toString());

        if (message.event === 'gift') {
            const giftData = message.data;

            if (!giftData.repeatEnd) return;

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
        participantes = [];
        subastaActiva = true;
        io.emit('actualizar_lista', participantes);
        connectToTikfinity();
    });
    
    // NUEVO: Escuchamos el tiempo de la ventana de control
    socket.on('sync_time', (time) => {
        // Y se lo reenviamos a TODAS las ventanas conectadas
        io.emit('update_time', time); 
    });

    socket.on('finalizar_subasta', () => {
        subastaActiva = false;
        // El servidor le avisa a todas las ventanas que el tiempo se detuvo
        io.emit('timer_stopped'); 
    });

    socket.on('disconnect', () => console.log(`Cliente desconectado: ${socket.id}`));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});