---
name: android-build
description: Compilar ReelObra, diagnosticar errores de Gradle/AGP/Kotlin/KSP, generar el APK y verificar compatibilidad (minSdk 29, arm64-v8a).
---
# android-build
1. `export ANDROID_HOME=${ANDROID_HOME:-/opt/android-sdk}`; si falta el SDK: `sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools"`.
2. Compilar y probar: `./gradlew assembleDebug testDebugUnitTest lintDebug --console=plain`.
3. Si falla, ver el primer error real: `./gradlew compileDebugKotlin --console=plain 2>&1 | grep -E '^e:'`.
   - `checkAarMetadata` pide compileSdk/AGP mayor → NO subir a ciegas: revisar DEPENDENCIES.md y bajar la librería o hacer la migración completa en una etapa propia.
   - KSP debe coincidir con Kotlin (`2.2.21` ↔ `2.2.21-2.0.x`).
   - Toolchain: el proyecto apunta a JVM 17 con JDK 21; no usar `jvmToolchain`.
4. Verificar APK: `aapt2 dump badging <apk> | grep -E 'sdkVersion|native-code'` y `aapt2 dump permissions <apk>`.
5. APK de entrega: `./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk` (firmado con clave debug hasta la etapa de release).
