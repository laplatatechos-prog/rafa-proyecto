// TPL Obras: tablero de obras de La Plata Techos.
// Datos en Supabase (tpl-presupuestos) vía funciones org_*; razonamiento con Claude vía la función "asistente".
"use strict";
const { url: SB, key: PK, lat: LAT, lon: LON } = window.TPL;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const plata = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-AR");
const hoyISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
const sumarDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fechaCorta = (iso) => iso ? new Date(iso + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" }) : "sin fecha";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ESTADOS = { aceptado: "Aceptado", senada: "Señada", curso: "En curso", terminada: "Terminada" };

// Si ya entró al sistema de presupuestos en este celular, reusa esa clave (mismo sitio).
function claveGuardada() {
  const c = leer("tplobras_clave"); if (c) return c;
  try { return JSON.parse(leer("tpl_akey") || '""') || ""; } catch { return ""; }
}
const st = { clave: claveGuardada(), obras: [], catalogo: [], clima: {}, chat: [], editando: null, propuesta: null };

function leer(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } }
function guardarLocal(k, v) { try { localStorage.setItem(k, v); } catch { /* sin storage */ } }
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2600); }

// ---------- API ----------
async function rpc(fn, args) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { apikey: PK, Authorization: `Bearer ${PK}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const txt = await r.text();
  if (!r.ok) { const e = new Error(txt.includes("clave incorrecta") ? "clave" : txt); e.clave = txt.includes("clave incorrecta"); throw e; }
  return txt ? JSON.parse(txt) : null;
}
async function asistente(body) {
  return asistenteLocal(body, { obras: st.obras, catalogo: st.catalogo, clima: st.clima, rpc, clave: st.clave, hoy: hoyISO() });
}

async function cargar() {
  try {
    st.obras = await rpc("org_listar", { p_key: st.clave });
  } catch (e) {
    if (e.clave) return pedirClave("Clave incorrecta.");
    toast("Sin conexión con la base"); console.error(e);
  }
  render();
}
async function cargarCatalogo() {
  try {
    const r = await fetch(`${SB}/rest/v1/catalogo?select=id,cat,nom,uni,pre&order=nom`, { headers: { apikey: PK, Authorization: `Bearer ${PK}` } });
    st.catalogo = await r.json();
    const dl = document.createElement("datalist"); dl.id = "dlCatalogo";
    dl.innerHTML = st.catalogo.map((c) => `<option value="${esc(c.nom)}">${esc(c.cat)} · ${plata(c.pre)}/${esc(c.uni)}</option>`).join("");
    document.body.append(dl);
  } catch { /* catálogo opcional */ }
}
async function cargarClima() {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=weather_code,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,temperature_2m_max,temperature_2m_min&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=16`;
    const d = (await (await fetch(u)).json()).daily;
    d.time.forEach((t, i) => {
      const dia = { fecha: t, cod: d.weather_code[i], mm: d.precipitation_sum[i], prob: d.precipitation_probability_max[i],
        viento: d.wind_speed_10m_max[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i] };
      dia.malo = dia.prob >= 60 || dia.mm >= 2 || dia.viento >= 40;
      st.clima[t] = dia;
    });
  } catch { toast("No se pudo traer el pronóstico"); }
  render();
}
const icono = (c) => c == null ? "·" : c >= 95 ? "⛈️" : c >= 61 ? "🌧️" : c >= 51 ? "🌦️" : c >= 45 ? "🌫️" : c >= 3 ? "☁️" : c >= 1 ? "⛅" : "☀️";

// ---------- cálculos ----------
function saldo(o) { return (Number(o.total) || 0) - (Number(o.cobrado) || 0); }
function diasObra(o) { return o.fecha ? Array.from({ length: Math.max(1, o.dias || 1) }, (_, i) => sumarDias(o.fecha, i)) : []; }
function diasMalos(o) {
  if (o.detalle && o.detalle.necesita_seco === false) return [];
  return diasObra(o).filter((f) => st.clima[f]?.malo);
}
function espera(o) {
  const desde = o.detalle?.esperando_desde || o.aceptacion?.fecha?.slice(0, 10) || o.presupuesto_fecha?.slice(0, 10);
  return desde && activa(o) ? Math.round((new Date(hoyISO()) - new Date(desde.slice(0, 10))) / 864e5) : 0;
}
function activa(o) { return o.estado !== "terminada"; }

// ---------- render ----------
function render() { renderKpis(); renderLista(); renderClima(); }

function renderKpis() {
  const act = st.obras.filter(activa), hoy = hoyISO(), en7 = sumarDias(hoy, 7);
  const aCobrar = st.obras.reduce((s, o) => s + Math.max(0, saldo(o)), 0);
  const prox = act.filter((o) => o.fecha >= hoy && o.fecha <= en7).length;
  const sinPedido = act.filter((o) => o.fecha && o.fecha <= en7 && (o.detalle?.pedido_estado ?? "pendiente") === "pendiente" && (o.materiales?.length || 0) > 0).length;
  const lluvia = act.filter((o) => diasMalos(o).length).length;
  $("#kpis").innerHTML = `
    <div class="kpi"><b>${plata(aCobrar)}</b><span>Falta cobrar</span></div>
    <div class="kpi"><b>${prox}</b><span>Obras próximos 7 días</span></div>
    <div class="kpi ${sinPedido ? "alerta" : ""}"><b>${sinPedido}</b><span>Pedidos sin hacer (≤ 7 días)</span></div>
    <div class="kpi ${lluvia ? "alerta" : ""}"><b>${lluvia}</b><span>Obras con lluvia pronosticada</span></div>`;
}

function renderLista() {
  const q = $("#buscar").value.trim().toLowerCase(), f = $("#filtroEstado").value;
  let l = st.obras.filter((o) => (f === "activas" ? activa(o) : !f || o.estado === f))
    .filter((o) => !q || `${o.cliente} ${o.dir} ${o.detalle?.trabajo}`.toLowerCase().includes(q));
  l.sort((a, b) => (a.fecha || "9").localeCompare(b.fecha || "9"));
  if (!l.length) { $("#lista").innerHTML = `<p class="muted">No hay obras${q || f ? " con ese filtro" : ""}. Tocá ＋ o el micrófono para cargar.</p>`; return; }
  $("#lista").innerHTML = l.map((o) => {
    const d = o.detalle || {}, malos = diasMalos(o), s = saldo(o), c = st.clima[o.fecha];
    const ped = d.pedido_estado || "pendiente";
    return `<article class="obra ${o.estado}" data-id="${esc(o.id)}">
      <h3><span>${esc(o.cliente || "Sin nombre")}</span><span>${c ? icono(c.cod) : ""}</span></h3>
      <div class="trab">${esc(d.trabajo || o.notas || o.dir || "")}</div>
      <div class="tags">
        <span class="tag">${fechaCorta(o.fecha)}${o.dias > 1 ? ` · ${o.dias} días` : ""}</span>
        <span class="tag">${ESTADOS[o.estado] || o.estado}</span>
        ${d.urgencia === "urgente" || d.urgencia === "alta" ? `<span class="tag mal">${d.urgencia === "urgente" ? "Urgente" : "Urgencia alta"}</span>` : ""}
        ${espera(o) > 30 ? `<span class="tag warn">Espera ${espera(o)} días</span>` : ""}
        ${malos.length ? `<span class="tag mal">Lluvia: ${malos.map(fechaCorta).join(", ")}</span>` : ""}
        ${o.materiales?.length ? `<span class="tag ${ped === "pendiente" ? "warn" : "ok"}">Pedido ${ped}${d.pedido_pagado ? " · pagado" : ped !== "pendiente" ? " · sin pagar" : ""} · ${plata(o.total_materiales)}</span>` : ""}
        ${o.total ? `<span class="tag ${s > 0 ? "warn" : "ok"}">${s > 0 ? "Falta " + plata(s) : "Cobrado"}</span>` : ""}
      </div></article>`;
  }).join("");
}

function renderClima() {
  const dias = Object.values(st.clima);
  if (!dias.length) { $("#clima").innerHTML = `<p class="muted">Cargando…</p>`; return; }
  $("#clima").innerHTML = dias.map((d) => {
    const obs = st.obras.filter((o) => activa(o) && diasObra(o).includes(d.fecha));
    const nombres = obs.map((o) => d.malo && o.detalle?.necesita_seco !== false ? `<b>${esc(o.cliente)}</b>` : esc(o.cliente)).join(", ");
    return `<div class="dia ${d.malo ? "mal" : "ok"}">
      <div><b>${fechaCorta(d.fecha)}</b></div>
      <div>${icono(d.cod)} ${Math.round(d.min)}–${Math.round(d.max)}° · ${d.prob ?? 0}% · ${d.mm ?? 0} mm · ${Math.round(d.viento)} km/h
        ${nombres ? `<div class="obras">${nombres}</div>` : ""}</div>
      <div>${d.malo ? "✋" : "✅"}</div></div>`;
  }).join("");
}

// ---------- editor ----------
function abrirObra(o) {
  st.editando = o ? structuredClone(o) : { id: "", fecha: hoyISO(), dias: 1, estado: "aceptado", detalle: { necesita_seco: true, pedido_estado: "pendiente" }, materiales: [], cobros: [] };
  const e = st.editando, d = e.detalle || {}, f = $("#formObra");
  $("#tituloObra").textContent = o ? e.cliente || "Obra" : "Nueva obra";
  for (const n of ["cliente", "tel", "dir", "estado", "total", "fecha", "dias", "notas"]) f.elements[n].value = e[n] ?? "";
  for (const n of ["trabajo", "situacion", "pedido_estado", "pedido_proveedor", "urgencia", "cliente_desde", "esperando_desde"])
    f.elements[n].value = d[n] ?? ({ pedido_estado: "pendiente", urgencia: "media", esperando_desde: o ? "" : hoyISO() }[n] ?? "");
  f.elements.pedido_pagado.checked = !!d.pedido_pagado;
  f.elements.necesita_seco.checked = d.necesita_seco !== false;
  renderMats(); renderCobros(); climaObra(); wa();
  $("#dlgObra").showModal();
}
function renderMats() {
  $("#mats").innerHTML = st.editando.materiales.map((m, i) => `<div class="mat" data-i="${i}">
      <input list="dlCatalogo" data-k="nombre" value="${esc(m.nombre)}" placeholder="Material">
      <input data-k="cantidad" type="number" step="any" inputmode="decimal" value="${m.cantidad ?? 1}" title="Cantidad">
      <input data-k="precio_unit" type="number" step="any" inputmode="decimal" value="${m.precio_unit ?? 0}" title="Precio unitario">
      <button type="button" data-del="${i}" aria-label="Quitar">✕</button></div>`).join("");
  totales();
}
function totales() {
  const e = st.editando, tm = e.materiales.reduce((s, m) => s + (+m.cantidad || 0) * (+m.precio_unit || 0), 0);
  const cob = e.cobros.reduce((s, c) => s + (+c.monto || 0), 0), tot = +$("#formObra").elements.total.value || 0;
  $("#totMat").textContent = plata(tm); $("#totCob").textContent = plata(cob); $("#saldo").textContent = plata(tot - cob);
}
function renderCobros() {
  $("#cobros").innerHTML = st.editando.cobros.map((c) => `<div class="cob"><span>${fechaCorta(c.fecha)} · ${esc(c.medio || "")}</span>
    <span>${plata(c.monto)} ${c.id ? `<button type="button" data-delcob="${c.id}" aria-label="Borrar">✕</button>` : ""}</span></div>`).join("");
  totales();
}
function climaObra() {
  const f = $("#formObra").elements, o = { fecha: f.fecha.value, dias: +f.dias.value || 1, detalle: { necesita_seco: f.necesita_seco.checked } };
  const txt = diasObra(o).map((d) => st.clima[d] ? `${fechaCorta(d)} ${icono(st.clima[d].cod)} ${st.clima[d].prob}%${st.clima[d].malo ? " ✋" : ""}` : null).filter(Boolean);
  const malos = diasMalos(o);
  $("#climaObra").innerHTML = txt.length ? txt.join(" · ") + (malos.length ? `<div class="err">Lluvia o viento en ${malos.length} día(s). Conviene mover la fecha.</div>` : "") : "Fuera del pronóstico (más de 16 días).";
}
function telWa(t) {
  let n = String(t || "").replace(/\D/g, "");
  if (!n) return "";
  if (n.startsWith("54")) n = n.slice(2);
  if (n.startsWith("0")) n = n.slice(1);
  n = n.replace(/^(\d{2,4})15(\d{6,8})$/, "$1$2"); // saca el 15 de celulares
  if (!n.startsWith("9")) n = "9" + n;
  return "54" + n;
}
function wa() {
  const f = $("#formObra").elements, n = telWa(f.tel.value), a = $("#btnWa");
  const msg = `Hola ${f.cliente.value.split(" ")[0] || ""}, te escribo de La Plata Techos. ` +
    (f.fecha.value ? `Tenemos programado el trabajo para el ${fechaCorta(f.fecha.value)}. ¿Te queda bien?` : "");
  a.href = n ? `https://wa.me/${n}?text=${encodeURIComponent(msg)}` : "#";
  a.style.visibility = n ? "visible" : "hidden";
}
function datosForm() {
  const f = $("#formObra").elements, e = st.editando;
  return {
    id: e.id || "", cliente: f.cliente.value.trim(), tel: f.tel.value.trim(), dir: f.dir.value.trim(), estado: f.estado.value,
    total: f.total.value, fecha: f.fecha.value, dias: f.dias.value, notas: f.notas.value, cuadrilla: e.cuadrilla ?? null,
    detalle: { trabajo: f.trabajo.value, situacion: f.situacion.value, necesita_seco: f.necesita_seco.checked,
      pedido_estado: f.pedido_estado.value, pedido_pagado: f.pedido_pagado.checked, pedido_proveedor: f.pedido_proveedor.value,
      pedido_fecha: e.detalle?.pedido_fecha ?? null, urgencia: f.urgencia.value,
      cliente_desde: f.cliente_desde.value, esperando_desde: f.esperando_desde.value },
    materiales: e.materiales.filter((m) => String(m.nombre || "").trim()),
  };
}
async function guardarObra(p) {
  const id = await rpc("org_guardar", { p_key: st.clave, p });
  return id;
}

// ---------- dictado ----------
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function abrirDictado() {
  st.propuesta = null; $("#dictTexto").value = ""; $("#dictPropuesta").innerHTML = ""; $("#btnConfirmar").disabled = true;
  $("#dlgDictado").showModal();
  if (!Rec) { $("#dictEstado").textContent = "Este navegador no dicta. Usá el micrófono del teclado y escribí acá."; $("#dictTexto").focus(); return; }
  rec = new Rec(); rec.lang = "es-AR"; rec.interimResults = true; rec.continuous = true;
  let base = "";
  rec.onresult = (ev) => {
    let fin = "", tmp = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) (ev.results[i].isFinal ? (fin += ev.results[i][0].transcript) : (tmp += ev.results[i][0].transcript));
    base += fin; $("#dictTexto").value = (base + " " + tmp).trim();
  };
  rec.onend = () => { $("#btnDictar").classList.remove("rec"); $("#dictEstado").textContent = "Listo. Corregí si hace falta y tocá Interpretar."; if ($("#dictTexto").value.trim()) interpretar(); };
  rec.onerror = (ev) => { $("#dictEstado").textContent = ev.error === "not-allowed" ? "Permití el micrófono para dictar." : "No se escuchó. Probá de nuevo o escribí."; };
  rec.start(); $("#btnDictar").classList.add("rec"); $("#dictEstado").textContent = "Escuchando… tocá Interpretar cuando termines.";
}
async function interpretar() {
  if (rec) { try { rec.onend = null; rec.stop(); } catch { } rec = null; $("#btnDictar").classList.remove("rec"); }
  const texto = $("#dictTexto").value.trim(); if (!texto) return;
  $("#dictEstado").textContent = "Claude está ordenando los datos…"; $("#btnConfirmar").disabled = true;
  try {
    const { propuesta } = await asistente({ modo: "dictado", texto });
    st.propuesta = propuesta; mostrarPropuesta(propuesta);
    $("#dictEstado").textContent = "Revisá y confirmá."; $("#btnConfirmar").disabled = false;
  } catch (e) { $("#dictEstado").textContent = "Error: " + e.message; }
}
function mostrarPropuesta(p) {
  const o = p.obra || {}, filas = [];
  const add = (k, v) => v != null && v !== "" && filas.push(`<dt>${k}</dt><dd>${esc(v)}</dd>`);
  if (p.accion === "cobro" && p.cobro) {
    const ob = st.obras.find((x) => x.id === p.cobro.obra_id);
    add("Cliente", ob?.cliente || "¿?"); add("Cobro", plata(p.cobro.monto)); add("Medio", p.cobro.medio); add("Fecha", p.cobro.fecha);
  } else {
    if (p.accion === "actualizar") add("Obra", st.obras.find((x) => x.id === o.id)?.cliente || "No encontrada: se crea nueva");
    add("Cliente", o.cliente); add("Tel", o.tel); add("Dirección", o.dir); add("Trabajo", o.trabajo); add("Situación", o.situacion);
    add("Estado", ESTADOS[o.estado]); add("Inicio", o.fecha && fechaCorta(o.fecha)); add("Días", o.dias); add("Total", o.total != null ? plata(o.total) : null);
    add("Urgencia", o.urgencia); add("Pedido", o.pedido_estado); add("Pedido pagado", o.pedido_pagado == null ? null : o.pedido_pagado ? "sí" : "no");
    if (o.materiales?.length) add("Materiales", o.materiales.map((m) => `${m.cantidad} ${m.unidad || ""} ${m.nombre}${m.precio_unit ? " @ " + plata(m.precio_unit) : ""}`).join("; "));
    add("Notas", o.notas);
  }
  $("#dictPropuesta").innerHTML = `<div class="prop"><div class="res">${esc(p.resumen)}</div><dl>${filas.join("")}</dl></div>`;
}
async function confirmarPropuesta() {
  const p = st.propuesta; if (!p) return;
  $("#btnConfirmar").disabled = true;
  try {
    await asistente({ modo: "confirmar", propuesta: p });
    $("#dlgDictado").close(); toast("Cargado ✔"); await cargar();
  } catch (e) { toast("Error: " + e.message); $("#btnConfirmar").disabled = false; }
}

// ---------- asistente ----------
async function preguntar(q) {
  if (!q.trim()) return;
  const hist = st.chat.slice(-10);
  st.chat.push({ role: "user", content: q }); pintarChat(true);
  try {
    const { texto } = await asistente({ modo: "analizar", pregunta: q, historial: hist });
    st.chat.push({ role: "assistant", content: texto });
  } catch (e) { st.chat.push({ role: "assistant", content: "Error: " + e.message }); }
  pintarChat(false);
}
function pintarChat(pensando) {
  $("#chat").innerHTML = st.chat.map((m) => `<div class="msg ${m.role === "user" ? "yo" : ""}">${esc(m.content)}</div>`).join("") +
    (pensando ? `<div class="msg muted">Claude está pensando…</div>` : "");
  window.scrollTo(0, document.body.scrollHeight);
}

// ---------- clave ----------
function pedirClave(err = "") { $("#claveErr").textContent = err; $("#dlgClave").showModal(); }
$("#formClave").addEventListener("submit", async (ev) => {
  ev.preventDefault(); st.clave = $("#clave").value;
  try { await rpc("org_listar", { p_key: st.clave }); guardarLocal("tplobras_clave", st.clave); $("#dlgClave").close(); cargar(); }
  catch (e) { $("#claveErr").textContent = e.clave ? "Clave incorrecta." : "Sin conexión."; }
});

// ---------- eventos ----------
$$(".tabs button").forEach((b) => b.addEventListener("click", () => {
  $$(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  for (const t of ["obras", "clima", "asistente"]) $("#tab-" + t).hidden = t !== b.dataset.tab;
}));
$("#buscar").addEventListener("input", renderLista);
$("#filtroEstado").addEventListener("change", renderLista);
$("#lista").addEventListener("click", (ev) => { const a = ev.target.closest(".obra"); if (a) abrirObra(st.obras.find((o) => o.id === a.dataset.id)); });
$("#btnNueva").addEventListener("click", () => abrirObra(null));
$$("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
$("#btnMat").addEventListener("click", () => { st.editando.materiales.push({ nombre: "", unidad: "u", cantidad: 1, precio_unit: 0 }); renderMats(); $$("#mats .mat input")[st.editando.materiales.length * 3 - 3]?.focus(); });
$("#mats").addEventListener("input", (ev) => {
  const row = ev.target.closest(".mat"); if (!row) return;
  const m = st.editando.materiales[+row.dataset.i], k = ev.target.dataset.k;
  m[k] = k === "nombre" ? ev.target.value : ev.target.value;
  if (k === "nombre") {
    const c = st.catalogo.find((x) => x.nom === ev.target.value);
    if (c) { m.catalogo_id = c.id; m.unidad = c.uni; m.precio_unit = c.pre; row.querySelector('[data-k="precio_unit"]').value = c.pre; }
  }
  totales();
});
$("#mats").addEventListener("click", (ev) => { const i = ev.target.dataset.del; if (i != null) { st.editando.materiales.splice(+i, 1); renderMats(); } });
$("#formObra").elements.total.addEventListener("input", totales);
for (const n of ["fecha", "dias", "necesita_seco"]) $("#formObra").elements[n].addEventListener("input", climaObra);
for (const n of ["tel", "cliente", "fecha"]) $("#formObra").elements[n].addEventListener("input", wa);
$("#btnCobro").addEventListener("click", async () => {
  const monto = +$("#cobroMonto").value; if (!monto) return;
  if (!st.editando.id) return toast("Guardá la obra antes de cargar cobros");
  try {
    const id = await rpc("org_cobro", { p_key: st.clave, p: { obra_id: st.editando.id, monto, medio: $("#cobroMedio").value } });
    st.editando.cobros.push({ id, monto, medio: $("#cobroMedio").value, fecha: hoyISO() });
    $("#cobroMonto").value = ""; $("#cobroMedio").value = ""; renderCobros(); cargar();
  } catch (e) { toast("Error: " + e.message); }
});
$("#cobros").addEventListener("click", async (ev) => {
  const id = ev.target.dataset.delcob; if (!id || !confirm("¿Borrar este cobro?")) return;
  try { await rpc("org_borrar_cobro", { p_key: st.clave, p_id: id }); st.editando.cobros = st.editando.cobros.filter((c) => c.id !== id); renderCobros(); cargar(); }
  catch (e) { toast("Error: " + e.message); }
});
$("#formObra").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try { await guardarObra(datosForm()); $("#dlgObra").close(); toast("Guardado ✔"); cargar(); }
  catch (e) { toast("Error: " + e.message); }
});
$("#btnDictar").addEventListener("click", abrirDictado);
$("#btnInterpretar").addEventListener("click", interpretar);
$("#btnConfirmar").addEventListener("click", confirmarPropuesta);
$("#dlgDictado").addEventListener("close", () => { if (rec) { try { rec.onend = null; rec.stop(); } catch { } rec = null; $("#btnDictar").classList.remove("rec"); } });
$$(".chips button").forEach((b) => b.addEventListener("click", () => preguntar(b.dataset.q)));
$("#formChat").addEventListener("submit", (ev) => { ev.preventDefault(); const q = $("#pregunta").value; $("#pregunta").value = ""; preguntar(q); });

// ---------- arranque ----------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
cargarCatalogo(); cargarClima();
if (!st.clave) pedirClave(); else cargar();
const qs = new URLSearchParams(location.search);
if (qs.get("dictar")) setTimeout(abrirDictado, 400);
if (qs.get("texto")) { setTimeout(() => { abrirDictado(); $("#dictTexto").value = qs.get("texto"); interpretar(); }, 600); }
