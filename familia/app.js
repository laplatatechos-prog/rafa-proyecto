/* Casa en Orden · app familiar (PWA + Supabase) */
const SB_URL = "https://dowtczgckcuvxwpgqcpq.supabase.co";
const SB_KEY = "sb_publishable_v6n2zkJXpBEUpR0TlULEVA_UwVMlwoa";
const sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const RUBROS = ["Vivienda","Servicios","Comida","Salud","Chicos","Transporte","Deudas","Proyectos","Gustos","Otros"];
const TABLAS = ["miembros","movs","pagos","deudas","proyectos","tareas","bienes","eventos"];
const COLS_MIEMBROS = "id,hogar_id,user_id,nombre,rol,tipo,edad,mesada,creado";
const DIAS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const COLORS = ["#2a6fdb","#8e44ad","#16a085","#e67e22","#d63384","#7d8c1f","#c2372a"];
const PRIORIDADES = [["Fijos: alquiler, servicios, colegio","Obligatorio","bad"],["Comida y salud","Obligatorio","bad"],["Deudas (cuotas)","Alta","warn"],["Fondo de emergencia","Alta","warn"],["Proyectos","Media",""],["Gustos y salidas","Si sobra","good"]];
const AJ0 = { adolVenPlata:false, dobleAprob:true, umbral:100000, puntos:true, presupuesto:{} };

const S = { session:null, hogares:[], H:null, hogar:null, codigos:{}, miembros:[], movs:[], pagos:[], deudas:[], proyectos:[], tareas:[], bienes:[], eventos:[] };
let tab = "inicio", sub = { plata:"resumen", casa:"tareas" }, cal = null, diaSel = null, chan = null, loaded = false;
const LS = { get(k){ try { return localStorage.getItem(k) } catch(e) { return null } }, set(k,v){ try { localStorage.setItem(k,v) } catch(e) {} } };

/* ---------- utilidades ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = n => "$ " + Math.round(+n || 0).toLocaleString("es-AR");
const pad = n => String(n).padStart(2,"0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
const hoy = () => iso(new Date());
const parse = s => { const [a,b,c] = (s||"").split("-").map(Number); return new Date(a,(b||1)-1,c||1) };
const dias = s => Math.round((parse(s) - parse(hoy())) / 864e5);
const corta = s => { if (!s) return ""; const d = parse(s); return pad(d.getDate()) + "/" + pad(d.getMonth()+1) };
const mes = s => (s||"").slice(0,7);
const addMes = s => { const d = parse(s); d.setMonth(d.getMonth()+1); return iso(d) };
const sum = A => A.reduce((a,x) => a + (+x.monto || 0), 0);
const tag = (t,c="") => `<span class="tag ${c}">${esc(t)}</span>`;

let tt; function toast(m){ clearTimeout(tt); let e = document.querySelector(".toast"); if (!e) { e = document.createElement("div"); e.className = "toast"; e.setAttribute("role","status"); document.body.appendChild(e) } e.textContent = m; tt = setTimeout(() => e.remove(), 2800) }
function errMsg(e){
  const m = (e && (e.message || e.error_description)) || "";
  if (/Invalid login/i.test(m)) return "Mail o contraseña incorrectos";
  if (/already registered/i.test(m)) return "Ese mail ya tiene cuenta. Entrá con tu contraseña.";
  if (/Password should be/i.test(m)) return "La contraseña tiene que tener al menos 6 caracteres";
  if (/row-level security|permission denied/i.test(m)) return "No tenés permiso para hacer esto";
  if (/Email not confirmed/i.test(m)) return "Falta confirmar el mail. Revisá tu correo.";
  if (/rate limit/i.test(m)) return "Demasiados intentos. Esperá un rato.";
  return m || "No se pudo guardar. Probá de nuevo.";
}
async function run(p, ok){ try { const r = await p; if (r && r.error) throw r.error; if (ok) toast(ok); return r } catch(e) { toast(errMsg(e)); return null } }

/* ---------- quién soy ---------- */
const yo = () => S.miembros.find(m => m.user_id === S.session?.user?.id);
const yoId = () => yo()?.id;
const AJ = () => ({ ...AJ0, ...(S.hogar?.ajustes || {}) });
const esAdmin = () => yo()?.rol === "admin";
const vePlata = () => esAdmin() || (AJ().adolVenPlata && yo()?.tipo === "adolescente");
const nombre = id => !id ? "Cualquiera" : (S.miembros.find(m => m.id === id)?.nombre || "Sin asignar");
const color = id => { const i = S.miembros.findIndex(m => m.id === id); return COLORS[(i < 0 ? 0 : i) % COLORS.length] };
const av = id => `<span class="av" style="background:${color(id)}">${esc((nombre(id)[0] || "?").toUpperCase())}</span>`;
const admins = () => S.miembros.filter(m => m.rol === "admin");

/* ---------- datos ---------- */
async function cargarTabla(t){
  const q = t === "miembros" ? sb.from(t).select(COLS_MIEMBROS) : sb.from(t).select("*");
  const { data, error } = await q.eq("hogar_id", S.H);
  if (!error) S[t] = data || [];
}
async function cargarHogar(){ const { data } = await sb.from("hogares").select("*").eq("id", S.H).maybeSingle(); S.hogar = data }
async function cargarCodigos(){ if (!esAdmin()) { S.codigos = {}; return } const { data } = await sb.rpc("codigos", { h: S.H }); S.codigos = {}; (data || []).forEach(r => S.codigos[r.id] = r.codigo) }
async function cargarTodo(){
  await cargarHogar();
  await Promise.all(TABLAS.map(cargarTabla));
  await cargarCodigos();
  loaded = true; render();
}
const pend = {}; let pendT;
function recargar(t){ pend[t] = 1; clearTimeout(pendT); pendT = setTimeout(async () => { const L = Object.keys(pend); L.forEach(k => delete pend[k]);
  for (const k of L) { if (k === "hogares") await cargarHogar(); else await cargarTabla(k) }
  if (L.includes("miembros")) await cargarCodigos(); render() }, 250) }
function suscribir(){
  if (chan) sb.removeChannel(chan);
  chan = sb.channel("hogar-" + S.H);
  TABLAS.forEach(t => chan.on("postgres_changes", { event:"*", schema:"public", table:t, filter:"hogar_id=eq." + S.H }, () => recargar(t)));
  chan.on("postgres_changes", { event:"*", schema:"public", table:"hogares", filter:"id=eq." + S.H }, () => recargar("hogares"));
  chan.subscribe();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.H) TABLAS.forEach(recargar) });

async function ins(t, d){ const r = await run(sb.from(t).insert({ hogar_id: S.H, ...d })); if (r) recargar(t); return r }
async function upd(t, id, d){ const r = await run(sb.from(t).update(d).eq("id", id)); if (r) recargar(t); return r }
async function del(t, id){ const r = await run(sb.from(t).delete().eq("id", id)); if (r) recargar(t); return r }
async function saveAj(d){ const aj = { ...AJ(), ...d }; const r = await run(sb.from("hogares").update({ ajustes: aj }).eq("id", S.H)); if (r) { S.hogar.ajustes = aj; render() } return r }

async function entrarHogar(){
  const { data } = await sb.from("miembros").select("hogar_id").eq("user_id", S.session.user.id);
  S.hogares = (data || []).map(r => r.hogar_id);
  const pref = LS.get("cdo-hogar");
  S.H = S.hogares.includes(pref) ? pref : S.hogares[0] || null;
  if (!S.H) { loaded = true; render(); return }
  LS.set("cdo-hogar", S.H); suscribir(); await cargarTodo();
}

/* ---------- cálculos ---------- */
const movsMes = (m = mes(hoy())) => S.movs.filter(x => mes(x.fecha) === m && x.estado === "aprobado");
function totales(){ const L = movsMes(); const ing = sum(L.filter(x => x.tipo === "ingreso")), gas = sum(L.filter(x => x.tipo === "gasto")); return { ing, gas, saldo: ing - gas } }
const debemos = () => S.deudas.filter(d => d.direccion === "debemos").reduce((a,d) => a + (+d.saldo || 0), 0);
const tareasDe = f => { const w = parse(f).getDay(); return S.tareas.filter(t => t.cat !== "horario" && (!t.dias || !t.dias.length || t.dias.includes(w))) };
const deHoy = () => tareasDe(hoy());
const hecha = (t, f = hoy()) => t.hechas && t.hechas[f];
function puntosSemana(){ const p = {}; const lim = new Date(); lim.setDate(lim.getDate() - 6); const l = iso(lim);
  S.tareas.forEach(t => Object.entries(t.hechas || {}).forEach(([d, who]) => { if (who && d >= l && d <= hoy()) p[who] = (p[who] || 0) + (+t.puntos || 0) })); return p }
const puedoMarcar = t => esAdmin() || !t.quien || t.quien === yoId();
const gastoMesada = id => sum(S.movs.filter(x => x.quien === id && x.mesada && mes(x.fecha) === mes(hoy()) && x.estado !== "rechazado"));

/* ---------- formularios ---------- */
const mOpts = extra => [...(extra || []), ...S.miembros.map(m => [m.id, m.nombre])];
const SCH = {
  movs: () => [{k:"tipo",l:"Tipo",t:"select",o:esAdmin()?[["gasto","Gasto"],["ingreso","Ingreso"]]:[["gasto","Gasto"]]},{k:"descr",l:"Qué fue",req:1},{k:"monto",l:"Monto ($)",t:"number",req:1},{k:"rubro",l:"Rubro",t:"select",o:RUBROS.map(r=>[r,r])},{k:"fecha",l:"Fecha",t:"date"},
    ...(esAdmin()?[{k:"quien",l:"Quién lo pagó o cobró",t:"select",o:mOpts()}]:[]),{k:"ticket",l:"Tengo el ticket o comprobante",t:"check"},{k:"mesada",l:"Salió de una mesada",t:"check"}],
  pagos: () => [{k:"descr",l:"Qué hay que pagar",req:1},{k:"monto",l:"Monto ($)",t:"number"},{k:"vence",l:"Vence",t:"date",req:1},{k:"rubro",l:"Rubro",t:"select",o:RUBROS.map(r=>[r,r])},{k:"recurrente",l:"Se repite todos los meses",t:"check"}],
  deudas: () => [{k:"descr",l:"Deuda",req:1},{k:"direccion",l:"Dirección",t:"select",o:[["debemos","Nosotros debemos"],["nosdeben","Nos deben a nosotros"]]},{k:"saldo",l:"Saldo pendiente ($)",t:"number"},{k:"cuota",l:"Cuota ($)",t:"number"},{k:"cuotas_tot",l:"Cantidad de cuotas",t:"number"},{k:"cuotas_pag",l:"Cuotas pagadas",t:"number"}],
  proyectos: () => [{k:"nombre",l:"Proyecto",req:1},{k:"meta",l:"Meta ($)",t:"number"},{k:"ahorrado",l:"Ya ahorrado ($)",t:"number"},{k:"fecha",l:"Para cuándo",t:"date"},{k:"proximo",l:"Próximo paso"},{k:"quien",l:"Responsable",t:"select",o:mOpts([["","Nadie"]])}],
  tareas: () => [{k:"titulo",l:"Tarea",req:1},{k:"cat",l:"Tipo",t:"select",o:[["limpieza","Limpieza"],["residuos","Residuos"],["rutina","Rutina"],["horario","Horario fijo"]]},{k:"quien",l:"Quién",t:"select",o:mOpts([["","Cualquiera"]])},{k:"dias",l:"Días (ninguno = todos los días)",t:"dias"},{k:"hora",l:"Hora",t:"time"},{k:"puntos",l:"Puntos",t:"number"}],
  bienes: () => [{k:"nombre",l:"Nombre",req:1},{k:"tipo",l:"Tipo",t:"select",o:[["bien","Bien"],["mantenimiento","Mantenimiento"],["documento","Documento"]]},{k:"fecha",l:"Fecha (vencimiento o próximo service)",t:"date"},{k:"nota",l:"Nota (dónde está, número de póliza, etc.)"},{k:"privado",l:"Solo lo ven los administradores",t:"check"}],
  eventos: () => [{k:"titulo",l:"Qué es",req:1},{k:"fecha",l:"Día",t:"date",req:1},{k:"hora",l:"Hora",t:"time"},{k:"quien",l:"Para quién",t:"select",o:mOpts([["","Toda la familia"]])},{k:"nota",l:"Nota"}],
  miembros: o => [{k:"nombre",l:"Nombre",req:1},{k:"rol",l:"Rol",t:"select",o:(admins().length < 2 || o?.rol === "admin") ? [["miembro","Partícipe (sin rol de responsable)"],["admin","Administrador"]] : [["miembro","Partícipe (sin rol de responsable)"]]},{k:"tipo",l:"Tipo",t:"select",o:[["adulto","Adulto"],["adolescente","Adolescente"],["infante","Infante"]]},{k:"edad",l:"Edad",t:"number"},{k:"mesada",l:"Mesada mensual ($)",t:"number"}],
};
const DEF = { movs:()=>({tipo:"gasto",rubro:"Comida",fecha:hoy()}), pagos:()=>({rubro:"Servicios",vence:hoy(),recurrente:true}), deudas:()=>({direccion:"debemos",cuotas_pag:0}), proyectos:()=>({ahorrado:0,quien:yoId()}), tareas:()=>({cat:"limpieza",quien:"",dias:[],puntos:5}), bienes:()=>({tipo:"bien"}), eventos:()=>({fecha:diaSel||hoy(),quien:""}), miembros:()=>({rol:"miembro",tipo:"adolescente",mesada:0}) };
const TIT = { movs:"gasto o ingreso", pagos:"pago", deudas:"deuda", proyectos:"proyecto", tareas:"tarea", bienes:"bien o documento", eventos:"evento", miembros:"miembro" };
const NULLABLE = ["quien","fecha","edad"];

function sheet(html){ const L = document.getElementById("layer"); L.innerHTML = `<div class="sheet-bg" data-act="close"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`; const f = L.querySelector("input,select"); if (f) setTimeout(() => f.focus(), 50) }
function closeSheet(){ document.getElementById("layer").innerHTML = "" }
function fieldHTML(f, v){
  const id = "f_" + f.k;
  if (f.t === "check") return `<label class="fld ck"><input type="checkbox" id="${id}" ${v ? "checked" : ""}> ${esc(f.l)}</label>`;
  if (f.t === "select") return `<label class="fld">${esc(f.l)}<select id="${id}">${f.o.map(([a,b]) => `<option value="${esc(a)}" ${String(v ?? "") === String(a) ? "selected" : ""}>${esc(b)}</option>`).join("")}</select></label>`;
  if (f.t === "dias") return `<div class="fld">${esc(f.l)}<div class="days">${DIAS.map((d,i) => `<label><input type="checkbox" id="${id}_${i}" ${(v || []).includes(i) ? "checked" : ""}>${d}</label>`).join("")}</div></div>`;
  return `<label class="fld">${esc(f.l)}<input type="${f.t || "text"}" id="${id}" value="${esc(v ?? "")}" ${f.t === "number" ? 'inputmode="decimal" step="any"' : ""}></label>`;
}
function readForm(fields){ const o = {}; fields.forEach(f => { const id = "f_" + f.k;
  if (f.t === "check") o[f.k] = document.getElementById(id).checked;
  else if (f.t === "dias") o[f.k] = DIAS.map((_,i) => document.getElementById(id + "_" + i).checked ? i : -1).filter(i => i >= 0);
  else if (f.t === "number") { const v = document.getElementById(id).value.replace(",", "."); o[f.k] = v === "" ? (NULLABLE.includes(f.k) ? null : 0) : +v }
  else { const v = document.getElementById(id).value.trim(); o[f.k] = v === "" && NULLABLE.includes(f.k) ? null : v } }); return o }
let formCtx = null;
function openForm(col, obj){
  const fields = SCH[col](obj); const v = obj || DEF[col](); formCtx = { col, obj, fields };
  const puedeBorrar = obj && (esAdmin() || (col === "eventos" && obj.creado_por === yoId()) || (col === "movs" && obj.creado_por === yoId() && obj.estado === "pendiente"));
  sheet(`<h2>${obj ? "Editar" : "Nuevo"} ${TIT[col]}</h2><form id="frm">${fields.map(f => fieldHTML(f, v[f.k])).join("")}
  <div class="acts">${puedeBorrar ? `<button type="button" class="btn danger" data-act="delete">Borrar</button>` : ""}<button type="button" class="btn line" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`);
}
async function submitForm(){
  const { col, obj, fields } = formCtx; const d = readForm(fields);
  const falta = fields.find(f => f.req && (f.t === "number" ? !(d[f.k] > 0) : !d[f.k])); if (falta) { toast("Completá: " + falta.l); return }
  if (col === "miembros" && d.rol === "admin" && obj?.rol !== "admin" && admins().length >= 2) { toast("Ya hay 2 administradores"); return }
  closeSheet();
  if (obj) { if (col === "movs") { delete d.estado } await upd(col, obj.id, d) && toast("Guardado"); return }
  if (col === "movs") { const r = await ins("movs", d); if (r) toast(esAdmin() ? "Cargado" : "Cargado. Lo tiene que aprobar un administrador"); return }
  if (col === "eventos") { const r = await ins("eventos", { ...d, creado_por: yoId() }); if (r) toast("Agregado al calendario"); return }
  if (col === "miembros") { const r = await ins("miembros", d); if (r) toast("Miembro agregado. Abajo tenés el código para invitarlo."); return }
  const r = await ins(col, { ...DEF[col](), ...d }); if (r) toast("Guardado");
}
function askMonto(titulo, def, cb){ formCtx = { custom: cb }; sheet(`<h2>${esc(titulo)}</h2><form id="frm"><label class="fld">Monto ($)<input type="number" id="f_monto" inputmode="decimal" step="any" value="${esc(def || "")}"></label><div class="acts"><button type="button" class="btn line" data-act="close">Cancelar</button><button class="btn" type="submit">Confirmar</button></div></form>`) }

/* ---------- pantallas ---------- */
const vence = s => { const d = dias(s); if (d < 0) return tag("Vencido","bad"); if (d === 0) return tag("Hoy","bad"); if (d === 1) return tag("Mañana","bad"); if (d <= 7) return tag(d + " días","warn"); return `<span class="muted">${corta(s)}</span>` };
const estTag = m => m.estado === "aprobado" ? tag("Aprobado","good") : m.estado === "rechazado" ? tag("Rechazado","bad") : tag((m.aprob || []).length ? "Falta 1 OK" : "Pendiente","warn");
const ADD = (col, txt) => `<button class="btn" data-act="new" data-col="${col}">+ ${txt}</button>`;
const editAttr = (col, id, ok) => ok ? `data-act="edit" data-col="${col}" data-id="${id}"` : "";

function vInicio(){
  const t = totales(), me = yo(), th = deHoy(), ph = puntosSemana();
  const prox = S.pagos.filter(p => !p.pagado && dias(p.vence) <= 7);
  const urg = S.pagos.filter(p => !p.pagado && dias(p.vence) <= 3).sort((a,b) => a.vence < b.vence ? -1 : 1);
  let h = `<div class="tiles">`;
  if (vePlata()) h += `<div class="tile">Saldo de ${MESES[new Date().getMonth()]}<span class="n ${t.saldo < 0 ? "bad" : "good"}">${fmt(t.saldo)}</span></div><div class="tile">Pagos próximos 7 días<span class="n ${prox.length ? "warn" : ""}">${prox.length}</span></div><div class="tile">Deudas que tenemos<span class="n ${debemos() ? "bad" : ""}">${fmt(debemos())}</span></div>`;
  else h += `<div class="tile">Me queda de mesada<span class="n">${fmt((+me?.mesada || 0) - gastoMesada(me?.id))}</span></div>` + (AJ().puntos ? `<div class="tile">Mis puntos (7 días)<span class="n good">${ph[yoId()] || 0}</span></div>` : "") + `<div class="tile">Mis tareas hoy<span class="n">${th.filter(x => x.quien === yoId() && hecha(x)).length} / ${th.filter(x => x.quien === yoId()).length}</span></div>`;
  h += `<div class="tile">Tareas de hoy<span class="n">${th.filter(x => hecha(x)).length} / ${th.length}</span></div></div>`;
  if (vePlata() && urg.length) h += `<div class="card"><h3>Urgente</h3>${urg.map(p => `<div class="row"><div class="main"><b>${esc(p.descr)}</b><span class="sub">${fmt(p.monto)}</span></div>${vence(p.vence)}</div>`).join("")}</div>`;
  const ev = S.eventos.filter(e => e.fecha >= hoy() && dias(e.fecha) <= 7).sort((a,b) => (a.fecha + a.hora) < (b.fecha + b.hora) ? -1 : 1);
  h += `<div class="card"><h3>Próximos 7 días <small>calendario</small></h3>${ev.length ? ev.map(evRow).join("") : `<div class="empty">Nada agendado. Agregá eventos en Agenda.</div>`}</div>`;
  h += `<div class="card"><h3>Hoy en casa <small>${DIAS[new Date().getDay()]} ${corta(hoy())}</small></h3>${th.length ? th.map(t => tareaRow(t)).join("") : `<div class="empty">No hay tareas para hoy.${esAdmin() ? " Cargalas en Casa." : ""}</div>`}</div>`;
  if (esAdmin()) { const P = S.movs.filter(m => m.estado === "pendiente"); h += `<div class="card"><h3>Para aprobar <small>${P.length}</small></h3>${P.length ? P.map(movRow).join("") : `<div class="empty">Nada pendiente.</div>`}</div>` }
  return h;
}
function evRow(e){ const ok = esAdmin() || e.creado_por === yoId();
  return `<div class="row ${ok ? "tap" : ""}" ${editAttr("eventos", e.id, ok)}><div class="main"><b>${esc(e.titulo)}</b><span class="sub">${DIAS[parse(e.fecha).getDay()]} ${corta(e.fecha)}${e.hora ? " · " + esc(e.hora) : ""} · ${esc(nombre(e.quien) === "Cualquiera" ? "Toda la familia" : nombre(e.quien))}${e.nota ? " · " + esc(e.nota) : ""}</span></div></div>` }
function tareaRow(t, f = hoy()){ const d = hecha(t, f), can = puedoMarcar(t) && f === hoy();
  return `<div class="row"><button class="chk ${d ? "done" : ""}" data-act="tick" data-id="${t.id}" ${can ? "" : "disabled"} aria-label="${d ? "Desmarcar" : "Marcar hecha"}: ${esc(t.titulo)}">${d ? "✓" : ""}</button><div class="main ${esAdmin() ? "tap" : ""}" ${editAttr("tareas", t.id, esAdmin())}><b>${esc(t.titulo)}</b><span class="sub">${esc(nombre(t.quien))}${t.hora ? " · " + esc(t.hora) : ""}${d ? " · hizo " + esc(nombre(d)) : ""}</span></div>${AJ().puntos && t.puntos ? `<span class="tag">${t.puntos} pts</span>` : ""}</div>` }
function movRow(m){ const ya = (m.aprob || []).includes(yoId());
  const btns = esAdmin() && m.estado === "pendiente" ? `<div style="display:flex;gap:6px;margin-top:6px">${ya ? `<span class="sub">Ya lo aprobaste. Falta el otro administrador.</span>` : `<button class="btn sm" data-act="aprobar" data-id="${m.id}">Aprobar</button><button class="btn sm danger" data-act="rechazar" data-id="${m.id}">Rechazar</button>`}</div>` : "";
  const ok = esAdmin() || (m.creado_por === yoId() && m.estado === "pendiente");
  return `<div class="row" style="align-items:flex-start"><div class="main ${ok ? "tap" : ""}" ${editAttr("movs", m.id, ok)}><b>${esc(m.descr || m.rubro)}</b><span class="sub">${esc(nombre(m.quien))} · ${esc(m.rubro)} · ${corta(m.fecha)}${m.ticket ? " · con ticket" : " · sin ticket"}${m.mesada ? " · mesada" : ""}</span>${btns}</div><div style="text-align:right"><span class="num ${m.tipo === "ingreso" ? "good" : ""}">${m.tipo === "ingreso" ? "+" : "−"}${fmt(m.monto)}</span><br>${estTag(m)}</div></div>` }

function vPlata(){
  if (!vePlata()) return vMiPlata();
  const s = sub.plata;
  let h = `<div class="tabs">${[["resumen","Resumen"],["pagos","Pagos"],["deudas","Deudas"],["rendicion","Rendición"],["proyectos","Proyectos"]].map(([k,l]) => `<button class="${s === k ? "on" : ""}" data-act="sub" data-k="plata" data-v="${k}">${l}</button>`).join("")}</div>`;
  if (s === "resumen") { const t = totales(); const por = {}; movsMes().filter(x => x.tipo === "gasto").forEach(x => por[x.rubro] = (por[x.rubro] || 0) + (+x.monto || 0)); const P = AJ().presupuesto || {};
    h += `<div class="card"><h3>Ingresos y gastos <small>${MESES[new Date().getMonth()]}</small></h3><div class="row"><div class="main">Ingresos</div><span class="num good">${fmt(t.ing)}</span></div><div class="row"><div class="main">Gastos</div><span class="num bad">${fmt(t.gas)}</span></div><div class="row"><div class="main"><b>Sobrante</b></div><span class="num ${t.saldo < 0 ? "bad" : "good"}">${fmt(t.saldo)}</span></div></div>`;
    h += `<div class="card"><h3>Prioridades económicas <small>orden de pago</small></h3>${PRIORIDADES.map((p,i) => `<div class="row"><div class="main">${i+1}. ${esc(p[0])}</div>${tag(p[1], p[2])}</div>`).join("")}</div>`;
    const rub = RUBROS.filter(r => P[r] || por[r]);
    h += `<div class="card"><h3>Presupuesto por rubro ${esAdmin() ? `<button class="btn sm line" data-act="presu">Editar</button>` : ""}</h3>${rub.length ? rub.map(r => { const g = por[r] || 0, b = +P[r] || 0, pc = b ? Math.round(g / b * 100) : 0; return `<div style="padding:6px 0"><div style="display:flex;justify-content:space-between;gap:8px"><span>${r}</span><span class="num ${b && pc > 100 ? "bad" : ""}">${fmt(g)}${b ? ` / ${fmt(b)}` : ""}</span></div>${b ? `<div class="bar"><i style="width:${Math.min(pc,100)}%;background:${pc > 100 ? "var(--bad)" : pc >= 90 ? "var(--warn)" : "var(--accent)"}"></i></div>` : ""}</div>` }).join("") : `<div class="empty">Sin gastos aprobados este mes.${esAdmin() ? " Fijá un presupuesto por rubro con Editar." : ""}</div>`}</div>`;
  }
  if (s === "pagos") { const L = [...S.pagos].sort((a,b) => (a.pagado - b.pagado) || (a.vence < b.vence ? -1 : 1));
    h += `<div class="card"><h3>Próximos pagos <small>${fmt(sum(L.filter(p => !p.pagado)))} pendiente</small></h3>${L.length ? L.map(p => `<div class="row"><div class="main ${esAdmin() ? "tap" : ""}" ${editAttr("pagos", p.id, esAdmin())}><b>${esc(p.descr)}</b><span class="sub">${fmt(p.monto)} · ${esc(p.rubro)}${p.recurrente ? " · mensual" : ""}</span></div>${p.pagado ? tag("Pagado","good") : vence(p.vence)}${esAdmin() && !p.pagado ? `<button class="btn sm" data-act="pagar" data-id="${p.id}">Pagué</button>` : ""}</div>`).join("") : `<div class="empty">No hay pagos cargados.</div>`}</div>`;
    if (esAdmin()) h += ADD("pagos","Agregar pago");
  }
  if (s === "deudas") {
    h += `<div class="card"><h3>Deudas <small>debemos ${fmt(debemos())}</small></h3>${S.deudas.length ? S.deudas.map(d => { const deb = d.direccion === "debemos"; const pc = d.cuotas_tot ? Math.round((+d.cuotas_pag || 0) / d.cuotas_tot * 100) : 0; return `<div class="row" style="align-items:flex-start"><div class="main ${esAdmin() ? "tap" : ""}" ${editAttr("deudas", d.id, esAdmin())}><b>${deb ? "" : "Nos deben: "}${esc(d.descr)}</b><span class="sub">${d.cuotas_tot ? `Cuota ${+d.cuotas_pag || 0} de ${d.cuotas_tot} · ` : ""}${+d.cuota ? fmt(d.cuota) + "/mes" : ""}</span>${d.cuotas_tot ? `<div class="bar"><i style="width:${pc}%;background:var(--good)"></i></div>` : ""}</div><div style="text-align:right"><span class="num ${deb ? "bad" : "good"}">${fmt(d.saldo)}</span>${esAdmin() && +d.saldo > 0 ? `<br><button class="btn sm line" style="margin-top:4px" data-act="cuota" data-id="${d.id}">${deb ? "Pagué cuota" : "Cobré"}</button>` : ""}</div></div>` }).join("") : `<div class="empty">No hay deudas cargadas.</div>`}</div>`;
    if (esAdmin()) h += ADD("deudas","Agregar deuda");
  }
  if (s === "rendicion") {
    h += `<div class="note">Cualquiera carga lo que gastó. ${AJ().dobleAprob ? `Los gastos desde ${fmt(AJ().umbral)} necesitan el OK de los 2 administradores; los menores, de uno.` : "Un administrador lo aprueba o lo rechaza."}</div>`;
    h += `<button class="btn" data-act="new" data-col="movs">+ Cargar gasto${esAdmin() ? " o ingreso" : ""}</button>`;
    const L = [...S.movs].sort((a,b) => a.fecha < b.fecha ? 1 : -1).slice(0, 80);
    h += `<div class="card"><h3>Movimientos</h3>${L.length ? L.map(movRow).join("") : `<div class="empty">Todavía no hay movimientos.</div>`}</div>`;
    const ms = S.miembros.filter(m => +m.mesada > 0);
    if (ms.length) h += `<div class="card"><h3>Mesadas <small>${MESES[new Date().getMonth()]}</small></h3>${ms.map(m => { const g = gastoMesada(m.id); return `<div class="row"><div class="main">${esc(m.nombre)} · ${fmt(m.mesada)}/mes</div><span class="num ${g > m.mesada ? "bad" : ""}">gastó ${fmt(g)}</span></div>` }).join("")}</div>`;
    const ing = movsMes().filter(x => x.tipo === "ingreso"); const tot = sum(ing); const por = {}; ing.forEach(x => por[x.quien] = (por[x.quien] || 0) + (+x.monto || 0));
    h += `<div class="card"><h3>Aportes al hogar <small>${MESES[new Date().getMonth()]}</small></h3>${tot ? Object.entries(por).map(([k,v]) => `<div class="row"><div class="main">${esc(nombre(k))}</div><span class="num">${fmt(v)} · ${Math.round(v / tot * 100)}%</span></div>`).join("") : `<div class="empty">Cargá los ingresos del mes para ver cuánto aporta cada uno.</div>`}<div class="row"><div class="main">Cierre de mes</div><button class="btn sm" data-act="cierre">Ver cierre</button></div></div>`;
  }
  if (s === "proyectos") h += vProyectos();
  return h;
}
function vMiPlata(){ const me = yo(); const L = S.movs.filter(x => x.quien === me?.id).sort((a,b) => a.fecha < b.fecha ? 1 : -1); const g = gastoMesada(me?.id);
  let h = `<div class="note">Acá ves solo tu plata. La plata de la casa la manejan los administradores.</div>`;
  h += `<div class="tiles"><div class="tile">Mesada del mes<span class="n">${fmt(me?.mesada)}</span></div><div class="tile">Te queda<span class="n ${(+me?.mesada || 0) - g < 0 ? "bad" : "good"}">${fmt((+me?.mesada || 0) - g)}</span></div></div>`;
  if (me?.tipo !== "infante") h += `<button class="btn" data-act="new" data-col="movs">+ Cargar un gasto</button>`;
  h += `<div class="card"><h3>Mis gastos</h3>${L.length ? L.map(movRow).join("") : `<div class="empty">No cargaste gastos todavía.</div>`}</div>`;
  h += `<div class="card"><h3>Proyectos de la familia</h3></div>` + vProyectos();
  return h }
function vProyectos(){
  let h = S.proyectos.length ? S.proyectos.map(p => { const pc = +p.meta ? Math.round((+p.ahorrado || 0) / p.meta * 100) : 0; const falta = Math.max(0, (+p.meta || 0) - (+p.ahorrado || 0)); let mens = ""; if (p.fecha && falta) { const ms = Math.max(1, Math.round(dias(p.fecha) / 30.4)); mens = `Aporte sugerido: ${fmt(falta / ms)}/mes` }
    return `<div class="card"><h3><span ${editAttr("proyectos", p.id, esAdmin())} style="${esAdmin() ? "cursor:pointer" : ""}">${esc(p.nombre)}</span>${esAdmin() && falta ? `<button class="btn sm" data-act="aportar" data-id="${p.id}">Aportar</button>` : pc >= 100 ? tag("Cumplido","good") : ""}</h3><div style="display:flex;justify-content:space-between;gap:8px"><span class="num">${fmt(p.ahorrado)} de ${fmt(p.meta)}</span><span class="muted">${p.fecha ? corta(p.fecha) + "/" + p.fecha.slice(2,4) : ""}</span></div><div class="bar"><i style="width:${Math.min(pc,100)}%"></i></div>${mens ? `<div class="row"><div class="main sub">${mens}</div></div>` : ""}${p.proximo ? `<div class="row"><div class="main">Próximo paso: ${esc(p.proximo)}</div>${p.quien ? tag(nombre(p.quien)) : ""}</div>` : ""}</div>` }).join("") : `<div class="card"><h3>Sin proyectos</h3><div class="empty">Cargá una meta con monto y fecha, por ejemplo vacaciones o una ampliación.</div></div>`;
  if (esAdmin()) h += ADD("proyectos","Nuevo proyecto"); return h }

function vCasa(){ const s = sub.casa;
  let h = `<div class="tabs">${[["tareas","Tareas"],["residuos","Residuos"],["horarios","Horarios"],["patrimonio","Patrimonio"]].map(([k,l]) => `<button class="${s === k ? "on" : ""}" data-act="sub" data-k="casa" data-v="${k}">${l}</button>`).join("")}</div>`;
  const diasTxt = t => !t.dias || !t.dias.length ? "Todos los días" : t.dias.map(d => DIAS[d]).join(" · ");
  const lista = (cats, tit) => { const L = S.tareas.filter(t => cats.includes(t.cat)); return `<div class="card"><h3>${tit}</h3>${L.length ? L.map(t => `<div class="row ${esAdmin() ? "tap" : ""}" ${editAttr("tareas", t.id, esAdmin())}><div class="main"><b>${esc(t.titulo)}</b><span class="sub">${diasTxt(t)}${t.hora ? " · " + esc(t.hora) : ""}</span></div><span>${esc(nombre(t.quien))}</span></div>`).join("") : `<div class="empty">Nada cargado.</div>`}</div>` };
  if (s === "tareas") { h += `<div class="card"><h3>Hoy</h3>${deHoy().filter(t => t.cat !== "residuos").map(t => tareaRow(t)).join("") || `<div class="empty">Nada para hoy.</div>`}</div>` + lista(["limpieza","rutina"], "Todas las tareas y rutinas");
    if (AJ().puntos) { const p = puntosSemana(); const M = S.miembros.filter(m => m.tipo !== "adulto"); h += `<div class="card"><h3>Puntos de los últimos 7 días</h3>${M.length ? M.map(m => `<div class="row"><div class="main">${esc(m.nombre)}</div><span class="num good">${p[m.id] || 0} pts</span></div>`).join("") : `<div class="empty">Sin chicos cargados.</div>`}</div>` } }
  if (s === "residuos") h += `<div class="card"><h3>Hoy</h3>${deHoy().filter(t => t.cat === "residuos").map(t => tareaRow(t)).join("") || `<div class="empty">Hoy no se saca nada.</div>`}</div>` + lista(["residuos"], "Calendario de residuos");
  if (s === "horarios") h += lista(["horario"], "Horarios fijos de la casa");
  if (s === "patrimonio") { const grp = (t, tit) => { const L = S.bienes.filter(b => b.tipo === t).sort((a,b) => (a.fecha || "9") < (b.fecha || "9") ? -1 : 1); return `<div class="card"><h3>${tit}</h3>${L.length ? L.map(b => `<div class="row ${esAdmin() ? "tap" : ""}" ${editAttr("bienes", b.id, esAdmin())}><div class="main"><b>${esc(b.nombre)}</b>${b.nota ? `<span class="sub">${esc(b.nota)}</span>` : ""}</div>${b.privado ? tag("Solo admins") : ""}${b.fecha ? (dias(b.fecha) < 0 ? tag(t === "mantenimiento" ? "Atrasado" : "Vencido","bad") : dias(b.fecha) <= 30 ? tag(corta(b.fecha),"warn") : `<span class="muted">${corta(b.fecha)}</span>`) : ""}</div>`).join("") : `<div class="empty">Nada cargado.</div>`}</div>` };
    h += grp("bien","Bienes") + grp("mantenimiento","Mantenimiento programado") + grp("documento","Documentos de la familia") }
  if (esAdmin()) h += s === "patrimonio" ? ADD("bienes","Agregar bien o documento") : ADD("tareas","Agregar tarea u horario");
  return h }

function itemsDia(f){ const out = [];
  S.eventos.filter(e => e.fecha === f).forEach(e => out.push({ k:"e", h:e.hora || "", html: evRow(e) }));
  if (vePlata()) S.pagos.filter(p => !p.pagado && p.vence === f).forEach(p => out.push({ k:"p", h:"", html:`<div class="row"><div class="main"><b>Vence: ${esc(p.descr)}</b><span class="sub">${fmt(p.monto)}</span></div>${tag("Pago","warn")}</div>` }));
  S.bienes.filter(b => b.fecha === f && (esAdmin() || !b.privado)).forEach(b => out.push({ k:"b", h:"", html:`<div class="row"><div class="main"><b>${esc(b.nombre)}</b><span class="sub">${b.tipo === "mantenimiento" ? "Mantenimiento" : "Vencimiento"}</span></div>${tag("Casa","bad")}</div>` }));
  return out }
function vAgenda(){
  const base = cal || new Date(new Date().getFullYear(), new Date().getMonth(), 1); cal = base; diaSel = diaSel || hoy();
  const y = base.getFullYear(), m = base.getMonth(); const first = new Date(y, m, 1); const start = new Date(y, m, 1 - first.getDay());
  let g = DIAS.map(d => `<div class="dn">${d}</div>`).join("");
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const f = iso(d); const it = itemsDia(f);
    const kinds = [...new Set(it.map(x => x.k))].slice(0,3);
    g += `<button data-act="dia" data-f="${f}" class="${d.getMonth() !== m ? "out" : ""} ${f === hoy() ? "today" : ""} ${f === diaSel ? "sel" : ""}" aria-label="${corta(f)}${it.length ? ", " + it.length + " cosas" : ""}">${d.getDate()}<span class="dots">${kinds.map(k => `<i class="${k}"></i>`).join("")}</span></button>`;
    if (i === 34 && new Date(y, m, 1 - first.getDay() + 35).getMonth() !== m) break }
  const it = itemsDia(diaSel).sort((a,b) => a.h < b.h ? -1 : 1);
  const tareas = tareasDe(diaSel); const horarios = S.tareas.filter(t => t.cat === "horario" && (!t.dias?.length || t.dias.includes(parse(diaSel).getDay())));
  let h = `<div class="card"><div class="calh"><button class="btn sm line" data-act="mes" data-d="-1" aria-label="Mes anterior">‹</button><b>${MESES[m]} ${y}</b><button class="btn sm line" data-act="mes" data-d="1" aria-label="Mes siguiente">›</button></div><div class="cal">${g}</div></div>`;
  h += `<div class="card"><h3>${DIAS[parse(diaSel).getDay()]} ${corta(diaSel)} ${diaSel !== hoy() ? `<button class="btn sm line" data-act="dia" data-f="${hoy()}">Hoy</button>` : ""}</h3>${it.length ? it.map(x => x.html).join("") : `<div class="empty">Sin eventos este día.</div>`}</div>`;
  if (horarios.length) h += `<div class="card"><h3>Horarios fijos</h3>${horarios.map(t => `<div class="row"><div class="main">${esc(t.titulo)}</div><span class="num">${esc(t.hora)}</span></div>`).join("")}</div>`;
  if (tareas.length) h += `<div class="card"><h3>Tareas de ese día</h3>${tareas.map(t => tareaRow(t, diaSel)).join("")}</div>`;
  if (yo()?.tipo !== "infante") h += ADD("eventos","Agregar al calendario");
  return h }

function vFamilia(){ const A = admins(), M = S.miembros.filter(m => m.rol !== "admin");
  const mrow = m => { const cod = S.codigos[m.id];
    return `<div class="row ${esAdmin() ? "tap" : ""}" ${editAttr("miembros", m.id, esAdmin())}>${av(m.id)}<div class="main"><b>${esc(m.nombre)}${m.edad ? ` · ${m.edad} años` : ""}</b><span class="sub">${m.user_id ? (m.user_id === S.session.user.id ? "Sos vos" : "Tiene cuenta") : m.tipo === "infante" ? "Sin cuenta, lo manejan los administradores" : "Todavía no entró"}${esAdmin() && cod && !m.user_id ? ` · código <span class="code">${esc(cod)}</span>` : ""}</span></div>${m.rol === "admin" ? tag("Admin","adm") : tag(m.tipo === "adolescente" ? "Adolescente" : m.tipo === "infante" ? "Infante" : "Adulto")}</div>${esAdmin() && cod && !m.user_id ? `<div style="display:flex;gap:6px;padding:0 0 8px 42px"><button class="btn sm" data-act="invitar" data-id="${m.id}">Copiar invitación</button></div>` : ""}${esAdmin() && m.user_id && m.user_id !== S.session.user.id ? `<div style="display:flex;gap:6px;padding:0 0 8px 42px"><button class="btn sm line" data-act="reacceso" data-id="${m.id}">Cambió de teléfono: nuevo código</button></div>` : ""}` };
  let h = `<div class="card"><h3>Administradores <small>${A.length} de 2</small></h3>${A.map(mrow).join("") || `<div class="empty">Sin administradores.</div>`}</div><div class="card"><h3>Partícipes <small>sin rol de responsable</small></h3>${M.map(mrow).join("") || `<div class="empty">Agregá a los chicos y a quien viva en la casa.</div>`}</div>`;
  const c = AJ();
  h += `<div class="card"><h3>Qué puede hacer cada uno</h3><div class="row"><div class="main">Ver la plata de la casa</div><span>${c.adolVenPlata ? "Admins y adolescentes" : "Solo admins"}</span></div><div class="row"><div class="main">Cargar un gasto</div><span>Todos menos infantes</span></div><div class="row"><div class="main">Aprobar gastos</div><span>${c.dobleAprob ? `Admins (2 OK desde ${fmt(c.umbral)})` : "Un admin"}</span></div><div class="row"><div class="main">Agregar al calendario</div><span>Todos</span></div><div class="row"><div class="main">Marcar tareas hechas</div><span>Cada uno las suyas</span></div></div>`;
  if (esAdmin()) { h += `<div class="card"><h3>Ajustes <small>solo administradores</small></h3>
    <label class="fld ck"><input type="checkbox" id="c_adol" data-act="cfg" ${c.adolVenPlata ? "checked" : ""}> Los adolescentes ven la plata de la casa</label>
    <label class="fld ck"><input type="checkbox" id="c_doble" data-act="cfg" ${c.dobleAprob ? "checked" : ""}> Gastos grandes necesitan el OK de los 2 admins</label>
    <label class="fld">Desde qué monto es "gasto grande" ($)<input type="number" id="c_umbral" inputmode="decimal" value="${esc(c.umbral)}" data-act="cfgnum"></label>
    <label class="fld ck"><input type="checkbox" id="c_puntos" data-act="cfg" ${c.puntos ? "checked" : ""}> Puntos por tareas para los chicos</label></div>`;
    h += ADD("miembros","Agregar miembro");
    h += `<div class="note">Cada miembro nuevo recibe un código. Mandale la invitación por WhatsApp: entra al link, crea su cuenta y pone el código.</div>` }
  h += `<div class="card"><h3>Este teléfono</h3><div class="row"><div class="main">Llave de acceso<span class="sub">Guardala por si cambiás de teléfono o borrás el navegador.</span></div><button class="btn sm line" data-act="llave">Copiar llave</button></div>${installBtn()}</div>`;
  return h }

/* ---------- instalación ---------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; render() });
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
function installBtn(){ if (standalone()) return "";
  if (deferredPrompt) return `<div class="row"><div class="main">Instalar la app en este teléfono</div><button class="btn sm" data-act="instalar">Instalar</button></div>`;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<div class="row"><div class="main sub">${ios ? "Para instalarla: en Safari tocá Compartir y después “Agregar a inicio”." : "Para instalarla: en Chrome tocá el menú ⋮ y después “Instalar app” o “Agregar a pantalla principal”."}</div></div>` }

/* ---------- pantallas sin casa / login ---------- */
const inp = 'style="font:inherit;font-size:16px;color:var(--ink);background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:10px"';
function vSinCasa(){
  return `<div class="auth"><h1>Casa en Orden</h1><div class="muted">La app de la familia: plata, tareas, calendario y la casa.</div>
  <form id="joinf" class="card"><h3>Me invitaron</h3><div class="empty">Poné el código que te pasó un administrador.</div>
  <label class="fld">Código<input type="text" id="j_cod" autocapitalize="characters" maxlength="8" ${inp.replace("16px","18px;letter-spacing:.15em")}></label>
  <button class="btn" type="submit">Entrar a la casa</button></form>
  <form id="newf" class="card"><h3>Soy administrador y arranco de cero</h3>
  <label class="fld">Nombre de la casa<input type="text" id="n_casa" placeholder="Casa Igoa" ${inp}></label>
  <label class="fld">Tu nombre<input type="text" id="n_yo" ${inp}></label>
  <button class="btn line" type="submit">Crear la casa</button></form>
  <form id="llavef" class="card"><h3>Ya usaba la app en otro teléfono</h3>
  <label class="fld">Llave de acceso<input type="text" id="l_llave" autocomplete="off" ${inp}></label>
  <button class="btn line" type="submit">Entrar con mi llave</button></form>
  ${installBtn() ? `<div class="card">${installBtn()}</div>` : ""}</div>` }

/* ---------- acceso sin usuario ni contraseña ---------- */
const llaveDe = c => btoa(c.email + ":" + c.password).replace(/=+$/,"");
function deLlave(k){ try { const t = atob(k.trim()); const i = t.lastIndexOf(":"); return i > 0 ? { email: t.slice(0,i), password: t.slice(i+1) } : null } catch(e) { return null } }
async function entrarCon(c){ const { error } = await sb.auth.signInWithPassword(c); if (error) throw error; LS.set("cdo-llave", llaveDe(c)) }
async function asegurarAcceso(){
  if (S.session) return true;
  const k = LS.get("cdo-llave"); const c = k && deLlave(k);
  try { if (c) { await entrarCon(c); return true } } catch(e) {}
  const { data, error } = await sb.rpc("crear_acceso"); if (error) { toast(errMsg(error)); return false }
  try { await entrarCon(data); const { data: s } = await sb.auth.getSession(); S.session = s.session; return true } catch(e) { toast(errMsg(e)); return false }
}

/* ---------- render ---------- */
const ICON = { inicio:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', plata:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/>', agenda:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', casa:'<path d="M4 12l5 5L20 6"/>', familia:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8"/>' };
const TABS = [["inicio","Inicio"],["plata","Plata"],["agenda","Agenda"],["casa","Casa"],["familia","Familia"]];
const HEAD = { inicio:() => "Hola, " + (yo()?.nombre || ""), plata:() => vePlata() ? "Plata" : "Mi plata", agenda:() => "Agenda", casa:() => "Casa", familia:() => S.hogar?.nombre || "Familia" };
const SUBH = { inicio:() => DIAS[new Date().getDay()] + " " + corta(hoy()) + (esAdmin() ? " · Administrador" : " · Partícipe"), plata:() => esAdmin() ? "Rendición, pagos, deudas y proyectos" : "Lo que cargues lo aprueba un administrador", agenda:() => "Calendario de la familia", casa:() => "Limpieza, residuos, horarios y patrimonio", familia:() => "Quién está y qué puede hacer" };
function render(){
  const app = document.getElementById("app"), nav = document.getElementById("nav");
  if (!S.session) { nav.innerHTML = ""; if (!booting) app.innerHTML = vSinCasa(); return }
  if (!loaded) return;
  if (!S.H || !yo()) { nav.innerHTML = ""; app.innerHTML = vSinCasa(); return }
  const sc = window.scrollY;
  app.innerHTML = `<header><div class="grow"><h1>${esc(HEAD[tab]())}</h1><p>${esc(SUBH[tab]())}</p></div><button class="who" data-act="tab" data-v="familia" aria-label="Mi cuenta">${av(yoId())}${esc(yo().nombre)}</button></header><main>${({ inicio:vInicio, plata:vPlata, agenda:vAgenda, casa:vCasa, familia:vFamilia })[tab]()}</main>`;
  nav.innerHTML = `<div class="in">${TABS.map(([k,l]) => `<button class="${tab === k ? "on" : ""}" data-act="tab" data-v="${k}" aria-current="${tab === k ? "page" : "false"}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>${l}</button>`).join("")}</div>`;
  window.scrollTo(0, sc);
}

/* ---------- acciones ---------- */
const find = (c, id) => S[c].find(x => x.id === id);
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el) return; const a = el.dataset.act, id = el.dataset.id;
  if (a === "close") { if (e.target === el || el.tagName === "BUTTON") closeSheet(); return }
  if (a === "tab") { tab = el.dataset.v; window.scrollTo(0,0); render(); return }
  if (a === "sub") { sub[el.dataset.k] = el.dataset.v; render(); return }
  if (a === "new") { openForm(el.dataset.col); return }
  if (a === "edit") { const o = find(el.dataset.col, id); if (o) openForm(el.dataset.col, o); return }
  if (a === "delete") { const { col, obj } = formCtx; if (el.dataset.sure) { if (col === "miembros" && obj.user_id === S.session.user.id) { toast("No podés borrarte a vos"); return } closeSheet(); if (await del(col, obj.id)) toast("Borrado") } else { el.dataset.sure = "1"; el.textContent = "¿Seguro? Tocá de nuevo" } return }
  if (a === "llave") { const k = LS.get("cdo-llave") || ""; try { await navigator.clipboard.writeText(k); toast("Llave copiada. Guardala en un lugar seguro.") } catch(_) { sheet(`<h2>Tu llave de acceso</h2><div class="card" style="word-break:break-all">${esc(k)}</div><div class="acts"><button class="btn line" data-act="close">Cerrar</button></div>`) } return }
  if (a === "reacceso") { const m = find("miembros", id); if (!el.dataset.sure) { el.dataset.sure = "1"; el.textContent = "¿Seguro? El teléfono viejo pierde el acceso"; return } const r = await run(sb.rpc("reiniciar_acceso", { m: id })); if (r) { recargar("miembros"); toast("Nuevo código para " + m.nombre + ": " + r.data) } return }
  if (a === "instalar") { if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; render() } return }
  if (a === "dia") { diaSel = el.dataset.f; const d = parse(diaSel); cal = new Date(d.getFullYear(), d.getMonth(), 1); render(); return }
  if (a === "mes") { cal = new Date(cal.getFullYear(), cal.getMonth() + (+el.dataset.d), 1); render(); return }
  if (a === "tick") { const t = find("tareas", id); if (!t || !puedoMarcar(t)) return; const was = hecha(t); const r = await run(sb.rpc("marcar_tarea", { t: id, dia: hoy() })); if (r) { recargar("tareas"); if (!was) toast("Hecho" + (AJ().puntos && t.puntos ? ` · +${t.puntos} pts` : "")) } return }
  if (a === "aprobar" || a === "rechazar") { const r = await run(sb.rpc("aprobar_mov", { m: id, aprobar: a === "aprobar" })); if (r) { recargar("movs"); toast(a === "aprobar" ? "Aprobado" : "Rechazado") } return }
  if (a === "pagar") { const p = find("pagos", id); askMonto("Pagué: " + p.descr, p.monto, async v => { if (await ins("movs", { tipo:"gasto", descr:p.descr, monto:v, rubro:p.rubro || "Servicios", ticket:true })) await upd("pagos", id, p.recurrente ? { vence:addMes(p.vence), ultimo_pago:hoy() } : { pagado:true, ultimo_pago:hoy() }) && toast("Pago registrado") }); return }
  if (a === "cuota") { const d = find("deudas", id); const deb = d.direccion === "debemos"; askMonto(deb ? "Pagué cuota: " + d.descr : "Cobré: " + d.descr, +d.cuota || d.saldo, async v => { if (await ins("movs", { tipo:deb ? "gasto" : "ingreso", descr:(deb ? "Cuota " : "Cobro ") + d.descr, monto:v, rubro:"Deudas", ticket:true })) await upd("deudas", id, { saldo:Math.max(0, (+d.saldo || 0) - v), cuotas_pag:(+d.cuotas_pag || 0) + 1 }) && toast(deb ? "Cuota registrada" : "Cobro registrado") }); return }
  if (a === "aportar") { const p = find("proyectos", id); askMonto("Aporte a: " + p.nombre, "", async v => { if (await ins("movs", { tipo:"gasto", descr:"Ahorro " + p.nombre, monto:v, rubro:"Proyectos", ticket:true })) await upd("proyectos", id, { ahorrado:(+p.ahorrado || 0) + v }) && toast("Aporte guardado") }); return }
  if (a === "invitar") { const m = find("miembros", id); const txt = `Te sumé a ${S.hogar?.nombre || "la casa"} en Casa en Orden. Entrá a ${location.origin}, creá tu cuenta y poné este código: ${S.codigos[id]}`;
    try { await navigator.clipboard.writeText(txt); toast("Invitación copiada. Pegala en WhatsApp.") } catch(_) { sheet(`<h2>Invitación para ${esc(m.nombre)}</h2><div class="card">${esc(txt)}</div><div class="acts"><button class="btn line" data-act="close">Cerrar</button></div>`) } return }
  if (a === "presu") { const P = AJ().presupuesto || {}; formCtx = { presu:true }; sheet(`<h2>Presupuesto mensual por rubro</h2><form id="frm">${RUBROS.map(r => `<label class="fld">${r} ($)<input type="number" id="p_${r}" inputmode="decimal" value="${esc(P[r] || "")}"></label>`).join("")}<div class="acts"><button type="button" class="btn line" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`); return }
  if (a === "cierre") { const L = movsMes(); const g = L.filter(x => x.tipo === "gasto"), i = L.filter(x => x.tipo === "ingreso"); const por = {}, pq = {}; g.forEach(x => { por[x.rubro] = (por[x.rubro] || 0) + (+x.monto || 0); pq[x.quien] = (pq[x.quien] || 0) + (+x.monto || 0) });
    const sin = g.filter(x => !x.ticket).length, pe = S.movs.filter(x => x.estado === "pendiente").length;
    sheet(`<h2>Cierre de ${MESES[new Date().getMonth()]}</h2><div class="card"><div class="row"><div class="main">Ingresos</div><span class="num good">${fmt(sum(i))}</span></div><div class="row"><div class="main">Gastos</div><span class="num bad">${fmt(sum(g))}</span></div><div class="row"><div class="main"><b>Resultado</b></div><span class="num">${fmt(sum(i) - sum(g))}</span></div></div>
    <div class="card" style="margin-top:10px"><h3>Gastos por rubro</h3>${Object.entries(por).sort((a,b) => b[1] - a[1]).map(([k,v]) => `<div class="row"><div class="main">${esc(k)}</div><span class="num">${fmt(v)}</span></div>`).join("") || `<div class="empty">Sin gastos.</div>`}</div>
    <div class="card" style="margin-top:10px"><h3>Gastos por persona</h3>${Object.entries(pq).map(([k,v]) => `<div class="row"><div class="main">${esc(nombre(k))}</div><span class="num">${fmt(v)}</span></div>`).join("") || `<div class="empty">Sin gastos.</div>`}</div>
    <div class="note" style="margin-top:10px">${sin} gastos sin ticket · ${pe} movimientos sin aprobar</div><div class="acts"><button class="btn line" data-act="close">Cerrar</button></div>`); return }
});
document.addEventListener("change", e => { const el = e.target;
  if (el.dataset.act === "cfg") { const map = { c_adol:"adolVenPlata", c_doble:"dobleAprob", c_puntos:"puntos" }; saveAj({ [map[el.id]]: el.checked }).then(r => { if (r) { toast("Ajuste guardado"); if (el.id === "c_adol") TABLAS.forEach(recargar) } }) }
  if (el.dataset.act === "cfgnum") { const v = +el.value || 0; if (v !== +AJ().umbral) saveAj({ umbral: v }).then(r => r && toast("Ajuste guardado")) }
});
document.addEventListener("submit", async e => { e.preventDefault(); const f = e.target;
  if (f.id === "llavef") { const c = deLlave(document.getElementById("l_llave").value); if (!c) { toast("Esa llave no es válida"); return } try { await entrarCon(c); toast("Listo, entraste") } catch(e) { toast("Esa llave no funciona") } return }
  if (f.id === "joinf") { const cod = document.getElementById("j_cod").value; if (!cod.trim()) { toast("Poné el código"); return } if (!await asegurarAcceso()) return; const r = await run(sb.rpc("unirme", { cod })); if (r) { LS.set("cdo-hogar", r.data); loaded = false; await entrarHogar(); toast("Listo, ya estás adentro") } return }
  if (f.id === "newf") { if (!document.getElementById("n_yo").value.trim()) { toast("Poné tu nombre"); return } if (!await asegurarAcceso()) return; const r = await run(sb.rpc("crear_hogar", { nombre_hogar: document.getElementById("n_casa").value, mi_nombre: document.getElementById("n_yo").value })); if (r) { LS.set("cdo-hogar", r.data); loaded = false; await entrarHogar(); tab = "familia"; render(); toast("Casa creada. Ahora sumá a la familia.") } return }
  if (formCtx?.custom) { const v = +(document.getElementById("f_monto").value || "").replace(",", "."); if (!(v > 0)) { toast("Poné el monto"); return } const cb = formCtx.custom; closeSheet(); cb(v); return }
  if (formCtx?.presu) { const P = {}; RUBROS.forEach(r => { const v = +document.getElementById("p_" + r).value || 0; if (v) P[r] = v }); closeSheet(); saveAj({ presupuesto: P }).then(r => r && toast("Presupuesto guardado")); return }
  submitForm();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet() });

/* ---------- arranque ---------- */
sb.auth.onAuthStateChange((ev, session) => {
  const antes = S.session?.user?.id; S.session = session;
  if (!session) { S.H = null; loaded = false; if (chan) { sb.removeChannel(chan); chan = null } render(); return }
  if (session.user.id !== antes) { loaded = false; render(); setTimeout(entrarHogar, 0) }
});
let booting = true;
(async () => { const { data } = await sb.auth.getSession(); if (!data.session) { const c = deLlave(LS.get("cdo-llave") || ""); if (c) { try { await entrarCon(c) } catch(e) {} } } booting = false; render() })();
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
render();
