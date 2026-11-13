#!/usr/bin/env bash
# Auditoría offline de ReelObra. Sale con código != 0 si encuentra algo prohibido.
set -uo pipefail
cd "$(dirname "$0")/.."
: "${ANDROID_HOME:=/opt/android-sdk}"; export ANDROID_HOME
fail=0
say(){ printf '%s\n' "$*"; }

say "== 1. Dependencias prohibidas en el classpath de release"
deps=$(./gradlew -q :app:dependencies --configuration releaseRuntimeClasspath 2>/dev/null)
bad=$(echo "$deps" | grep -E -i 'firebase|play-services|com\.google\.android\.gms|mlkit|okhttp|retrofit|io\.ktor|analytics|crashlytics|admob|sentry|appcenter' | sort -u)
if [ -n "$bad" ]; then say "FALLA:"; say "$bad"; fail=1; else say "OK"; fi

say "== 2. Código de red en el código fuente propio"
net=$(grep -rnE 'java\.net\.(URL|HttpURLConnection|Socket)|DownloadManager|okhttp|https?://' app/src/main/java 2>/dev/null | grep -v '^\s*//' )
if [ -n "$net" ]; then say "REVISAR:"; say "$net"; fail=1; else say "OK"; fi

say "== 3. Permisos del APK final (release)"
./gradlew -q :app:assembleRelease >/dev/null 2>&1 || { say "FALLA: no compila release"; exit 1; }
apk=$(ls app/build/outputs/apk/release/*.apk | head -1)
aapt2=$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)aapt2
perms=$("$aapt2" dump permissions "$apk")
say "$perms" | grep uses-permission
if echo "$perms" | grep -qE "INTERNET|NETWORK_STATE|WIFI_STATE|AD_ID"; then say "FALLA: permiso de red"; fail=1; else say "OK: sin permisos de red"; fi

say "== 4. Librerías nativas incluidas (revisar que sean las esperadas)"
unzip -l "$apk" | awk '/lib\//{print $4}' | sort

[ $fail -eq 0 ] && say "AUDITORÍA OFFLINE: OK" || say "AUDITORÍA OFFLINE: CON PROBLEMAS"
exit $fail
