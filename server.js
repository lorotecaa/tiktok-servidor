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
const VALID_STREAMER_IDS = [
    "@yosoytoniu",  
    "lorotecayt",   
    "otro_usuario_autorizado" 
];

const subastas = {};
// INICIO DEL BLOQUE io.on("connection") - TODOS LOS SOCKET.ON DEBEN IR AQUÍ DENTRO
io.on("connection", (socket) => { 
    console.log("🟢 Cliente conectado:", socket.id);

    // 1. EVENTO JOIN_ROOM (Usado por el Widget)
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
                    snipeActivado: true      // Valor por defecto
                };
            }
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

  // 2. EVENTO INICIAR_SUBASTA (Usado por el Dashboard)
  socket.on("iniciar_subasta", (data) => {
    // 🔑 CLAVE 1: Leer el ID de los datos
    const streamerId = data.streamerId;
    
    if (!streamerId) return;

    // 🔑 CLAVE 2: Unir el socket a la sala (Dashboard se une aquí)
    socket.join(streamerId); 
    socket.streamerId = streamerId; // Asignar el ID al socket
    
    // ⚠️ CRÍTICO: Inicializar o actualizar la estructura global al inicio
    subastas[streamerId] = subastas[streamerId] || { participantes: [], tiempoActual: 0 };
    
    // 🧹 CRÍTICO: Limpiar la lista de participantes (Solución TikFinity Bug)
    subastas[streamerId].participantes = [];
    subastas[streamerId].subastaActiva = true;

    // 🛑 CRÍTICO: Guardar la configuración de Snipe que viene del Dashboard
    subastas[streamerId].tiempoSnipeConfig = parseInt(data.tiempoSnipe) || 30; // Usar data.tiempoSnipe
    subastas[streamerId].snipeActivado = data.snipeActivado === true; 
    
    console.log(`🚀 [${streamerId}] Subasta solicitada. Config Snipe: ${subastas[streamerId].tiempoSnipeConfig}s`);
    
    // 📢 Enviar SÓLO a la sala correcta (se usa para que el Widget sepa que la subasta inició)
    io.to(streamerId).emit("subasta_iniciada", data);
});

// 3. EVENTO ACTUALIZAR_TIEMPO (Sincronización del temporizador)
socket.on('actualizar_tiempo', (data) => {
    const streamerId = data.streamerId; // El Dashboard ahora envía el ID en 'data'
    const tiempo = data.tiempo;

    if (!streamerId || !subastas[streamerId]) return;

    // Actualizamos el tiempo en la estructura del servidor (para mantener el estado)
    subastas[streamerId].tiempoActual = tiempo; 

    // 🔑 CLAVE: Transmitir a todos en la sala EXCEPTO al Dashboard emisor
    socket.to(streamerId).emit('actualizar_tiempo', data);
});

// 4. EVENTO NUEVO_REGALO (Lógica de acumulación y Snipe)
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
    // 2. LÓGICA DE SNIPE
    // ===================================
    if (subasta.subastaActiva && subasta.snipeActivado && subasta.tiempoActual <= subasta.tiempoSnipeConfig) {
        
        const tiempoReset = subasta.tiempoSnipeConfig;
        
        // 🔑 CLAVE: Reiniciar el tiempo en el servidor
        subasta.tiempoActual = tiempoReset;
        
        console.log(`⚡ [${streamerId}] ¡SNIPE! Regalo de ${data.usuario}. Tiempo reiniciado a ${tiempoReset}s.`);

        // 📢 Notificar a todos, incluyendo al Dashboard, para que reinicie su timer
        io.to(streamerId).emit("tiempo_reiniciado_por_snipe", { 
            tiempo: tiempoReset, 
            streamerId: streamerId 
        });
    }

    // ===================================
    // 3. SINCRONIZACIÓN (El Servidor envía el estado final)
    // ===================================
    io.to(streamerId).emit('sync_participantes', participantes);
});
// 5. EVENTO FINALIZAR_SUBASTA
 socket.on("finalizar_subasta", () => {
    const streamerId = socket.streamerId;
    if (!streamerId || !subastas[streamerId]) return;

    subastas[streamerId].subastaActiva = false; // Desactivamos la subasta en el servidor

    console.log(`⏹️ [${streamerId}] Subasta finalizada.`);
    // 📢 Enviar SÓLO a la sala correcta
    io.to(streamerId).emit("subasta_finalizada");
});

// 6. EVENTO ACTIVAR_ALERTA_SNIPE_VISUAL
socket.on("activar_alerta_snipe_visual", () => {
    const streamerId = socket.streamerId;
    if (!streamerId) return;

    console.log(`⚡ Señal de ALERTA SNIPE ACTIVO recibida. Reenviando a sala ${streamerId}.`);
    // 📢 Enviar SÓLO a la sala correcta
    io.to(streamerId).emit("activar_alerta_snipe_visual");
});

// 7. EVENTO ANUNCIAR_GANADOR
socket.on("anunciar_ganador", (ganador) => {
    const streamerId = socket.streamerId;
    if (!streamerId) return;

    console.log(`🏆 [${streamerId}] Anunciando ganador:`, ganador);
    // 📢 Enviar SÓLO a la sala correcta
    io.to(streamerId).emit("anunciar_ganador", ganador);
});

// 8. EVENTO LIMPIAR_LISTAS
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

}); // <-- CIERRE FINAL y CORRECTO del io.on("connection")
// ===============================
// 🚀 INICIAR SERVIDOR
// ===============================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
