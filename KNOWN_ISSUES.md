# Pendientes y problemas conocidos

## Pendientes
- [ ] Confirmar con el usuario las etapas 5+ (el prompt llegó cortado en la Etapa 4).
- [ ] Prueba de Etapa 1 en el teléfono real del usuario (ver TEST_PLAN.md).
- [ ] Usuario elige 2 voces finalistas de las 7 muestras (`muestras-voz/`).
- [ ] Medir RTF de las voces finalistas en su teléfono (Etapa 4).
- [ ] Keystore propio para firmar releases.

## Problemas conocidos
- La rotación del teléfono está fija en vertical (decisión de UX para obra; los clips horizontales importados se reproducen igual).
- No se valida espacio libre antes de grabar/importar (se agrega con la medición de Etapa 2; hoy CameraX corta y guarda si se llena).
- Debug APK pesa ~75 MB por iconos sin minificar; el release pesa ~5 MB.
- Sin pruebas instrumentadas (UI/cámara) todavía: se cubren con la checklist manual.
