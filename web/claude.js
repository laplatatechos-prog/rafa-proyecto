// Claude desde el navegador: la clave de la API queda guardada solo en este celular.
// Mismos modos que antes tenía la función del servidor: analizar, dictado, confirmar.
"use strict";
const CLAUDE_MODEL = "claude-opus-5-5";

const SISTEMA_ANALISIS = `Sos el asistente operativo de Rafael, dueño de La Plata Techos (techos, impermeabilizaciones, zinguería, estructuras en La Plata).
Hablás en español rioplatense, directo, como jefe de operaciones: sin rodeos, sin frases de cortesía.
Recibís todas las obras (cliente, trabajo, estado, materiales con precios, pedido de materiales, cobros, seña aceptada en el sistema de presupuestos, urgencia, antigüedad del cliente, desde cuándo espera) y el pronóstico de La Plata.

Cómo ordenar qué obra va primero. Pesá todo junto, no una sola variable:
1. Plata ya dejada: si el cliente señó o pagó (cobros, aceptacion.anticipo), cuánto y hace cuánto. Quien ya puso plata y espera hace tiempo tiene prioridad: no se lo puede colgar.
2. Tiempo esperando: días desde esperando_desde (o desde presupuesto_fecha / aceptacion.fecha si falta). Más de 30 días con seña es una alerta roja de reputación.
3. Urgencia del cliente (urgente > alta > media > baja). Una filtración activa es urgente aunque el monto sea chico.
4. Beneficio para la empresa: total de la obra menos materiales = margen bruto estimado. Obras grandes y con buen margen suben.
5. Antigüedad del cliente (cliente_desde): un cliente viejo y fiel pesa más; uno nuevo con seña también, porque es la primera impresión.
6. Factibilidad: lluvia o viento en la fecha (techo e impermeabilización no se hacen con prob >= 60 %, >= 2 mm o viento >= 40 km/h), materiales sin pedir o sin pagar.

Cuando te pidan un orden, devolvé una lista numerada: cliente, por qué va en ese lugar (una línea con los números concretos: seña, días esperando, margen, urgencia), y la acción inmediata (pedir material, confirmar fecha por WhatsApp, cobrar saldo). Cerrá con los riesgos: quién está colgado hace demasiado, qué choca con lluvia, qué cobro está atrasado.
Montos en pesos. Si falta un dato que cambia el orden, decí cuál y a quién preguntárselo.`;

const SISTEMA_DICTADO = `Convertís lo que Rafael dicta (techista de La Plata, habla rápido y coloquial) en datos para su sistema de obras.
Elegí una acción: "nueva" (cliente u obra nueva), "actualizar" (cambios a una obra existente: identificála por nombre de cliente o dirección en la lista y poné su id), o "cobro" (registró un pago de un cliente).
Completá solo lo que se dijo; lo que no se dijo va como null (no inventes). Fechas en formato AAAA-MM-DD; "el martes" o "mañana" se calculan desde la fecha de hoy que te paso.
Montos en pesos argentinos sin puntos ("dos palos" = 2000000, "500 lucas" = 500000).
Materiales: si coinciden con el catálogo, usá su precio y su id; si no, precio_unit null.
Urgencia: "se le llueve", "filtración" = urgente; "cuando puedas" = baja. cliente_desde: si dice que es cliente de hace años, estimá la fecha; esperando_desde: desde cuándo espera el trabajo, si lo dice.
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
        required: ["id", "cliente", "tel", "dir", "fecha", "dias", "estado", "total", "notas", "trabajo", "situacion", "pedido_estado", "pedido_pagado", "urgencia", "cliente_desde", "esperando_desde", "materiales"],
        properties: {
          id: { type: ["string", "null"] }, cliente: { type: ["string", "null"] }, tel: { type: ["string", "null"] },
          dir: { type: ["string", "null"] }, fecha: { type: ["string", "null"] }, dias: { type: ["integer", "null"] },
          estado: { anyOf: [{ type: "null" }, { type: "string", enum: ["aceptado", "senada", "curso", "terminada"] }] },
          total: { type: ["number", "null"] }, notas: { type: ["string", "null"] },
          trabajo: { type: ["string", "null"] }, situacion: { type: ["string", "null"] },
          pedido_estado: { anyOf: [{ type: "null" }, { type: "string", enum: ["pendiente", "hecho", "recibido"] }] },
          pedido_pagado: { type: ["boolean", "null"] },
          urgencia: { anyOf: [{ type: "null" }, { type: "string", enum: ["baja", "media", "alta", "urgente"] }] },
          cliente_desde: { type: ["string", "null"] },
          esperando_desde: { type: ["string", "null"] },
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

function claudeKey() { try { return localStorage.getItem("tplobras_claude") || ""; } catch { return ""; } }

async function llamarClaude(payload) {
  let key = claudeKey();
  if (!key) {
    key = (prompt("Pegá tu clave de la API de Claude (empieza con sk-ant-). Queda guardada solo en este celular.") || "").trim();
    if (!key) throw new Error("Falta la clave de Claude");
    try { localStorage.setItem("tplobras_claude", key); } catch { }
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, ...payload }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { try { localStorage.removeItem("tplobras_claude"); } catch { } throw new Error("Clave de Claude inválida. Tocá de nuevo y pegala otra vez."); }
  if (!r.ok) throw new Error(j.error?.message || ("Claude respondió " + r.status));
  if (j.stop_reason === "refusal") throw new Error("Claude no procesó ese pedido.");
  return (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function climaParaClaude(clima) {
  return Object.values(clima).map((d) => ({ fecha: d.fecha, lluvia_mm: d.mm, prob_lluvia: d.prob, viento_kmh: d.viento, tmax: d.max }));
}

// Combina la propuesta del dictado con la obra existente y la guarda.
async function confirmarPropuestaLocal(p, obras, rpc, clave, hoy) {
  if (p?.accion === "cobro" && p.cobro) { await rpc("org_cobro", { p_key: clave, p: p.cobro }); return p.cobro.obra_id; }
  const n = p?.obra ?? {};
  const ex = obras.find((o) => o.id && o.id === n.id) ?? null;
  const base = ex ?? { id: "", fecha: hoy, dias: 1, estado: "aceptado", detalle: {}, materiales: [] };
  const pick = (v, w) => (v === null || v === undefined ? w : v);
  const det = { ...(base.detalle ?? {}) };
  for (const k of ["trabajo", "situacion", "pedido_estado", "pedido_pagado", "urgencia", "cliente_desde", "esperando_desde"]) if (n[k] !== null && n[k] !== undefined) det[k] = n[k];
  const out = {
    id: ex ? ex.id : "", cliente: pick(n.cliente, base.cliente), tel: pick(n.tel, base.tel), dir: pick(n.dir, base.dir),
    fecha: pick(n.fecha, base.fecha), dias: pick(n.dias, base.dias), estado: pick(n.estado, base.estado),
    total: pick(n.total, base.total), cuadrilla: base.cuadrilla ?? null,
    notas: [base.notas, n.notas].filter(Boolean).join("\n") || null, detalle: det,
  };
  if (n.materiales?.length) out.materiales = [...(ex ? base.materiales : []), ...n.materiales.map((m) => ({ ...m, precio_unit: m.precio_unit ?? 0 }))];
  return rpc("org_guardar", { p_key: clave, p: out });
}

// ctx: {obras, catalogo, clima, rpc, clave, hoy}
async function asistenteLocal(body, ctx) {
  if (body.modo === "confirmar") return { ok: true, obra_id: await confirmarPropuestaLocal(body.propuesta, ctx.obras, ctx.rpc, ctx.clave, ctx.hoy) };
  if (body.modo === "dictado") {
    const lista = ctx.obras.map((o) => ({ id: o.id, cliente: o.cliente, dir: o.dir, fecha: o.fecha, estado: o.estado }));
    const cat = ctx.catalogo.map((c) => ({ id: c.id, nom: c.nom, uni: c.uni, pre: c.pre }));
    const txt = await llamarClaude({
      max_tokens: 4000, system: SISTEMA_DICTADO,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_DICTADO } },
      messages: [{ role: "user", content: `Hoy: ${ctx.hoy}\nObras existentes: ${JSON.stringify(lista)}\nCatálogo: ${JSON.stringify(cat)}\n\nDictado:\n${body.texto}` }],
    });
    return { propuesta: JSON.parse(txt) };
  }
  const contexto = `Hoy: ${ctx.hoy}\nPronóstico La Plata (16 días): ${JSON.stringify(climaParaClaude(ctx.clima))}\nObras: ${JSON.stringify(ctx.obras)}`;
  const historial = (body.historial || []).slice(-10).map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: String(h.content) }));
  const texto = await llamarClaude({
    max_tokens: 8000, output_config: { effort: "medium" },
    system: [{ type: "text", text: SISTEMA_ANALISIS }, { type: "text", text: contexto }],
    messages: [...historial, { role: "user", content: body.pregunta }],
  });
  return { texto };
}
