// server.js

// ===========================================
// 📦 SERVIDOR PRINCIPAL TIKTOK (CON SUBASTA)
// ===========================================

// Dependencias necesarias
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
// 🚨 Dependencia de TikFinity
const { TikTokIOConnection } = require('tiktok-livestream-chat-connector'); 

// Crear aplicación Express y servidor HTTP
const app = express();
const server = http.createServer(app);
// Permitir CORS desde cualquier origen (necesario para el widget y TikFinity)
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Puerto asignado por Render o localmente (por defecto: 3000 es más común)
const PORT = process.env.PORT || 3000;

// ===========================================
// 🌐 CONFIGURACIÓN EXPRESS
// ===========================================

// Servir archivos estáticos (Asumo que tu index.html está en la raíz o en /public)
app.use(express.static(path.join(__dirname, "public")));
// Si tu index.html está en la raíz, usa: app.use(express.static(__dirname));

// Ruta principal para renderizar index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html")); // Ajusta la ruta si es necesario
});

// ===========================================
// 🔑 CONFIGURACIÓN DE SEGURIDAD Y ESTADO
// ===========================================

// Estructura de datos para manejar múltiples subastas/salas
// { 'MI_STREAM_ID': { auctionState: 'espera', currentTime: 60, interval: null, participants: {}, config: {}, connection: null } }
const auctionRooms = {};

// Objeto para almacenar la conexión activa de TikFinity por streamerId
const activeTikTokConnections = {};

// 1. 🔑 DEFINE TU LISTA BLANCA DE IDs AQUÍ (Únicamente los IDs que pueden iniciar la conexión TikFinity)
const VALID_STREAMER_IDS = [
    "MI_STREAM_ID", // El ID por defecto que usas en el cliente
    "lorotecayt",   // Tu ID de prueba
    "otro_usuario_autorizado" 
];

// ===========================================
// 🛠️ FUNCIONES DE CONTROL DE SUBASTA
// ===========================================

/**
 * Función CRÍTICA: Aplica la solución al bug de TikFinity.
 * Limpia la lista de participantes y el estado de la subasta.
 */
function resetAuction(streamerId) {
    const room = auctionRooms[streamerId];
    if (!room) return;
    
    // Detener el temporizador si está activo
    if (room.interval) {
        clearInterval(room.interval);
    }
    
    // Limpiar la lista de participantes (SOLUCIÓN AL BUG de TikFinity)
    room.participants = {};
    
    // Reiniciar el estado
    room.auctionState = 'espera';
    room.currentTime = room.config.initialTime;

    // Emitir el nuevo estado
    io.to(streamerId).emit('update_state', { 
        participants: room.participants, 
        currentTime: room.currentTime,
        auctionState: room.auctionState
    });
    
    console.log(`[SERVER] 🧹 Subasta reiniciada en la sala: ${streamerId}`);
}

/**
 * Función principal del temporizador, gestiona el tiempo y el snipe.
 */
function startTimer(streamerId) {
    const room = auctionRooms[streamerId];
    if (!room || room.auctionState !== 'iniciado') return;

    if (room.interval) {
        clearInterval(room.interval);
    }
    
    room.interval = setInterval(() => {
        room.currentTime--;

        // Comprobar si ha terminado
        if (room.currentTime <= 0) {
            clearInterval(room.interval);
            room.auctionState = 'finalizado';
            endAuction(streamerId);
        } else {
            // Emitir actualización de tiempo y estado cada segundo
            io.to(streamerId).emit('update_state', { 
                currentTime: room.currentTime,
                auctionState: room.auctionState 
            });
            // Lógica de alerta de snipe visual (opcional)
            if (room.currentTime === room.config.snipeTime - 1) { 
                 io.to(streamerId).emit("activar_alerta_snipe_visual");
            }
        }
    }, 1000);
    
    console.log(`[SERVER] ⏱️ Temporizador iniciado en ${streamerId}.`);
}

/**
 * Finaliza la subasta, determina el ganador y notifica a los clientes.
 */
function endAuction(streamerId, manual = false) {
    const room = auctionRooms[streamerId];
    if (!room) return;
    
    if (room.interval) {
        clearInterval(room.interval);
    }
    room.auctionState = 'finalizado';
    
    let winner = null;
    const participantsArray = Object.values(room.participants);
    
    if (participantsArray.length > 0) {
        // Encontrar el ganador (el de más diamantes)
        winner = participantsArray.sort((a, b) => b.totalDiamonds - a.totalDiamonds)[0];
        console.log(`[SERVER] 🏆 Ganador de ${streamerId}: ${winner.nickname}`);
    } else {
        console.log(`[SERVER] Subasta finalizada sin participantes en ${streamerId}.`);
    }
    
    // Emitir el evento de finalización
    io.to(streamerId).emit('auction_ended', { winner: winner || { nickname: "Nadie", totalDiamonds: 0 } });
    
    // Enviar log de finalización
    io.to(streamerId).emit('update_state', { 
         logMessage: `<p style="color: #e74c3c; font-weight: bold;">${manual ? '🛑 FIN MANUAL' : '⏱️ TIEMPO AGOTADO'}: Subasta Finalizada. Ganador: **${winner ? winner.nickname : 'Nadie'}**.</p>`
    });
}

/**
 * Procesa el regalo, actualiza participantes y aplica lógica de snipe.
 */
function handleGift(streamerId, data) {
    const room = auctionRooms[streamerId];
    if (!room || room.auctionState !== 'iniciado') {
        return; // Ignorar regalos si la subasta no está activa
    }
    
    // **SOLUCIÓN BUG TIKFINITY:** data ya viene solo con regalos, simplificamos.
    
    const giftValue = data.giftValue * data.repeatCount;
    const nickname = data.nickname;
    
    // Añadir o actualizar el participante
    if (room.participants[nickname]) {
        room.participants[nickname].totalDiamonds += giftValue;
    } else {
        room.participants[nickname] = {
            nickname: nickname,
            profilePictureUrl: data.profilePictureUrl,
            totalDiamonds: giftValue,
        };
    }
    
    // ----------------------------------------
    // Lógica del SNIPE (CRÍTICA)
    // ----------------------------------------
    if (room.currentTime <= room.config.snipeTime) {
        // Si el tiempo es menor o igual al tiempo de snipe, lo reiniciamos.
        room.currentTime = room.config.snipeTime;
        io.to(streamerId).emit('update_state', { 
            logMessage: `<p style="color: #ff4d4d; font-weight: bold;">🚨 SNIPE: **${nickname}** reinició el tiempo a ${room.config.snipeTime}s con ${giftValue}💎.</p>`,
            currentTime: room.currentTime 
        });
    } else {
        io.to(streamerId).emit('update_state', { 
             logMessage: `<p style="color: #2ecc71;">🎁 Regalo: **${nickname}** donó ${giftValue} Diamantes.</p>`,
        });
    }

    // Emitir el estado actualizado de participantes
    io.to(streamerId).emit('update_state', { 
        participants: room.participants
    });
}

// ===========================================
// 🌐 CONEXIÓN TIKFINITY
// ===========================================

function connectToTikTok(streamerId) {
    // 1. Limpiar conexión anterior si existe
    if (activeTikTokConnections[streamerId]) {
        activeTikTokConnections[streamerId].close();
        delete activeTikTokConnections[streamerId];
    }

    console.log(`[TikFinity] Intentando conectar a @${streamerId}...`);
    const connection = new TikTokIOConnection(streamerId, { enableExtendedGiftInfo: true });
    
    connection.connect().then(state => {
        activeTikTokConnections[streamerId] = connection;
        
        io.to(streamerId).emit('update_state', { 
             logMessage: `<p style="color: #2ecc71;">🌐 Conexión TikFinity/TikTok ÉXITO a **@${state.uniqueId}**.</p>` 
        });
    }).catch(err => {
        console.error(`[TikFinity] ❌ Error al conectar a @${streamerId}: ${err.message}`);
        io.to(streamerId).emit('update_state', { 
             logMessage: `<p style="color: #e74c3c;">❌ ERROR TikFinity: No se pudo conectar a **@${streamerId}**. Revise el ID.</p>` 
        });
    });

    // -----------------------------------------------------
    // Manejo de Eventos de TikTok (solo procesamos 'gift')
    // -----------------------------------------------------
    connection.on('gift', data => {
        // Llamar a handleGift con los datos de TikFinity
        handleGift(streamerId, {
            type: 'gift',
            nickname: data.nickname,
            profilePictureUrl: data.profilePictureUrl,
            giftValue: data.diamondCount,
            repeatCount: data.repeatCount,
            giftName: data.giftName,
            uniqueId: data.uniqueId
        });
    });
}

// ===========================================
// ⚡ EVENTOS SOCKET.IO
// ===========================================

io.on("connection", (socket) => { 
    console.log("🟢 Cliente conectado:", socket.id);

    // ---------------------------------------
    // 1. JOIN_ROOM (Dashboard y Conexión TikFinity)
    // ---------------------------------------
    socket.on("join_room", (data) => { 
        const streamerId = data?.streamerId;

        if (!streamerId) return;
        
        // 2. VERIFICACIÓN DE LA LISTA BLANCA
        if (VALID_STREAMER_IDS.includes(streamerId)) {
            socket.join(streamerId);
            
            // 3. Inicializar o obtener la sala
            if (!auctionRooms[streamerId]) {
                auctionRooms[streamerId] = {
                    auctionState: 'espera',
                    currentTime: 60,
                    interval: null,
                    participants: {},
                    config: { initialTime: 60, snipeTime: 15 } // Configuración inicial por defecto
                };
            }
            
            const room = auctionRooms[streamerId];
            
            // 4. Conectar a TikTok (solo si no está conectado ya)
            if (!activeTikTokConnections[streamerId] || !activeTikTokConnections[streamerId].connected) {
                 connectToTikTok(streamerId);
            }
            
            // 5. Enviar el estado actual al cliente que acaba de entrar
            socket.emit('update_state', {
                participants: room.participants,
                currentTime: room.currentTime,
                auctionState: room.auctionState
            });
            
            console.log(`🔗 [${streamerId}] Dashboard unido a la sala.`);
        } else {
            // ID INVÁLIDO: Rechaza y notifica al cliente
            socket.emit('id_invalido', {
                streamerId: streamerId,
                message: "ID no autorizado. Por favor, comunícate con el administrador."
            });
            console.log(`❌ ERROR: ID Inválido (${streamerId}) intentó unirse. Rechazado.`);
        }
    });
    
    // ---------------------------------------
    // 2. INICIAR SUBASTA
    // ---------------------------------------
    socket.on("start_auction", (data) => {
        const streamerId = data?.streamerId;
        const room = auctionRooms[streamerId];
        
        if (room && room.auctionState !== 'iniciado') {
            // Asegurar que la configuración sea la enviada por el cliente
            room.config.initialTime = data.initialTime;
            room.config.snipeTime = data.snipeTime;
            room.currentTime = data.initialTime;
            room.auctionState = 'iniciado';
            
            // Si viene de 'finalizado', asegura una limpieza antes de iniciar
            if (Object.keys(room.participants).length > 0) {
                 resetAuction(streamerId);
            }

            startTimer(streamerId);
            
            // Notificar a todos los clientes de la sala
            io.to(streamerId).emit("update_state", {
                auctionState: room.auctionState,
                currentTime: room.currentTime,
                logMessage: `<p style="color: #2ecc71;">▶️ Subasta Iniciada. Tiempo: ${room.config.initialTime}s.</p>`
            });
            console.log(`🚀 [${streamerId}] Subasta iniciada.`);
        }
    });

    // ---------------------------------------
    // 3. FINALIZAR SUBASTA (Botón de STOP)
    // ---------------------------------------
    socket.on("end_auction", (data) => {
        const streamerId = data?.streamerId;
        const room = auctionRooms[streamerId];
        
        if (room && room.auctionState !== 'finalizado') {
            endAuction(streamerId, true); // Pasar 'true' para loguear como finalización manual
            console.log(`⏹️ [${streamerId}] Subasta finalizada manualmente.`);
        }
    });
    
    // ---------------------------------------
    // 4. PAUSAR SUBASTA
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
            console.log(`⏸️ [${streamerId}] Subasta pausada.`);
        }
    });
    
    // ---------------------------------------
    // 5. REINICIAR SUBASTA (Borrar todo, botón de Restart)
    // ---------------------------------------
    socket.on("restart_auction", (data) => {
        const streamerId = data?.streamerId;
        resetAuction(streamerId);
        
        io.to(streamerId).emit("update_state", {
             logMessage: `<p style="color: #7f8c8d;">🔄 Reinicio completo. En espera de inicio.</p>`
        });
        console.log(`🔄 [${streamerId}] Solicitud de reinicio procesada.`);
    });

    // ---------------------------------------
    // 6. SIMULAR REGALO
    // ---------------------------------------
    socket.on("simulate_gift", (giftData) => {
         const streamerId = giftData?.streamerId;
         handleGift(streamerId, giftData);
         console.log(`🎁 [${streamerId}] Simulación de regalo procesada.`);
    });

    // ---------------------------------------
    // 7. WIDGET JOIN (Unión del widget)
    // ---------------------------------------
    socket.on("join_room_widget", (data) => {
        const streamerId = data?.streamerId;
         if (VALID_STREAMER_IDS.includes(streamerId)) {
             socket.join(streamerId);
             const room = auctionRooms[streamerId] || { participants: {}, currentTime: 60, auctionState: 'espera' };
             
             // Enviar el estado actual al widget
             socket.emit('update_state', {
                participants: room.participants,
                currentTime: room.currentTime,
                auctionState: room.auctionState
            });
            console.log(`📺 [${streamerId}] Widget unido a la sala.`);
         }
    });
    
    // ---------------------------------------
    // 8. Desconexión
    // ---------------------------------------
    socket.on("disconnect", () => {
        console.log("🔴 Cliente desconectado:", socket.id);
    });
});

// ===========================================
// 🚀 INICIAR SERVIDOR
// ===========================================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
