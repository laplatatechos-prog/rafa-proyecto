/* Mi Día — app del celular. Habla con el backend de Google Apps Script. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var CFG_KEY = 'mi_dia_cfg';
  var cfg = leerCfg();
  var params = new URLSearchParams(location.search);
  var conversando = false; // modo charla: después de cada cosa pregunta "¿algo más?"

  /* ---------- Configuración ---------- */
  function leerCfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; }
  }
  function guardarCfg(c) {
    cfg = c;
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) { /* sin storage */ }
  }
  // Link de instalación: ...#url=...&clave=...
  if (location.hash.indexOf('clave=') >= 0) {
    var h = new URLSearchParams(location.hash.slice(1));
    guardarCfg({ url: h.get('url'), clave: h.get('clave') });
    history.replaceState(null, '', location.pathname + location.search);
  }

  function urlApi(accion, extra) {
    var u = new URL(cfg.url);
    u.searchParams.set('accion', accion);
    u.searchParams.set('clave', cfg.clave);
    Object.keys(extra || {}).forEach(function (k) { u.searchParams.set(k, extra[k]); });
    return u.toString();
  }
  function api(accion, extra) {
    return fetch(urlApi(accion, extra), { redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok && j.error) throw new Error(j.error);
        return j;
      });
  }

  /* ---------- Vistas ---------- */
  function mostrarVista(nombre) {
    ['hoy', 'deudas', 'config'].forEach(function (v) { $('vista-' + v).hidden = v !== nombre; });
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('activo', t.dataset.vista === nombre); });
    if (nombre === 'deudas') cargarDeudas();
    if (nombre === 'config') {
      $('cfg-url').value = cfg.url || '';
      $('cfg-clave').value = cfg.clave || '';
      $('cfg-link-dia').textContent = location.origin + location.pathname + '?modo=dia';
    }
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { mostrarVista(t.dataset.vista); });
  });
  $('btn-config').onclick = $('btn-config-2').onclick = function () { mostrarVista('config'); };
  $('cfg-cerrar').onclick = function () { mostrarVista('hoy'); cargarHoy(); };
  $('cfg-guardar').onclick = function () {
    guardarCfg({ url: $('cfg-url').value.trim(), clave: $('cfg-clave').value.trim() });
    $('cfg-estado').textContent = 'Probando…';
    api('agenda').then(function () {
      $('cfg-estado').textContent = '✅ Conectado.';
      setTimeout(function () { mostrarVista('hoy'); cargarHoy(); }, 600);
    }).catch(function (e) { $('cfg-estado').textContent = '❌ ' + e.message; });
  };

  /* ---------- Hoy ---------- */
  function fechaISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function escapar(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function pintarEventos(cont, eventos, esHoy) {
    if (!eventos.length) { cont.innerHTML = '<p class="vacio">Nada agendado.</p>'; return; }
    var ahora = new Date();
    var hhmm = String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');
    cont.innerHTML = eventos.map(function (e) {
      var hecho = /^✅/.test(e.titulo);
      var pasado = esHoy && e.fin && e.fin < hhmm;
      var clases = 'item' + (hecho ? ' hecho' : '') + (pasado ? ' pasado' : '');
      var sub = [e.lugar, e.calendario].filter(Boolean).map(escapar).join(' · ');
      var boton = e.todoElDia && !hecho ? '<button class="item-btn" data-hecho="' + escapar(e.id) + '">Hecho</button>' : '';
      return '<div class="' + clases + '">' +
        '<div class="item-hora">' + (e.hora || '•') + '</div>' +
        '<div class="item-cuerpo"><div class="item-titulo">' + escapar(e.titulo) + '</div>' +
        (sub ? '<div class="item-sub">' + sub + '</div>' : '') + '</div>' + boton + '</div>';
    }).join('');
    cont.querySelectorAll('[data-hecho]').forEach(function (b) {
      b.onclick = function () {
        b.disabled = true;
        api('hecho', { id: b.dataset.hecho }).then(cargarHoy).catch(errorRed);
      };
    });
  }
  function cargarHoy() {
    var hoy = new Date();
    var f = hoy.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('fecha-hoy').textContent = f.charAt(0).toUpperCase() + f.slice(1);
    var manana = new Date(hoy.getTime() + 86400000);
    api('agenda', { fecha: fechaISO(hoy) }).then(function (j) { pintarEventos($('lista-hoy'), j.eventos, true); }).catch(errorRed);
    api('agenda', { fecha: fechaISO(manana) }).then(function (j) { pintarEventos($('lista-manana'), j.eventos, false); }).catch(function () {});
  }

  /* ---------- Deudas ---------- */
  function plata(n, moneda) {
    return (moneda === 'USD' ? 'US$ ' : '$ ') + Math.round(n).toLocaleString('es-AR');
  }
  function cargarDeudas() {
    api('deudas').then(function (j) {
      var debo = 0, meDeben = 0;
      var hoy = fechaISO(new Date());
      j.deudas.forEach(function (d) {
        if (d.moneda !== 'ARS') return;
        if (d.tipo === 'DEBO') debo += d.monto; else meDeben += d.monto;
      });
      $('total-debo').textContent = plata(debo, 'ARS');
      $('total-medeben').textContent = plata(meDeben, 'ARS');
      var cont = $('lista-deudas');
      if (!j.deudas.length) { cont.innerHTML = '<p class="vacio">Sin deudas pendientes.</p>'; return; }
      cont.innerHTML = j.deudas.map(function (d) {
        var vence = '';
        if (d.vence) {
          var f = d.vence.split('-');
          vence = (d.vence < hoy ? '<span class="vencida">Vencida ' : 'Vence ') + f[2] + '/' + f[1] + (d.vence < hoy ? '</span>' : '');
        }
        var sub = [d.concepto ? escapar(d.concepto) : '', vence].filter(Boolean).join(' · ');
        return '<div class="item ' + (d.tipo === 'DEBO' ? 'debo' : 'me-deben') + '">' +
          '<div class="item-cuerpo"><div class="item-titulo">' + (d.tipo === 'DEBO' ? 'A ' : 'De ') + escapar(d.persona) + '</div>' +
          (sub ? '<div class="item-sub">' + sub + '</div>' : '') + '</div>' +
          '<div class="item-monto">' + plata(d.monto, d.moneda) + '</div>' +
          '<button class="item-btn" data-pagar="' + escapar(d.id) + '">' + (d.tipo === 'DEBO' ? 'Pagué' : 'Cobré') + '</button></div>';
      }).join('');
      cont.querySelectorAll('[data-pagar]').forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          api('pagar', { id: b.dataset.pagar }).then(function (r) { avisar(r.mensaje); cargarDeudas(); }).catch(errorRed);
        };
      });
    }).catch(errorRed);
  }

  /* ---------- Voz: hablar ---------- */
  var vozElegida = null;
  function elegirVoz() {
    if (!('speechSynthesis' in window)) return;
    var voces = speechSynthesis.getVoices();
    var pref = ['es-AR', 'es-US', 'es-419', 'es-MX', 'es-ES'];
    for (var i = 0; i < pref.length && !vozElegida; i++) {
      vozElegida = voces.find(function (v) { return v.lang.replace('_', '-') === pref[i]; }) || null;
    }
    if (!vozElegida) vozElegida = voces.find(function (v) { return /^es/i.test(v.lang); }) || null;
  }
  if ('speechSynthesis' in window) {
    elegirVoz();
    speechSynthesis.onvoiceschanged = elegirVoz;
  }
  function hablar(texto, alTerminar) {
    if (!('speechSynthesis' in window)) { if (alTerminar) alTerminar(); return; }
    speechSynthesis.cancel();
    // Chrome corta textos largos: se habla de a oraciones
    var frases = texto.match(/[^.?!]+[.?!]*/g) || [texto];
    frases.forEach(function (f, i) {
      var u = new SpeechSynthesisUtterance(f.trim());
      u.lang = vozElegida ? vozElegida.lang : 'es-AR';
      if (vozElegida) u.voice = vozElegida;
      u.rate = 1.02;
      if (i === frases.length - 1 && alTerminar) u.onend = alTerminar;
      speechSynthesis.speak(u);
    });
  }

  /* ---------- Voz: escuchar ---------- */
  var Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null;
  function escuchar() {
    if (!Reconocimiento) {
      avisar('Este navegador no reconoce voz. Usá el micrófono del teclado.');
      $('entrada-texto').focus();
      return;
    }
    if (rec) { try { rec.abort(); } catch (e) { /* nada */ } }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    rec = new Reconocimiento();
    rec.lang = 'es-AR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    var final = '';
    $('capa-voz').hidden = false;
    $('voz-estado').textContent = 'Te escucho…';
    $('voz-transcripcion').textContent = '';
    rec.onresult = function (ev) {
      var parcial = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) final += ev.results[i][0].transcript;
        else parcial += ev.results[i][0].transcript;
      }
      $('voz-transcripcion').textContent = final + parcial;
    };
    rec.onerror = function (ev) {
      if (ev.error === 'not-allowed') avisar('Dale permiso al micrófono en el navegador.');
      else if (ev.error !== 'no-speech' && ev.error !== 'aborted') avisar('Error de micrófono: ' + ev.error);
    };
    rec.onend = function () {
      $('capa-voz').hidden = true;
      rec = null;
      var texto = final.trim();
      if (!texto) {
        if (conversando) terminarCharla();
        return;
      }
      if (conversando && /^(no|nada|no gracias|nada mas|no nada|listo|eso es todo|chau|ninguna?)\.?$/i.test(quitarAcentos(texto))) {
        terminarCharla();
        return;
      }
      enviar(texto);
    };
    try { rec.start(); } catch (e) { $('capa-voz').hidden = true; avisar('No pude abrir el micrófono.'); }
  }
  function quitarAcentos(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function terminarCharla() {
    conversando = false;
    hablar('Perfecto. A laburar.');
  }
  $('btn-mic').onclick = function () { conversando = false; escuchar(); };
  $('voz-cancelar').onclick = function () { conversando = false; if (rec) rec.abort(); $('capa-voz').hidden = true; };

  /* ---------- Enviar una frase ---------- */
  function enviar(texto) {
    avisar('Anotando: "' + texto + '"…');
    return api('agregar', { texto: texto }).then(function (r) {
      avisar(r.mensaje, true);
      var seguir = conversando ? function () { escuchar(); } : null;
      hablar(r.mensaje + (conversando ? ' ¿Algo más?' : ''), seguir);
      cargarHoy();
      if (!$('vista-deudas').hidden) cargarDeudas();
    }).catch(errorRed);
  }
  $('form-texto').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var t = $('entrada-texto').value.trim();
    if (!t) return;
    $('entrada-texto').value = '';
    $('entrada-texto').blur();
    enviar(t);
  });

  /* ---------- Resumen del día ---------- */
  function escucharMiDia() {
    $('capa-dia').hidden = false;
    $('dia-texto').textContent = 'Cargando tu día…';
    api('resumen').then(function (r) {
      $('dia-titulo').textContent = r.texto.split('.')[0];
      $('dia-texto').textContent = r.texto.replace(/\. /g, '.\n');
      conversando = true;
      hablar(r.texto, function () { $('capa-dia').hidden = true; escuchar(); });
    }).catch(function (e) { $('capa-dia').hidden = true; errorRed(e); });
  }
  $('btn-escuchar').onclick = escucharMiDia;
  $('dia-play').onclick = escucharMiDia;
  $('dia-cerrar').onclick = function () {
    conversando = false;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    $('capa-dia').hidden = true;
  };

  /* ---------- Avisos ---------- */
  var timerAviso = null;
  function avisar(texto, conDeshacer) {
    $('aviso-texto').textContent = texto;
    $('aviso-deshacer').hidden = !conDeshacer;
    $('aviso').hidden = false;
    clearTimeout(timerAviso);
    timerAviso = setTimeout(function () { $('aviso').hidden = true; }, conDeshacer ? 9000 : 4000);
  }
  $('aviso-deshacer').onclick = function () {
    $('aviso').hidden = true;
    api('deshacer').then(function (r) { avisar(r.mensaje); hablar(r.mensaje); cargarHoy(); cargarDeudas(); }).catch(errorRed);
  };
  function errorRed(e) {
    avisar('⚠️ ' + (e && e.message ? e.message : 'Sin conexión'));
  }

  /* ---------- Arranque ---------- */
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});

  if (!cfg.url || !cfg.clave) {
    mostrarVista('config');
  } else {
    var vista = params.get('vista');
    mostrarVista(vista === 'deudas' ? 'deudas' : 'hoy');
    cargarHoy();
    var modo = params.get('modo');
    if (modo === 'voz') {
      escuchar(); // si el navegador lo bloquea, queda el botón grande
    } else if (modo === 'dia') {
      $('capa-dia').hidden = false;
      $('dia-texto').textContent = 'Tocá "Escuchar" para que te lea el día.';
      escucharMiDia();
    }
  }
})();
