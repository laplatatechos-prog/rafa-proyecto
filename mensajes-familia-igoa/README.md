# Mensajes Familia Igoa

Chat entre el celular (y la familia) y la compu de casa.

- **App del celular**: `index.html` (se publica con GitHub Pages). Se abre con el link que incluye el código de la familia (`?c=...`) y se instala con "Agregar a pantalla de inicio".
- **Programa de la compu**: carpeta `programa-pc/`. `iniciar.vbs` abre `MensajesFamiliaIgoa.ps1` sin ventana negra. Muestra los mensajes, deja responder y, con el botón "Llamar a la compu", sube el volumen y dice con voz "Abrí la computadora".
- **Buzón**: base de datos Supabase, tabla `compu_chat`, funciones `fam_enviar` y `fam_leer` (piden el código de la familia).
