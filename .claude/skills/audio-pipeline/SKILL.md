---
name: audio-pipeline
description: Pruebas del pipeline de audio - micrófono, extracción, transcripción (Whisper vía sherpa-onnx o whisper.cpp), síntesis de voz (Piper/Kokoro vía sherpa-onnx), volumen y sincronización.
---
# audio-pipeline
- Motor: sherpa-onnx `1.13.8` (AAR fijado). Versión PyPI 2.x NO trae espeak para Piper: para pruebas en PC usar `pip install sherpa-onnx==1.13.8`.
- Muestras de voz: `python3 scripts/voice-samples.py <modelos> <salida>` (texto con vocabulario de obra).
- Métricas a registrar en TEST_PLAN.md: RTF (tiempo de generación / duración de audio), memoria pico, tamaño del modelo.
- Inteligibilidad objetiva: transcribir la voz sintética con Whisper y comparar contra el texto (WER), en especial
  canaleta, zinguería, babeta, cumbrera, limahoya, tirante, cabio, membrana hidrófuga, chapa trapezoidal, bajada pluvial.
- Subtítulos: sintetizar por oración/frase; la duración real de cada fragmento da los tiempos. Prohibido estimar.
- Audio de entrada: mono 16 kHz para STT; normalizar volumen; filtro pasa-altos ~80 Hz para viento/ruido de obra.
