# Rocket Analyzer

Web en español para analizar archivos `.replay` de Rocket League. Vista compacta para PC **1920 × 1080**: todos los jugadores, posiciones con control temporal, mapas de calor y estadísticas. Eventos de posibles errores, boost y demoliciones en pestañas; sin consejos automáticos.

## Requisitos

- **Windows x64 o Linux x64 con Node.js 22.18 o superior** (o Docker en Linux x64). En Linux el análisis usa solo rrrocket; el lector antiguo `@kant/node-boxcars` 0.3.1 únicamente existe para Windows x64. No funciona en macOS ni en ARM.
- npm incluido con Node.js.
- Repeticiones de fútbol compatibles con el lector boxcars. Para las versiones recientes se utiliza **rrrocket 0.11.8 / boxcars 0.13.0**, instalado localmente con el comando siguiente.

## Puesta en marcha

Desde esta carpeta, ejecuta tú:

```powershell
npm.cmd install
npm.cmd run parser:setup
npm.cmd run dev
```

Abre <http://127.0.0.1:3000>. No hace falta configurar tokens, claves de API ni servicios externos. La instalación debe incluir las dependencias opcionales: contienen el binario nativo del lector. No uses `--omit=optional`.

`parser:setup` descarga el binario oficial de [rrrocket 0.11.8](https://github.com/nickbabcock/rrrocket/releases/tag/v0.11.8) para Windows x64 o Linux x64, verifica su SHA-256 y lo guarda en `.local/rrrocket/` (`rrrocket.exe` o `rrrocket`), fuera de Git. Requiere conexión únicamente para instalarlo, no para analizar partidas. Usa el instalador Node también si PowerShell bloquea los archivos `.ps1`. Instálalo antes de compilar para incluirlo en la distribución de producción.

Para comprobar tipos y ejecutar las pruebas:

```powershell
npm run typecheck
npm test
```

Para producción local:

```powershell
npm run build
npm start
```

La aplicación arranca vacía, sin partidos ficticios. Arrastra una repetición o pulsa **Subir replay**, arriba a la derecha. Una pantalla de carga bloquea las interacciones mientras se reciben y preparan los datos. Si falla la carga, se muestra el error y se conservan los datos anteriores.

## Despliegue en un servidor Linux con Docker

Requisitos: servidor Linux x64 con Docker y Docker Compose, un dominio con un registro DNS A/AAAA hacia la IP del servidor y los puertos 80 y 443 abiertos. [Caddy](https://caddyserver.com) obtiene y renueva el certificado HTTPS automáticamente.

```bash
git clone https://github.com/Riekii/RocketAnalyzer.git rocketanalyzer   # o copia la carpeta
cd rocketanalyzer
cp .env.example .env        # edita DOMAIN con tu dominio
docker compose up -d --build
docker compose logs -f      # comprobar el arranque
```

La imagen descarga rrrocket para Linux y verifica su SHA-256 durante la compilación. La aplicación escucha solo en `127.0.0.1:3000` del servidor, y Caddy publica el sitio en `https://DOMAIN` con un límite de subida de 34 MB y 120 s de tiempo de espera. `PUBLIC_ORIGIN` (definido por `compose.yaml` a partir de `DOMAIN`) es necesario porque el proxy reenvía por HTTP: sin él, las subidas devuelven 403.

- **Actualizar:** `git pull` y `docker compose up -d --build`.
- **Contraseña:** descomenta `basic_auth` en `Caddyfile`, genera el hash con `docker compose run --rm caddy caddy hash-password` y ejecuta `docker compose restart caddy`.
- **Si ya usas Nginx en 80/443:** arranca solo `docker compose up -d --build app` y apunta Nginx a `http://127.0.0.1:3000` con `client_max_body_size 34m;` y `proxy_read_timeout 120s;`.

Se analiza una repetición a la vez por contenedor; las demás reciben 429 hasta que termine.

## Encontrar tus repeticiones

Guarda una repetición desde Rocket League. En Windows, normalmente se encuentra en:

```text
Documentos\My Games\Rocket League\TAGame\Demos
```

Si Documentos está sincronizado con OneDrive, busca esa misma carpeta dentro de OneDrive. Los archivos terminan en `.replay`; no son vídeos.

## Funcionalidades

- Subida de un archivo cada vez, hasta **32 MiB** (etiquetado como 32 MB en la interfaz).
- Cabecera compacta con marcador y fecha a la izquierda; subida a la derecha. Conserva título, mapa interno y duración aproximada de la grabación sin una segunda tarjeta de resultado.
- Puntos, goles, asistencias, paradas, tiros y conversión de tiros por jugador.
- Tabla de todos los jugadores con turbo y distancia al compañero más cercano en el instante seleccionado, y recogidas de pads grandes, pequeños y sin tipo de toda la grabación.
- Campo en planta, balón y jugadores numerados en azul o naranja según su equipo; las insignias de la tabla y miniaturas usan esos mismos colores. Selecciona una fila, miniatura o jugador en el campo para ver sus datos.
- El campo dibuja todas las parejas de cada equipo, no solo las del jugador seleccionado: tres líneas por equipo en 3v3. Una matriz muestra además todas las distancias entre rivales, con todas las parejas (15 en 3v3), en metros en planta. Las posiciones ausentes son N/D.
- Reproducción fluida con `requestAnimationFrame`, interpolación visual entre muestras de **5 Hz** y velocidades **×1, ×1,5, ×2 y ×3**. El reloj usa tiempo transcurrido para evitar acumular retrasos; cambiar de velocidad conserva el instante. No se interpolan huecos mayores de 1,5 intervalos, fases diferentes ni desplazamientos incompatibles con movimiento continuo (2300 uu/s para coches y 6500 uu/s para balón, con margen de 150 uu).
- Deslizador continuo en segundos, disponible tanto en pausa como durante reproducción, con ratón, táctil y teclado (flechas: 0,1 s; Mayús + flechas: 1 s; RePág/AvPág: 10 s; Inicio/Fin: extremos). Al tocarlo se pausa inmediatamente y se cancela el fotograma pendiente para que no sobrescriba el instante elegido. Se pueden consultar instantes intermedios sin reproducir antes la partida; los huecos sin observaciones no mantienen posiciones antiguas.
- Miniaturas de calor para todos los jugadores y mapa ampliado para el jugador elegido, de toda la grabación o los últimos 10 segundos.
- Tres pestañas debajo de los gráficos: **Errores**, **Boost** y **Demos**. Errores y boost corresponden al jugador seleccionado; demos incluye todos los jugadores. Cada evento permite saltar al instante exacto y pausa la reproducción.
- La pestaña Errores reúne posibles fallos al balón y señales tácticas sostenidas al menos 2 s: proximidad en suelo (<7 m), aislamiento (>40 m), doble presión cerca de un balón bajo (<10 m) y falta de cobertura (nadie al menos 5 m por detrás del balón en campo propio). Se excluyen pausas identificadas, saques, equipos incompletos y mapas no verificados. Son indicios a revisar, no errores confirmados ni recomendaciones.
- Boost contiene los eventos de recogida. El tipo y la ubicación del pad se estiman por proximidad cuando se verifica un campo estándar.
- Demos muestra los eventos replicados `Demolish`, `DemolishFx` y `DemolishExtended`, con atacante, víctima y totales observados hechos/recibidos por jugador. Se distingue autodemolición y explosión de gol, sin contarlas como demos hechas por un atacante. Se conserva la identidad anterior al fotograma si la víctima pierde el PRI en ese mismo fotograma; no se reutiliza para coches nuevos. Se omiten snapshots del primer segundo y duplicados de una misma víctima en menos de 0,5 s. No se infieren demos por desapariciones, ni a partir del marcador; participantes desconocidos se etiquetan explícitamente. Requiere volver a subir partidas cargadas antes de incorporar esta lectura.
- Selector con los últimos ocho informes de la sesión, en memoria, también accesible en móvil.
- Exportación del informe actual a JSON desde la cabecera.
- Navegación con teclado, estados de carga, mensajes de error y adaptación a móvil.
- Tabla ampliada debajo de los campos, para todos los jugadores: turbo medio ponderado, segundos y porcentaje sin turbo (≤1 %) y lleno (≥99 %), pads, tiempo aéreo estimado, aproximaciones y posibles fallos con acceso al instante. Las métricas se calculan sobre las muestras originales, nunca sobre la interpolación.

### Estadísticas ampliadas

Turbo y aire usan únicamente tiempo activo identificado con posiciones observadas. El tiempo aéreo se estima como altura superior a 300 uu y distancia al perímetro estándar superior a 250 uu para reducir la confusión con conducción por paredes; puede omitir vuelo junto a ellas y no mide contacto de ruedas. Se muestra N/D en mapas no verificados. Los pads siguen siendo el total observado de la grabación.

Las aproximaciones requieren balón, posiciones continuas y contador replicado `PRI_TA:BallTouches`: cruzar de más de 600 uu a 600 uu o menos en 3D, cerrar al menos 100 uu entre muestras y que el propio coche se mueva hacia el balón a al menos 300 uu/s. Una separación posterior superior a 900 uu en un máximo de 3 segundos sin aumentar el contador se marca como **posible fallo**, no como error confirmado: puede ser una finta o decisión intencional. Se descartan intentos con pausas, huecos, teletransportes, pérdida de identidad o reinicio del contador. Antes del primer contador observado no se supone que valga cero; se indica la cobertura temporal y N/D si no hay datos. Los intentos incompletos no se cuentan como fallos.

## Qué se calcula y qué no

Se leen la **cabecera y los fotogramas de red** mediante rrrocket 0.11.8, que utiliza boxcars 0.13.0 y devuelve JSON. El proceso auxiliar enlaza actores, reconstruye el estado y devuelve solo el informe y la telemetría reducida, no todos los atributos de red. rrrocket tiene un tiempo máximo de 45 segundos y una salida máxima de 512 MiB antes de la reducción.

Si no está instalado el lector actualizado, se utiliza [node-boxcars](https://github.com/Justkant/node-boxcars) / boxcars 0.10.11, con decodificación CBOR mediante `cbor-x`. Ese lector antiguo puede fallar en los primeros fotogramas de partidas recientes; ejecuta `npm.cmd run parser:setup` si solo aparece el marcador. node-boxcars también permite recuperar la cabecera cuando falla la lectura de red.

Si el lector no puede analizar la red pero sí la cabecera, devuelve el marcador con una **advertencia explícita**: no hay mapas ni posiciones. Nunca se utilizan trayectorias ficticias como sustituto de una lectura de red real.

- La precisión es `goles / tiros × 100`, redondeada al entero más cercano. Si no hay tiros, se muestra **N/D**, no 0 %.
- Los datos ausentes o inválidos se mantienen como **N/D**. Los totales de un equipo tampoco se muestran si faltan componentes. El marcador oficial no se reconstruye sumando goles de jugadores, ya que puede haber abandonos o reconexiones.
- Los tiempos espaciales son marcas de red relativas al primer fotograma: **no son el reloj del juego**. La duración del encabezado es `NumFrames / RecordFPS`. El JSON conserva también los eventos de gol del encabezado.
- Los jugadores se enlazan mediante el coche, su PRI, su nombre y su equipo. Los nombres ambiguos en un mismo equipo se omiten, no se asignan por intuición. Las referencias a actores destruidos se eliminan. Una posición dinámica de más de un segundo deja de mostrarse; los cuerpos dormidos conservan su última posición conocida.
- Las coordenadas de boxcars 0.10.11 ya están en unidades Unreal, como muestran sus [pruebas de posiciones](https://github.com/nickbabcock/boxcars/blob/v0.10.11/tests/samples.rs). No se vuelven a multiplicar por 100. Las distancias son horizontales y se muestran usando 100 uu ≈ 1 m.
- El turbo se normaliza desde el byte replicado (0–255) a 0–100 %. Una subida de turbo **no se inventa como recogida de un pad**: se usan eventos `Pickup` / `PickupNew` con instigador. Se excluyen snapshots iniciales del primer segundo y estados duplicados. Las recogidas pueden ser incompletas si faltan eventos o identidad; no se garantiza un contador oficial.
- El evento confirma la recogida; el pad se estima si hay una posición reciente a menos de 350 uu de un pad estándar y altura inferior a 300 uu. Si no, el tipo queda desconocido. «12/100» es la capacidad de un pad pequeño/grande, no el turbo neto ganado. Los puntos del campo son referencias de ubicación, no indicadores de disponibilidad.
- Cada mapa de calor acumula tiempo observado por celda, no el número de fotogramas. Se excluyen pausas identificadas y se recortan huecos entre muestras. Las miniaturas usan escalas independientes: sirven para comparar zonas, no cantidades absolutas. Se proyecta también el juego aéreo sobre el suelo.
- Solo se dibuja el campo cuando el nombre interno del mapa pertenece a la lista de geometrías estándar verificadas. En otros mapas los datos espaciales siguen en el JSON, pero el mapa se indica como no disponible.
- No se muestran recomendaciones ni una nota de rotación. Las señales de doble presión y cobertura aparecen únicamente como posibles errores en su pestaña, con criterios explícitos. Se mantienen los datos, las distancias y las estimaciones etiquetadas (tiempo aéreo y posibles fallos).
- No se calcula una nota de rotación ni se infiere intención, rango, mecánicas o decisiones correctas. Tampoco se reproduce vídeo ni se calcula turbo neto consumido/ganado. La lectura de cabecera de respaldo no verifica el CRC ni garantiza la integridad de la red. Versiones nuevas pueden requerir actualizar el lector.
- No hay cuentas, base de datos, integración con ballchasing ni almacenamiento permanente. Recargar la página vacía el historial.

La distancia media al compañero conserva el filtro de muestras con equipo completo y juego activo identificado, a más de 350 uu del centro y en mapa estándar. Las distancias instantáneas se muestran siempre que haya posiciones y un compañero disponible. Ninguna distancia se interpreta como una decisión correcta o incorrecta.

## Arquitectura y privacidad

1. El navegador envía el archivo a `POST /api/analyze`, en el mismo servidor.
2. El endpoint limita el cuerpo recibido, con un plazo de subida de 30 segundos, valida extensión y tamaño, y crea una carpeta temporal con nombre aleatorio. Una subida incompleta no reserva el lector; solo la petición que adquiere la reserva puede liberarla.
3. Un proceso Node separado ejecuta el lector nativo, valida el encabezado y reduce los fotogramas a muestras y eventos. Límite de 60 segundos, heap de V8 de 1536 MiB y 48 MiB de salida. El heap no limita toda la memoria nativa: no es un aislamiento de sistema operativo.
4. El servidor devuelve el informe y elimina la carpeta temporal en `finally`. Si la limpieza falla, queda registrada en la consola del servidor.
5. El navegador conserva únicamente los informes de la sesión en memoria.

No se envían repeticiones a terceros. **Local** significa que ejecutas el servidor en tu equipo: si decides desplegarlo, los archivos sí se enviarán a ese servidor. Los scripts de arranque se limitan a `127.0.0.1`.

El endpoint es para uso local de confianza. No lo publiques directamente sin añadir autenticación, cuotas, límites de tiempo de subida y aislamiento del proceso a nivel de sistema operativo. El bloqueo de una sola lectura simultánea es por proceso, no distribuido. La comprobación de origen protege las subidas desde otras páginas, pero no sustituye la autenticación.

La comprobación compara `Origin` con el protocolo de la petición y la cabecera `Host` de destino, incluido el puerto. Así funciona tanto al abrir `localhost` como `127.0.0.1`, aunque Next.js use otro nombre internamente. No se consideran intercambiables esos dos orígenes ni se confía en `X-Forwarded-Host` para permitir subidas.

El nombre original nunca se usa como ruta temporal ni se interpola en un comando de shell. Los errores se muestran en la web y se registran en la consola del servidor. Los archivos `.replay` y las variables de entorno se excluyen del control de versiones.

## Estructura

- [Interfaz principal](src/components/dashboard.tsx)
- [Vista de jugadores y campo](src/components/spatial-workspace.tsx)
- [Campo y calor SVG](src/components/field-map.tsx)
- [Reconstrucción de actores de red](src/lib/network.ts)
- [Métricas espaciales y reglas](src/lib/telemetry.ts)
- [Estilos responsive](src/app/globals.css)
- [Endpoint de subida y análisis](src/app/api/analyze/route.ts)
- [Proceso aislado del lector](scripts/parse-replay.mjs)
- [Validación y normalización](src/lib/replay.ts)
- [Reglas de consejos](src/lib/analysis.ts)
- [Pruebas unitarias](tests/replay.test.ts)
- [Pruebas de reconstrucción y métricas espaciales](tests/telemetry.test.ts)

Las pruebas cubren normalización, datos ausentes, porcentajes, enlaces de actores, turbo, recogidas, pausas, huecos, calor y umbrales tácticos. Las fixtures de red son sintéticas y no sustituyen una prueba de integración del binario con una repetición real. El análisis se limita a una hora de grabación para acotar la respuesta.

Para repetir la prueba de integración con una partida local de fútbol estándar, sin guardar ni subir el archivo al repositorio:

```powershell
$env:REPLAY_TEST_FILE = 'C:\ruta\a\partida.replay'
npm.cmd test
```

La prueba comprueba posiciones y movimiento de todos los jugadores, balón, turbo, recogidas, fases activas y mapas de calor. Sin esa variable se omiten las pruebas que necesitan una repetición local.

Con el servidor ya arrancado en `127.0.0.1:3000`, puedes validar también que una subida incompleta no bloquee otro análisis y que termine en HTTP 408 tras 30 segundos:

```powershell
$env:REPLAY_UPLOAD_TEST = '1'
node --test tests\upload.test.ts
```

Esta comprobación requiere también `REPLAY_TEST_FILE` y no arranca ningún servidor.

Proyecto independiente, no afiliado a Psyonix, Epic Games ni ballchasing.
