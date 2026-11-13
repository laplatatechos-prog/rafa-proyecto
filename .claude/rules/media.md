---
description: Reglas para captura, edición y exportación de video/audio.
globs: ["app/src/main/java/com/reelobra/app/{capture,player,edit,export,subtitles,brand,tts,stt}/**"]
---
- Originales en `files/projects/<id>/clips/` son de solo lectura después de grabados.
- Vista previa y exportación deben usar la MISMA descripción de composición (misma clase/datos) para que coincidan.
- Subtítulos: tiempos derivados de duraciones reales del audio sintetizado o de alineación medida. Nunca estimados a ojo.
- Toda operación > 1 s: progreso real + cancelable + no bloquea UI.
