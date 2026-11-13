# Dependencias — ReelObra

Versiones fijadas en `gradle/libs.versions.toml`. Se eligió un conjunto **maduro y compatible entre sí**
(AGP 8.13 + Kotlin 2.2) en lugar de lo último (AGP 9.x, de 2026) para minimizar riesgo; la migración a AGP 9
se hará en una etapa propia. Verificado 2026-11-13.

## Build
| Componente | Versión | Licencia |
|---|---|---|
| Gradle (wrapper) | 8.14.3 | Apache-2.0 |
| Android Gradle Plugin | 8.13.2 | Apache-2.0 |
| Kotlin / Compose compiler | 2.2.21 | Apache-2.0 |
| KSP | 2.2.21-2.0.5 | Apache-2.0 |
| compileSdk / targetSdk / minSdk | 36 / 36 / 29 | — |
| JDK | 21 (bytecode 17) | GPL+CE |

## Librerías en el APK
| Librería | Versión | Uso | Licencia | ¿Red? |
|---|---|---|---|---|
| androidx.core / lifecycle / activity | 1.17.0 / 2.9.4 / 1.11.0 | base | Apache-2.0 | No |
| Compose BOM + Material 3 + icons-extended | 2025.10.01 | UI | Apache-2.0 | No |
| navigation-compose | 2.9.5 | navegación | Apache-2.0 | No |
| CameraX (core, camera2, lifecycle, video, view) | 1.5.1 | grabación | Apache-2.0 | No |
| Media3 ExoPlayer + UI | 1.8.0 | reproducción | Apache-2.0 | No (solo archivos locales) |
| Room | 2.8.3 | proyectos | Apache-2.0 | No |
| DataStore Preferences | 1.1.7 | preferencias | Apache-2.0 | No |
| kotlinx-coroutines | 1.10.2 | concurrencia | Apache-2.0 | No |

Próximas: Media3 Transformer/Effect 1.8.0 (Etapa 2), sherpa-onnx AAR 1.13.8 (Etapa 3–4).

## Motores de IA local (evaluados, Etapa 0)
| Motor | Versión | Licencia | Notas |
|---|---|---|---|
| sherpa-onnx | 1.13.8 (AAR Android 50 MB, todas las ABI; se recorta a arm64) | Apache-2.0 | Un solo motor para STT (Whisper ONNX) y TTS (Piper/Kokoro). Mantenimiento activo. |
| espeak-ng (dentro de sherpa-onnx, fonemizador de Piper/Kokoro) | — | **GPL-3.0** | Para uso propio no genera obligaciones. Si algún día se distribuye el APK a terceros, hay que publicar el código fuente (GPL). |
| whisper.cpp | v1.9.5 | MIT | Alternativa para STT; requiere NDK/JNI propio. Se compara en Etapa 3. |
| ONNX Runtime (dentro de sherpa-onnx) | — | MIT | — |
| ⚠ sherpa-onnx PyPI 2.0.1 | — | — | No trae frontend espeak: Piper falla ("no frontend available"). Usar 1.13.8. |

## Modelos de voz masculina en español (candidatos, Etapa 0)
Generados con el texto de prueba de obra. RTF = tiempo de generación / duración del audio (PC x86 4 núcleos;
en el teléfono será mayor: **medir en Etapa 4**).

| ID | Modelo | Acento | Tamaño | RTF PC | Licencia del dataset/modelo | Uso comercial |
|---|---|---|---|---|---|---|
| A | Piper es_MX-ald-medium | México | 79 MB | 0.04 | Unlicense (dominio público) | ✔ |
| B | Piper es_ES-davefx-medium | España | 79 MB | 0.05 | CC0 | ✔ |
| C | Piper es_MX-claude-high | México | 79 MB | 0.06 | Apache-2.0 | ✔ |
| D | Piper es_ES-sharvard-medium (hablante M) | España | 92 MB | 0.05 | CC-BY-3.0 | ✔ con atribución |
| E | Piper es_ES-carlfm-x_low | España | 39 MB | 0.03 | Dominio público | ✔ (calidad baja, 16 kHz) |
| F | Kokoro v1.0 int8 em_alex | ES neutro | 132 MB | 1.25 | Apache-2.0 | ✔ |
| G | Kokoro v1.0 int8 em_santa | ES neutro | 132 MB | 1.17 | Apache-2.0 | ✔ |

Kokoro es ~25× más lento que Piper: en gama media puede tardar varios minutos por reel. Decisión final en Etapa 4
tras escucha del usuario + medición en su teléfono.

## Modelos de transcripción (a medir en Etapa 3)
Whisper (OpenAI, MIT): tiny / base / small en int8 vía sherpa-onnx o ggml vía whisper.cpp.
Español con vocabulario técnico requiere al menos `base`; `small` probablemente sea el punto de equilibrio.
