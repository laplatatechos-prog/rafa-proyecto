---
name: offline-audit
description: Verificar que ReelObra funciona sin internet - permisos, dependencias, código de red, descargas y prueba en modo avión.
---
# offline-audit
1. Ejecutar `scripts/offline-audit.sh` (dependencias prohibidas, código de red, permisos del APK release, libs nativas).
2. La compilación ya corre `verifyOffline<Variant>` y falla si el manifiesto final pide red.
3. Cada dependencia nueva: revisar su manifiesto (`./gradlew :app:processReleaseMainManifest` y leer
   `app/build/intermediates/merged_manifest/release/.../AndroidManifest.xml`) y su licencia; anotar en DEPENDENCIES.md.
4. Modelos: deben venir en el APK (assets) o copiarse una vez por USB. Cero descargas en tiempo de ejecución.
5. Prueba en dispositivo (la hace el usuario): modo avión ON, instalar, abrir, grabar, importar, reproducir, cerrar y reabrir.
