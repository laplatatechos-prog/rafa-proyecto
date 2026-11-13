# Plan de pruebas — ReelObra

## Automáticas (cada cambio)
| Prueba | Comando | Cubre |
|---|---|---|
| Unitarias | `./gradlew testDebugUnitTest` | `Format`, nombres de archivo, `RecoveryPlanner` (10 casos) |
| Lint | `./gradlew lintDebug` | errores de Android, accesibilidad básica |
| Offline (build) | `verifyOfflineDebug/Release` | sin permisos de red en manifiesto final |
| Offline (completa) | `scripts/offline-audit.sh` | dependencias, código de red, permisos del APK, libs nativas |

## Etapa 1 — checklist en teléfono real (modo avión ACTIVADO)
1. Instalar APK. Abrir. Ver pantalla con NUEVO REEL.
2. NUEVO REEL → aceptar permisos → grabar 10 s hablando → detener → grabar otro de 5 s → LISTO.
3. En el proyecto: se ven 2 miniaturas; reproducir; se escucha la voz; tocar el 2º clip salta a ese clip.
4. Volver. El proyecto aparece en la lista con "2 clips · 0:15".
5. USAR VIDEOS DEL TELÉFONO → elegir 2 videos → barra de progreso → aparecen en un proyecto nuevo.
6. Interrupción: grabar, y a los 5 s apretar Inicio (o recibir una llamada). Volver: el clip quedó guardado.
7. Cierre forzado: grabar y cerrar la app desde recientes. Reabrir: el clip aparece (marcado ↺) o no queda basura.
8. Renombrar el proyecto. Borrar un clip. Borrar un proyecto.
9. Linterna: encender/apagar en interior oscuro.
10. Al sol: ¿se leen los botones y el contador?

Anotar: modelo de teléfono, versión de Android, y cualquier falla (qué hizo, qué esperaba, qué pasó).

## Mediciones de rendimiento (Etapa 3+)
| Teléfono | Android | RAM | STT 30 s | TTS 30 s | Export 30 s | Memoria pico | Temp. |
|---|---|---|---|---|---|---|---|
| (pendiente) | | | | | | | |
