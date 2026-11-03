// Capa de datos sin tablas nuevas.
// Los datos base de cada obra van en la tabla "obras" (función guardar_obra del sistema de presupuestos).
// Lo extra (trabajo, urgencia, materiales, pedido, cobros) va en una fila de "presupuestos" con id "org-<obra>".
// Imita las funciones org_listar / org_guardar / org_cobro / org_borrar_cobro, así el resto de la app no cambia.
"use strict";

const DB = (() => {
  const { url: SB, key: PK } = window.TPL;
  const H = { apikey: PK, Authorization: `Bearer ${PK}`, "Content-Type": "application/json" };
  const hoy = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  async function rest(path, opt = {}) {
    const r = await fetch(`${SB}/rest/v1/${path}`, { ...opt, headers: { ...H, ...(opt.headers || {}) } });
    const t = await r.text();
    if (!r.ok) throw new Error(`Base ${r.status}: ${t.slice(0, 200)}`);
    return t ? JSON.parse(t) : null;
  }
  const rpc = (fn, args) => rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

  async function extras(ids) {
    if (!ids.length) return {};
    const rows = await rest(`presupuestos?select=id,data&id=in.(${ids.map((i) => `"org-${i}"`).join(",")})`);
    return Object.fromEntries((rows || []).map((r) => [r.id.slice(4), r.data || {}]));
  }

  async function guardarExtra(obra, ex) {
    const data = {
      org: true, cli: obra.cliente || "", num: "ORG", vend: "organizador", fecha: hoy(),
      detalle: ex.detalle || {}, materiales: ex.materiales || [], cobros: ex.cobros || [],
    };
    await rest("presupuestos?on_conflict=id", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ id: "org-" + obra.id, num: "ORG", vend: "organizador", cli: obra.cliente || "",
        total: Number(obra.total) || 0, data, updated_at: new Date().toISOString() }]),
    });
  }

  async function listar() {
    const obras = (await rest("obras?select=*")) || [];
    const ex = await extras(obras.map((o) => o.id));
    const presIds = obras.map((o) => o.pres_id).filter(Boolean);
    let presFecha = {};
    if (presIds.length) {
      const ps = await rest(`presupuestos?select=id,created_at&id=in.(${presIds.map((i) => `"${i}"`).join(",")})`).catch(() => []);
      presFecha = Object.fromEntries((ps || []).map((p) => [p.id, p.created_at]));
    }
    let acept = {};
    try { (await rpc("aceptados_resumen", {}) || []).forEach((a) => { acept[a.pres_id] = a; }); } catch { /* opcional */ }
    return obras.filter((o) => !(ex[o.id]?.detalle?.borrada)).map((o) => {
      const e = ex[o.id] || {};
      const mats = e.materiales || [], cobros = e.cobros || [];
      const a = o.pres_id && acept[o.pres_id];
      return {
        ...o, detalle: Object.keys(e.detalle || {}).length ? e.detalle : null, materiales: mats, cobros,
        total_materiales: mats.reduce((s, m) => s + (+m.cantidad || 0) * (+m.precio_unit || 0), 0),
        cobrado: cobros.reduce((s, c) => s + (+c.monto || 0), 0),
        presupuesto_fecha: presFecha[o.pres_id] || null,
        aceptacion: a ? { fecha: a.created_at || a.fecha || null, forma: a.forma ?? null, cuotas: a.cuotas ?? null,
          monto: a.monto ?? null, anticipo: a.anticipo ?? null, fecha_obra_pedida: a.fecha_obra ?? null } : null,
      };
    }).sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));
  }

  async function guardar(p) {
    const id = p.id || "o" + uid().replace(/-/g, "");
    const prev = p.id ? ((await rest(`obras?select=*&id=eq.${encodeURIComponent(p.id)}`)) || [])[0] : null;
    const val = (k, d = null) => (p[k] === undefined ? (prev ? prev[k] : d) : p[k]);
    const obra = {
      id, fecha: val("fecha") || hoy(), dias: val("dias", 1) || 1, hora: prev?.hora ?? null, hora_fin: prev?.hora_fin ?? null,
      cliente: val("cliente", ""), tel: val("tel"), dir: val("dir"), cuadrilla: val("cuadrilla") ?? prev?.cuadrilla ?? null,
      estado: val("estado", "aceptado") || "aceptado", pres_id: prev?.pres_id ?? null, pres_num: prev?.pres_num ?? null,
      total: val("total") === "" ? null : val("total"), notas: val("notas"), cargo: prev?.cargo ?? null, updated_by: "organizador",
    };
    await rpc("guardar_obra", { p_obra: obra });
    const viejo = (await extras([id]))[id] || {};
    const det = { ...(viejo.detalle || {}), ...(p.detalle || {}) };
    if (!det.esperando_desde && !prev) det.esperando_desde = hoy();
    await guardarExtra(obra, {
      detalle: det,
      materiales: p.materiales !== undefined ? p.materiales.map((m) => ({ ...m, id: m.id || uid() })) : (viejo.materiales || []),
      cobros: viejo.cobros || [],
    });
    return id;
  }

  async function modificarCobros(obraId, f) {
    const obra = ((await rest(`obras?select=*&id=eq.${encodeURIComponent(obraId)}`)) || [])[0];
    if (!obra) throw new Error("No encontré esa obra");
    const viejo = (await extras([obraId]))[obraId] || {};
    const cobros = f(viejo.cobros || []);
    await guardarExtra(obra, { ...viejo, cobros });
  }

  async function cobro(p) {
    const id = uid();
    await modificarCobros(p.obra_id, (cs) => [...cs, { id, fecha: p.fecha || hoy(), monto: Number(p.monto), medio: p.medio || null, nota: p.nota || null }]);
    return id;
  }

  async function borrarCobro(cobroId) {
    const filas = (await rest("presupuestos?select=id,data&id=like.org-*")) || [];
    const fila = filas.find((r) => (r.data?.cobros || []).some((c) => c.id === cobroId));
    if (!fila) return false;
    await modificarCobros(fila.id.slice(4), (cs) => cs.filter((c) => c.id !== cobroId));
    return true;
  }

  return {
    rpc(fn, args) {
      if (fn === "org_listar") return listar();
      if (fn === "org_guardar") return guardar(args.p);
      if (fn === "org_cobro") return cobro(args.p);
      if (fn === "org_borrar_cobro") return borrarCobro(args.p_id);
      return rpc(fn, args);
    },
  };
})();
