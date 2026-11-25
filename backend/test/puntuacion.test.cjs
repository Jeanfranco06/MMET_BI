const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularPuntuacion } = require('../dist/cuestionarios/puntuacion.js');

const pssItems = Array.from({ length: 10 }, (_, index) => ({
  numero_item: index + 1,
  puntuacion_inversa: [4, 5, 7, 8].includes(index + 1),
}));
const pclItems = Array.from({ length: 20 }, (_, index) => ({ numero_item: index + 1, puntuacion_inversa: false }));

test('PSS-10: los cuatro ítems inversos producen 16 cuando todas las respuestas son 0', () => {
  assert.equal(calcularPuntuacion(pssItems, pssItems.map(({ numero_item }) => ({ numero_item, valor: 0 }))), 16);
});

test('PSS-10: las cuatro respuestas inversas producen 24 cuando todas las respuestas son 4', () => {
  assert.equal(calcularPuntuacion(pssItems, pssItems.map(({ numero_item }) => ({ numero_item, valor: 4 }))), 24);
});

test('PSS-10: el punto medio produce 20', () => {
  assert.equal(calcularPuntuacion(pssItems, pssItems.map(({ numero_item }) => ({ numero_item, valor: 2 }))), 20);
});

test('PCL-5: suma los 20 ítems sin inversión', () => {
  assert.equal(calcularPuntuacion(pclItems, pclItems.map(({ numero_item }) => ({ numero_item, valor: 4 }))), 80);
});

test('rechaza respuestas omitidas o fuera de rango', () => {
  assert.throws(() => calcularPuntuacion(pssItems, [{ numero_item: 1, valor: 5 }]), /Respuesta inválida/);
});
