# Mi Día — app Android

Despertador que te habla, lee tu Google Calendar del celular y anota cosas por voz.
No depende de Claude ni de ningún servidor: todo corre en el celular.

**Descargar:** [dist/MiDia.apk](dist/MiDia.apk)

## Qué hace
1. **Alarma** (por defecto 6:00, todos los días; se cambia en la app). Suena con el celu bloqueado.
2. Dice **"Despertate, Rafael. Despertate."** hasta que digas **"estoy despierto"** (o toques el botón).
3. Pregunta **"¿Te cuento lo que tenés hoy?"** → decís **"sí, decime"**.
4. Lee lo de hoy con horario: *"A las 9 y media de la mañana, llamar al proveedor…"*. Sin deudas ni totales.
5. Pregunta si querés anotar algo más. Lo que digas va al calendario.
6. **Widget** para la pantalla de inicio con botón de micrófono, y atajo "Agregar por voz" (mantener apretado el ícono).
7. **Voz a elección** (motor de voz del celular), velocidad y tono.

## Cómo está hecha
- Kotlin, sin librerías: `AlarmManager.setAlarmClock` + servicio en primer plano + pantalla sobre el bloqueo.
- Calendario: proveedor `CalendarContract` de Android (Google Calendar sincroniza solo, sin claves).
- Voz: `TextToSpeech` y `SpeechRecognizer` del sistema (Google / Samsung).
- `Parser.kt`: el mismo intérprete de frases de `apps-script/Parser.gs`, con las mismas pruebas.

## Compilar
```bash
cd android
echo "sdk.dir=/ruta/al/android-sdk" > local.properties
./gradlew testDebugUnitTest    # 11 pruebas: intérprete, pantallas, alarma, calendario simulado
./gradlew assembleRelease      # necesita keystore.properties + midia-firma.jks (no van al repo)
```
La firma (`midia-firma.jks` + `keystore.properties`) la tiene Rafael. **Sin esa misma firma, una
versión nueva no se instala encima de la vieja** (habría que desinstalar y perder los ajustes).
