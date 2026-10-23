const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.createContext(context);
for (const file of ['dist/data/data-schema.js', 'dist/data/data-engine.js', 'dist/data/operational-data.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

const Engine = context.window.AtlasDataEngine;
const engine = new Engine(context.window.ATLAS_SCHEMA, context.window.ATLAS_DATA_PACKAGE);
engine.merge({
  indicadores: [
    { indicador: 'populacao', nivel: 'municipio', codigo_ibge: '2304400', valor: '100.000', unidade: 'pessoas' },
    { indicador: 'populacao', nivel: 'municipio', codigo_ibge: '2303709', valor: '50.000', unidade: 'pessoas' }
  ],
  ocorrencias: [
    { id_ocorrencia: '1', data_hora: '2026-01-01 10:00', natureza: 'Roubo', grupo: 'CVP', status: 'Atendida', codigo_ibge: '2304400', tempo_atendimento_min: '12,5', latitude: '-3,73', longitude: '-38,52' },
    { id_ocorrencia: '2', data_hora: '2026-01-01 11:00', natureza: 'Roubo', grupo: 'CVP', status: 'Cancelada', codigo_ibge: '2304400', tempo_atendimento_min: '7,5' }
  ],
  recursos: [
    { tipo_recurso: 'viatura', quantidade: '4', codigo_ibge: '2304400' },
    { tipo_recurso: 'efetivo_policial', quantidade: '20', codigo_ibge: '2304400' }
  ]
});

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
assert(engine.validate().ok, 'O pacote válido foi rejeitado.');
assert(engine.aggregate('populacao', 'municipio').get('2304400') === 100000, 'Falha ao interpretar número brasileiro.');
assert(engine.aggregate('ocorrencias', 'municipio').get('2304400') === 2, 'Falha na contagem de ocorrências.');
assert(engine.aggregate('ocorrencias_canceladas', 'municipio').get('2304400') === 1, 'Falha na contagem de cancelamentos.');
assert(engine.aggregate('tempo_atendimento', 'municipio').get('2304400') === 10, 'Falha na média do tempo de atendimento.');
assert(engine.aggregate('viaturas', 'municipio').get('2304400') === 4, 'Falha na soma de viaturas.');
assert(engine.aggregate('efetivo_policial', 'municipio').get('2304400') === 20, 'Falha na soma de efetivo.');
assert(engine.points().length === 1, 'Falha na identificação de pontos georreferenciados.');

const parsed = context.window.AtlasDataUtils.parseDelimited('indicador;nivel;codigo_ibge;valor\npopulacao;municipio;2304400;123,45');
assert(parsed.length === 1 && parsed[0].codigo_ibge === '2304400', 'Falha no parser CSV com ponto e vírgula.');

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, metrics: engine.availableMetrics().map(item => item.id), summary: engine.summary() }, null, 2));
