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
// 📦 CONTROL DE SALAS (AISLAMIENTO DE DATOS)
// ===========================================
// Variable global que contendrá los datos de CADA sala (streamerId)
const salas = {}; 
// ===========================================

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
const VALID_STREAMER_IDS = [
    "@yosoytoniu",  
    "lorotecayt",   
    "otro_usuario_autorizado",
    "flycare.sw" // Agregué el ID que usas en los ejemplos
];

io.on("connection", (socket) => { 
    console.log("🟢 Cliente conectado:", socket.id);

    // 1. EVENTO JOIN_ROOM (CORREGIDO Y COMPLETO)
    socket.on("join_room", (data) => { 
        if (!data || !data.streamerId) return; 
        
        const streamerId = data.streamerId;
        const tiktokUser = data.tiktokUser || "Cliente No Requerido"; // Nombre de cliente más descriptivo

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
                    subastaActiva: false,
                    snipeTime: 15 // Valor por defecto
                };
                console.log(`Sala ${streamerId} inicializada.`);
            }

            const sala = salas[streamerId];

            // 5. Enviar el estado ACTUAL de la sala al cliente que se acaba de unir
            // NOTA: Cambié "update_participants" por el nombre que hemos usado: "actualizar_participantes"
            socket.emit("actualizar_participantes", sala.participantes);
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

    // 2. EVENTO INICIAR_SUBASTA (CORREGIDO PARA EVITAR TypeError)
    socket.on("iniciar_subasta", (data) => {
        // ✅ CORRECCIÓN CRÍTICA: Desestructuración segura para evitar el crash (TypeError)
        const { streamerId, initialTime, snipeTime } = data || {}; 
        
        if (!streamerId) {
            console.error("🛑 Error: iniciar_subasta recibido sin streamerId.");
            return; // Detiene la ejecución si los datos son inválidos
        }

        const sala = salas[streamerId];

        if (sala) {
            console.log(`🚀 [${streamerId}] Cliente solicitando inicio de subasta. Tiempo: ${initialTime}s`);
            sala.subastaActiva = true;
            sala.tiempoActual = initialTime; // Almacenamos el tiempo inicial
            sala.snipeTime = snipeTime || sala.snipeTime; // Almacenamos el tiempo de snipe

            // Emitimos solo a la sala específica
            io.to(streamerId).emit("subasta_iniciada", {
                initialTime: sala.tiempoActual, 
                snipeTime: sala.snipeTime 
            });
            io.to(streamerId).emit("update_subasta_status", true); 
        }
    });

    // 3. EVENTO SYNC_TIME (Manejo de seguridad en desestructuración)
    socket.on("sync_time", (data) => { 
        const { time, streamerId } = data || {};
        if (!streamerId) return; // Validación simple

        const sala = salas[streamerId];
        if (sala) {
            sala.tiempoActual = time; // Guardamos el tiempo en la sala
            // Reenviamos solo a otros clientes en la misma sala (excluyendo el emisor/dashboard)
            socket.to(streamerId).emit("update_time", time); 
        }
    });

    // 4. EVENTO FINALIZAR_SUBASTA (Manejo de seguridad en desestructuración)
    socket.on("finalizar_subasta", (data) => {
        const { streamerId } = data || {};
        if (!streamerId) return; // Validación simple

        const sala = salas[streamerId];
        if (sala) {
            console.log(`⏹️ [${streamerId}] Subasta finalizada.`);
            sala.subastaActiva = false;
            // Emitimos solo a la sala específica
            io.to(streamerId).emit("subasta_finalizada");
            io.to(streamerId).emit("update_subasta_status", false); 
        }
    });
    
    // 5. EVENTO ACTIVAR_ALERTA_SNIPE_VISUAL (Manejo de seguridad en desestructuración)
    socket.on("activar_alerta_snipe_visual", (data) => {
        const { streamerId } = data || {};
        if (!streamerId) return; // Validación simple

        console.log(`⚡ [${streamerId}] Señal de ALERTA SNIPE ACTIVO recibida. Reenviando a clientes.`);
        // Emitimos solo a la sala específica
        io.to(streamerId).emit("activar_alerta_snipe_visual");
    });

    // 6. EVENTO NUEVO_REGALO (Manejo de seguridad en desestructuración)
    socket.on("nuevo_regalo", (giftData) => {
        // Desestructuración segura
        const { usuario, cantidad, regalo, avatar_url, streamerId } = giftData || {};

        if (!streamerId || !usuario || !cantidad) {
            console.error("🛑 Error: nuevo_regalo recibido con datos incompletos.");
            return;
        }

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
        // NOTA: Usando "actualizar_participantes" como acordamos
        io.to(streamerId).emit("actualizar_participantes", participantes);

        // 4. Reenviar el regalo individual para efectos visuales (solo a clientes en esta sala)
        io.to(streamerId).emit("new_gift", { 
            usuario: usuario, 
            cantidad: cantidad, 
            total: nuevoTotal, 
            regalo: regalo,
            avatar_url: avatar_url
        });
    });

    // 7. EVENTO ANUNCIAR_GANADOR (Manejo de seguridad en desestructuración)
    socket.on("anunciar_ganador", (ganador) => {
        const { streamerId } = ganador || {}; // El objeto 'ganador' debe incluir el streamerId
        if (streamerId) {
            console.log(`🏆 [${streamerId}] Anunciando ganador:`, ganador.usuario);
            // Emitimos solo a la sala específica
            io.to(streamerId).emit("anunciar_ganador", ganador); 
        }
    });

    // 8. EVENTO LIMPIAR_LISTAS (Manejo de seguridad en desestructuración)
    socket.on("limpiar_listas", (data) => {
        const { streamerId } = data || {};
        if (!streamerId) return; // Validación simple

        const sala = salas[streamerId];
        if (sala) {
            // 1. Limpiar la lista de participantes de ESTA sala
            sala.participantes = []; 
            console.log(`🧹 [${streamerId}] Lista de participantes limpiada.`);
            
            // 2. Notificar a los clientes de ESTA sala que limpien (y actualizar la tabla)
            io.to(streamerId).emit("limpiar_listas_clientes");
            // NOTA: Usando "actualizar_participantes" como acordamos
            io.to(streamerId).emit("actualizar_participantes", sala.participantes); 
        }
    });
    
    // 9. Manejo de desconexión
    socket.on("disconnect", () => {
        console.log("🔴 Cliente desconectado:", socket.id);
        // Si tienes lógica para limpiar salas sin clientes, iría aquí.
    });
}); // <-- CIERRE CORRECTO FINAL del io.on("connection")

// ===============================
// 🚀 INICIAR SERVIDOR
// ===============================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
