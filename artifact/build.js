// Arma artifact/mi-dia.html metiendo el intérprete de apps-script/Parser.gs adentro de la página.
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const parser = fs.readFileSync(path.join(raiz, 'apps-script', 'Parser.gs'), 'utf8');
const src = fs.readFileSync(path.join(__dirname, 'mi-dia.src.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'mi-dia.html'), src.replace('/*__PARSER__*/', () => parser));
console.log('artifact/mi-dia.html listo');
