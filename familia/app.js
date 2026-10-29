/* Casa en Orden · app familiar (PWA + Supabase) */
const SB_URL = "https://dowtczgckcuvxwpgqcpq.supabase.co";
const SB_KEY = "sb_publishable_v6n2zkJXpBEUpR0TlULEVA_UwVMlwoa";
const sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const RUBROS = ["Vivienda","Servicios","Comida","Salud","Chicos","Transporte","Deudas","Proyectos","Gustos","Otros"];
const TABLAS = ["miembros","movs","pagos","deudas","proyectos","tareas","bienes","eventos","pendientes"];
const COLS_MIEMBROS = "id,hogar_id,user_id,nombre,rol,tipo,edad,mesada,creado";
const DIAS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const COLORS = ["#2a6fdb","#8e44ad","#16a085","#e67e22","#d63384","#7d8c1f","#c2372a"];
const PRIORIDADES = [["Fijos: alquiler, servicios, colegio","Obligatorio","bad"],["Comida y salud","Obligatorio","bad"],["Deudas (cuotas)","Alta","warn"],["Fondo de emergencia","Alta","warn"],["Proyectos","Media",""],["Gustos y salidas","Si sobra","good"]];
const AJ0 = { adolVenPlata:false, dobleAprob:true, umbral:100000, puntos:true, presupuesto:{} };

const S = { session:null, hogares:[], H:null, hogar:null, codigos:{}, miembros:[], movs:[], pagos:[], deudas:[], proyectos:[], tareas:[], bienes:[], eventos:[], pendientes:[] };
let cal = null, diaSel = null, chan = null, loaded = false;
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
  pendientes: () => [{k:"titulo",l:"Qué hay que resolver",req:1},{k:"quien",l:"Quién se encarga",t:"select",o:mOpts([["","Sin asignar"]])},{k:"fecha",l:"Para cuándo (opcional)",t:"date"},{k:"nota",l:"Detalle (opcional)"}],
  eventos: () => [{k:"titulo",l:"Qué es",req:1},{k:"fecha",l:"Día",t:"date",req:1},{k:"hora",l:"Hora",t:"time"},{k:"quien",l:"Para quién",t:"select",o:mOpts([["","Toda la familia"]])},{k:"nota",l:"Nota"}],
  miembros: o => [{k:"nombre",l:"Nombre",req:1},{k:"rol",l:"Rol",t:"select",o:(admins().length < 2 || o?.rol === "admin") ? [["miembro","Partícipe (sin rol de responsable)"],["admin","Administrador"]] : [["miembro","Partícipe (sin rol de responsable)"]]},{k:"tipo",l:"Tipo",t:"select",o:[["adulto","Adulto"],["adolescente","Adolescente"],["infante","Infante"]]},{k:"edad",l:"Edad",t:"number"},{k:"mesada",l:"Mesada mensual ($)",t:"number"}],
};
const DEF = { movs:()=>({tipo:"gasto",rubro:"Comida",fecha:hoy()}), pagos:()=>({rubro:"Servicios",vence:hoy(),recurrente:true}), deudas:()=>({direccion:"debemos",cuotas_pag:0}), proyectos:()=>({ahorrado:0,quien:yoId()}), tareas:()=>({cat:"limpieza",quien:"",dias:[],puntos:5}), bienes:()=>({tipo:"bien"}), eventos:()=>({fecha:diaSel||hoy(),quien:""}), pendientes:()=>({quien:""}), miembros:()=>({rol:"miembro",tipo:"adolescente",mesada:0}) };
const TIT = { movs:"gasto o ingreso", pagos:"pago", deudas:"deuda", proyectos:"proyecto", tareas:"tarea", bienes:"bien o documento", eventos:"evento", pendientes:"cosa para resolver", miembros:"miembro" };
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
  const puedeBorrar = obj && (esAdmin() || ((col === "eventos" || col === "pendientes") && obj.creado_por === yoId()) || (col === "movs" && obj.creado_por === yoId() && obj.estado === "pendiente"));
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
  if (col === "pendientes") { const r = await ins("pendientes", { ...d, creado_por: yoId() }); if (r) toast("Anotado para resolver"); return }
  if (col === "miembros") { const r = await ins("miembros", d); if (r) toast("Miembro agregado. Abajo tenés el código para invitarlo."); return }
  const r = await ins(col, { ...DEF[col](), ...d }); if (r) toast("Guardado");
}
function askMonto(titulo, def, cb){ formCtx = { custom: cb }; sheet(`<h2>${esc(titulo)}</h2><form id="frm"><label class="fld">Monto ($)<input type="number" id="f_monto" inputmode="decimal" step="any" value="${esc(def || "")}"></label><div class="acts"><button type="button" class="btn line" data-act="close">Cancelar</button><button class="btn" type="submit">Confirmar</button></div></form>`) }

/* ---------- pantallas ---------- */
/* Navegación por etapas: Inicio muestra botones grandes; cada botón abre una pantalla corta;
   el detalle aparece solo al tocar una fila; el botón "?" explica para qué sirve cada pantalla. */
let ruta = ["inicio"], verTodas = false;
const aqui = () => ruta[ruta.length - 1];
function go(r){ ruta.push(r); window.scrollTo(0,0); render() }
function back(){ if (ruta.length > 1) ruta.pop(); window.scrollTo(0,0); render() }
function home(){ ruta = ["inicio"]; window.scrollTo(0,0); render() }

const IC = {
  tareas:'<path d="M5 12.5l4.2 4.2L19 7"/>',
  agenda:'<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/>',
  plata:'<rect x="3" y="6.5" width="18" height="12" rx="3"/><circle cx="12" cy="12.5" r="2.6"/><path d="M6.5 6.5l9-3"/>',
  casa:'<path d="M4 11.5L12 5l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M10 20.5v-5h4v5"/>',
  familia:'<circle cx="8.5" cy="8.5" r="3"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M3 19.5c.4-3.2 2.7-5.3 5.5-5.3s5.1 2.1 5.5 5.3M14 14.6c2.9-.5 5.6 1.4 6.5 4.9"/>',
  informes:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pagos:'<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12h6"/>',
  deudas:'<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
  proyectos:'<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  movs:'<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  aprobar:'<path d="M7 11v9H4v-9zM7 11l4-7c1.7 0 2.5 1 2.2 2.6L12.6 10H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7"/>',
  residuos:'<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13"/>',
  horarios:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  patrimonio:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M15 8l2 2"/>',
  ajustes:'<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/>',
  gasto:'<path d="M12 5v14M5 12h14"/>',
  telefono:'<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  limpieza:'<path d="M14 3l-2.5 7M7 21l2-8.5h7L18 21z"/><path d="M9 16.5h8"/>',
  back:'<path d="M15 5l-7 7 7 7"/>', help:'<path d="M9.3 9a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.9v.5"/><circle cx="12" cy="17.6" r=".6"/>',
};
const svg = (k, w = 26) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || ""}</svg>`;
const tile = (r, label, sub, col, ic, badge) => `<button class="tile ${col}" data-act="go" data-r="${r}"><span class="ico">${svg(ic)}</span><span class="tl">${esc(label)}</span>${sub ? `<span class="ts">${esc(sub)}</span>` : ""}${badge ? `<span class="badge">${badge}</span>` : ""}</button>`;
const chip = (t, c = "") => `<span class="chip ${c}">${esc(t)}</span>`;
const rowBtn = (act, attrs, ic, col, title, subt, right) => `<button class="item" data-act="${act}" ${attrs}><span class="dot ${col}">${svg(ic, 20)}</span><span class="it"><b>${esc(title)}</b>${subt ? `<small>${subt}</small>` : ""}</span>${right || ""}<span class="chev" aria-hidden="true">›</span></button>`;
const vacio = (txt, cta) => `<div class="vacio"><p>${esc(txt)}</p>${cta || ""}</div>`;
const big = (col, act, attrs, ic, txt) => `<button class="cta ${col}" data-act="${act}" ${attrs}>${svg(ic, 22)}${esc(txt)}</button>`;
const cuando = s => { const d = dias(s); if (d < 0) return chip("Vencido", "c-rose"); if (d === 0) return chip("Hoy", "c-rose"); if (d === 1) return chip("Mañana", "c-peach"); if (d <= 7) return chip("En " + d + " días", "c-sun"); return chip(corta(s)) };
const estChip = m => m.estado === "aprobado" ? chip("Aprobado", "c-mint") : m.estado === "rechazado" ? chip("Rechazado", "c-rose") : chip((m.aprob || []).length ? "Falta 1 OK" : "Esperando OK", "c-sun");

/* prioridades: cada lista se ordena por prioridad; los admins las reordenan arrastrando */
const porPrio = (a, b) => (a.prioridad ?? 1000) - (b.prioridad ?? 1000);
let ordenando = null;
function lista(tabla, items, rowFn, vacioTxt){
  if (!items.length) return vacio(vacioTxt);
  const L = [...items].sort(porPrio);
  const puede = esAdmin() && L.length > 1;
  if (puede && ordenando === tabla) return `<div class="orden-h"><span>Arrastrá desde ☰ o usá las flechas. Lo de arriba es lo más importante.</span><button class="btn sm" data-act="orden-fin">Listo</button></div><div class="orden" data-t="${tabla}">${L.map((x, i) => `<div class="oi" data-id="${x.id}"><button class="handle" aria-label="Arrastrar">☰</button><span class="num-p">${i+1}</span><span class="oi-t">${esc(x.titulo || x.descr || x.nombre)}</span><button class="round sm" data-act="subir" data-id="${x.id}" aria-label="Subir">↑</button><button class="round sm" data-act="bajar" data-id="${x.id}" aria-label="Bajar">↓</button></div>`).join("")}</div>`;
  return (puede ? `<button class="link ordbtn" data-act="orden" data-t="${tabla}">↕ Ordenar por prioridad</button>` : "") + L.map((x, i) => `<div class="prio-w"><span class="num-p">${i+1}</span>${rowFn(x)}</div>`).join("");
}

/* textos que explican cada pantalla (botón ?) */
const AYUDA = {
  inicio: ["Esta es la pantalla principal.", "Tocá un botón grande para entrar a cada parte. Arriba ves lo más importante de hoy."],
  resolver: ["Cosas para resolver: un arreglo, un trámite, un problema.", "Están en orden de prioridad: la número 1 es la más importante. Cuando se resuelve, tocá el círculo.", "Cualquiera puede anotar algo para resolver."],
  tareas: ["Acá están las tareas de la casa.", "Cuando terminás una, tocá el círculo y se marca en verde." , "Cada tarea hecha suma puntos."],
  agenda: ["El calendario de la familia.", "Tocá un día para ver qué hay. Con el botón de abajo agregás un cumple, un turno o una salida."],
  plata: ["La plata de la casa, paso a paso.", "Elegí qué querés ver. Si gastaste algo, tocá Anotar un gasto."],
  "plata/gasto": ["Anotá lo que gastaste.", "Si tenés el ticket, marcá la casilla. Un adulto lo revisa y lo aprueba."],
  "plata/pagos": ["Las cuentas que hay que pagar: luz, colegio, alquiler.", "Los colores avisan cuánto falta para que venzan."],
  "plata/deudas": ["Lo que debemos y lo que nos deben.", "La barra muestra cuántas cuotas ya se pagaron."],
  "plata/proyectos": ["Las metas de la familia: viajes, arreglos, ahorro.", "La barra muestra cuánto falta para llegar."],
  "plata/movs": ["Todo lo que entró y salió.", "Tocá uno para ver el detalle."],
  "plata/aprobar": ["Gastos que cargó alguien y esperan tu OK.", "Tocá uno para aprobarlo o rechazarlo."],
  "plata/mia": ["Tu mesada del mes.", "Anotá lo que gastás para saber cuánto te queda."],
  casa: ["Todo lo de la casa.", "Elegí una parte: limpieza, residuos, horarios o las cosas de valor."],
  "casa/residuos": ["Qué días se saca la basura y quién la saca."],
  "casa/horarios": ["Los horarios fijos de la familia: escuela, cena, pantallas."],
  "casa/limpieza": ["Todas las tareas que se repiten y a quién le tocan."],
  "casa/patrimonio": ["Las cosas importantes de la casa: auto, papeles, garantías y mantenimiento.", "Avisa cuando algo está por vencer."],
  familia: ["Quiénes forman la casa.", "Los administradores organizan. Los partícipes usan la app, marcan sus tareas y anotan sus gastos."],
  informes: ["Informes para los administradores.", "Números del mes, presupuesto y cierre."],
  ajustes: ["Reglas de la casa.", "Elegí quién ve la plata y cuándo hace falta el OK de los dos administradores."],
  telefono: ["Tu llave de acceso.", "Guardala por si cambiás de teléfono. Sin la llave hay que pedir un código nuevo a un administrador."],
};
const TITULO = { inicio:() => "¡Hola, " + (yo()?.nombre || "") + "!", resolver:"Para resolver", tareas:"Tareas", agenda:"Agenda", plata:() => vePlata() ? "Plata" : "Mi plata", "plata/pagos":"Cuentas a pagar", "plata/deudas":"Deudas", "plata/proyectos":"Proyectos", "plata/movs":"Movimientos", "plata/aprobar":"Para aprobar", casa:"Casa", "casa/residuos":"Residuos", "casa/horarios":"Horarios", "casa/limpieza":"Limpieza y rutinas", "casa/patrimonio":"Patrimonio", familia:() => S.hogar?.nombre || "Familia", informes:"Informes", ajustes:"Ajustes", telefono:"Este teléfono" };

/* --- Inicio --- */
function vInicio(){
  const th = deHoy(), mias = th.filter(t => t.quien === yoId() || (!t.quien && !esAdmin())), faltan = mias.filter(t => !hecha(t)).length;
  const ev = S.eventos.filter(e => e.fecha >= hoy() && dias(e.fecha) <= 2).sort((a,b) => (a.fecha + a.hora) < (b.fecha + b.hora) ? -1 : 1)[0];
  const urg = vePlata() ? S.pagos.filter(p => !p.pagado && dias(p.vence) <= 3).length : 0;
  const pend = esAdmin() ? S.movs.filter(m => m.estado === "pendiente").length : 0;
  const pts = puntosSemana()[yoId()] || 0;
  let hero = `<div class="hero"><div class="hero-t">${DIAS[new Date().getDay()]} ${corta(hoy())}</div>`;
  hero += faltan ? `<button class="hero-b" data-act="go" data-r="tareas"><b>Te ${faltan === 1 ? "queda 1 tarea" : "quedan " + faltan + " tareas"} hoy</b><span>Tocá para verlas</span></button>`
                 : `<div class="hero-b ok"><b>${mias.length ? "¡Terminaste todo por hoy!" : "Hoy no tenés tareas"}</b>${AJ().puntos && pts ? `<span>Llevás ${pts} puntos esta semana</span>` : ""}</div>`;
  if (ev) hero += `<button class="hero-s" data-act="go" data-r="agenda">${svg("agenda", 18)} ${dias(ev.fecha) === 0 ? "Hoy" : dias(ev.fecha) === 1 ? "Mañana" : DIAS[parse(ev.fecha).getDay()]}${ev.hora ? " " + esc(ev.hora) : ""}: ${esc(ev.titulo)}</button>`;
  hero += `</div>`;
  let g = `<div class="tiles">`;
  g += tile("tareas", "Tareas", faltan ? faltan + " para hoy" : "Al día", "c-mint", "tareas");
  const pr = S.pendientes.filter(p => !p.resuelto).length;
  g += tile("resolver", "Para resolver", pr ? pr + " pendientes" : "Nada", "c-rose", "aprobar", pr || "");
  g += tile("agenda", "Agenda", "Calendario", "c-sky", "agenda");
  g += tile("plata", vePlata() ? "Plata" : "Mi plata", vePlata() ? "Cuentas y gastos" : "Mesada y gastos", "c-sun", "plata", urg + pend || "");
  g += tile("casa", "Casa", "Basura, horarios", "c-peach", "casa");
  g += tile("familia", "Familia", "Quién es quién", "c-lila", "familia");
  if (esAdmin()) g += tile("informes", "Informes", "Para admins", "c-ink", "informes");
  g += `</div>`;
  return hero + g;
}

/* --- Tareas --- */
function tareaRow(t, f = hoy()){ const d = hecha(t, f), can = puedoMarcar(t) && f === hoy();
  return `<div class="task ${d ? "done" : ""}"><button class="chk" data-act="tick" data-id="${t.id}" ${can ? "" : "disabled"} aria-label="${d ? "Desmarcar" : "Marcar hecha"}: ${esc(t.titulo)}">${d ? svg("tareas", 18) : ""}</button><button class="task-t" data-act="det-tarea" data-id="${t.id}"><b>${esc(t.titulo)}</b><small>${esc(nombre(t.quien))}${t.hora ? " · " + esc(t.hora) : ""}</small></button>${AJ().puntos && t.puntos ? chip("+" + t.puntos, "c-sun") : ""}</div>` }
function vTareas(){
  const th = deHoy().filter(t => t.cat !== "residuos" || true);
  th.sort(porPrio);
  const mias = th.filter(t => t.quien === yoId()), libres = th.filter(t => !t.quien), otras = th.filter(t => t.quien && t.quien !== yoId());
  let h = `<section class="blk"><h2>Mis tareas de hoy</h2>${mias.length ? mias.map(t => tareaRow(t)).join("") : vacio("Hoy no tenés tareas asignadas.")}</section>`;
  if (libres.length) h += `<section class="blk"><h2>Las puede hacer cualquiera</h2>${libres.map(t => tareaRow(t)).join("")}</section>`;
  if (otras.length) h += verTodas ? `<section class="blk"><h2>Las de los demás</h2>${otras.map(t => tareaRow(t)).join("")}</section><button class="link" data-act="todas">Ocultar las de los demás</button>`
                                  : `<button class="cta soft" data-act="todas">Ver las de los demás (${otras.length})</button>`;
  if (AJ().puntos) { const p = puntosSemana(); const M = S.miembros.filter(m => m.tipo !== "adulto"); if (M.length) { const mx = Math.max(10, ...M.map(m => p[m.id] || 0));
    h += `<section class="blk"><h2>Puntos de la semana</h2>${M.map(m => `<div class="pts"><span>${esc(m.nombre)}</span><div class="bar"><i style="width:${Math.round((p[m.id] || 0) / mx * 100)}%"></i></div><b>${p[m.id] || 0}</b></div>`).join("")}</section>` } }
  if (esAdmin()) h += big("c-mint", "new", 'data-col="tareas"', "gasto", "Agregar una tarea");
  return h }

/* --- Plata --- */
function vPlata(){
  if (!vePlata()) return vMiPlata();
  const t = totales(), urg = S.pagos.filter(p => !p.pagado && dias(p.vence) <= 3).length, pend = S.movs.filter(m => m.estado === "pendiente").length;
  let h = `<div class="numero c-sun"><small>Lo que sobra en ${MESES[new Date().getMonth()]}</small><b class="${t.saldo < 0 ? "neg" : ""}">${fmt(t.saldo)}</b></div>`;
  h += big("c-sun", "new", 'data-col="movs"', "gasto", "Anotar un gasto");
  h += `<div class="tiles">`;
  if (esAdmin()) h += tile("plata/aprobar", "Para aprobar", pend ? pend + " esperando" : "Nada pendiente", "c-mint", "aprobar", pend || "");
  h += tile("plata/pagos", "Cuentas", urg ? urg + " por vencer" : "Al día", "c-peach", "pagos", urg || "");
  h += tile("plata/deudas", "Deudas", fmt(debemos()), "c-rose", "deudas");
  h += tile("plata/proyectos", "Proyectos", S.proyectos.length + " metas", "c-lila", "proyectos");
  h += tile("plata/movs", "Movimientos", "Entradas y salidas", "c-sky", "movs");
  if (esAdmin()) h += tile("informes", "Informe del mes", "Números", "c-ink", "informes");
  return h + `</div>` }
function vMiPlata(){ const me = yo(), g = gastoMesada(me?.id), queda = (+me?.mesada || 0) - g;
  const L = S.movs.filter(x => x.quien === me?.id).sort((a,b) => a.fecha < b.fecha ? 1 : -1).slice(0, 8);
  let h = `<div class="numero c-mint"><small>Te queda de tu mesada</small><b class="${queda < 0 ? "neg" : ""}">${fmt(queda)}</b><span>de ${fmt(me?.mesada)} este mes</span></div>`;
  if (me?.tipo !== "infante") h += big("c-sun", "new", 'data-col="movs"', "gasto", "Anotar un gasto");
  h += `<section class="blk"><h2>Mis últimos gastos</h2>${L.length ? L.map(movRow).join("") : vacio("Todavía no anotaste nada.")}</section>`;
  h += `<div class="tiles">${tile("plata/proyectos", "Proyectos", "Metas de la familia", "c-lila", "proyectos")}</div>`;
  return h }
function movRow(m){ return rowBtn("det-mov", `data-id="${m.id}"`, m.tipo === "ingreso" ? "plata" : "movs", m.tipo === "ingreso" ? "c-mint" : "c-sun", m.descr || m.rubro, `${esc(nombre(m.quien))} · ${corta(m.fecha)}`, `<span class="rt"><span class="amt ${m.tipo === "ingreso" ? "pos" : ""}">${m.tipo === "ingreso" ? "+" : "−"}${fmt(m.monto)}</span>${estChip(m)}</span>`) }
function vPagos(){ const fila = p => rowBtn("det-pago", `data-id="${p.id}"`, "pagos", "c-peach", p.descr, fmt(p.monto) + (p.recurrente ? " · todos los meses" : ""), p.pagado ? chip("Pagado", "c-mint") : cuando(p.vence));
  const pend = S.pagos.filter(p => !p.pagado), pag = S.pagos.filter(p => p.pagado);
  return `<section class="blk"><h2>Por pagar, en orden de prioridad</h2>${lista("pagos", pend, fila, "No hay cuentas pendientes.")}</section>${pag.length ? `<section class="blk"><h2>Pagadas</h2>${pag.map(fila).join("")}</section>` : ""}` + (esAdmin() ? big("c-peach", "new", 'data-col="pagos"', "gasto", "Agregar una cuenta") : "") }
function vDeudas(){ return `<section class="blk"><h2>En orden de prioridad</h2>${lista("deudas", S.deudas, d => { const pc = d.cuotas_tot ? Math.round((+d.cuotas_pag || 0) / d.cuotas_tot * 100) : 0; const deb = d.direccion === "debemos";
    return rowBtn("det-deuda", `data-id="${d.id}"`, "deudas", deb ? "c-rose" : "c-mint", (deb ? "" : "Nos deben: ") + d.descr, d.cuotas_tot ? `Cuota ${+d.cuotas_pag || 0} de ${d.cuotas_tot}<span class="bar sm"><i style="width:${pc}%"></i></span>` : "", `<span class="amt ${deb ? "" : "pos"}">${fmt(d.saldo)}</span>`) }, "No hay deudas cargadas.")}</section>` + (esAdmin() ? big("c-rose", "new", 'data-col="deudas"', "gasto", "Agregar una deuda") : "") }
function vProyectos(){ return `<section class="blk">${lista("proyectos", S.proyectos, p => { const pc = +p.meta ? Math.min(100, Math.round((+p.ahorrado || 0) / p.meta * 100)) : 0;
    return `<button class="meta" data-act="det-proy" data-id="${p.id}"><span class="meta-t"><b>${esc(p.nombre)}</b><span>${pc}%</span></span><span class="bar"><i style="width:${pc}%"></i></span><small>${fmt(p.ahorrado)} de ${fmt(p.meta)}${p.fecha ? " · para " + corta(p.fecha) + "/" + p.fecha.slice(2,4) : ""}</small></button>` }, "Todavía no hay metas.")}</section>` + (esAdmin() ? big("c-lila", "new", 'data-col="proyectos"', "gasto", "Nueva meta") : "") }
function vMovs(){ const L = [...S.movs].sort((a,b) => a.fecha < b.fecha ? 1 : -1).slice(0, 60); return `<section class="blk">${L.length ? L.map(movRow).join("") : vacio("Todavía no hay movimientos.")}</section>` }
function vAprobar(){ const L = S.movs.filter(m => m.estado === "pendiente"); return `<section class="blk">${L.length ? L.map(movRow).join("") : vacio("No hay nada para aprobar. ¡Todo al día!")}</section>` }

/* --- Para resolver --- */
function vResolver(){
  const fila = p => `<div class="task ${p.resuelto ? "done" : ""}"><button class="chk" data-act="resolver" data-id="${p.id}" aria-label="Marcar resuelto: ${esc(p.titulo)}">${p.resuelto ? svg("tareas", 18) : ""}</button><button class="task-t" data-act="det-pend" data-id="${p.id}"><b>${esc(p.titulo)}</b><small>${esc(p.quien ? nombre(p.quien) : "Sin asignar")}${p.fecha ? " · para " + corta(p.fecha) : ""}</small></button></div>`;
  const ab = S.pendientes.filter(p => !p.resuelto), ok = S.pendientes.filter(p => p.resuelto);
  let h = `<section class="blk"><h2>En orden de prioridad</h2>${lista("pendientes", ab, fila, "¡No hay nada para resolver!")}</section>`;
  if (ok.length) h += verTodas ? `<section class="blk"><h2>Resueltas</h2>${ok.map(fila).join("")}</section>` : `<button class="cta soft" data-act="todas">Ver las resueltas (${ok.length})</button>`;
  if (yo()?.tipo !== "infante") h += big("c-rose", "new", 'data-col="pendientes"', "gasto", "Anotar algo para resolver");
  return h }

/* --- Casa --- */
function vCasa(){ const res = deHoy().filter(t => t.cat === "residuos");
  let h = res.length ? `<div class="aviso c-peach">${svg("residuos", 20)} Hoy se saca: ${res.map(t => esc(t.titulo.replace(/^sacar\s*/i, ""))).join(", ")}</div>` : "";
  return h + `<div class="tiles">${tile("casa/limpieza", "Limpieza y rutinas", S.tareas.filter(t => ["limpieza","rutina"].includes(t.cat)).length + " tareas", "c-mint", "limpieza")}${tile("casa/residuos", "Residuos", "Qué día y quién", "c-peach", "residuos")}${tile("casa/horarios", "Horarios", "Escuela, cena…", "c-sky", "horarios")}${tile("casa/patrimonio", "Patrimonio", "Papeles y service", "c-lila", "patrimonio")}</div>` }
const diasTxt = t => !t.dias || !t.dias.length ? "Todos los días" : t.dias.map(d => DIAS[d]).join(", ");
const listaT = (cats, ic, col) => { const L = S.tareas.filter(t => cats.includes(t.cat)); return `<section class="blk">${lista("tareas", L, t => rowBtn("det-tarea", `data-id="${t.id}"`, ic, col, t.titulo, diasTxt(t) + (t.hora ? " · " + esc(t.hora) : ""), chip(nombre(t.quien))), "Nada cargado todavía.")}</section>` + (esAdmin() ? big(col, "new", 'data-col="tareas"', "gasto", "Agregar") : "") };
function vPatrimonio(){ const V = S.bienes.filter(b => esAdmin() || !b.privado);
  const grp = (t, tit, col, ic) => { const L = V.filter(b => b.tipo === t); return L.length ? `<section class="blk"><h2>${tit}</h2>${L.map(b => rowBtn("det-bien", `data-id="${b.id}"`, ic, col, b.nombre, b.nota ? esc(b.nota) : "", b.fecha ? (dias(b.fecha) < 0 ? chip(t === "mantenimiento" ? "Atrasado" : "Vencido", "c-rose") : dias(b.fecha) <= 30 ? chip(corta(b.fecha), "c-sun") : chip(corta(b.fecha))) : "")).join("")}</section>` : "" };
  const h = grp("mantenimiento", "Mantenimiento", "c-peach", "ajustes") + grp("bien", "Bienes", "c-lila", "patrimonio") + grp("documento", "Papeles", "c-sky", "pagos");
  return (h || vacio("Todavía no hay nada cargado.")) + (esAdmin() ? big("c-lila", "new", 'data-col="bienes"', "gasto", "Agregar algo") : "") }

/* --- Agenda --- */
function itemsDia(f){ const out = [];
  S.eventos.filter(e => e.fecha === f).forEach(e => out.push({ k:"e", h:e.hora || "", html: rowBtn("det-evento", `data-id="${e.id}"`, "agenda", "c-sky", e.titulo, (e.hora ? esc(e.hora) + " · " : "") + esc(e.quien ? nombre(e.quien) : "Toda la familia"), "") }));
  if (vePlata()) S.pagos.filter(p => !p.pagado && p.vence === f).forEach(p => out.push({ k:"p", h:"", html: rowBtn("det-pago", `data-id="${p.id}"`, "pagos", "c-peach", "Vence: " + p.descr, fmt(p.monto), "") }));
  S.bienes.filter(b => b.fecha === f && (esAdmin() || !b.privado)).forEach(b => out.push({ k:"b", h:"", html: rowBtn("det-bien", `data-id="${b.id}"`, "patrimonio", "c-lila", b.nombre, b.tipo === "mantenimiento" ? "Mantenimiento" : "Vence", "") }));
  return out }
function vAgenda(){
  const base = cal || new Date(new Date().getFullYear(), new Date().getMonth(), 1); cal = base; diaSel = diaSel || hoy();
  const y = base.getFullYear(), m = base.getMonth(), first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay());
  let g = DIAS.map(d => `<div class="dn">${d[0]}</div>`).join("");
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const f = iso(d); const kinds = [...new Set(itemsDia(f).map(x => x.k))].slice(0,3);
    g += `<button data-act="dia" data-f="${f}" class="${d.getMonth() !== m ? "out" : ""} ${f === hoy() ? "today" : ""} ${f === diaSel ? "sel" : ""}">${d.getDate()}<span class="dots">${kinds.map(k => `<i class="${k}"></i>`).join("")}</span></button>`;
    if (i === 34 && new Date(y, m, 1 - first.getDay() + 35).getMonth() !== m) break }
  const it = itemsDia(diaSel).sort((a,b) => a.h < b.h ? -1 : 1);
  let h = `<section class="blk cal-blk"><div class="calh"><button class="round" data-act="mes" data-d="-1" aria-label="Mes anterior">‹</button><b>${MESES[m]} ${y}</b><button class="round" data-act="mes" data-d="1" aria-label="Mes siguiente">›</button></div><div class="cal">${g}</div></section>`;
  h += `<section class="blk"><h2>${diaSel === hoy() ? "Hoy" : DIAS[parse(diaSel).getDay()] + " " + corta(diaSel)}</h2>${it.length ? it.map(x => x.html).join("") : vacio("No hay nada este día.")}</section>`;
  if (yo()?.tipo !== "infante") h += big("c-sky", "new", 'data-col="eventos"', "gasto", "Agregar al calendario");
  return h }

/* --- Familia --- */
function vFamilia(){
  const card = m => `<button class="persona" data-act="det-miembro" data-id="${m.id}">${av(m.id)}<span><b>${esc(m.nombre)}</b><small>${m.rol === "admin" ? "Administrador" : m.tipo === "adolescente" ? "Adolescente" : m.tipo === "infante" ? "Infante" : "Adulto"}${m.user_id === S.session.user.id ? " · vos" : !m.user_id && m.tipo !== "infante" ? " · falta que entre" : ""}</small></span></button>`;
  let h = `<section class="blk"><h2>La familia</h2><div class="gente">${S.miembros.map(card).join("")}</div></section>`;
  if (esAdmin()) h += big("c-lila", "new", 'data-col="miembros"', "gasto", "Sumar a alguien");
  h += `<div class="tiles">${esAdmin() ? tile("ajustes", "Ajustes", "Reglas de la casa", "c-ink", "ajustes") : ""}${tile("telefono", "Este teléfono", "Tu llave", "c-sky", "telefono")}</div>`;
  return h }
function vAjustes(){ const c = AJ();
  return `<section class="blk"><label class="sw"><input type="checkbox" id="c_adol" data-act="cfg" ${c.adolVenPlata ? "checked" : ""}><span>Los adolescentes ven la plata de la casa</span></label>
  <label class="sw"><input type="checkbox" id="c_doble" data-act="cfg" ${c.dobleAprob ? "checked" : ""}><span>Los gastos grandes necesitan el OK de los 2 admins</span></label>
  <label class="fld">Desde qué monto es "gasto grande" ($)<input type="number" id="c_umbral" inputmode="decimal" value="${esc(c.umbral)}" data-act="cfgnum"></label>
  <label class="sw"><input type="checkbox" id="c_puntos" data-act="cfg" ${c.puntos ? "checked" : ""}><span>Puntos por tareas para los chicos</span></label></section>
  ${big("c-ink", "presu", "", "plata", "Presupuesto por rubro")}` }
function vTelefono(){ return `<section class="blk"><p class="txt">Esta llave es tu entrada a la app. Si cambiás de teléfono, la pegás y entrás como siempre.</p>${big("c-sky", "llave", "", "telefono", "Copiar mi llave")}</section>${installBtn() ? `<section class="blk">${installBtn()}</section>` : ""}` }

/* --- Informes (para admins, más técnico) --- */
function vInformes(){ const t = totales(); const por = {}; movsMes().filter(x => x.tipo === "gasto").forEach(x => por[x.rubro] = (por[x.rubro] || 0) + (+x.monto || 0)); const P = AJ().presupuesto || {};
  const r = (a, b, c = "") => `<div class="r"><span>${a}</span><b class="${c}">${b}</b></div>`;
  let h = `<section class="blk rep"><h2>Resultado de ${MESES[new Date().getMonth()]}</h2>${r("Ingresos", fmt(t.ing), "pos")}${r("Gastos", fmt(t.gas))}${r("Sobrante", fmt(t.saldo), t.saldo < 0 ? "neg" : "pos")}${r("Deuda total", fmt(debemos()))}${r("Cuentas pendientes", fmt(sum(S.pagos.filter(p => !p.pagado))))}</section>`;
  const rub = RUBROS.filter(x => P[x] || por[x]);
  h += `<section class="blk rep"><h2>Presupuesto por rubro</h2>${rub.length ? rub.map(x => { const g = por[x] || 0, b = +P[x] || 0, pc = b ? Math.round(g / b * 100) : 0; return `<div class="r"><span>${x}</span><b class="${b && pc > 100 ? "neg" : ""}">${fmt(g)}${b ? " / " + fmt(b) + " (" + pc + "%)" : ""}</b></div>` }).join("") : vacio("Sin gastos aprobados este mes.")}</section>`;
  h += `<section class="blk rep"><h2>Prioridades de pago</h2>${PRIORIDADES.map((p,i) => `<div class="r"><span>${i+1}. ${esc(p[0])}</span>${chip(p[1], p[2] === "bad" ? "c-rose" : p[2] === "warn" ? "c-sun" : p[2] === "good" ? "c-mint" : "")}</div>`).join("")}</section>`;
  const ing = movsMes().filter(x => x.tipo === "ingreso"), tot = sum(ing), pq = {}; ing.forEach(x => pq[x.quien] = (pq[x.quien] || 0) + (+x.monto || 0));
  h += `<section class="blk rep"><h2>Aportes al hogar</h2>${tot ? Object.entries(pq).map(([k,v]) => r(esc(nombre(k)), fmt(v) + " · " + Math.round(v / tot * 100) + "%")).join("") : vacio("Sin ingresos cargados este mes.")}</section>`;
  const ms = S.miembros.filter(m => +m.mesada > 0);
  if (ms.length) h += `<section class="blk rep"><h2>Mesadas</h2>${ms.map(m => r(esc(m.nombre) + " · " + fmt(m.mesada), "gastó " + fmt(gastoMesada(m.id)))).join("")}</section>`;
  h += big("c-ink", "cierre", "", "informes", "Ver cierre del mes");
  return h }

/* --- Detalles (aparecen solo al tocar) --- */
function detalle(titulo, col, ic, filas, acciones){
  sheet(`<div class="det-h"><span class="dot ${col}">${svg(ic, 22)}</span><h2>${esc(titulo)}</h2></div><div class="det">${filas.filter(Boolean).map(([a,b]) => `<div class="r"><span>${a}</span><b>${b}</b></div>`).join("")}</div><div class="acts col">${acciones || ""}<button class="btn line" data-act="close">Cerrar</button></div>`) }
const ab = (act, id, txt, cls = "") => `<button class="btn ${cls}" data-act="${act}" data-id="${id}">${txt}</button>`;
const eb = (col, id) => `<button class="btn line" data-act="edit" data-col="${col}" data-id="${id}">Editar</button>`;
function abrirDetalle(k, id){
  if (k === "mov") { const m = find("movs", id); const ya = (m.aprob || []).includes(yoId());
    detalle(m.descr || m.rubro, m.tipo === "ingreso" ? "c-mint" : "c-sun", "movs", [["Monto", (m.tipo === "ingreso" ? "+" : "−") + fmt(m.monto)], ["Quién", esc(nombre(m.quien))], ["Rubro", esc(m.rubro)], ["Fecha", corta(m.fecha)], ["Ticket", m.ticket ? "Sí" : "No"], m.mesada ? ["De la mesada", "Sí"] : null, ["Estado", estChip(m)]],
      (esAdmin() && m.estado === "pendiente" ? (ya ? `<p class="txt">Ya lo aprobaste. Falta el otro administrador.</p>` : ab("aprobar", id, "Aprobar") + ab("rechazar", id, "Rechazar", "danger")) : "") + ((esAdmin() || (m.creado_por === yoId() && m.estado === "pendiente")) ? eb("movs", id) : "")) }
  if (k === "pago") { const p = find("pagos", id);
    detalle(p.descr, "c-peach", "pagos", [["Monto", fmt(p.monto)], ["Vence", corta(p.vence) + " " + (p.pagado ? "" : cuando(p.vence))], ["Rubro", esc(p.rubro)], ["Se repite", p.recurrente ? "Todos los meses" : "No"], p.ultimo_pago ? ["Último pago", corta(p.ultimo_pago)] : null],
      esAdmin() ? (!p.pagado ? ab("pagar", id, "Ya lo pagué") : "") + eb("pagos", id) : "") }
  if (k === "deuda") { const d = find("deudas", id); const deb = d.direccion === "debemos";
    detalle(d.descr, deb ? "c-rose" : "c-mint", "deudas", [["Saldo", fmt(d.saldo)], +d.cuota ? ["Cuota", fmt(d.cuota)] : null, d.cuotas_tot ? ["Cuotas", (+d.cuotas_pag || 0) + " de " + d.cuotas_tot] : null, ["Tipo", deb ? "Nosotros debemos" : "Nos deben"]],
      esAdmin() ? (+d.saldo > 0 ? ab("cuota", id, deb ? "Pagué una cuota" : "Cobré") : "") + eb("deudas", id) : "") }
  if (k === "proy") { const p = find("proyectos", id); const falta = Math.max(0, (+p.meta || 0) - (+p.ahorrado || 0)); let mens = ""; if (p.fecha && falta) mens = fmt(falta / Math.max(1, Math.round(dias(p.fecha) / 30.4))) + " por mes";
    detalle(p.nombre, "c-lila", "proyectos", [["Ahorrado", fmt(p.ahorrado)], ["Meta", fmt(p.meta)], ["Falta", fmt(falta)], p.fecha ? ["Para", corta(p.fecha) + "/" + p.fecha.slice(2,4)] : null, mens ? ["Hay que juntar", mens] : null, p.proximo ? ["Próximo paso", esc(p.proximo)] : null, p.quien ? ["Responsable", esc(nombre(p.quien))] : null],
      esAdmin() ? (falta ? ab("aportar", id, "Sumar plata") : "") + eb("proyectos", id) : "") }
  if (k === "pend") { const p = find("pendientes", id); const ok = esAdmin() || p.creado_por === yoId();
    detalle(p.titulo, "c-rose", "aprobar", [["Quién se encarga", esc(p.quien ? nombre(p.quien) : "Sin asignar")], p.fecha ? ["Para cuándo", corta(p.fecha)] : null, p.nota ? ["Nota", esc(p.nota)] : null, ["Prioridad", "N° " + ([...S.pendientes.filter(x => !x.resuelto)].sort(porPrio).findIndex(x => x.id === id) + 1 || "-")], ["Estado", p.resuelto ? chip("Resuelto", "c-mint") : chip("Pendiente", "c-sun")], ["Lo anotó", esc(nombre(p.creado_por))]], ok ? eb("pendientes", id) : "") }
  if (k === "tarea") { const t = find("tareas", id);
    detalle(t.titulo, "c-mint", "tareas", [["Quién", esc(nombre(t.quien))], ["Días", diasTxt(t)], t.hora ? ["Hora", esc(t.hora)] : null, AJ().puntos && t.puntos ? ["Puntos", "+" + t.puntos] : null, hecha(t) ? ["Hoy", "Hecha por " + esc(nombre(hecha(t)))] : null], esAdmin() ? eb("tareas", id) : "") }
  if (k === "bien") { const b = find("bienes", id);
    detalle(b.nombre, "c-lila", "patrimonio", [["Tipo", b.tipo === "mantenimiento" ? "Mantenimiento" : b.tipo === "documento" ? "Papel" : "Bien"], b.fecha ? ["Fecha", corta(b.fecha) + "/" + b.fecha.slice(2,4)] : null, b.nota ? ["Nota", esc(b.nota)] : null, b.privado ? ["Quién lo ve", "Solo admins"] : null], esAdmin() ? eb("bienes", id) : "") }
  if (k === "evento") { const e = find("eventos", id);
    detalle(e.titulo, "c-sky", "agenda", [["Día", DIAS[parse(e.fecha).getDay()] + " " + corta(e.fecha)], e.hora ? ["Hora", esc(e.hora)] : null, ["Para", esc(e.quien ? nombre(e.quien) : "Toda la familia")], e.nota ? ["Nota", esc(e.nota)] : null, ["Lo anotó", esc(nombre(e.creado_por))]], (esAdmin() || e.creado_por === yoId()) ? eb("eventos", id) : "") }
  if (k === "miembro") { const m = find("miembros", id); const cod = S.codigos[m.id];
    detalle(m.nombre, "c-lila", "familia", [["Rol", m.rol === "admin" ? "Administrador" : "Partícipe"], ["Tipo", m.tipo === "adolescente" ? "Adolescente" : m.tipo === "infante" ? "Infante" : "Adulto"], m.edad ? ["Edad", m.edad + " años"] : null, +m.mesada ? ["Mesada", fmt(m.mesada) + " por mes"] : null, ["Cuenta", m.user_id ? "Ya entró" : m.tipo === "infante" ? "No necesita" : "Todavía no entró"], esAdmin() && cod && !m.user_id ? ["Código", `<span class="code">${esc(cod)}</span>`] : null],
      esAdmin() ? (cod && !m.user_id ? ab("invitar", id, "Copiar invitación para WhatsApp") : "") + (m.user_id && m.user_id !== S.session.user.id ? ab("reacceso", id, "Cambió de teléfono: nuevo código", "line") : "") + eb("miembros", id) : "") }
}

/* ---------- instalación ---------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; render() });
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
function installBtn(){ if (standalone()) return "";
  if (deferredPrompt) return big("c-mint", "instalar", "", "telefono", "Instalar la app en este teléfono");
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<p class="txt">${ios ? "Para instalarla: en Safari tocá Compartir y después “Agregar a inicio”." : "Para instalarla: en Chrome tocá el menú ⋮ y después “Instalar app”."}</p>` }

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
const VISTAS = { inicio:vInicio, resolver:vResolver, tareas:vTareas, agenda:vAgenda, plata:() => vePlata() ? vPlata() : vMiPlata(), "plata/pagos":vPagos, "plata/deudas":vDeudas, "plata/proyectos":vProyectos, "plata/movs":vMovs, "plata/aprobar":vAprobar,
  casa:vCasa, "casa/limpieza":() => listaT(["limpieza","rutina"], "limpieza", "c-mint"), "casa/residuos":() => listaT(["residuos"], "residuos", "c-peach"), "casa/horarios":() => listaT(["horario"], "horarios", "c-sky"), "casa/patrimonio":vPatrimonio,
  familia:vFamilia, ajustes:vAjustes, telefono:vTelefono, informes:vInformes };
const NAV = [["inicio","Inicio","casa"],["tareas","Tareas","tareas"],["agenda","Agenda","agenda"],["plata","Plata","plata"]];
function render(){
  const app = document.getElementById("app"), nav = document.getElementById("nav");
  if (!S.session) { nav.innerHTML = ""; if (!booting) app.innerHTML = vSinCasa(); return }
  if (!loaded) return;
  if (!S.H || !yo()) { nav.innerHTML = ""; app.innerHTML = vSinCasa(); return }
  const r = VISTAS[aqui()] ? aqui() : (ruta = ["inicio"], "inicio");
  const t = TITULO[r]; const titulo = typeof t === "function" ? t() : t;
  const sc = window.scrollY;
  app.innerHTML = `<header class="top">${ruta.length > 1 ? `<button class="round hb" data-act="back" aria-label="Volver">${svg("back", 22)}</button>` : `<span class="logo">${svg("casa", 22)}</span>`}<h1>${esc(titulo)}</h1>${AYUDA[r] ? `<button class="round hb help" data-act="help" aria-label="¿Para qué sirve esta pantalla?">${svg("help", 22)}</button>` : ""}</header><main class="pg">${VISTAS[r]()}</main>`;
  const raiz = ruta[1] || "inicio";
  nav.innerHTML = `<div class="in">${NAV.map(([k,l,ic]) => `<button class="${raiz === k || (k === "inicio" && ruta.length === 1) ? "on" : ""}" data-act="nav" data-r="${k}">${svg(ic, 24)}<span>${l}</span></button>`).join("")}</div>`;
  window.scrollTo(0, sc);
}

/* ---------- acciones ---------- */
const find = (c, id) => S[c].find(x => x.id === id);
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el) return; const a = el.dataset.act, id = el.dataset.id;
  if (a === "close") { if (e.target === el || el.tagName === "BUTTON") closeSheet(); return }
  if (a === "go") { verTodas = false; ordenando = null; go(el.dataset.r); return }
  if (a === "back") { verTodas = false; ordenando = null; back(); return }
  if (a === "nav") { verTodas = false; ordenando = null; if (el.dataset.r === "inicio") home(); else { ruta = ["inicio", el.dataset.r]; window.scrollTo(0,0); render() } return }
  if (a === "help") { const t = AYUDA[aqui()] || []; sheet(`<div class="det-h"><span class="dot c-sun">${svg("help", 22)}</span><h2>${esc(t[0] || "")}</h2></div>${t.slice(1).map(p => `<p class="txt big">${esc(p)}</p>`).join("")}<div class="acts col"><button class="btn" data-act="close">Entendido</button></div>`); return }
  if (a.startsWith("det-")) { abrirDetalle(a.slice(4), id); return }
  if (a === "todas") { verTodas = !verTodas; render(); return }
  if (a === "orden") { ordenando = el.dataset.t; render(); return }
  if (a === "orden-fin") { ordenando = null; render(); return }
  if (a === "subir" || a === "bajar") { const box = el.closest(".orden"), it = el.closest(".oi"); if (a === "subir" && it.previousElementSibling) box.insertBefore(it, it.previousElementSibling); if (a === "bajar" && it.nextElementSibling) box.insertBefore(it.nextElementSibling, it); guardarOrden(box); return }
  if (a === "resolver") { const r = await run(sb.rpc("resolver", { p: id })); if (r) { recargar("pendientes"); const p = find("pendientes", id); if (p && !p.resuelto) toast("¡Resuelto!") } return }
  if (a === "new") { openForm(el.dataset.col); return }
  if (a === "edit") { const o = find(el.dataset.col, id); if (o) openForm(el.dataset.col, o); return }
  if (a === "delete") { const { col, obj } = formCtx; if (el.dataset.sure) { if (col === "miembros" && obj.user_id === S.session.user.id) { toast("No podés borrarte a vos"); return } closeSheet(); if (await del(col, obj.id)) toast("Borrado") } else { el.dataset.sure = "1"; el.textContent = "¿Seguro? Tocá de nuevo" } return }
  if (a === "llave") { const k = LS.get("cdo-llave") || ""; try { await navigator.clipboard.writeText(k); toast("Llave copiada. Guardala en un lugar seguro.") } catch(_) { sheet(`<h2>Tu llave de acceso</h2><div class="card" style="word-break:break-all">${esc(k)}</div><div class="acts"><button class="btn line" data-act="close">Cerrar</button></div>`) } return }
  if (a === "reacceso") { const m = find("miembros", id); if (!el.dataset.sure) { el.dataset.sure = "1"; el.textContent = "¿Seguro? El teléfono viejo pierde el acceso"; return } const r = await run(sb.rpc("reiniciar_acceso", { m: id })); if (r) { recargar("miembros"); toast("Nuevo código para " + m.nombre + ": " + r.data) } return }
  if (a === "instalar") { if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; render() } return }
  if (a === "dia") { diaSel = el.dataset.f; const d = parse(diaSel); cal = new Date(d.getFullYear(), d.getMonth(), 1); render(); return }
  if (a === "mes") { cal = new Date(cal.getFullYear(), cal.getMonth() + (+el.dataset.d), 1); render(); return }
  if (a === "tick") { const t = find("tareas", id); if (!t || !puedoMarcar(t)) return; const was = hecha(t); const r = await run(sb.rpc("marcar_tarea", { t: id, dia: hoy() })); if (r) { recargar("tareas"); if (!was) toast("¡Bien hecho!" + (AJ().puntos && t.puntos ? ` +${t.puntos} puntos` : "")) } return }
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
let enviando = false;
document.addEventListener("submit", async e => { e.preventDefault(); if (enviando) return; enviando = true; const b = e.target.querySelector('[type=submit]'); if (b) b.disabled = true;
  try { await enviar(e.target) } finally { enviando = false; if (b && b.isConnected) b.disabled = false } });
async function enviar(f){
  if (f.id === "llavef") { const c = deLlave(document.getElementById("l_llave").value); if (!c) { toast("Esa llave no es válida"); return } try { await entrarCon(c); toast("Listo, entraste") } catch(e) { toast("Esa llave no funciona") } return }
  if (f.id === "joinf") { const cod = document.getElementById("j_cod").value; if (!cod.trim()) { toast("Poné el código"); return } if (!await asegurarAcceso()) return; const r = await run(sb.rpc("unirme", { cod })); if (r) { LS.set("cdo-hogar", r.data); loaded = false; await entrarHogar(); toast("Listo, ya estás adentro") } return }
  if (f.id === "newf") { if (!document.getElementById("n_yo").value.trim()) { toast("Poné tu nombre"); return } if (!await asegurarAcceso()) return; const r = await run(sb.rpc("crear_hogar", { nombre_hogar: document.getElementById("n_casa").value, mi_nombre: document.getElementById("n_yo").value })); if (r) { LS.set("cdo-hogar", r.data); loaded = false; await entrarHogar(); ruta = ["inicio","familia"]; render(); toast("Casa creada. Ahora sumá a la familia.") } return }
  if (formCtx?.custom) { const v = +(document.getElementById("f_monto").value || "").replace(",", "."); if (!(v > 0)) { toast("Poné el monto"); return } const cb = formCtx.custom; closeSheet(); cb(v); return }
  if (formCtx?.presu) { const P = {}; RUBROS.forEach(r => { const v = +document.getElementById("p_" + r).value || 0; if (v) P[r] = v }); closeSheet(); saveAj({ presupuesto: P }).then(r => r && toast("Presupuesto guardado")); return }
  await submitForm();
}
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet() });

/* arrastrar para ordenar prioridades */
async function guardarOrden(box){ const t = box.dataset.t, ids = [...box.querySelectorAll(".oi")].map(x => x.dataset.id);
  box.querySelectorAll(".num-p").forEach((n, i) => n.textContent = i + 1);
  ids.forEach((id, i) => { const o = find(t, id); if (o) o.prioridad = i + 1 });
  const r = await run(sb.rpc("ordenar", { tabla: t, ids })); if (r) recargar(t) }
let drag = null;
document.addEventListener("pointerdown", e => { const hdl = e.target.closest(".handle"); if (!hdl) return; e.preventDefault();
  const it = hdl.closest(".oi"); drag = { it, box: it.closest(".orden") }; it.classList.add("drag"); hdl.setPointerCapture(e.pointerId) });
document.addEventListener("pointermove", e => { if (!drag) return; const { it, box } = drag;
  const sibs = [...box.querySelectorAll(".oi")].filter(x => x !== it);
  const next = sibs.find(x => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2 });
  if (next) { if (it.nextElementSibling !== next) box.insertBefore(it, next) } else if (box.lastElementChild !== it) box.appendChild(it) });
document.addEventListener("pointerup", () => { if (!drag) return; const { it, box } = drag; it.classList.remove("drag"); drag = null; guardarOrden(box) });

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
