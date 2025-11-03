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

  // Evento para iniciar la subasta (enviado desde el dashboard)
  socket.on("iniciar_subasta", (data) => {
    console.log("🚀 Cliente solicitando inicio de subasta.");
    io.emit("subasta_iniciada", data);
  });

  socket.on("sync_time", (tiempo, isSnipeConfigurado) => {
    
    // ... Código para obtener TIEMPO_SNIPE_UMBRAL (mantener en 15) ...
    const TIEMPO_SNIPE_UMBRAL = 15; 

    // 🚨 CORRECCIÓN CRÍTICA: La alerta solo se activa si el tiempo es ESTRICTAMENTE MENOR al umbral (14s o menos)
    // Esto asegura que al reiniciar a 15s, la alerta esté en FALSE.
    const isSnipeActive = isSnipeConfigurado && (tiempo < TIEMPO_SNIPE_UMBRAL); // <-- ¡Cambio de <= a < !

    // ... Reenviar con io.emit ...
    io.emit('update_time', tiempo, isSnipeActive); 
});

  // Evento cuando se finaliza la subasta
  socket.on("finalizar_subasta", () => {
    console.log("⏹️ Subasta finalizada.");
    io.emit("subasta_finalizada");
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
  // 🧹 Limpiar listas
  socket.on("limpiar_listas", () => {
    console.log("🧹 Solicitud para limpiar listas recibida desde el Dashboard.");
    io.emit("limpiar_listas_clientes");
  });
  // Detectar desconexión
  socket.on("disconnect", () => {
    console.log("🔴 Cliente desconectado:", socket.id);
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



