# Mi Día — asistente de agenda por voz

App personal: todos los días a las 6 AM te lee en voz alta lo que tenés que hacer
("a las 8 de la mañana: obra Gonnet; a las 2 de la tarde: cita con Pérez…"), te dice
qué deudas vencen y te pregunta si querés agregar algo más. Desde el celular apretás
un botón, hablás, y queda agendado en tu Google Calendar o anotado como deuda.

```
Celular (app "Mi Día" + automatización 6 AM)
        │  internet
        ▼
Google Apps Script (tu cuenta)  ──►  Google Calendar (todos tus calendarios)
                                ──►  Google Sheets  "Asistente Rafa — Deudas"
                                ──►  Gmail: resumen de respaldo a las 6 AM
```

Costo: **$0**. Todo corre en tu cuenta de Google. No hay servidor que mantener.

| Carpeta | Qué es |
|---|---|
| `apps-script/` | El "cerebro": lee calendarios, entiende frases, guarda deudas. Se pega en script.google.com |
| `docs/` | La app del celular (se publica gratis con GitHub Pages) |
| `tests/` | Pruebas automáticas (`npm test`) |

---

## Instalación (una sola vez, ~15 minutos)

### Paso 1 — El cerebro en Google (desde la compu)

1. Entrá a <https://script.google.com> con la cuenta de Google donde tenés el calendario → **Nuevo proyecto**. Ponele de nombre `Asistente Rafa`.
2. Borrá lo que hay en `Código.gs` y pegá el contenido de [`apps-script/Codigo.gs`](apps-script/Codigo.gs).
3. Botón **+** → **Secuencia de comandos** → nombre `Parser` → pegá [`apps-script/Parser.gs`](apps-script/Parser.gs).
4. ⚙️ **Configuración del proyecto** → tildá **"Mostrar el archivo de manifiesto appsscript.json"**. Volvé al editor, abrí `appsscript.json` y reemplazalo por [`apps-script/appsscript.json`](apps-script/appsscript.json).
5. Arriba elegí la función **`configurar`** → **Ejecutar** → aceptá los permisos (Google avisa "app no verificada": **Configuración avanzada → Ir a Asistente Rafa**. Es tu propio código).
6. Abajo, en el **Registro de ejecución**, aparece **TU CLAVE SECRETA**. Copiala.
7. **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   - **Implementar** → copiá la **URL de la aplicación web** (termina en `/exec`).

> Si después cambiás el código: **Implementar → Gestionar implementaciones → ✏️ → Versión: nueva**. Así la URL no cambia.

### Paso 2 — La app en el celular

1. En GitHub: **Settings → Pages → Branch: `main` / carpeta `/docs` → Save**. La app queda en
   `https://laplatatechos-prog.github.io/rafa-proyecto/`
2. Abrila en **Chrome** (Android) o **Safari** (iPhone).
3. Pegá la URL del paso 1.7 y la clave del paso 1.6 → **Guardar y probar** → tiene que decir ✅ Conectado.
4. Menú del navegador → **Agregar a pantalla principal / Instalar app**.
5. **Botón directo para hablar (Android):** mantené apretado el ícono "Mi Día" → arrastrá **"Agregar por voz"** a la pantalla. Queda un botón que abre directo el micrófono.

### Paso 3 — Que te hable solo a las 6 AM

#### Android → app gratuita **MacroDroid**

Nueva macro:

- **Disparador:** Fecha/Hora → Hora del día → `06:00`, todos los días.
- **Acción 1:** Conectividad → **Solicitud HTTP** → GET →
  `TU_URL/exec?accion=resumen&formato=texto&clave=TU_CLAVE`
  → guardar respuesta en variable de texto `resumen`.
- **Acción 2:** Dispositivo → **Hablar texto** → `{v=resumen}` (idioma Español).
- **Acción 3 (para contestarle):** Aplicaciones → **Abrir sitio web** →
  `https://laplatatechos-prog.github.io/rafa-proyecto/?modo=voz`

Bonus: en MacroDroid podés crear un **widget de pantalla** ("Botón de acceso directo") que dispare la misma macro cuando quieras escuchar el día de nuevo.

#### iPhone → app **Atajos**

**Automatización** → **Hora del día 06:00** → Diario → **Ejecutar inmediatamente**. Acciones:

1. *Obtener contenido de URL* → `TU_URL/exec?accion=resumen&formato=texto&clave=TU_CLAVE`
2. *Leer texto* → (Contenido de la URL)
3. *Dictar texto* (idioma Español)
4. *Obtener contenido de URL* → `TU_URL/exec?accion=agregar&formato=texto&clave=TU_CLAVE&texto=` + *Texto dictado*
5. *Leer texto* → (Contenido de la URL)

Duplicá los pasos 3–5 como un atajo aparte llamado **"Anotar"** y ponelo como **widget** en la pantalla de inicio, o decí *"Oye Siri, anotar"*.

**Respaldo:** además, a las 6 AM te llega un mail con el mismo resumen.

---

## Qué le podés decir

| Decís | Qué hace |
|---|---|
| "Agregame a las 2 de la tarde una cita con Pérez" | Evento hoy 14:00, aviso 30 min antes |
| "Mañana a las 9 medición en City Bell" | Evento mañana 9:00 |
| "El viernes a las 10 y media reunión con el arquitecto" | Evento viernes 10:30 |
| "El 15 de diciembre a las 8 entrega de materiales" | Evento con fecha |
| "Agregame que tengo que ir a buscar las membranas" | Tarea de hoy (sin hora) 📌 |
| "Recordame mañana comprar tornillos" | Tarea para mañana |
| "Le debo 50 mil a Juan para el viernes" | Deuda + evento "💸 Pagar 50.000 pesos a Juan" el viernes |
| "Deuda con Corralón Norte de $350.000 por las chapas" | Deuda con concepto |
| "Le debo 300 dólares a mi cuñado" | Deuda en dólares |
| "Gómez me debe 1,5 millones de la obra de Tolosa" | Plata a cobrar |
| "Tengo que cobrarle a Ramírez 80 lucas el 25" | Cobro con fecha |

Reglas: "a las 3" sin decir mañana/tarde se toma como **15 hs** (horario de obra: de 1 a 6 = tarde).
Si la hora ya pasó y no dijiste el día, va para mañana. En modo mañana, decí **"no"** o **"listo"** para cortar.

Si entendió mal: botón **Deshacer** (aparece 9 segundos) y lo repetís.

## Ajustes opcionales

En Apps Script → ⚙️ Configuración del proyecto → **Propiedades de la secuencia de comandos**:

| Propiedad | Para qué |
|---|---|
| `NOMBRE` | Cómo te saluda (por defecto `Rafael`) |
| `CALENDARIO` | ID del calendario donde agenda lo nuevo (por defecto el principal) |
| `EXCLUIR` | Calendarios que NO querés que lea, separados por coma (ej: `Cumpleaños,Feriados en Argentina`) |
| `URL_APP` | Link de la app para que aparezca en el mail de las 6 AM |

## Seguridad

- La clave secreta es lo único que protege tus datos. **No la publiques ni la subas a GitHub.**
- Si se filtra: borrá la propiedad `CLAVE`, ejecutá `configurar` otra vez y cargá la nueva clave en el celular y en MacroDroid/Atajos.

## Desarrollo

```bash
npm test            # prueba el intérprete de frases y el backend con Google simulado
npm run simulador   # backend falso en http://localhost:8787/exec (clave: prueba)
```
