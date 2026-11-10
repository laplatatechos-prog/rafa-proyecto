// Simula los servicios de Google Apps Script para probar Codigo.gs sin Google.
// Uso: TZ=America/Argentina/Buenos_Aires node tests/simulador-google.js [puerto]
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');

function crearEntorno() {
  const propsData = {};
  const eventos = [];
  let nextId = 1;
  function Evento(cal, titulo, ini, fin, todoElDia, opts) {
    this.id = 'ev' + (nextId++); this.cal = cal; this.titulo = titulo; this.ini = ini; this.fin = fin;
    this.todo = todoElDia; this.lugar = (opts && opts.location) || ''; this.borrado = false;
  }
  Object.assign(Evento.prototype, {
    getId() { return this.id; }, getTitle() { return this.titulo; }, setTitle(t) { this.titulo = t; },
    getStartTime() { return this.ini; }, getEndTime() { return this.fin; }, isAllDayEvent() { return this.todo; },
    getLocation() { return this.lugar; }, addPopupReminder() {}, deleteEvent() { this.borrado = true; },
    getMyStatus() { return 'YES'; },
  });
  function Calendario(nombre) { this.nombre = nombre; }
  Object.assign(Calendario.prototype, {
    getName() { return this.nombre; }, isHidden() { return false; },
    getEvents(a, b) { return eventos.filter(e => !e.borrado && e.cal === this && e.ini < b && e.fin > a); },
    createEvent(t, i, f, o) { const e = new Evento(this, t, i, f, false, o); eventos.push(e); return e; },
    createAllDayEvent(t, d, o) {
      const i = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const e = new Evento(this, t, i, new Date(i.getTime() + 86400000), true, o); eventos.push(e); return e;
    },
  });
  const principal = new Calendario('Rafael');
  const obras = new Calendario('Obras');
  const filas = [];
  const hoja = {
    getName: () => 'Deudas', setName() {}, getParent: () => ({ getUrl: () => 'https://docs.google.com/x' }),
    getRange(r, c, nr, nc) {
      if (typeof r === 'string') return { setNumberFormat() { return this; } };
      return {
        setValues(v) { v.forEach((fila, i) => fila.forEach((x, j) => { filas[r - 1 + i] = filas[r - 1 + i] || []; filas[r - 1 + i][c - 1 + j] = x; })); return this; },
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const f = filas[r - 1 + i] || []; out.push(Array.from({ length: nc }, (_, j) => f[c - 1 + j] === undefined ? '' : f[c - 1 + j])); } return out; },
        setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; },
      };
    },
    setFrozenRows() {}, getLastRow: () => filas.length, appendRow(f) { filas.push(f.slice()); }, deleteRow(n) { filas.splice(n - 1, 1); },
  };
  const ss = { getId: () => 'ss1', getSheets: () => [hoja], getSheetByName: () => hoja, getUrl: () => 'u' };
  const pad = n => String(n).padStart(2, '0');
  const ctx = {
    console,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => propsData[k] === undefined ? null : propsData[k], setProperty: (k, v) => { propsData[k] = String(v); },
      deleteProperty: k => { delete propsData[k]; } }) },
    CalendarApp: {
      getAllCalendars: () => [principal, obras], getDefaultCalendar: () => principal, getCalendarById: () => null,
      getEventById: id => eventos.find(e => e.id === id) || null, GuestStatus: { NO: 'NO' },
    },
    SpreadsheetApp: { create: () => ss, openById: () => ss },
    ContentService: {
      MimeType: { JSON: 'json', TEXT: 'text' },
      createTextOutput(t) { return { t, setMimeType(m) { this.m = m; return this; } }; },
    },
    Utilities: {
      getUuid: () => 'abcd-efgh-ijkl-mnop-qrst-uvwx',
      formatDate(d, z, f) {
        return f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
          .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes()));
      },
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'yo@example.com' }) },
    MailApp: { sendEmail: (a, s, b) => { ctx.ultimoMail = { a, s, b }; } },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => { const t = { timeBased: () => t, atHour: () => t, nearMinute: () => t, everyDays: () => t, inTimezone: () => t, create: () => t }; return t; } },
    Logger: { log: () => {} },
  };
  vm.createContext(ctx);
  for (const f of ['Parser.gs', 'Codigo.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', f), 'utf8'), ctx, { filename: f });
  }
  // datos de ejemplo
  const hoy = new Date(); const d = (h, m) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), h, m);
  obras.createEvent('Obra Gonnet — membrana', d(8, 0), d(10, 0), { location: 'Camino Centenario 1234, Gonnet' });
  principal.createEvent('Reunión con el arquitecto', d(11, 30), d(12, 30));
  principal.createAllDayEvent('📌 Pasar presupuesto a Sosa', hoy);
  propsData.CLAVE = 'prueba';
  return { ctx, eventos, filas };
}

if (require.main === module) {
  const { ctx } = crearEntorno();
  const puerto = +process.argv[2] || 8787;
  http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const parameter = Object.fromEntries(u.searchParams);
    const out = ctx.doGet({ parameter });
    res.writeHead(200, { 'Content-Type': out.m === 'json' ? 'application/json' : 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(out.t);
  }).listen(puerto, () => console.log('Simulador en http://localhost:' + puerto));
}
module.exports = { crearEntorno };
