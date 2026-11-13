---
description: Regla offline absoluta. Aplica a todo cambio de dependencias, manifiesto o código de red.
globs: ["**/build.gradle.kts", "**/libs.versions.toml", "**/AndroidManifest.xml", "**/*.kt"]
---
- No agregar dependencias de grupos `com.google.firebase`, `com.google.android.gms`, `com.google.mlkit` (modelos descargables),
  `com.squareup.okhttp3`, `com.squareup.retrofit2`, `io.ktor`, SDKs de analíticas o publicidad.
- No usar `java.net.URL`, `HttpURLConnection`, sockets ni `DownloadManager`.
- No agregar código que descargue modelos: los modelos se empaquetan (assets) o se copian por USB.
- Después de tocar dependencias: `scripts/offline-audit.sh`.
