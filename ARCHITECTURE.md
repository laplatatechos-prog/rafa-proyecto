# Arquitectura — ReelObra

## Principios
App chica, estable y mantenible. Un módulo Gradle `:app`, paquetes por dominio. Kotlin + Compose + Material 3.
Sin red. Originales inmutables: toda edición es una descripción (datos) que se aplica en vista previa y en exportación.

## Paquetes (`com.reelobra.app`)
| # | Dominio | Paquete | Estado |
|---|---|---|---|
| 1 | Captura multimedia | `ui/camera` (CameraX `LifecycleCameraController`) | Etapa 1 ✔ |
| 2 | Proyectos | `project` (`ProjectRepository`, `ProjectStorage`, `ImportManager`, `RecoveryPlanner`) | Etapa 1 ✔ |
| 3 | Voz a texto | `stt` (sherpa-onnx Whisper / whisper.cpp, a decidir por medición) | Etapa 3 |
| 4 | Voz sintética | `tts` (sherpa-onnx + Piper VITS o Kokoro) | Etapa 4 |
| 5 | Edición y composición | `edit` (`EditSpec` → Media3 `Composition`) | Etapa 2 |
| 6 | Subtítulos | `subtitles` (segmentación + tiempos reales del TTS → `OverlayEffect`) | Etapa 5 |
| 7 | Identidad visual | `brand` (nombre, logo, marca de agua) | Etapa 6 |
| 8 | Vista previa | `player` (ExoPlayer + mismos efectos) | Etapa 1 básica ✔ |
| 9 | Exportación | `export` (Media3 Transformer → MediaStore `Movies/ReelObra`) | Etapa 7 |
| 10 | Configuración y almacenamiento | `data` (Room, DataStore, `AppContainer`) | Etapa 1 ✔ |

## Almacenamiento
```
files/projects/<projectId>/clips/<yyyyMMdd_HHmmss_SSS>.mp4   originales (grabados o importados por copia)
files/projects/_ilegibles/                                   videos que no se pudieron leer (no se borran)
databases/reelobra.db                                         Room: projects, clips (y luego edits, textos)
```
Importar **copia** el video: el proyecto no depende de que el original siga en la galería.

## Flujo de procesamiento (objetivo)
```
Clips originales ──► EditSpec (segmentos, recorte 9:16, mute, ajustes imagen)
                          │
Audio del clip / narración ──► STT (Whisper local) ──► texto editable + glosario
                                                          │
                                       texto final ──► TTS por frase ──► audio + duración exacta por frase
                                                          │
                                       subtítulos con tiempos reales ◄┘
                          │
        Vista previa (ExoPlayer + efectos)  ≡  Exportación (Transformer + mismos efectos)
                                                          │
                                         MP4 1080×1920 H.264/AAC ──► MediaStore Movies/ReelObra
```

## Robustez
- Grabación: CameraX finaliza el archivo al ir a segundo plano (llamada, cambio de app); se registra igual.
- Registro de clips y la importación corren en `appScope`, no atados a la pantalla.
- Al iniciar: `recoverOrphanClips()` registra videos sin entrada en la base y limpia `.part` de importaciones cortadas.
- Operaciones largas (Etapa 3+): WorkManager/servicio en primer plano con progreso real y cancelación.

## Seguridad / privacidad
Sin permiso INTERNET (removido explícitamente en el manifiesto + verificación en build + `scripts/offline-audit.sh`).
`allowBackup=false` y reglas de extracción vacías: nada a la nube de Google.
