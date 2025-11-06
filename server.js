// ===============================
// 📦 SERVIDOR PRINCIPAL TIKTOK (CON EVENTO DE REGALOS Y SALAS PRIVADAS)
// ===============================

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

// ===============================
// ⚙️ CONFIGURACIÓN BASE
// ===============================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});
const PORT = process.env.PORT || 10000;

// ===============================
// 💾 ESTADO GLOBAL DEL SERVIDOR (POR STREAMER)
// ===============================
/* Cada streamerId tiene su propio estado de participantes.
   Así, cada usuario tiene una sala completamente independiente. */
const streamerStates = {};

function getStreamerState(streamerId) {
  if (!streamerStates[streamerId]) {
    streamerStates[streamerId] = { participantes: [] };
  }
  return streamerStates[streamerId];
}

// ===============================
// 🌐 CONFIGURACIÓN EXPRESS
// ===============================
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===============================
// ⚡ CONFIGURACIÓN SOCKET.IO
// ===============================
io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado:", socket.id);

  // ==========================
  // 🔗 UNIRSE A UNA SALA PRIVADA
  // ==========================
  socket.on("join_room", (streamerId) => {
    if (!streamerId) {
      console.warn(`⚠️ Cliente ${socket.id} intentó unirse sin streamerId.`);
      return;
    }

    socket.join(streamerId);
    console.log(`[Sala] Cliente ${socket.id} unido a la sala: ${streamerId}`);

    const state = getStreamerState(streamerId);
    // Enviar el estado actual solo a este nuevo cliente
    socket.emit("sync_participantes_clientes", {
      participantes: state.participantes,
      streamerId,
    });
  });

  // ==========================
  // 🧠 EMISIÓN CENTRALIZADA
  // ==========================
  function emitToRoom(event, data) {
    if (!data || !data.streamerId) return;
    io.to(data.streamerId).emit(event, data);
  }

  // ==========================================================
  // 🎁 EVENTO: NUEVO REGALO
  // ==========================================================
  socket.on("new_gift", (giftData) => {
    if (!giftData.streamerId) return;

    console.log(
      `🎁 [${giftData.streamerId}] Nuevo regalo de ${giftData.usuario} (${giftData.cantidad}💎)`
    );

    emitToRoom("new_gift", {
      gift: {
        usuario: giftData.usuario,
        cantidad: giftData.cantidad,
        regalo: giftData.regalo,
        avatar_url: giftData.avatar_url,
      },
      streamerId: giftData.streamerId,
    });
  });

  // ==========================================================
  // 🚀 INICIO DE SUBASTA
  // ==========================================================
  socket.on("iniciar_subasta", (data) => {
    console.log(`🚀 [${data.streamerId}] Subasta iniciada.`);
    emitToRoom("iniciar_subasta", data);
  });

  // ==========================================================
  // ⏱️ SINCRONIZAR TIEMPO ENTRE DASHBOARD Y WIDGET
  // ==========================================================
  socket.on("sync_time", (data) => {
    emitToRoom("sync_time", {
      time: data.time,
      streamerId: data.streamerId,
    });
  });

  // ==========================================================
  // ⏹️ FINALIZAR SUBASTA
  // ==========================================================
  socket.on("finalizar_subasta", (data) => {
    console.log(`⏹️ [${data.streamerId}] Subasta finalizada.`);
    emitToRoom("finalizar_subasta", data);
  });

  // ==========================================================
  // ⚡ ALERTA VISUAL DE SNIPE
  // ==========================================================
  socket.on("activar_alerta_snipe_visual", (data) => {
    console.log(`⚡ [${data.streamerId}] Alerta SNIPE visual activada.`);
    emitToRoom("activar_alerta_snipe_visual", data);
  });

  // ==========================================================
  // 🔄 RESTAURAR WIDGET DESPUÉS DEL SNIPE
  // ==========================================================
  socket.on("restaurar_widget", (data) => {
    console.log(`ℹ️ [${data.streamerId}] Restaurar widget.`);
    emitToRoom("restaurar_widget", data);
  });

  // ==========================================================
  // 📊 SINCRONIZACIÓN DE PARTICIPANTES
  // ==========================================================
  socket.on("sync_participantes", (data) => {
    const state = getStreamerState(data.streamerId);
    state.participantes = data.participantes;

    console.log(
      `📊 [${data.streamerId}] Participantes sincronizados: ${data.participantes.length}`
    );

    emitToRoom("sync_participantes_clientes", {
      participantes: data.participantes,
      streamerId: data.streamerId,
    });
  });

  // ==========================================================
  // 🏆 ANUNCIAR GANADOR
  // ==========================================================
  socket.on("anunciar_ganador", (data) => {
    console.log(`🏆 [${data.streamerId}] Ganador: ${data.usuario}`);
    emitToRoom("anunciar_ganador", data);
  });

  // ==========================================================
  // 🧹 LIMPIAR LISTAS Y ESTADO
  // ==========================================================
  socket.on("limpiar_listas", (data) => {
    console.log(`🧹 [${data.streamerId}] Limpiando listas.`);
    const state = getStreamerState(data.streamerId);
    state.participantes = [];
    emitToRoom("limpiar_listas_clientes", data);
  });

  // ==========================================================
  // 🔴 DESCONECTAR
  // ==========================================================
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
