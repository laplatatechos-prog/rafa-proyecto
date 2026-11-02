# TPL Obras — organizador de obras de La Plata Techos

Tres piezas que comparten la misma base de datos (Supabase `tpl-presupuestos`):

| Pieza | Carpeta | Qué hace |
|---|---|---|
| Tablero web (PWA) | `web/` | Obras por cliente: trabajo, estado, materiales con precio, pedido hecho/pagado, cobros y saldo, fecha, pronóstico de La Plata, chat con Claude y dictado. Se instala en el celular desde Chrome ("Agregar a pantalla principal"). |
| Asistente Claude | `supabase/functions/asistente/` | `analizar`: razona sobre todas las obras + pronóstico. `dictado`: convierte lo dictado en una propuesta. `confirmar`: guarda la propuesta que Rafael aprobó. |
| Burbuja Android | `android/` | Burbuja flotante sobre cualquier app. Tocás, dictás, Claude ordena, confirmás y se carga. |

## Base de datos
`supabase/migrations/001_organizador.sql` agrega `obra_detalle`, `obra_materiales` y `obra_cobros` a la tabla `obras` existente, sin modificar lo que ya existe. Todo se lee y escribe con las funciones `org_*`, que piden la clave de administrador del sistema de presupuestos.

## Configuración
- La clave de la API de Claude va como secret `ANTHROPIC_API_KEY` en Supabase → Edge Functions → Secrets. Nunca en el código.
- Pronóstico: Open-Meteo (gratis, sin clave).

## Publicación
- Tablero: carpeta `obras/` de la rama `gh-pages` (https://laplatatechos-prog.github.io/rafa-proyecto/obras/), se publica sola al hacer push a `main`. No toca el resto del sitio, donde está el sistema de presupuestos.
- APK: se compila sola en GitHub Actions y queda en la release `burbuja-latest` (`.github/workflows/android.yml`).
