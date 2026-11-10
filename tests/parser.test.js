// Ejecutar: TZ=America/Argentina/Buenos_Aires node tests/parser.test.js
const fs = require('fs');
const path = require('path');
const Module = require('module');

const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Parser.gs'), 'utf8');
const m = new Module('Parser.gs');
m._compile(src, 'Parser.gs');
const P = m.exports;

// Martes 10/11/2026, 10:00
const AHORA = new Date(2026, 10, 10, 10, 0);
let fallas = 0, total = 0;

function fmt(d) {
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;
}

function caso(frase, esperado) {
  total++;
  const r = P.interpretarFrase(frase, AHORA);
  const real = {
    tipo: r.tipo,
    titulo: r.titulo,
    fecha: fmt(r.fecha),
    hora: r.hora ? `${String(r.hora.h).padStart(2, '0')}:${String(r.hora.m).padStart(2, '0')}` : null,
  };
  if (r.deuda) {
    real.persona = r.deuda.persona;
    real.monto = r.deuda.monto;
    real.moneda = r.deuda.moneda;
    real.direccion = r.deuda.direccion;
    real.concepto = r.deuda.concepto;
  }
  const errores = Object.keys(esperado).filter(k => esperado[k] !== real[k]);
  if (errores.length) {
    fallas++;
    console.log(`✗ "${frase}"\n   esperado: ${JSON.stringify(esperado)}\n   obtenido: ${JSON.stringify(real)}`);
  } else {
    console.log(`✓ "${frase}" → ${JSON.stringify(real)}`);
  }
}

// Eventos con hora
caso('agregame a las 2 de la tarde una cita con Pérez', { tipo: 'evento', titulo: 'Cita con Pérez', fecha: '2026-11-10', hora: '14:00' });
caso('Agendame mañana a las 9 de la mañana medición en Gonnet', { tipo: 'evento', titulo: 'Medición en Gonnet', fecha: '2026-11-11', hora: '09:00' });
caso('reunión con el arquitecto el viernes a las 10 y media', { tipo: 'evento', titulo: 'Reunión con el arquitecto', fecha: '2026-11-13', hora: '10:30' });
caso('a las 3 presupuesto para la señora Gómez', { tipo: 'evento', titulo: 'Presupuesto para la señora Gómez', fecha: '2026-11-10', hora: '15:00' });
caso('visita obra City Bell 17:45', { tipo: 'evento', titulo: 'Visita obra City Bell', fecha: '2026-11-10', hora: '17:45' });
caso('el 15 de diciembre a las 8 entrega de materiales', { tipo: 'evento', titulo: 'Entrega de materiales', fecha: '2026-12-15', hora: '08:00' });
caso('llamar al proveedor de chapa a las dos', { tipo: 'evento', titulo: 'Llamar al proveedor de chapa', fecha: '2026-11-10', hora: '14:00' });
caso('dentista a las 7 menos cuarto de la tarde', { tipo: 'evento', titulo: 'Dentista', fecha: '2026-11-10', hora: '18:45' });
caso('agregame una cita con Juan Carlos el lunes al mediodía', { tipo: 'evento', titulo: 'Cita con Juan Carlos', fecha: '2026-11-16', hora: '12:00' });
caso('a las 8 de la mañana ir al corralón', { tipo: 'evento', titulo: 'Ir al corralón', fecha: '2026-11-11', hora: '08:00' });
caso('pasado mañana a la tarde pasar por lo de Martínez', { tipo: 'evento', titulo: 'Pasar por lo de Martínez', fecha: '2026-11-12', hora: '16:00' });
caso('el 20 a las 11 firma de contrato', { tipo: 'evento', titulo: 'Firma de contrato', fecha: '2026-11-20', hora: '11:00' });
caso('cena a las 21 hs', { tipo: 'evento', titulo: 'Cena', fecha: '2026-11-10', hora: '21:00' });
caso('Agendá para el jueves a las 4 y cuarto la inspección del techo de Ramírez', { tipo: 'evento', titulo: 'Inspección del techo de Ramírez', fecha: '2026-11-12', hora: '16:15' });

// Tareas sin hora
caso('agregame que tengo que ir a buscar las membranas', { tipo: 'tarea', titulo: 'Ir a buscar las membranas', fecha: '2026-11-10', hora: null });
caso('recordame mañana comprar tornillos autoperforantes', { tipo: 'tarea', titulo: 'Comprar tornillos autoperforantes', fecha: '2026-11-11', hora: null });
caso('anotá mandar la memoria técnica a López el miércoles', { tipo: 'tarea', titulo: 'Mandar la memoria técnica a López', fecha: '2026-11-11', hora: null });

// Deudas
caso('le debo 50 mil a Juan', { tipo: 'deuda', persona: 'Juan', monto: 50000, moneda: 'ARS', direccion: 'DEBO', fecha: null });
caso('agregame una deuda con Corralón Norte de $350.000 por las chapas', { tipo: 'deuda', persona: 'Corralón Norte', monto: 350000, direccion: 'DEBO', concepto: 'Las chapas' });
caso('tengo que pagarle a Pedro 120000 el viernes', { tipo: 'deuda', persona: 'Pedro', monto: 120000, fecha: '2026-11-13', direccion: 'DEBO' });
caso('le debo 300 dólares a mi cuñado', { tipo: 'deuda', persona: 'Mi cuñado', monto: 300, moneda: 'USD' });
caso('Gómez me debe 1,5 millones de la obra de Tolosa', { tipo: 'deuda', persona: 'Gómez', monto: 1500000, direccion: 'ME_DEBEN', concepto: 'Obra de Tolosa' });
caso('me deben 80 lucas de Fernández', { tipo: 'deuda', persona: 'Fernández', monto: 80000, direccion: 'ME_DEBEN' });
caso('tengo que cobrarle a Ramírez cincuenta mil el 25', { tipo: 'deuda', persona: 'Ramírez', monto: 50000, direccion: 'ME_DEBEN', fecha: '2026-11-25' });
caso('debo 25.500 al gomero', { tipo: 'deuda', persona: 'Gomero', monto: 25500, direccion: 'DEBO' });

// Formatos de voz
total++;
const pruebasHora = [[14, 0, 'a las 2 de la tarde'], [8, 30, 'a las 8 y media de la mañana'], [13, 0, 'a la 1 de la tarde'], [12, 0, 'a las 12 del mediodía'], [18, 45, 'a las 7 menos cuarto de la tarde']];
pruebasHora.forEach(([h, mi, esp]) => {
  const r = P.horaHablada(h, mi);
  if (r !== esp) { fallas++; console.log(`✗ horaHablada(${h},${mi}) = "${r}" (esperado "${esp}")`); }
});
if (P.formatearMiles(1500000) !== '1.500.000') { fallas++; console.log('✗ formatearMiles'); }

console.log(`\n${total - fallas}/${total} OK`);
process.exit(fallas ? 1 : 0);
