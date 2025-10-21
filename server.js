// ===============================
// 📦 SERVIDOR PRINCIPAL TIKTOK (CORREGIDO Y SIN ERRORES)
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

  // Evento para iniciar la subasta (enviado desde el dashboard)
  socket.on("iniciar_subasta", (data) => {
    console.log("🚀 Cliente solicitando inicio de subasta.");
    io.emit("subasta_iniciada", data);
  });

  // Evento de sincronización de tiempo desde el dashboard
  socket.on("sync_time", (time) => {
    // Reenviamos el tiempo a todos los widgets conectados
    socket.broadcast.emit("update_time", time);
  });

  // Evento cuando se finaliza la subasta
  socket.on("finalizar_subasta", () => {
    console.log("⏹️ Subasta finalizada.");
    io.emit("subasta_finalizada");
  });

  // Detectar desconexión
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


