---
name: release-checklist
description: Validar funciones y preparar una versión instalable (APK) de ReelObra.
---
# release-checklist
1. `./gradlew clean assembleDebug testDebugUnitTest lintDebug` verde.
2. `scripts/offline-audit.sh` verde.
3. Subir `versionCode` y `versionName` en `app/build.gradle.kts`.
4. `./gradlew assembleRelease`; copiar el APK como `ReelObra-<version>.apk`.
5. Firma: hasta definir keystore propio se firma con clave debug. Cuando exista keystore, NUNCA commitearlo; ver BUILD.md.
6. Checklist de dispositivo de la etapa (TEST_PLAN.md) completada por el usuario en su teléfono, en modo avión.
7. Actualizar ROADMAP.md (estado), KNOWN_ISSUES.md y crear tag `vX.Y.Z`.
