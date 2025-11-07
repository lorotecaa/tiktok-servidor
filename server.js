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
const io = new Server(server);

// Puerto asignado por Render o localmente (por defecto: 10000)
const PORT = process.env.PORT || 10000;

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
// ⚡ CONFIGURACIÓN SOCKET.IO
// ===============================
io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado:", socket.id);
// 👇 AQUÍ DEBES AGREGAR EL BLOQUE 'join_room' 👇
    socket.on("join_room", (data) => { 
        if (data && data.streamerId) { 
            const streamerId = data.streamerId;
            // Obtiene el nombre de usuario para el log
            const tiktokUser = data.tiktokUser || "Desconocido"; 
            
            socket.join(streamerId);
            // Log modificado para mostrar el nombre
            const emoji = '🔗'; // Este emoji se verá azul/gris en Render
        
        // El log final: 🔗 [@yosoytoniu] Cliente unido a la sala.
        console.log(`${emoji} [${streamerId}] Cliente unido a la sala.`);
        }
    });
    // 👆 FIN DEL BLOQUE 'join_room' 👆
  // Evento para iniciar la subasta (enviado desde el dashboard)
  socket.on("iniciar_subasta", (data) => {
    console.log("🚀 Cliente solicitando inicio de subasta.");
    io.emit("subasta_iniciada", data);
  });

  // Evento de sincronización de tiempo desde el dashboard
  socket.on("sync_time", (time) => {
    socket.broadcast.emit("update_time", time);
  });

  // Evento cuando se finaliza la subasta
  socket.on("finalizar_subasta", () => {
    console.log("⏹️ Subasta finalizada.");
    io.emit("subasta_finalizada");
  });
  socket.on("activar_alerta_snipe_visual", () => {
    console.log("⚡ Señal de ALERTA SNIPE ACTIVO recibida. Reenviando a clientes.");
    io.emit("activar_alerta_snipe_visual");
});

  // 🆕 NUEVO: evento para reenviar regalos recibidos desde el dashboard
  socket.on("nuevo_regalo", (giftData) => {
    console.log("🎁 nuevo_regalo recibido:", giftData);
    io.emit("new_gift", giftData);
  });
// 👑 NUEVO → cuando el Dashboard elija un ganador
  socket.on("anunciar_ganador", (ganador) => {
    console.log("🏆 Anunciando ganador:", ganador);
    io.emit("anunciar_ganador", ganador); // 🔹 lo envía a todos los clientes (incluyendo el widget)
  });

  // 👇 AÑADE ESTE BLOQUE NUEVO 👇
    socket.on("limpiar_listas", () => {
        console.log("🧹 Solicitud para limpiar listas recibida desde el Dashboard.");
        io.emit("limpiar_listas_clientes"); // Avisa a TODOS los clientes que limpien
    });
    // 👆 FIN DEL BLOQUE NUEVO 👆
});

// ===============================
// 🚀 INICIAR SERVIDOR
// ===============================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});



