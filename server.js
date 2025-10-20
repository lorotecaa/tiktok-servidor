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
let clockInterval = null;
let currentTimerValue = 0;

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
        participantes.sort((a, b) => b.cantidad - a.cantidad);
        io.emit('actualizar_lista', participantes);
    });

    tikfinitySocket.on('error', () => io.emit('conexion_error', 'No se pudo conectar a TikFinity.'));
    tikfinitySocket.on('close', () => {
        io.emit('conexion_desconectada');
        tikfinitySocket = null;
    });
}

function startMasterClock(durationSeconds) {
    if (clockInterval) clearInterval(clockInterval);

    currentTimerValue = durationSeconds;
    io.emit('timer_sync', currentTimerValue);

    clockInterval = setInterval(() => {
        if (currentTimerValue > 0) {
            currentTimerValue--;
            io.emit('timer_sync', currentTimerValue);
        } else {
            clearInterval(clockInterval);
            io.emit('timer_end');
        }
    }, 1000);
}

io.on('connection', (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);

    socket.on('iniciar_subasta', (duration) => {
        console.log('RECIBIDA ORDEN DE INICIAR SUBASTA. Limpiando lista...');
        participantes = [];
        subastaActiva = true;
        io.emit('actualizar_lista', participantes);
        const durationFromInput = duration || 200;
        startMasterClock(durationFromInput);
        connectToTikfinity();
    });

    socket.on('finalizar_subasta', () => {
        console.log('RECIBIDA ORDEN DE FINALIZAR SUBASTA');
        subastaActiva = false;
        if (clockInterval) clearInterval(clockInterval);
        io.emit('timer_end');
    });

    socket.on('disconnect', () => console.log(`Cliente desconectado: ${socket.id}`));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
