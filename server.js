// ===============================
// 📦 SERVIDOR PRINCIPAL TIKTOK (CON EVENTO DE REGALOS)
// ===============================

// Dependencias necesarias
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

// Crear aplicación Express y servidor HTTP
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Puerto asignado por Render o localmente (por defecto: 10000)
const PORT = process.env.PORT || 10000;

// ===============================
// 💾 ESTADO GLOBAL DEL SERVIDOR (CRÍTICO PARA AISLAMIENTO Y ANTI-BUG)
// ===============================
/* Almacena la lista de participantes por streamerId. Limpiarla previene
   que donadores pasados reaparezcan al iniciar una nueva subasta. */
const streamerStates = {}; 

function getStreamerState(streamerId) {
    if (!streamerStates[streamerId]) {
        streamerStates[streamerId] = {
            participantes: [], // La lista de participantes por streamer
        };
    }
    return streamerStates[streamerId];
}


// ===============================
// 🌐 CONFIGURACIÓN EXPRESS
// ===============================

// Servir archivos estáticos desde la carpeta "public"
app.use(express.static(path.join(__dirname, "public")));

// Ruta principal para renderizar index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===============================
// ⚡ CONFIGURACIÓN SOCKET.IO (CON LÓGICA DE SALAS)
// ===============================
io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado:", socket.id);

  // 🛑 CRÍTICO: Evento para unirse a una Sala única
  socket.on("join_room", (streamerId) => {
    if (streamerId) {
        socket.join(streamerId);
        console.log(`[Sala] Cliente ${socket.id} unido a la sala: ${streamerId}`);

        // Sincroniza la lista de participantes guardada en el servidor al unirse
        const state = getStreamerState(streamerId);
        if (state.participantes.length > 0) {
            socket.emit('sync_participantes_clientes', { participantes: state.participantes });
        }
    }
  });

// ==========================================================
// 🎁 EVENTO CENTRAL DE REGALO (RECIBIDO DEL PUENTE LOCAL/DASHBOARD)
// ==========================================================
  socket.on("nuevo_regalo", (giftData) => {
    // giftData = { usuario, cantidad, regalo, avatar_url, streamerId }
    console.log(`🎁 [${giftData.streamerId}] nuevo_regalo recibido de ${giftData.usuario} con cantidad ${giftData.cantidad}`);
    
    if (!giftData.streamerId) return;

    // 🛑 CRÍTICO: Reenviar el regalo individual a todos los clientes de la sala.
    // La acumulación ocurre en el cliente/Dashboard.
    const individualGift = {
        usuario: giftData.usuario,
        cantidad: giftData.cantidad, // Valor individual del regalo (diamantes)
        regalo: giftData.regalo,
        avatar_url: giftData.avatar_url,
    };

    // 🛑 CORRECCIÓN: Emitir solo a la sala con el evento 'new_gift'
    io.to(giftData.streamerId).emit("new_gift", { gift: individualGift }); 
  });
// ==========================================================
// Los siguientes eventos han sido corregidos para usar io.to(data.streamerId)

  // Evento para iniciar la subasta
  socket.on("iniciar_subasta", (data) => { 
    console.log(`🚀 [${data.streamerId}] Solicitando inicio de subasta.`);
    io.to(data.streamerId).emit("subasta_iniciada"); 
});

  // Evento de sincronización de tiempo
  socket.on("sync_time", (data) => { 
    socket.to(data.streamerId).emit("update_time", { time: data.time }); 
});

  // Evento cuando se finaliza la subasta
  socket.on("finalizar_subasta", (data) => { 
    console.log(`⏹️ [${data.streamerId}] Subasta finalizada.`);
    io.to(data.streamerId).emit("finalizar_subasta"); 
});

  // Evento para activar la alerta visual de Snipe
  socket.on("activar_alerta_snipe_visual", (data) => { 
    console.log(`⚡ [${data.streamerId}] Alerta SNIPE activa.`);
    io.to(data.streamerId).emit("activar_alerta_snipe_visual"); 
});

  // Evento para avisar al widget que salga del modo Snipe visual
  socket.on("restaurar_widget", (data) => { 
    console.log(`ℹ️ [${data.streamerId}] Restaurar widget.`);
    io.to(data.streamerId).emit("restaurar_widget_cliente"); 
});

  // SINCRONIZACIÓN: Cuando el Dashboard sincroniza su lista final (guarda estado)
  socket.on("sync_participantes", (data) => {
    console.log(`📊 [${data.streamerId}] Participantes sincronizados. Total: ${data.participantes.length}`);
    const state = getStreamerState(data.streamerId);
    state.participantes = data.participantes; // Guardar lista
    socket.to(data.streamerId).emit("sync_participantes_clientes", { participantes: data.participantes }); // Enviar a widgets
  });

  // Anunciar ganador
  socket.on("anunciar_ganador", (data) => { 
    console.log(`🏆 [${data.streamerId}] Anunciando ganador: ${data.usuario}`);
    io.to(data.streamerId).emit("anunciar_ganador", data); 
});

  // 🧹 Limpiar listas (Llamado por el Dashboard)
  socket.on("limpiar_listas", (data) => {
    console.log(`🧹 [${data.streamerId}] Limpiando listas.`);
    const state = getStreamerState(data.streamerId);
    state.participantes = []; // 🛑 CRÍTICO: Limpia el estado del servidor
    io.to(data.streamerId).emit("limpiar_listas_clientes");
  });
    
  // Detectar desconexión
  socket.on("disconnect", () => { console.log("🔴 Cliente desconectado:", socket.id); });
});

// ===============================
// 🚀 INICIAR SERVIDOR
// ===============================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
