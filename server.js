// ===============================
// 📦 SERVIDOR PRINCIPAL TIKTOK (Corregido)
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

  // CORREGIDO: (Antes 'iniciar-subasta')
 // Escucha cuando un usuario (Dashboard o Widget) se conecta e inicia
  socket.on("iniciar_subasta", (data) => {
    console.log("🚀 Cliente solicitando inicio de subasta.");
    // Opcional: Reenviar si es necesario, aunque el cliente no escucha 'subasta_iniciada'
    io.emit("subasta_iniciada", data); 
  });

  // CORREGIDO: (Antes 'actualizar-tiempo')
 // Recibe la hora SÓLO del Dashboard Maestro
  socket.on('sync_time', (time) => {
    // CORREGIDO: (Antes 'tiempo-actualizado')
    // Reenvía la hora a TODOS los clientes (incluyendo los Widgets Esclavos)
    io.emit('update_time', time); 
  });

  // CORREGIDO: (Antes 'finalizar-subasta')
 // Escucha cuando el Dashboard finaliza la subasta
  socket.on("finalizar_subasta", () => {
    // Avisa a todos (El cliente actual no usa este evento, pero es buena práctica)
    io.emit("subasta_finalizada"); 
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
