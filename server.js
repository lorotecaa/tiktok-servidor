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

        if (message.event === 'gift' || message.event === 'roomUser') {
            let topDonors = message.event === 'gift' ? [message.data] : message.data.topViewers;
            if (!topDonors) return;

            topDonors.forEach(donor => {
                let userData = message.event === 'gift' ? donor : donor.user;
                let coinCount = message.event === 'gift' ? (donor.diamondCount * donor.repeatCount) : donor.coinCount;
                
                if (!userData || !userData.uniqueId || coinCount <= 0) return;

                const donacion = { usuario: userData.uniqueId || userData.nickname, cantidad: coinCount };
                const existingUser = participantes.find(p => p.usuario === donacion.usuario);

                if (existingUser) {
                    if (message.event === 'gift') {
                        existingUser.cantidad += donacion.cantidad;
                    } else if (donacion.cantidad > existingUser.cantidad) {
                        existingUser.cantidad = donacion.cantidad;
                    }
                } else {
                    participantes.push(donacion);
                }
            });

            participantes.sort((a, b) => b.cantidad - a.sort);
            io.emit('actualizar_lista', participantes);
        }
    });

    tikfinitySocket.on('error', (err) => io.emit('conexion_error', 'No se pudo conectar a TikFinity.'));
    tikfinitySocket.on('close', () => {
        io.emit('conexion_desconectada');
        tikfinitySocket = null;
    });
}

io.on('connection', (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);

    socket.on('iniciar_subasta', (duration) => { // RECIBE LA DURACIÓN DEL CLIENTE
        console.log('RECIBIDA ORDEN DE INICIAR SUBASTA. Limpiando lista...');
        participantes = []; 
        subastaActiva = true;
        io.emit('actualizar_lista', participantes); 
        connectToTikfinity();
        
        // ENVÍA LA ORDEN Y EL VALOR INICIAL DEL TEMPORIZADOR A TODOS LOS CLIENTES
        io.emit('start_timer_sync', duration);
    });
    
    socket.on('sync_time', (time) => {
        // Recibe el tick de un cliente (el maestro) y lo reenvía a todos los demás
        io.emit('update_time', time); 
    });

    socket.on('finalizar_subasta_manual', () => {
        console.log('RECIBIDA ORDEN DE FINALIZAR SUBASTA');
        subastaActiva = false;
        io.emit('stop_timer_sync'); // Avisa a todos que se detengan
    });

    socket.on('disconnect', () => console.log(`Cliente desconectado: ${socket.id}`));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});