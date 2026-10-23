const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.createContext(context);
for (const file of ['dist/data/map-data.js', 'dist/data/ipece-indicadores.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

const data = context.window;
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const cityNames = new Set(data.CEARA_MUNICIPIOS.map(item => item.nome));
const cityIds = new Set(data.CEARA_MUNICIPIOS.map(item => String(item.id)));
const geoIds = new Set(data.CEARA_GEOJSON.features.map(item => String(item.properties.codarea)));
const regionIds = new Set(data.CEARA_REGIOES.map(item => String(item.codigo)));
const regionNames = new Set(data.CEARA_REGIOES.map(item => item.regiao));
const indicators = data.IPECE_INDICADORES.municipios;
const indicatorNames = new Set(Object.keys(indicators));
const neighborhoodCities = new Set(data.CEARA_BAIRROS.features.map(item => item.properties.Municipio));

assert(cityNames.size === 184, `Municípios: ${cityNames.size}/184`);
assert(geoIds.size === 184, `Geometrias municipais: ${geoIds.size}/184`);
assert(regionIds.size === 184, `Municípios regionalizados: ${regionIds.size}/184`);
assert(regionNames.size === 14, `Regiões: ${regionNames.size}/14`);
assert(data.CEARA_REGION_LIMITS.features.length === 14, `Limites regionais: ${data.CEARA_REGION_LIMITS.features.length}/14`);
assert(indicatorNames.size === 184, `IDM: ${indicatorNames.size}/184`);
assert(data.CEARA_BAIRROS.features.length === 1311, `Bairros: ${data.CEARA_BAIRROS.features.length}/1311`);
assert(neighborhoodCities.size === 105, `Municípios com bairros: ${neighborhoodCities.size}/105`);

for (const id of cityIds) assert(geoIds.has(id), `Município ${id} sem geometria`);
for (const id of cityIds) assert(regionIds.has(id), `Município ${id} sem região`);
for (const name of cityNames) assert(indicatorNames.has(name), `${name} sem IDM`);
for (const name of indicatorNames) assert(cityNames.has(name), `IDM sem município correspondente: ${name}`);
for (const name of neighborhoodCities) assert(cityNames.has(name), `Bairros vinculados a município desconhecido: ${name}`);

const ranks = new Set();
for (const [name, item] of Object.entries(indicators)) {
  assert(Number.isFinite(item.idm2022) && item.idm2022 >= 0 && item.idm2022 <= 1, `IDM 2022 inválido: ${name}`);
  assert(Number.isInteger(item.rank2022) && item.rank2022 >= 1 && item.rank2022 <= 184, `Ranking IDM inválido: ${name}`);
  ranks.add(item.rank2022);
}
assert(ranks.size === 184, `Ranking IDM possui ${ranks.size}/184 posições únicas`);

const report = {
  municipios: cityNames.size,
  regioes: regionNames.size,
  limitesRegionais: data.CEARA_REGION_LIMITS.features.length,
  indicadoresIdm: indicatorNames.size,
  bairros: data.CEARA_BAIRROS.features.length,
  municipiosComBairros: neighborhoodCities.size,
  municipiosComPib2023: Object.values(indicators).filter(item => item.pib2023Mil).length,
  melhorIdm2022: Object.entries(indicators).sort((a, b) => a[1].rank2022 - b[1].rank2022)[0][0]
};

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors, report }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, report }, null, 2));
