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
    "otro_usuario_autorizado" 
];

const subastas = {};
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
            socket.streamerId = streamerId; // 🛑 CRÍTICO: Guardar el ID aquí
            
            // 3. Log
            const emoji = '🔗';
            console.log(`${emoji} [${streamerId}] Cliente unido a la sala.`);

            // ⚠️ Inicializar subasta si es la primera vez que se conecta un cliente con este ID
            if (!subastas[streamerId]) {
                subastas[streamerId] = {
                    participantes: [],
                    tiempoActual: 0,
                    subastaActiva: false,
                    tiempoSnipeConfig: 30, // Valor por defecto
                    snipeActivado: true      // Valor por defecto
                };
            }
            
            // Sincronizar el estado (tiempo y lista) al unirse
            io.to(streamerId).emit('sync_participantes', subastas[streamerId].participantes);
            io.to(streamerId).emit('update_time', subastas[streamerId].tiempoActual);

        } else {
            // ID INVÁLIDO: Rechaza
            console.log(`❌ ERROR: ID Inválido (${streamerId}) intentó unirse. Rechazado.`);
            socket.emit('id_invalido', {
                streamerId: streamerId,
                message: "ID no autorizado. Por favor, comunícate con el administrador."
            });
        }
    }
});

    // ... (el resto de tus eventos)
    // 👆 FIN DEL BLOQUE 'join_room' 👆
  // Evento para iniciar la subasta (enviado desde el dashboard)
  socket.on("iniciar_subasta", (data) => {
    const streamerId = socket.streamerId;
    if (!streamerId) return;

    // ⚠️ CRÍTICO: Inicializar o actualizar la estructura global al inicio
    subastas[streamerId] = subastas[streamerId] || { participantes: [], tiempoActual: 0 };
    subastas[streamerId].subastaActiva = true;
    
    // 🛑 CRÍTICO: Guardar la configuración de Snipe que viene del Dashboard
    subastas[streamerId].tiempoSnipeConfig = parseInt(data.tiempoSnipeConfig) || 30; 
    subastas[streamerId].snipeActivado = data.snipeActivado === true;
    
    console.log(`🚀 [${streamerId}] Subasta solicitada. Config Snipe: ${subastas[streamerId].tiempoSnipeConfig}s`);
    
    // 📢 Enviar SÓLO a la sala correcta
    io.to(streamerId).emit("subasta_iniciada", data);
});

  // Evento de sincronización de tiempo desde el dashboard
  socket.on("sync_time", (time) => {
    const streamerId = socket.streamerId;
    if (!streamerId || !subastas[streamerId]) return;

    // Actualizamos el tiempo en la estructura del servidor (para mantener el estado)
    subastas[streamerId].tiempoActual = time; 

    // 📢 Enviar SÓLO a la sala correcta
    io.to(streamerId).emit("update_time", time);
});
// server.js
// ... (asegúrate de que tienes una estructura global para guardar los datos por streamer)
// const subastas = {}; 
// ...

socket.on('nuevo_regalo', (data) => {
    const streamerId = data.streamerId;
    
    // ⚠️ Verifica que la estructura existe (CRÍTICO)
    if (!subastas[streamerId]) {
        console.error(`ERROR: Subasta no inicializada para ID: ${streamerId}`);
        return;
    }
    
    const subasta = subastas[streamerId];
    const participantes = subasta.participantes;
    const cantidadDelRegalo = parseInt(data.cantidad) || 0; 

    // ===================================
    // 1. ACUMULACIÓN DE REGALO (Lógica del Servidor)
    // ===================================
    const existente = participantes.find(p => p.usuario === data.usuario);

    if (existente) {
        existente.cantidad = parseInt(existente.cantidad) + cantidadDelRegalo; 
        existente.avatar_url = data.avatar_url;
    } else {
        participantes.push({
            usuario: data.usuario,
            cantidad: cantidadDelRegalo, 
            regalo: data.regalo,
            avatar_url: data.avatar_url
        });
    }

    // 💡 Ordena la lista
    participantes.sort((a, b) => parseInt(b.cantidad) - parseInt(a.cantidad));


    // ===================================
    // 2. LÓGICA DE SNIPE (ELIMINADO) ❌
    // ===================================


    // ===================================
    // 3. SINCRONIZACIÓN (El Servidor envía el estado final) - CONSERVAR
    // ===================================
    io.to(streamerId).emit('sync_participantes', participantes); 
});
 socket.on("finalizar_subasta", () => {
    const streamerId = socket.streamerId;
    if (!streamerId || !subastas[streamerId]) return;

    subastas[streamerId].subastaActiva = false; // Desactivamos la subasta en el servidor

    console.log(`⏹️ [${streamerId}] Subasta finalizada.`);
    // 📢 Enviar SÓLO a la sala correcta
    io.to(streamerId).emit("subasta_finalizada");
});

// Evento para activar la alerta visual de Snipe
socket.on("activar_alerta_snipe_visual", () => {
    const streamerId = socket.streamerId;
    if (!streamerId) return;

    console.log(`⚡ Señal de ALERTA SNIPE ACTIVO recibida. Reenviando a sala ${streamerId}.`);
    // 📢 Enviar SÓLO a la sala correcta
    io.to(streamerId).emit("activar_alerta_snipe_visual");
});

// 👑 cuando el Dashboard elija un ganador
socket.on("anunciar_ganador", (ganador) => {
    const streamerId = socket.streamerId;
    if (!streamerId) return;

    console.log(`🏆 [${streamerId}] Anunciando ganador:`, ganador);
    // 📢 Enviar SÓLO a la sala correcta
    io.to(streamerId).emit("anunciar_ganador", ganador);
});

// Evento para limpiar las listas y resetear el estado
socket.on("limpiar_listas", () => {
    const streamerId = socket.streamerId;
    if (!streamerId || !subastas[streamerId]) return;

    // 1. Limpiar en el servidor
    subastas[streamerId].participantes = [];
    subastas[streamerId].subastaActiva = false;
    subastas[streamerId].tiempoActual = 0;

    console.log(`🧹 [${streamerId}] Solicitud para limpiar listas.`);
    // 📢 Avisa a SÓLO los clientes de esta sala que limpien
    io.to(streamerId).emit("limpiar_listas_clientes");
});
    // 👆 FIN DEL BLOQUE NUEVO 👆
}); // <-- CIERRE CORRECTO FINAL del io.on("connection")
// ===============================
// 🚀 INICIAR SERVIDOR
// ===============================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});



