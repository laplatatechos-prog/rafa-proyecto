#!/usr/bin/env python3
"""Genera muestras de las voces candidatas con sherpa-onnx (mismo motor que usará la app).
Uso: pip install sherpa-onnx==1.13.8 soundfile ; python3 scripts/voice-samples.py <dir_modelos> <dir_salida>
Los modelos se bajan de https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models
OJO: sherpa-onnx 2.x en PyPI no trae frontend espeak para Piper: fijar 1.13.8.
"""
import os, sys, time
import sherpa_onnx as so, soundfile as sf

TXT = ("Acá estamos cambiando esta canaleta porque tenía una pendiente mal hecha. "
       "El agua se acumulaba y terminaba filtrando por la pared. "
       "Revisamos la babeta, la cumbrera y la limahoya, y colocamos membrana hidrófuga bajo la chapa trapezoidal. "
       "La bajada pluvial queda con la pendiente de desagüe correcta.")

def piper(base, name, sid=0):
    d = f"{base}/{name}"; onnx = [f for f in os.listdir(d) if f.endswith(".onnx")][0]
    return so.OfflineTtsConfig(model=so.OfflineTtsModelConfig(vits=so.OfflineTtsVitsModelConfig(
        model=f"{d}/{onnx}", tokens=f"{d}/tokens.txt", data_dir=f"{d}/espeak-ng-data"), num_threads=4)), sid

def kokoro(base, sid):
    d = f"{base}/kokoro-int8-multi-lang-v1_0"
    return so.OfflineTtsConfig(model=so.OfflineTtsModelConfig(kokoro=so.OfflineTtsKokoroModelConfig(
        model=f"{d}/model.int8.onnx", voices=f"{d}/voices.bin", tokens=f"{d}/tokens.txt",
        data_dir=f"{d}/espeak-ng-data", lang="es"), num_threads=4)), sid

def main(base, out):
    os.makedirs(out, exist_ok=True)
    cands = {
        "A_piper_es_MX-ald-medium": piper(base, "vits-piper-es_MX-ald-medium"),
        "B_piper_es_ES-davefx-medium": piper(base, "vits-piper-es_ES-davefx-medium"),
        "C_piper_es_MX-claude-high": piper(base, "vits-piper-es_MX-claude-high"),
        "D_piper_es_ES-sharvard-medium-M": piper(base, "vits-piper-es_ES-sharvard-medium", 0),
        "E_piper_es_ES-carlfm-x_low": piper(base, "vits-piper-es_ES-carlfm-x_low"),
        "F_kokoro_em_alex": kokoro(base, 29),
        "G_kokoro_em_santa": kokoro(base, 53),
    }
    for k, (cfg, sid) in cands.items():
        t = so.OfflineTts(cfg); t0 = time.time(); a = t.generate(TXT, sid=sid, speed=1.0); dt = time.time() - t0
        dur = len(a.samples) / a.sample_rate
        sf.write(f"{out}/{k}.wav", a.samples, a.sample_rate)
        print(f"{k}: audio {dur:.1f}s, generación {dt:.1f}s, RTF {dt/dur:.2f}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
