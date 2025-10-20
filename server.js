// ===============================
// 📦 SERVIDOR PRINCIPAL TIKTOK
// ===============================

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const cors = require("cors");

// Crear aplicación Express y servidor HTTP
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Puerto asignado por Render o localmente 10000
const PORT = process.env.PORT || 10000;

// ===============================
// 🌐 CONFIGURACIÓN EXPRESS
// ===============================
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===============================
// ⚡ CONFIGURACIÓN SOCKET.IO
// ===============================
io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado:", socket.id);

  // Cuando el panel (Electron) inicia la subasta
  socket.on("iniciar_subasta", (data) => {
    console.log("🚀 Subasta iniciada");
    io.emit("subasta_iniciada", data);
  });

  // Cuando el panel actualiza el tiempo (dashboard emite)
  socket.on("sync_time", (tiempoActual) => {
    // Enviar a todos los widgets conectados
    io.emit("update_time", tiempoActual);
  });

  // Cuando el panel finaliza la subasta
  socket.on("finalizar_subasta", () => {
    console.log("🏁 Subasta finalizada");
    io.emit("subasta_finalizada");
  });

  socket.on("disconnect", () => {
    console.log("🔴 Cliente desconectado:", socket.id);
  });
});

// ===============================
// 🚀 INICIAR SERVIDOR
// ===============================
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
