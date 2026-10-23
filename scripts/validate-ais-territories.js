const fs=require('fs');
const vm=require('vm');

const context={window:{}};
vm.runInNewContext(fs.readFileSync('dist/data/ais-territorios-2026.js','utf8'),context);
const data=context.window.ATLAS_AIS_TERRITORIES;
const cities=JSON.parse(fs.readFileSync('dist/data/municipios.json','utf8'));
const neighborhoods=JSON.parse(fs.readFileSync('dist/data/ceara-bairros.geojson','utf8')).features;
const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const municipalityIndex=new Map();
for(const [ais,names] of Object.entries(data.municipios))for(const name of names){
  const key=fold(name);if(municipalityIndex.has(key))throw new Error(`${name} repetido em ${ais}`);municipalityIndex.set(key,ais);
}
const missingCities=cities.map(item=>item.nome).filter(name=>!['Fortaleza','Caucaia'].includes(name)&&!municipalityIndex.has(fold(name)));
const reports={};
for(const city of ['Fortaleza','Caucaia']){
  const index=new Map();
  for(const [ais,names] of Object.entries(data.bairros[city]))for(const name of names)index.set(fold(name),ais);
  const available=neighborhoods.filter(feature=>feature.properties.Municipio===city).map(feature=>feature.properties.Nome);
  const declaredMissing=new Set((data.semClassificacao?.[city]||[]).map(fold));
  reports[city]={total:available.length,mapped:available.filter(name=>index.has(fold(name))).length,semClassificacao:available.filter(name=>declaredMissing.has(fold(name))),missing:available.filter(name=>!index.has(fold(name))&&!declaredMissing.has(fold(name)))};
}
const aisIds=new Set([...Object.keys(data.municipios),...Object.values(data.bairros).flatMap(area=>Object.keys(area))]);
const result={municipios:{total:cities.length,mapped:municipalityIndex.size+2,missing:missingCities},bairros:reports,ais:[...aisIds].sort()};
console.log(JSON.stringify(result,null,2));
if(missingCities.length||aisIds.size!==34||reports.Fortaleza.missing.length||reports.Caucaia.missing.length)process.exit(1);
