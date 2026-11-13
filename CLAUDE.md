# ReelObra — instrucciones permanentes para Claude Code

## Producto
App Android nativa, 100 % offline, para que un contratista de techos convierta momentos reales de obra
en reels verticales (9:16, 1080×1920, H.264/AAC) con voz masculina sintética, subtítulos y marca.
El usuario decide qué se graba, qué se conserva y qué se publica. La app automatiza lo repetitivo,
nunca reemplaza su criterio técnico ni inventa información (materiales, medidas, garantías, resultados).
Detalle: PRODUCT.md. Etapas: ROADMAP.md.

## Reglas absolutas
1. **Offline total.** Prohibido `android.permission.INTERNET` y cualquier permiso de red en el APK.
   Prohibido Firebase, Google Play Services, analíticas, publicidad, telemetría, login, APIs remotas,
   descargas en tiempo de ejecución. Los modelos van empaquetados en el APK o se copian una sola vez desde la PC.
2. **Los originales son intocables.** La edición se guarda como datos (recortes, orden, textos);
   el archivo original no se modifica jamás. Solo la exportación escribe un MP4 nuevo.
3. **No inventar.** Ni tiempos de subtítulo inventados, ni texto técnico que el usuario no dijo.
4. **Nunca perder contenido.** Toda operación larga se puede cancelar, muestra progreso real y deja el
   proyecto recuperable si la app muere.
5. **Fundamentos antes que funciones sofisticadas.** No se arranca una etapa sin que la anterior compile,
   pase pruebas y tenga checklist de dispositivo.

## Arquitectura (resumen; detalle en ARCHITECTURE.md)
Un módulo `:app`, paquetes por dominio en `com.reelobra.app`:
`capture` · `project` · `data` · `player` · `ui/*` · (próximos) `stt` · `tts` · `edit` · `subtitles` · `brand` · `export` · `settings`.
Inyección manual en `data/AppContainer.kt`. Room para proyectos, DataStore para preferencias.
Motores nativos (sherpa-onnx) se integran como AAR fijado; NDK/JNI propio solo si es imprescindible.
No crear módulos Gradle nuevos sin una razón medida (tiempo de build, aislamiento nativo).

## Comandos
```bash
export ANDROID_HOME=/opt/android-sdk        # o el SDK local
./gradlew assembleDebug                      # APK debug (incluye verifyOfflineDebug)
./gradlew testDebugUnitTest                  # pruebas unitarias
./gradlew lintDebug                          # lint (abortOnError)
./gradlew assembleRelease                    # APK release minificado (incluye verifyOfflineRelease)
scripts/offline-audit.sh                     # auditoría offline completa
```

## Estándares de código
- Kotlin, Compose + Material 3. Strings de UI en español rioplatense, cortos y en mayúscula para acciones.
- Botones principales ≥ 72 dp (`BigButtonHeight`), contraste alto, sin menús anidados.
- Lógica pura separada de Android (p. ej. `RecoveryPlanner`) para poder probarla con JUnit.
- Trabajo pesado fuera del hilo principal (`Dispatchers.IO/Default`); operaciones largas en `appScope`
  o WorkManager, nunca atadas a una pantalla.
- Versiones fijadas en `gradle/libs.versions.toml`. Cambiar una versión = actualizar DEPENDENCIES.md.

## Manejo de errores
- Nunca crashear por un archivo ilegible: se aparta en `projects/_ilegibles/`, no se borra.
- Mensajes al usuario en lenguaje llano, qué pasó y qué se conservó. Log técnico con `Log.w/e`.
- Excepciones de cancelación se relanzan; el resto se captura en el borde (repositorio / ViewModel).

## Obligatorio antes de dar algo por terminado (Definición de terminado)
1. `./gradlew assembleDebug testDebugUnitTest lintDebug` en verde.
2. `scripts/offline-audit.sh` en verde (sin permisos de red, sin dependencias prohibidas).
3. Pruebas nuevas para la lógica nueva.
4. Docs actualizados: DECISIONS.md si hubo decisión, DEPENDENCIES.md si cambió una librería/modelo,
   KNOWN_ISSUES.md si queda algo pendiente.
5. Checklist de prueba en dispositivo real escrita en TEST_PLAN.md para la etapa.
6. Commit por etapa funcional, mensaje en español.

## Prioridades
Estabilidad > no perder contenido > offline > velocidad en gama media > calidad de voz > estética.
