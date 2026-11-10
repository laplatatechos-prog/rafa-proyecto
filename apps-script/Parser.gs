/**
 * Intérprete de frases en castellano rioplatense.
 * Convierte "agregame a las 2 de la tarde una cita con Pérez" en un objeto
 * con fecha, hora y título. No usa servicios de Google: se puede testear con Node.
 */

var DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

var NUMEROS_PALABRA = {
  'una': 1, 'uno': 1, 'un': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5, 'seis': 6,
  'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10, 'once': 11, 'doce': 12, 'quince': 15,
  'veinte': 20, 'treinta': 30, 'cuarenta': 40, 'cincuenta': 50, 'sesenta': 60,
  'setenta': 70, 'ochenta': 80, 'noventa': 90, 'cien': 100, 'doscientos': 200,
  'trescientos': 300, 'cuatrocientos': 400, 'quinientos': 500
};

var PALABRAS_CORTE = ['de', 'del', 'por', 'para', 'el', 'la', 'los', 'las', 'que', 'hasta', 'antes',
  'manana', 'hoy', 'pasado', 'y', 'en', 'al', 'a', 'con', 'mil', 'pesos', 'dolares', 'lucas',
  'vence', 'este', 'esta', 'proximo', 'semana', 'mes', 'me', 'le', 'les', 'lo', 'se', 'debo',
  'debe', 'deben', 'pagar', 'pagarle', 'cobrar', 'cobrarle', 'tengo', 'tiene', 'son', 'es'
].concat(DIAS_SEMANA);

/** Minúsculas sin acentos, conservando el largo exacto (posición a posición). */
function normalizarTexto(s) {
  return s.split('').map(function (c) {
    return c.normalize('NFD').charAt(0).toLowerCase();
  }).join('');
}

/** Pasa números dichos con palabras a dígitos, sólo en contextos de hora o plata. */
function numerosEnPalabras(s) {
  var claves = Object.keys(NUMEROS_PALABRA).join('|');
  // "a las dos", "la una"
  s = s.replace(new RegExp('\\b(las?)\\s+(' + claves + ')\\b', 'gi'), function (m, art, num) {
    return art + ' ' + NUMEROS_PALABRA[num.toLowerCase()];
  });
  // "y diez", "menos veinte"
  s = s.replace(new RegExp('\\b(y|menos)\\s+(' + claves + ')\\b(?!\\s+mil)', 'gi'), function (m, c, num) {
    return c + ' ' + NUMEROS_PALABRA[num.toLowerCase()];
  });
  // "cincuenta mil", "un millón", "veinte lucas"
  s = s.replace(new RegExp('\\b(' + claves + ')\\s+(mil|mill[oó]n|millones|lucas?|pesos|d[oó]lares)\\b', 'gi'),
    function (m, num, mult) { return NUMEROS_PALABRA[num.toLowerCase()] + ' ' + mult; });
  return s;
}

/**
 * Texto de trabajo: guarda el original (para títulos con mayúsculas y acentos)
 * y el normalizado (para buscar patrones). Al quitar un fragmento se quita de los dos.
 */
function TextoTrabajo(original) {
  this.o = original;
  this.n = normalizarTexto(original);
}
TextoTrabajo.prototype.quitar = function (regex) {
  var m = regex.exec(this.n);
  if (!m) return null;
  var ini = m.index, fin = m.index + m[0].length;
  this.o = this.o.slice(0, ini) + ' ' + this.o.slice(fin);
  this.n = this.n.slice(0, ini) + ' ' + this.n.slice(fin);
  return m;
};
TextoTrabajo.prototype.buscar = function (regex) {
  return regex.exec(this.n);
};

function sumarDias(fecha, dias) {
  var d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  d.setDate(d.getDate() + dias);
  return d;
}

/** Extrae la hora. Devuelve {h, m} o null. */
function extraerHora(t) {
  var m;
  // "al mediodía"
  if (t.quitar(/\b(?:al|a\s+el|para\s+el|tipo)\s+mediodia\b/)) return { h: 12, m: 0 };

  var periodo = '(?:\\s*(?:de|a|en|por)\\s+la\\s+(manana|tarde|noche|madrugada)|\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)(?![a-z]))?';
  var re = new RegExp(
    '\\b(?:(?:a|para|desde|tipo|como)\\s+)?(?:eso\\s+de\\s+)?(?:las?)\\s+(\\d{1,2})(?:\\s*[:.h]\\s*(\\d{2}))?(?!\\d)' +
    '(?:\\s*(?:hs|horas|h)\\b\\.?)?' +
    '(?:\\s+y\\s+(media|cuarto|\\d{1,2}))?' +
    '(?:\\s+menos\\s+(cuarto|\\d{1,2}))?' +
    '(?:\\s*(?:hs|horas)\\b\\.?)?' + periodo);
  m = t.quitar(re);
  if (!m) {
    // "14:30", "9.15 hs", "18 hs"
    var re2 = new RegExp('\\b(\\d{1,2})(?:\\s*[:.]\\s*(\\d{2})(?!\\d)(?:\\s*(?:hs|horas)\\b\\.?)?|\\s*(?:hs|horas)\\b\\.?)()()' + periodo);
    m = t.quitar(re2);
  }
  if (!m) return null;

  var h = parseInt(m[1], 10);
  var min = m[2] ? parseInt(m[2], 10) : 0;
  if (m[3]) min = m[3] === 'media' ? 30 : (m[3] === 'cuarto' ? 15 : parseInt(m[3], 10));
  if (m[4]) {
    h = h - 1;
    min = m[4] === 'cuarto' ? 45 : 60 - parseInt(m[4], 10);
  }
  var per = m[5] || null;
  var ampm = m[6] ? m[6].replace(/[^ap]/g, '') : null;
  if (h > 23 || min > 59) return null;

  if (per === 'tarde' || per === 'noche' || ampm === 'p') {
    if (h < 12) h += 12;
  } else if (per === 'manana' || per === 'madrugada' || ampm === 'a') {
    if (h === 12) h = 0;
  } else if (h >= 1 && h <= 6 && !m[2]) {
    // "a las 3" en horario laboral = 15 hs
    h += 12;
  }
  if (h < 0) h += 24;
  return { h: h, m: min };
}

/** Extrae la fecha relativa o explícita. Devuelve Date (00:00) o null. */
function extraerFecha(t, ahora) {
  var hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  var m;

  if (t.quitar(/\b(?:para\s+)?pasado\s+manana\b/)) return sumarDias(hoy, 2);
  if (t.quitar(/\b(?:para\s+)?manana\b/)) return sumarDias(hoy, 1);
  if (t.quitar(/\b(?:para\s+)?hoy\b/)) return hoy;

  m = t.quitar(/\b(?:para\s+)?(?:el\s+)?(?:dia\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+|del\s+)?(\d{4}))?\b/);
  if (m) {
    var mes = m[2] === 'setiembre' ? 8 : MESES.indexOf(m[2]);
    return fechaExplicita(hoy, parseInt(m[1], 10), mes, m[3] ? parseInt(m[3], 10) : null);
  }
  m = t.quitar(/\b(?:para\s+)?(?:el\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    var anio = m[3] ? parseInt(m[3], 10) : null;
    if (anio !== null && anio < 100) anio += 2000;
    return fechaExplicita(hoy, parseInt(m[1], 10), parseInt(m[2], 10) - 1, anio);
  }
  m = t.quitar(/\b(?:para\s+)?(?:(?:el|este|esta)\s+)?(?:proximo\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?:\s+que\s+viene|\s+proximo)?\b/);
  if (m) {
    var objetivo = DIAS_SEMANA.indexOf(m[1]);
    var diff = (objetivo - hoy.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    return sumarDias(hoy, diff);
  }
  m = t.quitar(/\b(?:para\s+)?el\s+(?:dia\s+)?(\d{1,2})\b(?!\s*(?:[:.]\d|hs|horas|mil|lucas|pesos|dolares|%))/);
  if (m) {
    var dia = parseInt(m[1], 10);
    if (dia >= 1 && dia <= 31) {
      var f = new Date(hoy.getFullYear(), hoy.getMonth(), dia);
      if (f < hoy) f = new Date(hoy.getFullYear(), hoy.getMonth() + 1, dia);
      return f;
    }
  }
  if (t.quitar(/\b(?:para\s+)?la\s+semana\s+que\s+viene\b/)) return sumarDias(hoy, 7);
  return null;
}

function fechaExplicita(hoy, dia, mes, anio) {
  if (mes < 0 || mes > 11 || dia < 1 || dia > 31) return null;
  var f = new Date(anio || hoy.getFullYear(), mes, dia);
  if (!anio && f < hoy) f = new Date(hoy.getFullYear() + 1, mes, dia);
  return f;
}

/** Extrae un monto: "50 mil", "$50.000", "1,5 millones", "20 lucas", "300 dólares". */
function extraerMonto(t) {
  var m = t.quitar(/(?:\$|u\$s|usd)?\s*\b(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(mil|millon(?:es)?|lucas?|k)?\b\s*(pesos|dolares|usd|mangos|verdes)?/);
  if (!m) return null;
  var crudo = m[1];
  var valor;
  if (/^\d{1,3}([.,]\d{3})+$/.test(crudo)) valor = parseFloat(crudo.replace(/[.,]/g, ''));
  else valor = parseFloat(crudo.replace(',', '.'));
  var mult = m[2] || '';
  if (/^millon/.test(mult)) valor *= 1000000;
  else if (/^mil|^luca|^k/.test(mult)) valor *= 1000;
  var moneda = /dolar|usd|verde/.test(m[3] || '') || /u\$s|usd/.test(m[0]) ? 'USD' : 'ARS';
  return { valor: Math.round(valor), moneda: moneda };
}

function capitalizar(s) {
  s = s.trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Toma de 1 a 4 palabras como nombre de persona/acreedor desde una posición. */
function tomarNombre(t, desde) {
  var restoO = t.o.slice(desde), restoN = t.n.slice(desde);
  var palabrasN = restoN.split(/\s+/), palabrasO = restoO.split(/\s+/);
  var out = [], consumido = 0, i = 0;
  // saltar espacios iniciales
  while (i < palabrasN.length && palabrasN[i] === '') { consumido += 1; i++; }
  for (; i < palabrasN.length && out.length < 4; i++) {
    var p = palabrasN[i].replace(/[.,;:!?]+$/, '');
    if (!p || PALABRAS_CORTE.indexOf(p) >= 0 || /^[\d$]/.test(p)) break;
    out.push(palabrasO[i].replace(/[.,;:!?]+$/, ''));
    consumido += palabrasN[i].length + 1;
    if (/[.,;:!?]$/.test(palabrasN[i])) break;
  }
  if (!out.length) return null;
  var ini = desde, fin = Math.min(desde + consumido, t.n.length);
  t.o = t.o.slice(0, ini) + ' ' + t.o.slice(fin);
  t.n = t.n.slice(0, ini) + ' ' + t.n.slice(fin);
  // "mi cuñado" -> "Mi cuñado"; "juan carlos" -> "Juan Carlos"
  if (/^(?:mi|tu|su|el|la|los|las)$/i.test(out[0])) return capitalizar(out.join(' '));
  return out.map(capitalizar).join(' ');
}

var RE_PREFIJOS = /^\s*(?:che|dale|bueno|por\s+favor|porfa|ok|okey|hola)?[\s,]*(?:(?:agregame|agrega|agregar|agregalo|anadi|anademe|agenda|agendame|agendar|anotame|anota|anotar|poneme|pone|ponme|recordame|recorda|acordame|haceme\s+acordar|creame|crea|crear|guardame|guarda|sumame|suma)\b(?:\s+(?:de|que|para))?)?\s*(?:(?:que\s+)?(?:tengo|tenemos|hay)\s+que\s+)?(?:(?:un|una)\s+)?(?:(?:recordatorio|tarea|evento|pendiente|nota)\b(?:\s+(?:de|para|que))?\s*)?/;

function limpiarTitulo(s) {
  s = s.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  var n = normalizarTexto(s);
  var m = RE_PREFIJOS.exec(n);
  if (m && m[0].length) { s = s.slice(m[0].length); n = n.slice(m[0].length); }
  // conectores sueltos al principio o al final
  var conectores = /^(?:(?:y|a|el|la|para|de|que|en|con|por|un|una|me|tambien|ademas)\b[\s,]*)+/;
  m = conectores.exec(n);
  if (m && m[0].length) {
    if (!n.slice(m[0].length).trim()) return '';
    s = s.slice(m[0].length);
  }
  s = s.replace(/[\s,;:.]+(?:y|a|el|la|para|de|que|en|con|por|las?)?[\s,;:.]*$/i, '').trim();
  s = s.replace(/^[\s,;:.]+/, '');
  return capitalizar(s);
}

/**
 * Interpreta una frase.
 * @return {{tipo:string, titulo:string, fecha:Date|null, hora:{h,m}|null, deuda:Object|null}}
 */
function interpretarFrase(texto, ahora) {
  ahora = ahora || new Date();
  var original = numerosEnPalabras(String(texto || '').trim());
  var t = new TextoTrabajo(original);

  var esMeDeben = /\b(?:me\s+deben?|me\s+tienen?\s+que\s+(?:pagar|devolver)|(?:tengo\s+que\s+)?cobrar(?:le|les)?)\b/.test(t.n);
  var esDebo = !esMeDeben && /\b(?:le\s+|les\s+)?debo\b|\bdeuda\b|\bpagar(?:le|les)?\b|\bdevolver(?:le|les)?\b|\bprestamo\b/.test(t.n);

  var hora = extraerHora(t);
  var fecha = extraerFecha(t, ahora);
  if (!hora) {
    var hp = t.quitar(/\b(?:a|por|en|de|durante)\s+la\s+(manana|tarde|noche)\b/);
    if (hp) hora = { h: { manana: 9, tarde: 16, noche: 20 }[hp[1]], m: 0 };
  }
  if (!hora) hora = extraerHora(t); // por si la hora quedaba detrás de la fecha

  if (esDebo || esMeDeben) {
    var monto = extraerMonto(t);
    var persona = null, mm;
    if (esMeDeben) {
      mm = t.buscar(/\b(?:me\s+deben?|me\s+tienen?\s+que\s+(?:pagar|devolver))\b/);
      var antes = mm ? t.n.slice(0, mm.index) : '';
      var limpioAntes = limpiarTitulo(t.o.slice(0, mm ? mm.index : 0));
      t.quitar(/\b(?:que\s+)?(?:me\s+deben?|me\s+tienen?\s+que\s+(?:pagar|devolver)|(?:tengo\s+que\s+)?cobrar(?:le|les)?)\b/);
      var ma = t.buscar(/\b(?:a|de|con)\s+(?=[^\s\d$])/);
      if (ma) persona = tomarNombre(t, ma.index + ma[0].length);
      if (!persona && limpioAntes && antes.trim()) {
        persona = limpioAntes.split(/\s+/).slice(-3).map(capitalizar).join(' ');
        t.o = t.o.slice(mm.index); t.n = t.n.slice(mm.index);
      }
      if (!persona) {
        var mp = t.buscar(/^\s*(?=[^\s\d$])/);
        if (mp) persona = tomarNombre(t, mp[0].length);
      }
    } else {
      mm = t.quitar(/\b(?:que\s+)?(?:(?:le|les)\s+)?(?:debo|tengo\s+que\s+(?:pagar(?:le|les)?|devolver(?:le|les)?)|pagar(?:le|les)?|devolver(?:le|les)?)\b/);
      t.quitar(/\b(?:una\s+)?deuda\b/);
      var mb = t.buscar(/\b(?:a|con|al)\s+(?=[^\s\d$])/);
      if (mb) persona = tomarNombre(t, mb.index + mb[0].length);
      if (!persona) {
        var mc = t.buscar(/^\s*(?:el|la|los|las)?\s*(?=[^\s\d$])/);
        if (mc) persona = tomarNombre(t, mc[0].length);
      }
    }
    if (!monto) monto = extraerMonto(t);
    var concepto = limpiarTitulo(t.o.replace(/\b(?:por|de|del)\b\s*/i, ' '));
    concepto = concepto.replace(/^(?:por|de|del)\s+/i, '');
    return {
      tipo: 'deuda',
      titulo: (esMeDeben ? 'Cobrar a ' : 'Pagar a ') + (persona || 'alguien'),
      fecha: fecha,
      hora: hora,
      deuda: {
        direccion: esMeDeben ? 'ME_DEBEN' : 'DEBO',
        persona: persona || 'Sin nombre',
        monto: monto ? monto.valor : 0,
        moneda: monto ? monto.moneda : 'ARS',
        concepto: capitalizar(concepto),
        vence: fecha
      }
    };
  }

  var titulo = limpiarTitulo(t.o);
  if (!titulo) titulo = 'Recordatorio';

  if (!fecha) {
    var hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    fecha = hoy;
    // si ya pasó la hora de hoy, va para mañana
    if (hora && (hora.h < ahora.getHours() || (hora.h === ahora.getHours() && hora.m <= ahora.getMinutes()))) {
      fecha = sumarDias(hoy, 1);
    }
  }
  return {
    tipo: hora ? 'evento' : 'tarea',
    titulo: titulo,
    fecha: fecha,
    hora: hora,
    deuda: null
  };
}

/* ---------- Formatos para hablar ---------- */

function horaHablada(h, m) {
  var periodo;
  if (h === 0) periodo = 'de la noche';
  else if (h < 12) periodo = 'de la mañana';
  else if (h === 12) periodo = 'del mediodía';
  else if (h < 20) periodo = 'de la tarde';
  else periodo = 'de la noche';
  var h12 = h % 12 === 0 ? 12 : h % 12;
  var art = h12 === 1 ? 'a la 1' : 'a las ' + h12;
  var mins = '';
  if (m === 30) mins = ' y media';
  else if (m === 15) mins = ' y cuarto';
  else if (m === 45) { art = (h12 % 12 + 1) === 1 ? 'a la 1' : 'a las ' + (h12 % 12 + 1); mins = ' menos cuarto'; }
  else if (m > 0) mins = ' y ' + m;
  return art + mins + ' ' + periodo;
}

function formatearMiles(n) {
  var s = String(Math.round(Math.abs(n)));
  var out = '';
  while (s.length > 3) { out = '.' + s.slice(-3) + out; s = s.slice(0, -3); }
  return (n < 0 ? '-' : '') + s + out;
}

function montoHablado(valor, moneda) {
  return formatearMiles(valor) + (moneda === 'USD' ? ' dólares' : ' pesos');
}

function fechaHablada(fecha, ahora) {
  ahora = ahora || new Date();
  var hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  var f = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  var diff = Math.round((f - hoy) / 86400000);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff === 2) return 'pasado mañana';
  if (diff === -1) return 'ayer';
  var dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var base = dias[f.getDay()] + ' ' + f.getDate() + ' de ' + MESES[f.getMonth()];
  if (diff > 2 && diff < 7) return 'el ' + dias[f.getDay()];
  return 'el ' + base;
}

if (typeof module !== 'undefined') {
  module.exports = {
    interpretarFrase: interpretarFrase, horaHablada: horaHablada, montoHablado: montoHablado,
    fechaHablada: fechaHablada, formatearMiles: formatearMiles, normalizarTexto: normalizarTexto
  };
}
