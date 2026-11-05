# Rocket Analyzer

Web en español para analizar archivos `.replay` de Rocket League. Vista compacta para PC **1920 × 1080**: todos los jugadores, posiciones con control temporal, mapas de calor y señales tácticas en el mismo espacio. El resumen de qué mejorar permanece al final.

## Requisitos

- **Windows x64 y Node.js x64 22.18 o superior**. El paquete nativo `@kant/node-boxcars` 0.3.1 publica un binario para esta plataforma. Esta versión del proyecto no puede analizar archivos en Linux, macOS ni Windows ARM.
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

`parser:setup` descarga el binario oficial de [rrrocket 0.11.8](https://github.com/nickbabcock/rrrocket/releases/tag/v0.11.8), verifica su SHA-256 y lo guarda en `.local/rrrocket/rrrocket.exe`, fuera de Git. Requiere conexión únicamente para instalarlo, no para analizar partidas. Usa el instalador Node también si PowerShell bloquea los archivos `.ps1`. Instálalo antes de compilar para incluirlo en la distribución de producción.

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

La aplicación arranca con un **ejemplo ficticio claramente identificado**. Arrastra una repetición o pulsa **Subir repetición** para sustituirlo por datos reales.

## Encontrar tus repeticiones

Guarda una repetición desde Rocket League. En Windows, normalmente se encuentra en:

```text
Documentos\My Games\Rocket League\TAGame\Demos
```

Si Documentos está sincronizado con OneDrive, busca esa misma carpeta dentro de OneDrive. Los archivos terminan en `.replay`; no son vídeos.

## Funcionalidades

- Subida de un archivo cada vez, hasta **32 MiB** (etiquetado como 32 MB en la interfaz).
- Marcador oficial, título, mapa interno, fecha guardada y duración aproximada de la grabación.
- Puntos, goles, asistencias, paradas, tiros y conversión de tiros por jugador.
- Tabla de todos los jugadores con turbo y distancia al compañero más cercano en el instante seleccionado, y recogidas de pads grandes, pequeños y sin tipo de toda la grabación.
- Campo en planta, balón y jugadores numerados; selecciona una fila, miniatura o jugador en el campo para ver su análisis.
- Reproducción fluida con `requestAnimationFrame`, interpolación visual entre muestras de **5 Hz** y velocidades **×1, ×1,5, ×2 y ×3**. El reloj usa tiempo transcurrido para evitar acumular retrasos; cambiar de velocidad conserva el instante. No se interpolan huecos mayores de 1,5 intervalos, fases diferentes ni desplazamientos incompatibles con movimiento continuo (2300 uu/s para coches y 6500 uu/s para balón, con margen de 150 uu).
- Miniaturas de calor para todos los jugadores y mapa ampliado para el jugador elegido, de toda la grabación o los últimos 10 segundos.
- Eventos de recogida de turbo con salto al instante correspondiente. El tipo y la ubicación del pad se estiman por proximidad cuando se verifica un campo estándar.
- Situaciones persistentes a revisar: proximidad entre compañeros, aislamiento, posible doble presión y falta de cobertura. Reglas orientativas, no una valoración universal de rotación.
- Resumen **En qué mejorar** siempre al final, con hasta dos recomendaciones para el jugador elegido. Prioriza señales espaciales con suficiente muestra; si no hay evidencia suficiente, lo indica sin inventar defectos.
- Selector con los últimos ocho informes de la sesión, en memoria, también accesible en móvil.
- Exportación del informe actual a JSON. El informe de ejemplo conserva `demo: true`.
- Navegación con teclado, estados de carga, mensajes de error y adaptación a móvil.
- Tabla ampliada debajo de los campos, para todos los jugadores: turbo medio ponderado, segundos y porcentaje sin turbo (≤1 %) y lleno (≥99 %), pads, tiempo aéreo estimado, aproximaciones y posibles fallos con acceso al instante. Las métricas se calculan sobre las muestras originales, nunca sobre la interpolación.

### Estadísticas ampliadas

Turbo y aire usan únicamente tiempo activo identificado con posiciones observadas. El tiempo aéreo se estima como altura superior a 300 uu y distancia al perímetro estándar superior a 250 uu para reducir la confusión con conducción por paredes; puede omitir vuelo junto a ellas y no mide contacto de ruedas. Se muestra N/D en mapas no verificados. Los pads siguen siendo el total observado de la grabación.

Las aproximaciones requieren balón, posiciones continuas y contador replicado `PRI_TA:BallTouches`: cruzar de más de 600 uu a 600 uu o menos en 3D, cerrar al menos 100 uu entre muestras y que el propio coche se mueva hacia el balón a al menos 300 uu/s. Una separación posterior superior a 900 uu en un máximo de 3 segundos sin aumentar el contador se marca como **posible fallo**, no como error confirmado: puede ser una finta o decisión intencional. Se descartan intentos con pausas, huecos, teletransportes, pérdida de identidad o reinicio del contador. Antes del primer contador observado no se supone que valga cero; se indica la cobertura temporal y N/D si no hay datos. Los intentos incompletos no se cuentan como fallos.

## Qué se calcula y qué no

Se leen la **cabecera y los fotogramas de red** mediante rrrocket 0.11.8, que utiliza boxcars 0.13.0 y devuelve JSON. El proceso auxiliar enlaza actores, reconstruye el estado y devuelve solo el informe y la telemetría reducida, no todos los atributos de red. rrrocket tiene un tiempo máximo de 45 segundos y una salida máxima de 512 MiB antes de la reducción.

Si no está instalado el lector actualizado, se utiliza [node-boxcars](https://github.com/Justkant/node-boxcars) / boxcars 0.10.11, con decodificación CBOR mediante `cbor-x`. Ese lector antiguo puede fallar en los primeros fotogramas de partidas recientes; ejecuta `npm.cmd run parser:setup` si solo aparece el marcador. node-boxcars también permite recuperar la cabecera cuando falla la lectura de red.

Si el lector no puede analizar la red pero sí la cabecera, devuelve el marcador con una **advertencia explícita**: no hay mapas ni evaluación táctica. El ejemplo ficticio inicial no incluye trayectorias y no se utiliza para simular una lectura de red real.

- La precisión es `goles / tiros × 100`, redondeada al entero más cercano. Si no hay tiros, se muestra **N/D**, no 0 %.
- Los datos ausentes o inválidos se mantienen como **N/D**. Los totales de un equipo tampoco se muestran si faltan componentes. El marcador oficial no se reconstruye sumando goles de jugadores, ya que puede haber abandonos o reconexiones.
- Los tiempos espaciales son marcas de red relativas al primer fotograma: **no son el reloj del juego**. La duración del encabezado es `NumFrames / RecordFPS`. El JSON conserva también los eventos de gol del encabezado.
- Los jugadores se enlazan mediante el coche, su PRI, su nombre y su equipo. Los nombres ambiguos en un mismo equipo se omiten, no se asignan por intuición. Las referencias a actores destruidos se eliminan. Una posición dinámica de más de un segundo deja de mostrarse; los cuerpos dormidos conservan su última posición conocida.
- Las coordenadas de boxcars 0.10.11 ya están en unidades Unreal, como muestran sus [pruebas de posiciones](https://github.com/nickbabcock/boxcars/blob/v0.10.11/tests/samples.rs). No se vuelven a multiplicar por 100. Las distancias son horizontales y se muestran usando 100 uu ≈ 1 m.
- El turbo se normaliza desde el byte replicado (0–255) a 0–100 %. Una subida de turbo **no se inventa como recogida de un pad**: se usan eventos `Pickup` / `PickupNew` con instigador. Se excluyen snapshots iniciales del primer segundo y estados duplicados. Las recogidas pueden ser incompletas si faltan eventos o identidad; no se garantiza un contador oficial.
- El evento confirma la recogida; el pad se estima si hay una posición reciente a menos de 350 uu de un pad estándar y altura inferior a 300 uu. Si no, el tipo queda desconocido. «12/100» es la capacidad de un pad pequeño/grande, no el turbo neto ganado. Los puntos del campo son referencias de ubicación, no indicadores de disponibilidad.
- Cada mapa de calor acumula tiempo observado por celda, no el número de fotogramas. Se excluyen pausas identificadas y se recortan huecos entre muestras. Las miniaturas usan escalas independientes: sirven para comparar zonas, no cantidades absolutas. Se proyecta también el juego aéreo sobre el suelo.
- Solo se dibuja el campo y se aplican reglas tácticas cuando el nombre interno del mapa pertenece a la lista de geometrías estándar verificadas. En otros mapas los datos espaciales siguen en el JSON, pero el mapa y la valoración se indican como no disponibles.
- Los consejos son reglas sobre **una única partida**, no resultados de IA. La regla de conversión usa un 30 % como referencia de la herramienta con al menos cuatro tiros; no es una media de jugadores profesionales. El volumen de tiros, las asistencias y las paradas no bastan para juzgar decisiones o nivel.
- No se calcula una nota de rotación ni se infiere intención, rango, mecánicas o decisiones correctas. Tampoco se reproduce vídeo ni se calcula turbo neto consumido/ganado. La lectura de cabecera de respaldo no verifica el CRC ni garantiza la integridad de la red. Versiones nuevas pueden requerir actualizar el lector.
- No hay cuentas, base de datos, integración con ballchasing ni almacenamiento permanente. Recargar la página vacía el historial.

### Criterios tácticos

Se evalúan únicamente muestras con juego activo identificado (`bBallHasBeenHit`), pasados dos segundos desde su activación, sin gol ni fin de partido identificado, lejos del centro (radio de 350 uu) y con todos los compañeros presentes. En 1v1 no se evalúa separación ni rotación. Si faltan fases o compañeros, no se presenta una conclusión favorable por defecto.

Una señal debe mantenerse **al menos dos segundos continuos** para contribuir a los porcentajes y a la lista de situaciones:

| Señal | Regla de esta herramienta |
|---|---|
| Muy juntos | Dos compañeros en el suelo (altura < 300 uu) a menos de 700 uu |
| Aislado | Jugador a más de 4000 uu del compañero más cercano |
| Posible doble presión | Dos compañeros en el suelo a menos de 1000 uu del balón, también bajo |
| Sin cobertura | Balón en campo propio (más de 500 uu desde el centro) sin compañero al menos 500 uu por detrás del balón hacia su propia portería |

Estos umbrales son **heurísticas**, no promedios competitivos ni normas que haya que cumplir en todas las jugadas. La tabla muestra distancias instantáneas y las métricas tácticas porcentajes sobre el tiempo evaluable. Las señales del instante son candidatas; solo las sostenidas aparecen en el historial. No detectar una señal no demuestra que la rotación sea correcta.

El resumen prioriza cobertura, doble presión, proximidad y aislamiento cuando hay al menos 20 segundos evaluables, una señal suma al menos 3 segundos y representa al menos el 5 % del tiempo evaluable. También sugiere revisar rutas de pads si, con al menos 20 segundos de turbo observado, se pasó un 40 % o más con turbo inferior al 20 %.

## Arquitectura y privacidad

1. El navegador envía el archivo a `POST /api/analyze`, en el mismo servidor.
2. El endpoint limita el cuerpo recibido, valida extensión y tamaño, y crea una carpeta temporal con nombre aleatorio.
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

La prueba comprueba posiciones y movimiento de todos los jugadores, balón, turbo, recogidas, fases activas y mapas de calor. Sin esa variable se omite únicamente la prueba de integración.

Proyecto independiente, no afiliado a Psyonix, Epic Games ni ballchasing.
