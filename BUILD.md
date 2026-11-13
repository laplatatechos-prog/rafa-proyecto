# Compilar ReelObra

## Requisitos
- JDK 21 (o 17+). Android SDK: `platforms;android-36`, `build-tools;36.0.0`, `platform-tools`.
- No hace falta Android Studio (pero sirve para depurar). NDK no se usa todavía.

## Comandos
```bash
export ANDROID_HOME=$HOME/Android/Sdk      # o donde esté el SDK
./gradlew assembleDebug                    # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease                  # app/build/outputs/apk/release/app-release.apk (minificado)
./gradlew testDebugUnitTest lintDebug      # pruebas + lint
scripts/offline-audit.sh                   # auditoría offline
```
Cada `assemble*` ejecuta `verifyOffline<Variant>`: si el manifiesto final contiene INTERNET, la compilación falla.

## CI
`.github/workflows/android.yml` compila, prueba, audita y publica los APK como artefacto en cada push.

## Instalar por USB
```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

## Firma de release (pendiente)
Generar una vez y guardar fuera del repo:
`keytool -genkeypair -v -keystore reelobra.jks -alias reelobra -keyalg RSA -keysize 4096 -validity 36500`
Perder el keystore = no poder actualizar la app instalada sin desinstalar.
