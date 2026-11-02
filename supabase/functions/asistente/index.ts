// Asistente de La Plata Techos.
// POST {modo:"analizar", key, pregunta, historial?}  -> {texto}
// POST {modo:"dictado",  key, texto}                  -> {propuesta}  (no guarda nada)
// POST {modo:"confirmar", key, propuesta}             -> {ok, obra_id}  (guarda la propuesta que Rafael confirmó)
// La clave de administrador es la misma del sistema de presupuestos.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";

const SB = Deno.env.get("SUPABASE_URL")!;
const SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODEL = "claude-opus-5-5";
const LAT = -34.9214, LON = -57.9545; // La Plata

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function rpc(fn: string, args: unknown) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function pronostico() {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&daily=precipitation_sum,precipitation_probability_max,wind_speed_10m_max,temperature_2m_max` +
    `&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=16`;
  try {
    const d = (await (await fetch(u)).json()).daily;
    return d.time.map((t: string, i: number) => ({
      fecha: t, lluvia_mm: d.precipitation_sum[i], prob_lluvia: d.precipitation_probability_max[i],
      viento_kmh: d.wind_speed_10m_max[i], tmax: d.temperature_2m_max[i],
    }));
  } catch { return []; }
}

const hoy = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });

const SISTEMA_ANALISIS = `Sos el asistente operativo de Rafael, dueño de La Plata Techos (techos, impermeabilizaciones, zinguería, estructuras en La Plata).
Hablás en español rioplatense, directo, como jefe de operaciones: sin rodeos, sin frases de cortesía.
Recibís todas las obras (datos del cliente, trabajo, estado, materiales con precios, pedido de materiales, cobros) y el pronóstico de La Plata.
Reglas de criterio:
- Trabajos de techo e impermeabilización no se hacen con lluvia (prob >= 60% o >= 2 mm) ni con viento fuerte (>= 40 km/h). Avisá qué obra choca con qué día y proponé fecha alternativa dentro del pronóstico.
- Una obra con fecha cercana y pedido de materiales "pendiente" o sin pagar es un riesgo: marcalo.
- Saldo a cobrar = total de la obra menos lo cobrado. Ordená los cobros pendientes de mayor a menor.
- Priorizá por plata y por fecha. Respondé con listas numeradas, cortas, con montos en pesos.
- Si falta un dato para decidir, decí cuál.`;

const SISTEMA_DICTADO = `Convertís lo que Rafael dicta (techista de La Plata, habla rápido y coloquial) en datos para su sistema de obras.
Elegí una acción: "nueva" (cliente u obra nueva), "actualizar" (cambios a una obra existente: identificála por nombre de cliente o dirección en la lista y poné su id), o "cobro" (registró un pago de un cliente).
Completá solo lo que se dijo; lo que no se dijo va como null (no inventes). Fechas en formato AAAA-MM-DD; "el martes" o "mañana" se calculan desde la fecha de hoy que te paso.
Montos en pesos argentinos sin puntos ("dos palos" = 2000000, "500 lucas" = 500000).
Materiales: si coinciden con el catálogo, usá su precio y su id; si no, precio_unit null.
"resumen" es una confirmación de 1 a 3 líneas para leer en una burbuja del celular.`;

const ESQUEMA_DICTADO = {
  type: "object",
  additionalProperties: false,
  required: ["accion", "resumen", "obra", "cobro"],
  properties: {
    accion: { type: "string", enum: ["nueva", "actualizar", "cobro"] },
    resumen: { type: "string" },
    obra: {
      anyOf: [{ type: "null" }, {
        type: "object", additionalProperties: false,
        required: ["id", "cliente", "tel", "dir", "fecha", "dias", "estado", "total", "notas", "trabajo", "situacion", "pedido_estado", "pedido_pagado", "materiales"],
        properties: {
          id: { type: ["string", "null"] }, cliente: { type: ["string", "null"] }, tel: { type: ["string", "null"] },
          dir: { type: ["string", "null"] }, fecha: { type: ["string", "null"] }, dias: { type: ["integer", "null"] },
          estado: { anyOf: [{ type: "null" }, { type: "string", enum: ["aceptado", "senada", "curso", "terminada"] }] },
          total: { type: ["number", "null"] }, notas: { type: ["string", "null"] },
          trabajo: { type: ["string", "null"] }, situacion: { type: ["string", "null"] },
          pedido_estado: { anyOf: [{ type: "null" }, { type: "string", enum: ["pendiente", "hecho", "recibido"] }] },
          pedido_pagado: { type: ["boolean", "null"] },
          materiales: {
            anyOf: [{ type: "null" }, {
              type: "array", items: {
                type: "object", additionalProperties: false,
                required: ["nombre", "unidad", "cantidad", "precio_unit", "catalogo_id"],
                properties: {
                  nombre: { type: "string" }, unidad: { type: ["string", "null"] }, cantidad: { type: "number" },
                  precio_unit: { type: ["number", "null"] }, catalogo_id: { type: ["string", "null"] },
                },
              },
            }],
          },
        },
      }],
    },
    cobro: {
      anyOf: [{ type: "null" }, {
        type: "object", additionalProperties: false, required: ["obra_id", "monto", "medio", "fecha"],
        properties: { obra_id: { type: "string" }, monto: { type: "number" }, medio: { type: ["string", "null"] }, fecha: { type: ["string", "null"] } },
      }],
    },
  },
};

function textoDe(msg: Anthropic.Message) {
  return msg.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n");
}

// Combina la propuesta del dictado con la obra existente y la guarda.
async function confirmar(key: string, p: any, obras: any[]) {
  if (p?.accion === "cobro" && p.cobro) {
    await rpc("org_cobro", { p_key: key, p: p.cobro });
    return p.cobro.obra_id;
  }
  const n = p?.obra ?? {};
  const ex = obras.find((o) => o.id && o.id === n.id) ?? null;
  const base = ex ?? { id: "", fecha: hoy(), dias: 1, estado: "aceptado", detalle: {}, materiales: [] };
  const pick = (v: unknown, w: unknown) => (v === null || v === undefined ? w : v);
  const det: Record<string, unknown> = { ...(base.detalle ?? {}) };
  for (const k of ["trabajo", "situacion", "pedido_estado", "pedido_pagado"]) if (n[k] !== null && n[k] !== undefined) det[k] = n[k];
  const out: Record<string, unknown> = {
    id: ex ? ex.id : "", cliente: pick(n.cliente, base.cliente), tel: pick(n.tel, base.tel), dir: pick(n.dir, base.dir),
    fecha: pick(n.fecha, base.fecha), dias: pick(n.dias, base.dias), estado: pick(n.estado, base.estado),
    total: pick(n.total, base.total), cuadrilla: base.cuadrilla ?? null,
    notas: [base.notas, n.notas].filter(Boolean).join("\n") || null, detalle: det,
  };
  if (n.materiales?.length) {
    out.materiales = [...(ex ? base.materiales : []), ...n.materiales.map((m: any) => ({ ...m, precio_unit: m.precio_unit ?? 0 }))];
  }
  return await rpc("org_guardar", { p_key: key, p: out });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  let obras: any[];
  try { obras = await rpc("org_listar", { p_key: body.key ?? "" }); }
  catch (e) {
    return String(e).includes("clave incorrecta") ? json({ error: "Clave incorrecta" }, 401) : json({ error: String(e) }, 500);
  }
  if (body.modo === "ping") return json({ ok: true, obras: obras.length });

  try {
    if (body.modo === "confirmar") {
      const id = await confirmar(body.key, body.propuesta, obras);
      return json({ ok: true, obra_id: id });
    }
  } catch (e) { return json({ error: String(e) }, 500); }

  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "Falta cargar ANTHROPIC_API_KEY en los secrets de Supabase." }, 500);
  const client = new Anthropic();
  try {
    if (body.modo === "dictado") {
      const texto = String(body.texto ?? "").slice(0, 4000);
      if (!texto.trim()) return json({ error: "No llegó texto" }, 400);
      const catalogo = await (await fetch(`${SB}/rest/v1/catalogo?select=id,nom,uni,pre`, {
        headers: { apikey: SK, Authorization: `Bearer ${SK}` },
      })).json();
      const lista = obras.map((o) => ({ id: o.id, cliente: o.cliente, dir: o.dir, fecha: o.fecha, estado: o.estado }));
      const msg = await client.messages.create({
        model: MODEL, max_tokens: 4000,
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_DICTADO } },
        system: SISTEMA_DICTADO,
        messages: [{ role: "user", content:
          `Hoy: ${hoy()}\nObras existentes: ${JSON.stringify(lista)}\nCatálogo: ${JSON.stringify(catalogo)}\n\nDictado:\n${texto}` }],
      } as any);
      if (msg.stop_reason === "refusal") return json({ error: "Claude no pudo procesar ese dictado." }, 422);
      return json({ propuesta: JSON.parse(textoDe(msg)) });
    }

    // modo analizar (por defecto)
    const pregunta = String(body.pregunta ?? "Dame el panorama: prioridades de esta semana, riesgos por lluvia, pedidos de materiales y cobros pendientes.").slice(0, 4000);
    const historial = Array.isArray(body.historial) ? body.historial.slice(-10) : [];
    const clima = await pronostico();
    const contexto = `Hoy: ${hoy()}\nPronóstico La Plata (16 días): ${JSON.stringify(clima)}\nObras: ${JSON.stringify(obras)}`;
    const msg = await client.messages.create({
      model: MODEL, max_tokens: 8000,
      output_config: { effort: "medium" },
      system: [{ type: "text", text: SISTEMA_ANALISIS }, { type: "text", text: contexto }],
      messages: [...historial.map((h: any) => ({ role: h.role === "assistant" ? "assistant" : "user", content: String(h.content) })),
                 { role: "user", content: pregunta }],
    } as any);
    if (msg.stop_reason === "refusal") return json({ error: "Claude no respondió esa consulta." }, 422);
    return json({ texto: textoDe(msg) });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
