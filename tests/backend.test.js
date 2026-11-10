// Prueba Codigo.gs completo contra el simulador de Google.
const { crearEntorno } = require('./simulador-google');
const { ctx, eventos, filas } = crearEntorno();
let fallas = 0;
function ok(cond, msg) { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) fallas++; }
const get = p => { const o = ctx.doGet({ parameter: Object.assign({ clave: 'prueba' }, p) }); return o.m === 'json' ? JSON.parse(o.t) : o.t; };

ok(JSON.parse(ctx.doGet({ parameter: { clave: 'mala' } }).t).ok === false, 'rechaza clave incorrecta');
let r = get({ accion: 'agregar', texto: 'agregame a las 11 de la noche una llamada con Pérez' });
ok(r.ok && r.tipo === 'evento' && /Llamada con Pérez/.test(r.mensaje), 'agrega evento: ' + r.mensaje);
r = get({ accion: 'agregar', texto: 'le debo 50 mil a Juan para el viernes' });
ok(r.ok && r.tipo === 'deuda' && filas.length === 2, 'agrega deuda: ' + r.mensaje);
ok(eventos.some(e => /Pagar 50\.000 pesos a Juan/.test(e.titulo)), 'la deuda con vencimiento crea evento en el calendario');
r = get({ accion: 'agregar', texto: 'Gómez me debe 200 mil de la obra' });
ok(r.ok && /Gómez te debe 200\.000 pesos/.test(r.mensaje), 'agrega cobro: ' + r.mensaje);
r = get({ accion: 'deudas' });
ok(r.deudas.length === 2, 'lista 2 deudas');
const idJuan = r.deudas.find(d => d.persona === 'Juan').id;
r = get({ accion: 'pagar', id: idJuan });
ok(r.ok && get({ accion: 'deudas' }).deudas.length === 1, 'marca deuda pagada');
r = get({ accion: 'agregar', texto: 'recordame comprar tornillos' });
const antes = eventos.filter(e => !e.borrado).length;
r = get({ accion: 'deshacer' });
ok(r.ok && eventos.filter(e => !e.borrado).length === antes - 1, 'deshacer borra lo último');
r = get({ accion: 'agregar', texto: 'debo 10 mil al gomero' });
get({ accion: 'deshacer' });
ok(get({ accion: 'deudas' }).deudas.length === 1, 'deshacer borra la deuda de la planilla');
const texto = get({ accion: 'resumen', formato: 'texto' });
console.log('\n--- RESUMEN HABLADO ---\n' + texto + '\n');
ok(/A las 8 de la mañana: Obra Gonnet — membrana, en Camino Centenario 1234/.test(texto), 'resumen incluye eventos con hora y lugar');
ok(/Pasar presupuesto a Sosa/.test(texto) && !/📌/.test(texto), 'resumen incluye tareas sin emojis');
ok(/Te deben 200\.000 pesos/.test(texto), 'resumen incluye lo que te deben');
ok(/¿Querés agregar algo más\?$/.test(texto), 'termina preguntando si querés agregar algo');
ctx.enviarResumenDiario();
ok(ctx.ultimoMail && /Tu día/.test(ctx.ultimoMail.s), 'manda el mail diario');
ctx.configurar();
ok(true, 'configurar() corre sin errores');
console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
