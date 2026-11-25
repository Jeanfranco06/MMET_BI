const test = require('node:test');
const assert = require('node:assert/strict');
const { AiService, DISCLAIMER_NO_CLINICO, NOTA_METODOLOGICA_REPORTE } = require('../dist/ai/ai.service.js');

const mockConfig = {
  get: (key) => {
    if (key === 'AI_MODEL') return 'qwen-plus';
    return '';
  },
};

test('AI interpretarEvaluacion rechaza puntaje PSS-10 mayor a 40', async () => {
  const ai = new AiService(mockConfig);
  await assert.rejects(
    () =>
      ai.interpretarEvaluacion({
        instrumento: 'PSS-10',
        puntaje_total: 45,
        momento: 'INICIAL',
      }),
    /excede el máximo permitido/,
  );
});

test('AI interpretarEvaluacion devuelve disclaimer no clínico y variación', async () => {
  const ai = new AiService(mockConfig);
  const res = await ai.interpretarEvaluacion({
    instrumento: 'PSS-10',
    puntaje_total: 15,
    momento: 'FINAL',
    puntaje_inicial_previo: 21,
    codigo_practica: 'P-01',
    nombre_practica: 'Atención plena a la respiración',
  });
  assert.equal(res.variacion_vs_inicial, 6);
  assert.equal(res.escala_maxima, 40);
  assert.equal(res.disclaimer, DISCLAIMER_NO_CLINICO);
  assert.ok(Array.isArray(res.observaciones_clave) && res.observaciones_clave.length > 0);
  assert.ok(Array.isArray(res.sugerencias_seguimiento) && res.sugerencias_seguimiento.length > 0);
});

test('AI interpretarReporte rechaza grupos con n < 5 por supresión estadística', async () => {
  const ai = new AiService(mockConfig);
  await assert.rejects(
    () =>
      ai.interpretarReporte({
        reporte: 'RG-02',
        corte: '2026-11-23',
        kpis: { tasa_cumplimiento_meta: 80 },
        grupos: [
          { nombre: 'P-01', n: 25, valor: 5.2, semaforo: 'BUENO' },
          { nombre: 'P-03', n: 4, valor: 3.1, semaforo: 'SUPRIMIDO' },
        ],
      }),
    /Supresión estadística activa/,
  );
});

test('AI interpretarReporte devuelve secciones separadas y nota sin causalidad', async () => {
  const ai = new AiService(mockConfig);
  const res = await ai.interpretarReporte({
    reporte: 'RG-02',
    corte: '2026-11-23',
    kpis: { practicas_evaluables: 5, tasa_cumplimiento_meta: 100, semaforo: 'BUENO' },
    grupos: [{ nombre: 'P-01', n: 158, valor: 5.28, semaforo: 'BUENO' }],
  });
  assert.equal(res.reporte, 'RG-02');
  assert.ok(Array.isArray(res.hechos_observados) && res.hechos_observados.length > 0);
  assert.ok(Array.isArray(res.lectura_semaforos) && res.lectura_semaforos.length > 0);
  assert.ok(Array.isArray(res.recomendaciones_gestion) && res.recomendaciones_gestion.length > 0);
  assert.equal(res.nota_metodologica, NOTA_METODOLOGICA_REPORTE);
});
