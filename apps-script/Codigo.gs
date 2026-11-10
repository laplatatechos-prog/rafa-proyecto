/**
 * ASISTENTE RAFA — backend en Google Apps Script.
 *
 * - Lee todos tus calendarios de Google y arma el resumen del día para leer en voz alta.
 * - Agenda eventos / tareas / deudas a partir de una frase ("agregame a las 2 una cita con Pérez").
 * - Guarda las deudas en una planilla de Google Sheets que se crea sola.
 * - Todos los días a las 6 AM te manda el resumen por mail (respaldo de la voz).
 *
 * Primera vez: ejecutar la función `configurar` desde el editor (ver README).
 */

var ZONA = 'America/Argentina/Buenos_Aires';
var MARCA = 'Creado por Asistente Rafa';
var COLUMNAS = ['ID', 'Alta', 'Tipo', 'Persona', 'Monto', 'Moneda', 'Concepto', 'Vence', 'Estado', 'Pagada el', 'EventoId'];

/* =================== CONFIGURACIÓN =================== */

function props() { return PropertiesService.getScriptProperties(); }

/** Ejecutar UNA vez desde el editor. Crea la clave, la planilla y el disparador de las 6 AM. */
function configurar() {
  var p = props();
  var clave = p.getProperty('CLAVE');
  if (!clave) {
    clave = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    p.setProperty('CLAVE', clave);
  }
  if (!p.getProperty('NOMBRE')) p.setProperty('NOMBRE', 'Rafael');
  var hoja = hojaDeudas();

  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'enviarResumenDiario') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('enviarResumenDiario').timeBased().atHour(6).nearMinute(0).everyDays(1)
    .inTimezone(ZONA).create();

  Logger.log('================ LISTO ================');
  Logger.log('TU CLAVE SECRETA: ' + clave);
  Logger.log('Planilla de deudas: ' + hoja.getParent().getUrl());
  Logger.log('Calendarios que voy a leer: ' + calendariosLectura().map(function (c) { return c.getName(); }).join(', '));
  Logger.log('Ahora: Implementar > Nueva implementación > Aplicación web (ver README).');
}

/** Calendarios a leer: todos los visibles, salvo los excluidos en la propiedad EXCLUIR (nombres separados por coma). */
function calendariosLectura() {
  var excluir = (props().getProperty('EXCLUIR') || '').split(',')
    .map(function (s) { return s.trim().toLowerCase(); }).filter(String);
  return CalendarApp.getAllCalendars().filter(function (c) {
    if (c.isHidden()) return false;
    return excluir.indexOf(c.getName().toLowerCase()) < 0;
  });
}

/** Calendario donde se agendan las cosas nuevas (propiedad CALENDARIO = ID; si no, el principal). */
function calendarioDestino() {
  var id = props().getProperty('CALENDARIO');
  return (id && CalendarApp.getCalendarById(id)) || CalendarApp.getDefaultCalendar();
}

/* =================== API WEB =================== */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var formato = p.formato || 'json';
  try {
    if (!p.clave || p.clave !== props().getProperty('CLAVE')) {
      return salida({ ok: false, error: 'Clave incorrecta' }, formato, 'Clave incorrecta.');
    }
    var accion = p.accion || 'resumen';
    var r;
    switch (accion) {
      case 'resumen':
        r = armarResumen(new Date());
        return salida({ ok: true, texto: r.texto, eventos: r.eventos, deudas: r.deudas }, formato, r.texto);
      case 'agenda':
        var desde = p.fecha ? fechaDesdeISO(p.fecha) : new Date();
        return salida({ ok: true, eventos: eventosDelDia(desde).map(eventoAJson) }, formato);
      case 'agregar':
        r = agregarDesdeTexto(p.texto || '');
        return salida(r, formato, r.mensaje);
      case 'deudas':
        return salida({ ok: true, deudas: listarDeudas(p.todas === '1') }, formato);
      case 'pagar':
        r = marcarPagada(p.id);
        return salida(r, formato, r.mensaje);
      case 'deshacer':
        r = deshacerUltimo();
        return salida(r, formato, r.mensaje);
      case 'hecho':
        r = marcarHecho(p.id);
        return salida(r, formato, r.mensaje);
      default:
        return salida({ ok: false, error: 'Acción desconocida' }, formato, 'No entendí la acción.');
    }
  } catch (err) {
    return salida({ ok: false, error: String(err && err.message || err) }, formato, 'Hubo un error: ' + err);
  }
}

function salida(obj, formato, texto) {
  if (formato === 'texto') {
    return ContentService.createTextOutput(texto || obj.mensaje || obj.error || 'Listo.')
      .setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fechaDesdeISO(s) {
  var a = s.split('-');
  return new Date(+a[0], +a[1] - 1, +a[2]);
}

/* =================== AGENDA =================== */

function eventosDelDia(fecha) {
  var ini = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  var fin = new Date(ini.getTime() + 86400000);
  var vistos = {};
  var lista = [];
  calendariosLectura().forEach(function (cal) {
    var nombreCal = cal.getName();
    cal.getEvents(ini, fin).forEach(function (ev) {
      if (ev.getMyStatus && ev.getMyStatus() === CalendarApp.GuestStatus.NO) return;
      var clave = ev.getTitle() + '|' + ev.getStartTime().getTime();
      if (vistos[clave]) return; // mismo evento en dos calendarios
      vistos[clave] = true;
      lista.push({ ev: ev, calendario: nombreCal });
    });
  });
  lista.sort(function (a, b) {
    var ad = a.ev.isAllDayEvent() ? 0 : 1, bd = b.ev.isAllDayEvent() ? 0 : 1;
    if (ad !== bd) return bd - ad; // primero los que tienen hora
    return a.ev.getStartTime() - b.ev.getStartTime();
  });
  return lista;
}

function eventoAJson(x) {
  var ev = x.ev;
  var ini = ev.getStartTime();
  return {
    id: ev.getId(),
    titulo: ev.getTitle(),
    todoElDia: ev.isAllDayEvent(),
    hora: ev.isAllDayEvent() ? null : Utilities.formatDate(ini, ZONA, 'HH:mm'),
    fin: ev.isAllDayEvent() ? null : Utilities.formatDate(ev.getEndTime(), ZONA, 'HH:mm'),
    lugar: ev.getLocation() || '',
    calendario: x.calendario
  };
}

/* =================== RESUMEN HABLADO =================== */

function armarResumen(ahora) {
  var nombre = props().getProperty('NOMBRE') || 'Rafael';
  var hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  var dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var saludo = ahora.getHours() < 13 ? 'Buen día' : (ahora.getHours() < 20 ? 'Buenas tardes' : 'Buenas noches');
  var partes = [];
  partes.push(saludo + ' ' + nombre + '. Hoy es ' + dias[hoy.getDay()] + ' ' + hoy.getDate() + ' de ' + MESES[hoy.getMonth()] + '.');

  var lista = eventosDelDia(hoy);
  var conHora = lista.filter(function (x) { return !x.ev.isAllDayEvent(); });
  var sinHora = lista.filter(function (x) { return x.ev.isAllDayEvent(); });

  if (!lista.length) {
    partes.push('No tenés nada agendado para hoy.');
  } else {
    if (conHora.length) {
      partes.push(conHora.length === 1 ? 'Tenés una cosa con horario.' : 'Tenés ' + conHora.length + ' cosas con horario.');
      conHora.forEach(function (x) {
        var ini = x.ev.getStartTime();
        var linea = capitalizar(horaHablada(ini.getHours(), ini.getMinutes())) + ': ' + limpiarParaVoz(x.ev.getTitle());
        if (x.ev.getLocation()) linea += ', en ' + limpiarParaVoz(x.ev.getLocation().split(',')[0]);
        partes.push(linea + '.');
      });
    }
    if (sinHora.length) {
      partes.push('Pendientes del día, sin horario: ' + sinHora.map(function (x) { return limpiarParaVoz(x.ev.getTitle()); }).join('; ') + '.');
    }
  }

  // Deudas
  var deudas = listarDeudas(false);
  var debo = deudas.filter(function (d) { return d.tipo === 'DEBO'; });
  var meDeben = deudas.filter(function (d) { return d.tipo === 'ME_DEBEN'; });
  var en7 = hoy.getTime() + 7 * 86400000;
  var vencidas = debo.filter(function (d) { return d.vence && fechaDesdeISO(d.vence) < hoy; });
  var proximas = debo.filter(function (d) { return d.vence && fechaDesdeISO(d.vence) >= hoy && fechaDesdeISO(d.vence).getTime() <= en7; });

  vencidas.forEach(function (d) {
    partes.push('Atención: está vencido el pago de ' + montoHablado(d.monto, d.moneda) + ' a ' + d.persona + '.');
  });
  proximas.forEach(function (d) {
    partes.push('Tenés que pagarle ' + montoHablado(d.monto, d.moneda) + ' a ' + d.persona + ' ' + fechaHablada(fechaDesdeISO(d.vence), ahora) + '.');
  });
  var totDebo = totalesPorMoneda(debo), totMeDeben = totalesPorMoneda(meDeben);
  if (totDebo) partes.push('En total debés ' + totDebo + '.');
  if (totMeDeben) partes.push('Te deben ' + totMeDeben + '.');
  var cobrosHoy = meDeben.filter(function (d) { return d.vence && fechaDesdeISO(d.vence).getTime() <= hoy.getTime(); });
  cobrosHoy.forEach(function (d) {
    partes.push('Hoy tenés que cobrarle ' + montoHablado(d.monto, d.moneda) + ' a ' + d.persona + '.');
  });

  // Adelanto de mañana
  var manana = eventosDelDia(new Date(hoy.getTime() + 86400000)).filter(function (x) { return !x.ev.isAllDayEvent(); });
  if (manana.length) {
    var p0 = manana[0].ev.getStartTime();
    partes.push('Mañana arrancás ' + horaHablada(p0.getHours(), p0.getMinutes()) + ' con ' + limpiarParaVoz(manana[0].ev.getTitle()) + '.');
  }

  partes.push('¿Querés agregar algo más?');
  return { texto: partes.join(' '), eventos: lista.map(eventoAJson), deudas: deudas };
}

function totalesPorMoneda(lista) {
  var t = {};
  lista.forEach(function (d) { t[d.moneda] = (t[d.moneda] || 0) + d.monto; });
  return Object.keys(t).filter(function (k) { return t[k] > 0; })
    .map(function (k) { return montoHablado(t[k], k); }).join(' y ');
}

function limpiarParaVoz(s) {
  // saca emojis y símbolos que el lector de voz lee mal
  return String(s).replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();
}

/* =================== AGREGAR DESDE TEXTO =================== */

function agregarDesdeTexto(texto) {
  texto = String(texto).trim();
  if (!texto) return { ok: false, mensaje: 'No escuché nada. Probá de nuevo.' };
  var ahora = new Date();
  var r = interpretarFrase(texto, ahora);
  var cal = calendarioDestino();
  var desc = MARCA + '\nDictado: "' + texto + '"';

  if (r.tipo === 'deuda') {
    var d = r.deuda;
    var eventoId = '';
    if (d.vence) {
      var tituloEv = (d.direccion === 'DEBO' ? '💸 Pagar ' : '💰 Cobrar ') + montoHablado(d.monto, d.moneda) +
        ' a ' + d.persona + (d.concepto ? ' (' + d.concepto + ')' : '');
      var ev = r.hora
        ? cal.createEvent(tituloEv, conHora(d.vence, r.hora), new Date(conHora(d.vence, r.hora).getTime() + 30 * 60000), { description: desc })
        : cal.createAllDayEvent(tituloEv, d.vence, { description: desc });
      ev.addPopupReminder(r.hora ? 60 : 9 * 60); // sin hora: aviso a las 15 hs del día anterior
      eventoId = ev.getId();
    }
    var id = agregarDeuda(d, eventoId);
    guardarUltimo({ tipo: 'deuda', id: id, eventoId: eventoId });
    var msg = d.direccion === 'DEBO'
      ? 'Anotado: le debés ' + (d.monto ? montoHablado(d.monto, d.moneda) : 'plata') + ' a ' + d.persona
      : 'Anotado: ' + d.persona + ' te debe ' + (d.monto ? montoHablado(d.monto, d.moneda) : 'plata');
    if (d.concepto) msg += ', por ' + d.concepto.charAt(0).toLowerCase() + d.concepto.slice(1);
    if (d.vence) msg += '. Vence ' + fechaHablada(d.vence, ahora);
    if (!d.monto) msg += '. Ojo: no entendí el monto, corregilo en la planilla';
    return { ok: true, tipo: 'deuda', mensaje: msg + '.', id: id };
  }

  var evento;
  if (r.tipo === 'evento') {
    var ini = conHora(r.fecha, r.hora);
    evento = cal.createEvent(r.titulo, ini, new Date(ini.getTime() + 60 * 60000), { description: desc });
    evento.addPopupReminder(30);
    guardarUltimo({ tipo: 'evento', eventoId: evento.getId() });
    return {
      ok: true, tipo: 'evento', id: evento.getId(),
      mensaje: 'Agendado: ' + r.titulo + ', ' + fechaHablada(r.fecha, ahora) + ' ' + horaHablada(r.hora.h, r.hora.m) + '.'
    };
  }
  evento = cal.createAllDayEvent('📌 ' + r.titulo, r.fecha, { description: desc });
  guardarUltimo({ tipo: 'tarea', eventoId: evento.getId() });
  return { ok: true, tipo: 'tarea', id: evento.getId(), mensaje: 'Anotado para ' + fechaHablada(r.fecha, ahora) + ': ' + r.titulo + '.' };
}

function conHora(fecha, hora) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), hora.h, hora.m);
}

function guardarUltimo(obj) { props().setProperty('ULTIMO', JSON.stringify(obj)); }

function deshacerUltimo() {
  var raw = props().getProperty('ULTIMO');
  if (!raw) return { ok: false, mensaje: 'No hay nada para deshacer.' };
  var u = JSON.parse(raw);
  if (u.eventoId) {
    try { CalendarApp.getEventById(u.eventoId).deleteEvent(); } catch (e) { /* ya borrado */ }
  }
  if (u.tipo === 'deuda' && u.id) {
    var hoja = hojaDeudas();
    var fila = buscarFila(hoja, u.id);
    if (fila) hoja.deleteRow(fila);
  }
  props().deleteProperty('ULTIMO');
  return { ok: true, mensaje: 'Listo, lo borré.' };
}

/** Marca una tarea del calendario como hecha (le agrega ✅ al título). */
function marcarHecho(id) {
  var ev = CalendarApp.getEventById(id);
  if (!ev) return { ok: false, mensaje: 'No encontré ese evento.' };
  if (ev.getTitle().indexOf('✅') !== 0) ev.setTitle('✅ ' + ev.getTitle().replace(/^📌\s*/, ''));
  return { ok: true, mensaje: 'Marcado como hecho.' };
}

/* =================== DEUDAS (Google Sheets) =================== */

function hojaDeudas() {
  var p = props();
  var id = p.getProperty('PLANILLA');
  var ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Asistente Rafa — Deudas');
    p.setProperty('PLANILLA', ss.getId());
    var h = ss.getSheets()[0];
    h.setName('Deudas');
    h.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
    h.setFrozenRows(1);
    h.getRange('E:E').setNumberFormat('#,##0');
    h.getRange('B:B').setNumberFormat('dd/mm/yyyy');
    h.getRange('H:H').setNumberFormat('dd/mm/yyyy');
    h.getRange('J:J').setNumberFormat('dd/mm/yyyy');
  }
  return ss.getSheetByName('Deudas') || ss.getSheets()[0];
}

function agregarDeuda(d, eventoId) {
  var hoja = hojaDeudas();
  var id = 'D' + new Date().getTime().toString(36).toUpperCase();
  hoja.appendRow([id, new Date(), d.direccion, d.persona, d.monto, d.moneda, d.concepto || '',
    d.vence || '', 'PENDIENTE', '', eventoId || '']);
  return id;
}

function listarDeudas(incluirPagadas) {
  var hoja = hojaDeudas();
  var n = hoja.getLastRow();
  if (n < 2) return [];
  var filas = hoja.getRange(2, 1, n - 1, COLUMNAS.length).getValues();
  return filas.filter(function (f) { return f[0] && (incluirPagadas || f[8] !== 'PAGADA'); })
    .map(function (f) {
      return {
        id: f[0], alta: f[1] instanceof Date ? Utilities.formatDate(f[1], ZONA, 'yyyy-MM-dd') : '',
        tipo: f[2], persona: f[3], monto: Number(f[4]) || 0, moneda: f[5] || 'ARS', concepto: f[6],
        vence: f[7] instanceof Date ? Utilities.formatDate(f[7], ZONA, 'yyyy-MM-dd') : '',
        estado: f[8]
      };
    })
    .sort(function (a, b) { return (a.vence || '9999') < (b.vence || '9999') ? -1 : 1; });
}

function buscarFila(hoja, id) {
  var n = hoja.getLastRow();
  if (n < 2) return 0;
  var ids = hoja.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return 0;
}

function marcarPagada(id) {
  var hoja = hojaDeudas();
  var fila = buscarFila(hoja, id);
  if (!fila) return { ok: false, mensaje: 'No encontré esa deuda.' };
  hoja.getRange(fila, 9, 1, 2).setValues([['PAGADA', new Date()]]);
  var datos = hoja.getRange(fila, 1, 1, COLUMNAS.length).getValues()[0];
  var eventoId = datos[10];
  if (eventoId) {
    try {
      var ev = CalendarApp.getEventById(eventoId);
      if (ev) ev.setTitle('✅ ' + ev.getTitle().replace(/^[💸💰]\s*/u, ''));
    } catch (e) { /* nada */ }
  }
  var texto = datos[2] === 'DEBO' ? 'Pagada la deuda con ' + datos[3] : 'Cobrado lo de ' + datos[3];
  return { ok: true, mensaje: texto + '.' };
}

/* =================== AVISO DIARIO 6 AM =================== */

function enviarResumenDiario() {
  var r = armarResumen(new Date());
  var mail = Session.getEffectiveUser().getEmail();
  var app = props().getProperty('URL_APP');
  var cuerpo = r.texto.replace(/\. /g, '.\n') + (app ? '\n\nAbrir la app: ' + app : '');
  MailApp.sendEmail(mail, '☀️ Tu día — ' + Utilities.formatDate(new Date(), ZONA, 'dd/MM'), cuerpo);
}

/* =================== PRUEBAS DESDE EL EDITOR =================== */

function probarResumen() { Logger.log(armarResumen(new Date()).texto); }
function probarInterprete() {
  ['agregame a las 2 de la tarde una cita con Pérez', 'le debo 50 mil a Juan para el viernes',
    'recordame mañana comprar membrana'].forEach(function (f) {
    Logger.log(f + ' => ' + JSON.stringify(interpretarFrase(f, new Date())));
  });
}
