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
// 1. 🔑 DEFINE TU LISTA BLANCA DE IDS AQUÍ
// **IMPORTANTE: Debes cambiar estos valores por los IDs que autorices.**
const VALID_STREAMER_IDS = [
    "@yosoytoniu",  
    "lorotecayt", 
    "andersson_4k",
    "otro_usuario_autorizado" 
];
// INICIO DEL BLOQUE io.on("connection") - TODOS LOS SOCKET.ON DEBEN IR AQUÍ DENTRO
io.on("connection", (socket) => { 
    console.log("🟢 Cliente conectado:", socket.id);

    // 1. EVENTO JOIN_ROOM
    socket.on("join_room", (data) => { 
        if (data && data.streamerId) { 
            const streamerId = data.streamerId;
            const tiktokUser = data.tiktokUser || "Desconocido"; 
            
            // 2. VERIFICACIÓN DE LA LISTA BLANCA
            if (VALID_STREAMER_IDS.includes(streamerId)) {
                // ID VÁLIDO: Permite la conexión a la sala
                socket.join(streamerId);
                
                // 3. Log con el emoji que te gustó
                const emoji = '🔗';
                console.log(`${emoji} [${streamerId}] Cliente unido a la sala.`);
            } else {
                // ID INVÁLIDO: Rechaza y notifica al cliente
                console.log(`❌ ERROR: ID Inválido (${streamerId}) intentó unirse. Rechazado.`);
                
                // 4. Envía el evento de error al cliente para mostrar la alerta
                socket.emit('id_invalido', {
                    streamerId: streamerId,
                    message: "ID no autorizado. Por favor, comunícate con el administrador."
                });
            }
        }
    }); // <--- Cierre del socket.on("join_room")

    // ... (el resto de tus eventos)
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
}); // <-- CIERRE CORRECTO FINAL del io.on("connection")
// ===============================
// 🚀 INICIAR SERVIDOR
// ===============================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});






