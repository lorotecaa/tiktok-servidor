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
let clockInterval = null; // NUEVO: Intervalo del reloj maestro
let currentTimerValue = 0; // NUEVO: El valor de tiempo actual

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
        // ... (Tu lógica de procesamiento de regalos) ...
        participantes.sort((a, b) => b.cantidad - a.sort);
        io.emit('actualizar_lista', participantes);
    });

    tikfinitySocket.on('error', (err) => io.emit('conexion_error', 'No se pudo conectar a TikFinity.'));
    tikfinitySocket.on('close', () => {
        io.emit('conexion_desconectada');
        tikfinitySocket = null;
    });
}

// NUEVO: Función para iniciar el temporizador en el servidor
function startMasterClock(durationSeconds) {
    if (clockInterval) clearInterval(clockInterval);

    currentTimerValue = durationSeconds;
    io.emit('timer_sync', currentTimerValue); // Envía el valor inicial

    clockInterval = setInterval(() => {
        if (currentTimerValue > 0) {
            currentTimerValue--;
            io.emit('timer_sync', currentTimerValue); // Envía la hora a todos los clientes
        } else {
            clearInterval(clockInterval);
            io.emit('timer_end'); // Avisa a todos que el tiempo terminó
        }
    }, 1000);
}

io.on('connection', (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);

    socket.on('iniciar_subasta', (duration) => { // AHORA RECIBE LA DURACIÓN
        console.log('RECIBIDA ORDEN DE INICIAR SUBASTA. Limpiando lista...');
        participantes = [];
        subastaActiva = true;
        io.emit('actualizar_lista', participantes); 
        
        // CORRECCIÓN: El servidor arranca el reloj maestro
        const durationFromInput = 200; // Valor por defecto ya que el cliente no lo envía
        startMasterClock(durationFromInput); 
        
        connectToTikfinity();
    });
    
    socket.on('finalizar_subasta', () => {
        console.log('RECIBIDA ORDEN DE FINALIZAR SUBASTA');
        subastaActiva = false;
        if (clockInterval) clearInterval(clockInterval); // Detiene el reloj maestro
        io.emit('timer_end'); // Fuerza el final en todas las ventanas
    });

    socket.on('disconnect', () => console.log(`Cliente desconectado: ${socket.id}`));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
