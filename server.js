// server.js

// ===========================================
// 📦 SERVIDOR PRINCIPAL TIKTOK (CON SUBASTA)
// ===========================================

// Dependencias necesarias
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

// Crear aplicación Express y servidor HTTP
const app = express();
const server = http.createServer(app);
// Permitir CORS (necesario para el widget y la comunicación)
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Puerto asignado por Render o localmente (por defecto: 10000)
const PORT = process.env.PORT || 10000;

// ===========================================
// 🌐 CONFIGURACIÓN EXPRESS
// ===========================================

// Servir archivos estáticos desde la carpeta "public"
app.use(express.static(path.join(__dirname, "public")));

// Ruta principal para renderizar index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===========================================
// 🔑 CONFIGURACIÓN DE SEGURIDAD Y ESTADO
// ===========================================

// Estructura de datos para manejar múltiples subastas/salas
// { 'MI_STREAM_ID': { auctionState: 'espera', currentTime: 60, interval: null, participants: {}, config: {initialTime: 60, snipeTime: 15} } }
const auctionRooms = {};

// 1. 🔑 DEFINE TU LISTA BLANCA DE IDS AQUÍ
const VALID_STREAMER_IDS = [
    "@yosoytoniu",  
    "lorotecayt",   
    "otro_usuario_autorizado",
    "MI_STREAM_ID" // Añade el ID por defecto si lo usas
];


// ===========================================
// 🛠️ FUNCIONES DE CONTROL DE SUBASTA (Lógica del Timer y Snipe)
// ===========================================

/**
 * Aplica la solución al bug: Limpia participantes y reinicia el estado.
 */
function resetAuction(streamerId) {
    const room = auctionRooms[streamerId];
    if (!room) return;
    
    if (room.interval) {
        clearInterval(room.interval);
    }
    
    // 🔥 SOLUCIÓN AL BUG: Limpiar la lista de participantes 🔥
    room.participants = {}; 
    
    room.auctionState = 'espera';
    room.currentTime = room.config.initialTime || 60; // Usa el tiempo inicial configurado

    io.to(streamerId).emit('update_state', { 
        participants: room.participants, 
        currentTime: room.currentTime,
        auctionState: room.auctionState
    });
    console.log(`[SERVER] 🧹 Subasta reiniciada/limpiada en: ${streamerId}`);
}

/**
 * Inicia el temporizador de la sala.
 */
function startTimer(streamerId) {
    const room = auctionRooms[streamerId];
    if (!room || room.auctionState !== 'iniciado') return;

    if (room.interval) {
        clearInterval(room.interval);
    }
    
    room.interval = setInterval(() => {
        room.currentTime--;

        if (room.currentTime <= 0) {
            clearInterval(room.interval);
            room.auctionState = 'finalizado';
            endAuction(streamerId);
        } else {
            io.to(streamerId).emit('update_state', { 
                currentTime: room.currentTime,
                auctionState: room.auctionState 
            });
            // Alerta de snipe visual (ejemplo)
            if (room.currentTime === room.config.snipeTime - 1) { 
                 io.to(streamerId).emit("activar_alerta_snipe_visual");
            }
        }
    }, 1000);
}

/**
 * Finaliza la subasta, determina el ganador.
 */
function endAuction(streamerId, manual = false) {
    const room = auctionRooms[streamerId];
    if (!room || room.auctionState === 'finalizado') return;
    
    if (room.interval) {
        clearInterval(room.interval);
    }
    room.auctionState = 'finalizado';
    
    let winner = null;
    const participantsArray = Object.values(room.participants);
    
    if (participantsArray.length > 0) {
        winner = participantsArray.sort((a, b) => b.totalDiamonds - a.totalDiamonds)[0];
    }
    
    io.to(streamerId).emit('auction_ended', { winner: winner || { nickname: "Nadie", totalDiamonds: 0 } });
    io.to(streamerId).emit('update_state', { 
         logMessage: `<p style="color: #e74c3c; font-weight: bold;">${manual ? '🛑 FIN MANUAL' : '⏱️ TIEMPO AGOTADO'}: Ganador: **${winner ? winner.nickname : 'Nadie'}**.</p>`
    });
}

/**
 * Procesa el regalo, actualiza participantes y aplica lógica de snipe.
 * (Usado por incoming_gift y simularRegalo)
 */
function handleGift(streamerId, data) {
    const room = auctionRooms[streamerId];
    if (!room || room.auctionState !== 'iniciado') {
        return; 
    }
    
    // **CRÍTICO:** Solo procesamos regalos (esto asegura la solución al bug)
    if (data.type !== 'gift') return;
    
    const giftValue = (data.giftValue || 1) * (data.repeatCount || 1);
    const nickname = data.nickname;
    
    // Actualizar o añadir participante
    if (room.participants[nickname]) {
        room.participants[nickname].totalDiamonds += giftValue;
    } else {
        room.participants[nickname] = {
            nickname: nickname,
            profilePictureUrl: data.profilePictureUrl || '',
            totalDiamonds: giftValue,
        };
    }
    
    // Lógica del SNIPE
    if (room.currentTime <= room.config.snipeTime) {
        room.currentTime = room.config.snipeTime;
        io.to(streamerId).emit('update_state', { 
            logMessage: `<p style="color: #ff4d4d; font-weight: bold;">🚨 SNIPE: **${nickname}** reinició a ${room.config.snipeTime}s con ${giftValue}💎.</p>`,
            currentTime: room.currentTime 
        });
    } else {
        io.to(streamerId).emit('update_state', { 
             logMessage: `<p style="color: #2ecc71;">🎁 Regalo: **${nickname}** donó ${giftValue} Diamantes. Total: ${room.participants[nickname].totalDiamonds}💎</p>`,
        });
    }

    // Emitir el estado actualizado
    io.to(streamerId).emit('update_state', { 
        participants: room.participants,
        currentTime: room.currentTime
    });
}


// ===========================================
// ⚡ EVENTOS SOCKET.IO
// ===========================================
io.on("connection", (socket) => { 
    console.log("🟢 Cliente conectado:", socket.id);

    // ---------------------------------------
    // 1. JOIN_ROOM (Dashboard y Widget)
    // ---------------------------------------
    socket.on("join_room", (data) => { 
        const streamerId = data?.streamerId;
        if (!streamerId) return;
        
        // 2. VERIFICACIÓN DE LA LISTA BLANCA
        if (VALID_STREAMER_IDS.includes(streamerId)) {
            socket.join(streamerId);
            
            // Inicializar la sala si no existe
            if (!auctionRooms[streamerId]) {
                auctionRooms[streamerId] = {
                    auctionState: 'espera',
                    currentTime: 60,
                    interval: null,
                    participants: {},
                    config: { initialTime: 60, snipeTime: 15 } // Configuración por defecto
                };
            }
            const room = auctionRooms[streamerId];
            
            // Enviar el estado actual al cliente que se une
            socket.emit('update_state', {
                participants: room.participants,
                currentTime: room.currentTime,
                auctionState: room.auctionState,
                logMessage: `<p style="color: #3498db;">🔗 Unido a la sala **${streamerId}**.</p>`
            });
            
            console.log(`🔗 [${streamerId}] Cliente unido a la sala.`);
        } else {
            console.log(`❌ ERROR: ID Inválido (${streamerId}) intentó unirse. Rechazado.`);
            socket.emit('id_invalido', {
                streamerId: streamerId,
                message: "ID no autorizado. Por favor, comunícate con el administrador."
            });
        }
    });

    // ---------------------------------------
    // 2. INICIAR SUBASTA (Botón Iniciar)
    // ---------------------------------------
    // **CORREGIDO** para usar 'start_auction' y gestionar la lógica
    socket.on("start_auction", (data) => {
        const streamerId = data?.streamerId;
        const room = auctionRooms[streamerId];
        
        if (room && room.auctionState !== 'iniciado') {
            room.config.initialTime = data.initialTime;
            room.config.snipeTime = data.snipeTime;
            room.currentTime = data.initialTime;
            room.auctionState = 'iniciado';
            
            // Si la sala no está limpia, la reiniciamos antes de empezar
            if (Object.keys(room.participants).length > 0) {
                 resetAuction(streamerId); 
            }

            startTimer(streamerId);
            
            io.to(streamerId).emit("update_state", {
                auctionState: room.auctionState,
                currentTime: room.currentTime,
                logMessage: `<p style="color: #2ecc71;">▶️ Subasta Iniciada. Tiempo: ${room.config.initialTime}s.</p>`
            });
            console.log(`🚀 [${streamerId}] Subasta iniciada.`);
        }
    });

    // ---------------------------------------
    // 3. FINALIZAR SUBASTA (Botón Finalizar)
    // ---------------------------------------
    // **CORREGIDO** para usar 'end_auction' y gestionar la lógica
    socket.on("end_auction", (data) => {
        const streamerId = data?.streamerId;
        endAuction(streamerId, true); // True = finalización manual
        console.log(`⏹️ [${streamerId}] Subasta finalizada manualmente.`);
    });
    
    // ---------------------------------------
    // 4. PAUSAR SUBASTA (Botón Pausar)
    // ---------------------------------------
    socket.on("pause_auction", (data) => {
        const streamerId = data?.streamerId;
        const room = auctionRooms[streamerId];
        
        if (room && room.auctionState === 'iniciado') {
            if (room.interval) {
                clearInterval(room.interval);
            }
            room.auctionState = 'pausado';
            
            io.to(streamerId).emit("update_state", {
                auctionState: room.auctionState,
                logMessage: `<p style="color: #f39c12;">⏸️ Subasta Pausada.</p>`
            });
        }
    });
    
    // ---------------------------------------
    // 5. REINICIAR SUBASTA (Botón Restart)
    // ---------------------------------------
    socket.on("restart_auction", (data) => {
        const streamerId = data?.streamerId;
        resetAuction(streamerId);
        
        io.to(streamerId).emit("update_state", {
             logMessage: `<p style="color: #7f8c8d;">🔄 Reinicio completo. En espera de inicio.</p>`
        });
    });

    // ---------------------------------------
    // 6. RECEPCIÓN DE REGALOS (Desde el Dashboard cliente TikFinity Local)
    // ---------------------------------------
    socket.on("incoming_gift", (giftData) => {
         const streamerId = giftData?.streamerId;
         if (auctionRooms[streamerId]) {
             // Usa la función central para actualizar la subasta/snipe
             handleGift(streamerId, giftData); 
         }
    });
    
    // ---------------------------------------
    // 7. SIMULAR REGALO (Para el botón Simular Regalo)
    // ---------------------------------------
    socket.on("simulate_gift", (giftData) => {
         const streamerId = giftData?.streamerId;
         handleGift(streamerId, giftData);
         console.log(`🎁 [${streamerId}] Simulación de regalo procesada.`);
    });

    // ---------------------------------------
    // 8. Eventos Antiguos (DEBES REEMPLAZARLOS O ELIMINARLOS)
    // ---------------------------------------
    // ESTOS DEBEN SER REEMPLAZADOS POR start_auction y end_auction:
    // socket.on("iniciar_subasta", (data) => { ... }); // REEMPLAZAR
    // socket.on("finalizar_subasta", () => { ... }); // REEMPLAZAR
    // socket.on("nuevo_regalo", (giftData) => { ... }); // REEMPLAZAR por incoming_gift
    
    // Puedes dejar estos si los usas en el cliente
    socket.on("sync_time", (time) => { socket.broadcast.emit("update_time", time); });
    socket.on("activar_alerta_snipe_visual", () => { io.emit("activar_alerta_snipe_visual"); });
    socket.on("anunciar_ganador", (ganador) => { io.to(ganador.streamerId).emit("anunciar_ganador", ganador); });
    socket.on("limpiar_listas", (data) => { io.to(data.streamerId).emit("limpiar_listas_clientes"); });

    // ---------------------------------------
    // 9. Desconexión
    // ---------------------------------------
    socket.on("disconnect", () => {
        console.log("🔴 Cliente desconectado:", socket.id);
    });
});
// ===============================
// 🚀 INICIAR SERVIDOR
// ===============================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
