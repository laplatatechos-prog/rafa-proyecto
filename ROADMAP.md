# Roadmap — ReelObra

> Nota: el prompt maestro llegó cortado en "ETAPA 4 — Voz masculina artificial - Selección y prueba del…".
> Las etapas 5 a 8 están inferidas de las secciones 10–16 del prompt y deben confirmarse con el usuario.

| Etapa | Contenido | Entregable / criterio de aceptación | Estado |
|---|---|---|---|
| 0 | Entorno, librerías, modelos, licencias, estructura, docs | Proyecto compila; licencias verificadas; muestras de voz generadas | ✔ 2026-11-13 |
| 1 | Pantalla principal, Nuevo Reel, cámara, galería, reproducción, proyectos | APK que graba, importa y reproduce sin internet; recupera clips tras cierre | ✔ código / ⏳ prueba en teléfono |
| 2 | Edición básica: recortes, segmentos, reencuadre 9:16, unión, mute, marcadores | Editor que exporta un MP4 de prueba con los cortes elegidos | Pendiente |
| 3 | Voz a texto: extracción de audio, Whisper local, editor de texto, glosario | Transcripción de 30 s en español con vocabulario de obra; medida en teléfono real | Pendiente |
| 4 | Voz masculina: elección final (≥2 alternativas comparadas), integración, regenerar, velocidad, volumen | Narración generada offline desde texto, escuchable y regenerable | Pendiente |
| 5* | Subtítulos: segmentación 1–2 líneas, tiempos reales, estilo, zona segura, edición | Subtítulos quemados que coinciden con la voz (error < 150 ms medido) | Pendiente |
| 6* | Imagen y marca: brillo/contraste/saturación/nitidez, logo, marca de agua, intro/cierre | Plantilla por defecto configurable sin código | Pendiente |
| 7* | Vista previa fiel + exportación 1080×1920 a `Movies/ReelObra` | Vista previa = archivo final (posición subtítulos, logo, audio) | Pendiente |
| 8* | Rendimiento y release: mediciones en gama media, keystore propio, v1.0 | Tiempos medidos documentados; APK firmado | Pendiente |

\* inferidas.

## Criterios generales de cada etapa
Compila, pruebas en verde, auditoría offline en verde, checklist de dispositivo completada por el usuario.
