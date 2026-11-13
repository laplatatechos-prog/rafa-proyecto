---
name: device-performance
description: Medir memoria, tiempos (transcripción, voz, exportación), temperatura y estabilidad en teléfonos reales de gama media ARM64.
---
# device-performance
- Con el teléfono por USB y depuración activada:
  - Memoria: `adb shell dumpsys meminfo com.reelobra.app`
  - Temperatura: `adb shell dumpsys thermalservice` / `dumpsys battery | grep temp`
  - Tiempos: logs `adb logcat -s ReelObraPerf` (cada operación larga registra inicio/fin/duración).
  - Espacio: `adb shell df /data`
- Registrar en TEST_PLAN.md: modelo de teléfono, Android, RAM, y para un clip de 30 s: STT, TTS, exportación (s), memoria pico (MB).
- Umbral de aceptación inicial (a validar): exportar 30 s en < 60 s y TTS de 30 s de narración en < 15 s en gama media.
- Sin medición real no se promete un tiempo.
