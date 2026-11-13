# Decisiones — ReelObra

Formato: fecha · decisión · alternativas · motivo.

1. **2026-11-13 · Un solo módulo `:app` con paquetes por dominio.** Alt: 10 módulos Gradle. Motivo: el prompt pide evitar
   complejidad; los 10 dominios existen como paquetes. Se separa un módulo solo si una medición lo justifica.
2. **2026-11-13 · AGP 8.13.2 + Kotlin 2.2.21 + librerías de fines de 2025.** Alt: AGP 9.5 (2026). Motivo: AGP 9 cambia el
   modelo de Kotlin integrado; preferimos base madura y reproducible. Migración en etapa dedicada.
3. **2026-11-13 · minSdk 29 (Android 10).** Alt: 26. Motivo: almacenamiento con alcance y MediaStore sin permisos de
   escritura; los motores de IA necesitan hardware de 2019+ de todas formas.
4. **2026-11-13 · Solo arm64-v8a.** Motivo: requisito del prompt; reduce el APK (los modelos nativos pesan por ABI).
5. **2026-11-13 · Importar = copiar al proyecto.** Alt: referenciar URI. Motivo: el proyecto no se rompe si el video se
   borra de la galería; los permisos del selector de fotos no siempre persisten. Costo: espacio duplicado (se informará).
6. **2026-11-13 · sherpa-onnx como motor único candidato para TTS y STT.** Alt: Piper nativo + whisper.cpp con JNI propio.
   Motivo: un AAR mantenido (Apache-2.0) con Kotlin API para ambos, menos código nativo propio. whisper.cpp queda como
   alternativa de STT a comparar en Etapa 3.
7. **2026-11-13 · Subtítulos con tiempos reales del TTS.** El texto se sintetiza por frase; la duración real del audio de
   cada frase define su ventana. Cumple "no usar tiempos inventados" sin alineador adicional. Si la voz original se
   conserva (sin TTS), se usarán los timestamps de Whisper y se medirá su precisión.
8. **2026-11-13 · Sin permiso INTERNET + verificación automática.** `tools:node="remove"` en el manifiesto, tarea Gradle
   `verifyOffline<Variant>` que falla la compilación y `scripts/offline-audit.sh` en CI.
9. **2026-11-13 · APK release firmado con clave debug hasta la etapa de release.** Motivo: instalación lateral para pruebas.
   El keystore definitivo lo genera y guarda el dueño (nunca en el repo).
10. **2026-11-13 · Inyección manual (AppContainer) en lugar de Hilt.** Motivo: app chica, menos build time y magia.
