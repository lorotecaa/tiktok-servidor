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

// ===========================================
// 📦 CONTROL DE SALAS (AISLAMIENTO DE DATOS) <--- ¡NUEVO BLOQUE CRÍTICO!
// ===========================================
// Variable global que contendrá los datos de CADA sala (streamerId)
const salas = {}; 
// ===========================================

// ===============================
// 🌐 CONFIGURACIÓN EXPRESS
// ===============================
// ... (Tus configuraciones Express se mantienen sin cambios) ...

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
const VALID_STREAMER_IDS = [
    "larahoenen",  
    "lorotecayt",   
    "otro_usuario_autorizado" 
];

io.on("connection", (socket) => { 
    console.log("🟢 Cliente conectado:", socket.id);

    // 1. EVENTO JOIN_ROOM (CORREGIDO Y COMPLETO)
    socket.on("join_room", (data) => { 
        if (!data || !data.streamerId) return; 
        
        const streamerId = data.streamerId;
        const tiktokUser = data.tiktokUser || "Cliente"; 

        // 2. VERIFICACIÓN DE LA LISTA BLANCA
        if (VALID_STREAMER_IDS.includes(streamerId)) {
            // ID VÁLIDO: Permite la conexión y une a la sala
            socket.join(streamerId);
            
            // 3. Log
            const emoji = '🔗';
            console.log(`${emoji} [${streamerId}] Cliente ${tiktokUser} unido a la sala.`);

            // 4. Inicializar la sala si no existe y acceder a ella
            if (!salas[streamerId]) {
                salas[streamerId] = {
                    participantes: [],
                    tiempoActual: 0,
                    subastaActiva: false
                };
                console.log(`Sala ${streamerId} inicializada.`);
            }

            const sala = salas[streamerId];

            // 5. Enviar el estado ACTUAL de la sala al cliente que se acaba de unir
            socket.emit("update_participants", sala.participantes);
            socket.emit("update_time", sala.tiempoActual);
            socket.emit("update_subasta_status", sala.subastaActiva);

        } else {
            // ID INVÁLIDO: Rechaza
            console.log(`❌ ERROR: ID Inválido (${streamerId}) intentó unirse. Rechazado.`);
            socket.emit('id_invalido', {
                streamerId: streamerId,
                message: "ID no autorizado. Por favor, comunícate con el administrador."
            });
        }
    });

    // 2. EVENTO INICIAR_SUBASTA (MODIFICADO)
    socket.on("iniciar_subasta", (data) => {
        const { streamerId, initialTime } = data; // Esperamos el streamerId y el tiempo inicial
        const sala = salas[streamerId];

        if (sala) {
            console.log(`🚀 [${streamerId}] Cliente solicitando inicio de subasta.`);
            sala.subastaActiva = true;
            sala.tiempoActual = initialTime; // Almacenamos el tiempo inicial
            
            // Emitimos solo a la sala específica
            io.to(streamerId).emit("subasta_iniciada", data);
            io.to(streamerId).emit("update_subasta_status", true); 
        }
    });

    // 3. EVENTO SYNC_TIME (MODIFICADO)
    socket.on("sync_time", ({ time, streamerId }) => { // Esperamos un objeto con 'time' y 'streamerId'
        const sala = salas[streamerId];
        if (sala) {
            sala.tiempoActual = time; // Guardamos el tiempo en la sala
            // Reenviamos solo a otros clientes en la misma sala (excluyendo el emisor/dashboard)
            socket.to(streamerId).emit("update_time", time); 
        }
    });

    // 4. EVENTO FINALIZAR_SUBASTA (MODIFICADO)
    socket.on("finalizar_subasta", ({ streamerId }) => { // Esperamos un objeto con 'streamerId'
        const sala = salas[streamerId];
        if (sala) {
            console.log(`⏹️ [${streamerId}] Subasta finalizada.`);
            sala.subastaActiva = false;
            // Emitimos solo a la sala específica
            io.to(streamerId).emit("subasta_finalizada");
            io.to(streamerId).emit("update_subasta_status", false); 
        }
    });
    
    // 5. EVENTO ACTIVAR_ALERTA_SNIPE_VISUAL (MODIFICADO)
    socket.on("activar_alerta_snipe_visual", ({ streamerId }) => { // Esperamos un objeto con 'streamerId'
        console.log(`⚡ [${streamerId}] Señal de ALERTA SNIPE ACTIVO recibida. Reenviando a clientes.`);
        // Emitimos solo a la sala específica
        io.to(streamerId).emit("activar_alerta_snipe_visual");
    });

    // 6. EVENTO NUEVO_REGALO (MODIFICADO Y CON LÓGICA DE ACUMULACIÓN) <--- ¡SOLUCIÓN DE BUG DE TIKFINITY!
    socket.on("nuevo_regalo", (giftData) => {
        const { usuario, cantidad, regalo, avatar_url, streamerId } = giftData;

        // 1. Validar que la sala exista y esté activa
        const sala = salas[streamerId];
        if (!sala || !sala.subastaActiva) {
            console.log(`🎁 Regalo ignorado: Subasta inactiva o sala ${streamerId} no existe.`);
            return;
        }
        
        const participantes = sala.participantes; // Lista de participantes de ESTA sala
        
        // 2. Lógica de Acumulación
        const existingIndex = participantes.findIndex(p => p.usuario === usuario);
        let nuevoTotal;

        if (existingIndex !== -1) {
            // Usuario existente: ACUMULAR en la lista de ESTA sala
            participantes[existingIndex].cantidad += cantidad;
            nuevoTotal = participantes[existingIndex].cantidad;
        } else {
            // Usuario nuevo: AÑADIR a la lista de ESTA sala
            participantes.push({ usuario, cantidad, regalo, avatar_url });
            nuevoTotal = cantidad;
        }
        
        // 3. Reemitir la lista ACTUALIZADA (solo a los clientes en esta sala)
        io.to(streamerId).emit("update_participants", participantes);

        // 4. Reenviar el regalo individual para efectos visuales (solo a clientes en esta sala)
        io.to(streamerId).emit("new_gift", { 
            usuario: usuario, 
            cantidad: cantidad, 
            total: nuevoTotal, 
            regalo: regalo,
            avatar_url: avatar_url
        });
    });

    // 7. EVENTO ANUNCIAR_GANADOR (MODIFICADO)
    socket.on("anunciar_ganador", (ganador) => {
        const { streamerId } = ganador; // El objeto 'ganador' debe incluir el streamerId
        if (streamerId) {
            console.log(`🏆 [${streamerId}] Anunciando ganador:`, ganador.usuario);
            // Emitimos solo a la sala específica
            io.to(streamerId).emit("anunciar_ganador", ganador); 
        }
    });

    // 8. EVENTO LIMPIAR_LISTAS (MODIFICADO Y CRÍTICO)
    socket.on("limpiar_listas", ({ streamerId }) => { // Esperamos un objeto con 'streamerId'
        const sala = salas[streamerId];
        if (sala) {
            // 1. Limpiar la lista de participantes de ESTA sala
            sala.participantes = []; 
            console.log(`🧹 [${streamerId}] Lista de participantes limpiada.`);
            
            // 2. Notificar a los clientes de ESTA sala que limpien (y actualizar la tabla)
            io.to(streamerId).emit("limpiar_listas_clientes");
            io.to(streamerId).emit("update_participants", sala.participantes);
        }
    });
}); // <-- CIERRE CORRECTO FINAL del io.on("connection")

// ===============================
// 🚀 INICIAR SERVIDOR
// ===============================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});

