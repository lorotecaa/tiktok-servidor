// ===============================
// 📦 SERVIDOR PRINCIPAL TIKTOK
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

// Puerto asignado por Render o localmente 10000
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

  // Escucha cuando un usuario inicia la subasta
  socket.on("iniciar-subasta", (data) => {
    console.log("🚀 Subasta iniciada con datos:", data);
    io.emit("subasta-iniciada", data); // Enviar a todos los clientes
  });

  // Escucha actualizaciones del tiempo
  socket.on("actualizar-tiempo", (tiempo) => {
    io.emit("tiempo-actualizado", tiempo); // Reenviar tiempo a todos
  });

  // Escucha cuando se finaliza la subasta
  socket.on("finalizar-subasta", () => {
    io.emit("subasta-finalizada"); // Avisar a todos
  });

  // Escucha desconexión del cliente
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
