// ===============================
// ⚡ CONFIGURACIÓN SOCKET.IO
// ===============================
io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado:", socket.id);

  // 🔄 Sincronizar tiempo global
  let tiempoGlobal = 0;

  // Escucha cuando un usuario inicia la subasta
  socket.on("iniciar-subasta", (data) => {
    console.log("🚀 Subasta iniciada:", data);
    io.emit("subasta-iniciada", data);
  });

  // Escucha actualizaciones del tiempo
  socket.on("actualizar-tiempo", (tiempo) => {
    tiempoGlobal = tiempo;
    io.sockets.emit("tiempo-actualizado", tiempoGlobal);
  });

  // Cuando un nuevo widget se conecta, se sincroniza
  socket.emit("tiempo-actualizado", tiempoGlobal);

  // Escucha cuando se finaliza la subasta
  socket.on("finalizar-subasta", () => {
    tiempoGlobal = 0;
    io.sockets.emit("subasta-finalizada");
  });

  socket.on("disconnect", () => {
    console.log("🔴 Cliente desconectado:", socket.id);
  });
});
