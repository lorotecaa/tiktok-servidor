<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Subasta en Vivo Widget</title>
    <style>
        /* ESTILOS BASE Y CONTROL */
        body { font-family: 'Arial', sans-serif; background: #111; color: white; margin:0; padding:0; display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; }
        
        /* Contenedor principal del Dashboard */
        #dashboard-container { display: flex; flex-wrap: wrap; justify-content: center; width: 100%; max-width: 1200px; padding: 20px; }
        
        /* Oculta los elementos no deseados en el modo widget */
        .widget-mode #dashboard-container { 
            /* Para que ocupe todo el espacio de OBS/TikTok Studio */
            display: block !important;
            max-width: 100% !important;
            width: 100% !important;
            padding: 0 !important;
        }

        .widget-mode #controles,
        .widget-mode #ganadores,
        .widget-mode #logDonaciones,
        .widget-mode h1 {
            display: none !important;
        }

        /* WIDGET: Contenedor Principal (Temporizador + Lista) */
        .widget-mode #widget-overlay {
            width: 350px; /* Ancho fijo para el widget */
            margin: 0 auto;
            position: relative;
        }
        
        /* WIDGET: Estilo del Temporizador (Parte Superior) */
        .widget-mode #tiempoBox {
            background: #008000; /* Fondo del temporizador, como el ejemplo */
            width: 100%;
            height: auto;
            border-radius: 10px 10px 0 0;
            padding: 10px 0;
        }

        .widget-mode #tiempoRestante {
            font-size: 3em;
            font-weight: bold;
            color: #00FF00; /* Color verde brillante */
        }
        .widget-mode #tiempoBox h2 { display: none; }
        .widget-mode #subtext { 
            font-size: 14px; 
            color: #ccc; 
            margin-top: 5px;
        }

        /* WIDGET: Estilo de los Participantes (Tabla de Posiciones) */
        .widget-mode #participantes {
            background: #1c2b3e; /* Fondo oscuro de la lista, como el ejemplo */
            width: 100%;
            height: auto;
            min-height: 200px;
            padding: 10px;
            margin: 0;
            border-radius: 0 0 10px 10px;
        }

        .widget-mode #listaParticipantes {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .widget-mode #listaParticipantes li {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #34495e; /* Fondo de cada item de la lista */
            margin-bottom: 5px;
            padding: 10px;
            border-radius: 8px;
            font-size: 18px;
            font-weight: bold;
        }
        .widget-mode #listaParticipantes li span {
            color: #ffd700; /* Color de la moneda */
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div id="dashboard-container">
        <h1>⚡ Subasta en Vivo ⚡</h1>

        <div id="ganadores"><h2>🏆 Ganadores de Rondas</h2><ul id="listaGanadores"></ul></div>
        <div id="controles">
            <h2>🎮 Controles</h2>
            <label for="tiktokUser">👤 TikTok User:</label><br>
            <input type="text" id="tiktokUser" placeholder="@usuario" style="width: 90%; margin-bottom: 15px; padding: 5px;"><br>
            <div class="subcuadro">
                <label for="tiempo">⏱ Tiempo inicial (segundos):</label><br>
                <input type="number" id="tiempo" value="200"><br><br>
                <button class="start" onclick="iniciar()">Iniciar</button>
                <button onclick="pausar()">Pausar</button>
                <button class="stop" onclick="finalizar()">Finalizar</button>
                <button onclick="restart()">Restart</button>
            </div>
        </div>
        <div id="logDonaciones"><strong>📝 Historial de Eventos:</strong></div>
        
        <div id="widget-overlay">
            <div id="tiempoBox">
                <h2>⏳ Tiempo Restante</h2>
                <div id="tiempoRestante" data-segundos="0">00:00</div>
                <div id="subtext">El desempate termina en</div>
            </div>

            <div id="participantes">
                <div id="participantes-header">
                     </div>
                <ul id="listaParticipantes">
                    </ul>
                <div class="totales" style="display:none;"><span id="totalParticipantes">0</span><span id="totalDiamantes">0</span></div>
            </div>
        </div>

    </div> <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
    <script>
        const socket = io("http://localhost:3000"); // Cambiar a tu URL de Render

        // ... (Tu código JavaScript para conexión, eventos y funciones) ...

        // Función para formatear el tiempo a MM:SS
        function formatTime(totalSeconds) {
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        // Modifica tu función actualizarParticipantesUI
        function actualizarParticipantesUI() {
            participantes.sort((a, b) => b.cantidad - a.sort);

            listaParticipantesEl.innerHTML = "";
            let totalDiamantes = 0;
            
            // Limitamos a los 5 primeros para que encaje bien en un widget
            const topN = participantes.slice(0, 5); 

            topN.forEach((p, index) => {
                const li = document.createElement("li");
                const rango = index + 1;
                li.innerHTML = `
                    <div style="font-size: 1.2em; color: #aaa;">${rango}</div>
                    <div style="flex-grow: 1; text-align: left; padding-left: 10px;">${p.usuario}</div>
                    <span style="color: gold;">${p.cantidad} 🪙</span>
                `;
                listaParticipantesEl.appendChild(li);
                totalDiamantes += p.cantidad;
            });
            // El resto de la UI (totales) se mantiene para el modo dashboard
            totalParticipantesEl.textContent = participantes.length;
            totalDiamantesEl.textContent = totalDiamantes;
        }

        // Modifica tu función iniciar para que llame a la función de formateo
        function iniciar() {
            // ... (el código de inicialización y socket.emit("iniciar_subasta")) ...
            
            // ... (la inicialización del temporizador)
            tiempoActual = parseInt(document.getElementById("tiempo").value);
            // El elemento ya no tiene solo el texto, sino un atributo
            tiempoRestanteEl.setAttribute('data-segundos', tiempoActual); 
            tiempoRestanteEl.textContent = formatTime(tiempoActual);
            
            if (intervalo) clearInterval(intervalo);
            intervalo = setInterval(() => {
                if (tiempoActual > 0) {
                    tiempoActual--;
                    tiempoRestanteEl.setAttribute('data-segundos', tiempoActual);
                    tiempoRestanteEl.textContent = formatTime(tiempoActual); // Formatea aquí
                } else {
                    terminarTiempo();
                }
            }, 1000);
        }

        // ... (Tus otras funciones como finalizar, terminarTiempo, etc., se mantienen igual) ...

        // --- LÓGICA DE DETECCIÓN DE WIDGET ---
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('mode') === 'widget') {
            document.body.classList.add('widget-mode');
            // Aseguramos que el widget se conecte y active el conteo
            socket.emit("iniciar_subasta"); 
            // Ocultamos elementos innecesarios al arrancar
            document.querySelector('#subtext').innerText = 'El desempate termina en';
        }
        
    </script>
</body>
</html>