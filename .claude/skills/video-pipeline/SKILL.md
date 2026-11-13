---
name: video-pipeline
description: Pruebas de recorte, composición, reencuadre 9:16, subtítulos quemados, marca, vista previa y exportación con Media3 Transformer.
---
# video-pipeline
- Edición = datos (EditSpec): lista de segmentos {clip, inicio, fin}, recorte 9:16, mute/volumen, textos. Nunca tocar originales.
- Vista previa: ExoPlayer con los mismos efectos (Media3 `setVideoEffects`) que la exportación → lo que se ve es lo que sale.
- Exportación: Media3 Transformer + Composition, 1080×1920, H.264 High, AAC 48 kHz, 30 fps; fallback a 720×1280 si el codificador no soporta 1080p (informar al usuario).
- Guardar en MediaStore `Movies/ReelObra` (IS_PENDING=1 mientras escribe).
- Verificar salida con `ffprobe` en PC: resolución, códec, fps, duración, pistas.
- Zona segura subtítulos: no usar el 20 % inferior ni el 12 % superior (controles de Instagram/TikTok).
