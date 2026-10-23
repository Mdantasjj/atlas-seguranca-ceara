const SVG_NS='http://www.w3.org/2000/svg';
const VIEW={width:900,height:760};
const REGION_COLORS={
  'Cariri':'#b9d9a9','Centro Sul':'#cb78ba','Grande Fortaleza':'#6ebe45','Litoral Leste':'#c8a7d8',
  'Litoral Norte':'#9fd2b8','Litoral Oeste / Vale do Curu':'#a58559','Maciço de Baturité':'#e5decc',
  'Serra da Ibiapaba':'#db7f7f','Sertão Central':'#d6cf47','Sertão de Canindé':'#b9b9b9',
  'Sertão dos Crateús':'#71bad1','Sertão dos Inhamuns':'#ddb09f','Sertão de Sobral':'#a49ad2',
  'Vale do Jaguaribe':'#d99a27'
};

const state={
  features:[],regionFeatures:[],names:new Map(),idsByName:new Map(),regions:new Map(),
  neighborhoods:new Map(),indicators:{},project:null,activeProject:null,currentCity:null,selectedMunicipality:null,
  transform:{scale:1,x:0,y:0},dataEngine:null,activeMetric:'ais_ocorrencias_2026',activeLevel:'ais',
  showOccurrences:false,showResources:false,activeNature:'all'
};

const $=selector=>document.querySelector(selector);
const mapSvg=$('#mapSvg');
const municipalityLayer=$('#municipalityLayer');
const regionBoundaryLayer=$('#regionBoundaryLayer');
const neighborhoodLayer=$('#neighborhoodLayer');
const neighborhoodLabelLayer=$('#neighborhoodLabelLayer');
const customGeometryLayer=$('#customGeometryLayer');
const pointLayer=$('#pointLayer');
const tooltip=$('#tooltip');
const contextBox=$('#mapContext');
let suppressClickUntil=0;
let interactionTimer;

function el(name,attributes={}){
  const node=document.createElementNS(SVG_NS,name);
  Object.entries(attributes).forEach(([key,value])=>node.setAttribute(key,value));
  return node;
}

function fold(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
}

function allCoords(geometry){
  const output=[];
  const walk=value=>typeof value[0]==='number'?output.push(value):value.forEach(walk);
  walk(geometry.coordinates);
  return output;
}

function bounds(features){
  const points=features.flatMap(feature=>allCoords(feature.geometry));
  if(!points.length)throw new Error('Geometria sem coordenadas.');
  return {
    minX:Math.min(...points.map(point=>point[0])),maxX:Math.max(...points.map(point=>point[0])),
    minY:Math.min(...points.map(point=>point[1])),maxY:Math.max(...points.map(point=>point[1]))
  };
}

function projector(features,width,height,padding=34){
  const box=bounds(features);
  const scale=Math.min((width-padding*2)/(box.maxX-box.minX),(height-padding*2)/(box.maxY-box.minY));
  const offsetX=(width-(box.maxX-box.minX)*scale)/2;
  const offsetY=(height-(box.maxY-box.minY)*scale)/2;
  const project=([x,y])=>[offsetX+(x-box.minX)*scale,offsetY+(box.maxY-y)*scale];
  project.scale=scale;
  return project;
}

function pathData(geometry,project){
  const ringPath=ring=>'M'+ring.map(point=>project(point).map(value=>value.toFixed(2)).join(',')).join('L')+'Z';
  if(geometry.type==='Polygon')return geometry.coordinates.map(ringPath).join('');
  if(geometry.type==='MultiPolygon')return geometry.coordinates.flatMap(polygon=>polygon.map(ringPath)).join('');
  return '';
}

function formatDecimal(value,digits=4){
  return Number(value).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
}

function formatVariation(value){
  const number=Number(value);
  return `${number>0?'+':''}${number.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
}

function formatGdp(thousands){
  const billions=Number(thousands)/1_000_000;
  return `R$ ${billions.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})} bi`;
}

function mixHex(base,target='#ffffff',weight=.65){
  const parse=color=>color.replace('#','').match(/.{2}/g).map(value=>parseInt(value,16));
  const [br,bg,bb]=parse(base),[tr,tg,tb]=parse(target);
  return'#'+[br*weight+tr*(1-weight),bg*weight+tg*(1-weight),bb*weight+tb*(1-weight)]
    .map(value=>Math.round(value).toString(16).padStart(2,'0')).join('');
}

function nameHash(value){
  let hash=0;for(const char of String(value))hash=(hash*31+char.charCodeAt(0))>>>0;return hash;
}

function ringAreaCentroid(ring){
  let twiceArea=0,x=0,y=0;
  for(let index=0;index<ring.length-1;index++){
    const current=ring[index],next=ring[index+1],cross=current[0]*next[1]-next[0]*current[1];
    twiceArea+=cross;x+=(current[0]+next[0])*cross;y+=(current[1]+next[1])*cross;
  }
  if(Math.abs(twiceArea)<1e-12){
    return{area:0,point:[ring.reduce((sum,p)=>sum+p[0],0)/ring.length,ring.reduce((sum,p)=>sum+p[1],0)/ring.length]};
  }
  return{area:Math.abs(twiceArea/2),point:[x/(3*twiceArea),y/(3*twiceArea)]};
}

function representativePoint(geometry){
  const rings=geometry.type==='Polygon'?[geometry.coordinates[0]]:geometry.coordinates.map(polygon=>polygon[0]);
  return rings.map(ringAreaCentroid).sort((a,b)=>b.area-a.area)[0].point;
}

function indicatorText(name,compact=false){
  const item=state.indicators[name];
  if(!item)return '';
  const pieces=[`IDM 2022 ${formatDecimal(item.idm2022)}`,`${item.rank2022}º/184`,`${formatVariation(item.variacao)} desde 2019`];
  if(item.pib2023Mil)pieces.push(`PIB 2023 ${formatGdp(item.pib2023Mil)}`);
  return pieces.join(compact?' · ':'\n');
}

function activeMetricValueForMunicipality(name,id,region){
  if(!state.metricValues)return null;
  if(state.activeLevel==='regiao')return state.metricValues.get(region)??null;
  return state.metricValues.get(id)??state.metricValues.get(name)??null;
}

function formatMetricValue(value,unit=''){
  if(!Number.isFinite(Number(value)))return'Sem dado';
  const number=Number(value);
  if(unit==='R$')return number.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
  if(unit==='índice')return number.toLocaleString('pt-BR',{minimumFractionDigits:4,maximumFractionDigits:4});
  const formatted=number.toLocaleString('pt-BR',{maximumFractionDigits:Number.isInteger(number)?0:2});
  return unit?`${formatted} ${unit}`:formatted;
}

function aisMetricValues(nature='all'){
  const values=new Map();
  (window.ATLAS_AIS_DATA?.areas||[]).forEach(area=>{
    const value=nature==='all'?area.total:(area.naturezas.find(item=>item[0]===nature)?.[1]||0);
    values.set(area.id,value);
  });
  return values;
}

let aisTerritoryIndexes;
function getAisTerritoryIndexes(){
  if(aisTerritoryIndexes)return aisTerritoryIndexes;
  const municipality=new Map(),neighborhood=new Map();
  const territories=window.ATLAS_AIS_TERRITORIES||{municipios:{},bairros:{}};
  Object.entries(territories.municipios||{}).forEach(([ais,names])=>names.forEach(name=>municipality.set(fold(name),ais)));
  Object.entries(territories.bairros||{}).forEach(([city,areas])=>{
    const cityIndex=new Map();
    Object.entries(areas).forEach(([ais,names])=>names.forEach(name=>cityIndex.set(fold(name),ais)));
    neighborhood.set(fold(city),cityIndex);
  });
  aisTerritoryIndexes={municipality,neighborhood};return aisTerritoryIndexes;
}

function aisForMunicipality(name){return getAisTerritoryIndexes().municipality.get(fold(name))||null}
function aisForNeighborhood(city,name){return getAisTerritoryIndexes().neighborhood.get(fold(city))?.get(fold(name))||null}

function restoreNeighborhoodColors(){
  neighborhoodLayer.querySelectorAll('.neighborhood-map').forEach(path=>{
    path.style.setProperty('--district-fill',path.dataset.baseFill||'#d9dfdc');
    path.classList.remove('no-data');delete path.dataset.ais;
  });
}

function appendAisLabels(pointBuckets,project){
  pointBuckets.forEach((points,ais)=>{
    if(!points.length)return;
    const projected=points.map(project);
    const x=projected.reduce((sum,point)=>sum+point[0],0)/projected.length;
    const y=projected.reduce((sum,point)=>sum+point[1],0)/projected.length;
    const label=el('text',{x,y,class:'ais-map-label','aria-hidden':'true'});label.textContent=ais.replace('AIS','AIS ');
    customGeometryLayer.appendChild(label);
  });
}

function renderAisMap(min,max,palette){
  const pointBuckets=new Map();
  const addPoint=(ais,point)=>{if(!ais)return;if(!pointBuckets.has(ais))pointBuckets.set(ais,[]);pointBuckets.get(ais).push(point)};
  const colorFor=ais=>thematicColor(Number(state.metricValues.get(ais)),min,max,palette)||'#e8ece9';
  customGeometryLayer.replaceChildren();

  if(state.currentCity){
    const cityAis=aisForMunicipality(state.currentCity);
    const features=state.neighborhoods.get(state.currentCity)||[];
    const featureByName=new Map(features.map(feature=>[fold(feature.properties.Nome),feature]));
    neighborhoodLayer.querySelectorAll('.neighborhood-map').forEach(path=>{
      const ais=aisForNeighborhood(state.currentCity,path.dataset.name)||cityAis;
      path.dataset.ais=ais||'';
      path.style.setProperty('--district-fill',colorFor(ais));
      path.classList.toggle('no-data',!ais);
      const feature=featureByName.get(fold(path.dataset.name));
      if(feature&&ais)addPoint(ais,representativePoint(feature.geometry));
    });
    appendAisLabels(pointBuckets,state.activeProject);
    return;
  }

  municipalityLayer.querySelectorAll('.municipality').forEach(path=>{
    const name=path.dataset.name,ais=aisForMunicipality(name);
    if(name==='Fortaleza'||name==='Caucaia'){
      path.style.setProperty('--region-color','#e8ece9');path.classList.remove('no-data');return;
    }
    path.dataset.ais=ais||'';
    path.style.setProperty('--region-color',colorFor(ais));
    path.classList.toggle('no-data',!ais);
    const feature=state.features.find(item=>String(item.properties.codarea)===path.dataset.id);
    if(feature&&ais)addPoint(ais,representativePoint(feature.geometry));
  });

  ['Fortaleza','Caucaia'].forEach(city=>{
    (state.neighborhoods.get(city)||[]).forEach(feature=>{
      const name=feature.properties.Nome||'',ais=aisForNeighborhood(city,name);
      if(!ais)return;
      const path=el('path',{d:pathData(feature.geometry,state.project),class:'ais-overlay','data-ais':ais,tabindex:'0','aria-label':`${ais}, ${name}, ${city}: ${formatMetricValue(state.metricValues.get(ais),'ocorrências')}`,style:`--ais-color:${colorFor(ais)}`});
      path.addEventListener('pointermove',event=>showTip(`${ais.replace('AIS','AIS ')} · ${name} · ${city}\n${formatMetricValue(state.metricValues.get(ais),'ocorrências')}`,event));
      path.addEventListener('pointerleave',hideTip);
      path.addEventListener('click',()=>openCity(city));
      customGeometryLayer.appendChild(path);
    });
  });
  appendAisLabels(pointBuckets,state.project);
}

function municipalityTooltip(name,id,region){
  const lines=[`${name} · ${region}`,indicatorText(name)];
  if(state.activeMetric!=='base'){
    const ais=state.activeLevel==='ais'?aisForMunicipality(name):null;
    const value=ais?state.metricValues.get(ais):activeMetricValueForMunicipality(name,id,region);
    const label=state.metricMeta?.label||'Indicador';
    if(ais)lines.push(`${ais.replace('AIS','AIS ')} · ${label}: ${formatMetricValue(value,state.metricMeta?.unit||'')}`);
    else if(state.activeLevel==='ais'&&(name==='Fortaleza'||name==='Caucaia'))lines.push('Divisão por AIS exibida nos bairros');
    else lines.push(`${label}: ${formatMetricValue(value,state.metricMeta?.unit||'')}`);
  }
  return lines.filter(Boolean).join('\n');
}

function paletteFor(direction){
  if(direction==='negative')return['#f2ebe8','#dec5bd','#c99b8f','#a9675d','#7d3e39'];
  if(direction==='positive')return['#edf3ed','#c9dec9','#94bd9a','#5d9470','#35624d'];
  return['#eef2f3','#ccdce0','#96bbc4','#5f929f','#346574'];
}

function thematicColor(value,min,max,palette){
  if(!Number.isFinite(value))return null;
  if(max===min)return palette[Math.floor(palette.length/2)];
  const ratio=Math.max(0,Math.min(.999999,(value-min)/(max-min)));
  return palette[Math.floor(ratio*palette.length)];
}

function renderMetricLegend(meta,values){
  const legend=$('#regionLegend');
  const items=$('#legendItems');
  const heading=legend.querySelector('.legend-heading');
  const valid=[...values.values()].map(Number).filter(Number.isFinite);
  if(!valid.length){renderRegionLegend();return}
  const min=Math.min(...valid),max=Math.max(...valid),palette=paletteFor(meta.direction);
  heading.querySelector('strong').textContent=String(meta.label||'INDICADOR').toLocaleUpperCase('pt-BR');
  heading.querySelector('span').textContent=meta.period||meta.unit||'DADOS CARREGADOS';
  items.replaceChildren();items.classList.add('metric-legend');
  palette.forEach((color,index)=>{
    const start=min+(max-min)*(index/palette.length);
    const item=document.createElement('div');item.className='legend-item';
    const swatch=document.createElement('i');swatch.style.background=color;
    const label=document.createElement('span');label.textContent=formatMetricValue(start,meta.unit==='ocorrências'?'':meta.unit);
    item.append(swatch,label);items.appendChild(item);
  });
}

function restoreRegionColors(){
  document.querySelectorAll('.municipality').forEach(path=>{
    path.style.setProperty('--region-color',path.dataset.baseColor||'#ccd4cf');
    path.classList.remove('no-data');
  });
}

function renderCustomGeometries(min,max,palette){
  customGeometryLayer.replaceChildren();
  const storageKey={bairro:'bairros',distrito:'distritos',localidade:'localidades'}[state.activeLevel];
  const collection=storageKey?state.dataEngine.data.geometrias[storageKey]:null;
  if(!collection?.features?.length)return 0;
  let count=0;
  collection.features.forEach(feature=>{
    const properties=feature.properties||{};
    if(state.currentCity&&properties.municipio&&fold(properties.municipio)!==fold(state.currentCity))return;
    const name=properties.nome||properties.name||`${state.activeLevel} ${count+1}`;
    const territory=String(properties.codigo_ibge||properties.municipio||'');
    const key=`${territory}::${name}`;
    const value=state.metricValues.get(key)??state.metricValues.get(`${properties.municipio||''}::${name}`);
    const color=thematicColor(Number(value),min,max,palette);
    const path=el('path',{
      d:pathData(feature.geometry,state.activeProject||state.project),class:'neighborhood-map custom-geometry','data-name':name,
      style:`--city-color:${color||'#d9dfdc'};--district-fill:${color||'#d9dfdc'}`,tabindex:'0','aria-label':`${name}: ${formatMetricValue(value,state.metricMeta?.unit||'')}`
    });
    path.classList.toggle('no-data',!color);
    path.addEventListener('pointermove',event=>showTip(`${name}\n${state.metricMeta?.label||'Indicador'}: ${formatMetricValue(value,state.metricMeta?.unit||'')}`,event));
    path.addEventListener('pointerleave',hideTip);
    customGeometryLayer.appendChild(path);count++;
  });
  return count;
}

function applyMetric(){
  if(!state.dataEngine)return;
  const note=$('#metricNote');
  customGeometryLayer.replaceChildren();
  state.metricValues=new Map();state.metricMeta=null;

  if(state.activeMetric==='base'){
    restoreRegionColors();restoreNeighborhoodColors();renderRegionLegend();
    if(note)note.textContent='A base regional do IPECE permanece como visualização padrão.';
    return;
  }

  if(state.activeMetric==='ipece_idm2022'){
    state.activeLevel='municipio';
    state.metricMeta={label:'IDM 2022',unit:'índice',direction:'positive',period:'IPECE · 2022'};
    Object.entries(state.indicators).forEach(([name,item])=>state.metricValues.set(state.idsByName.get(name)||name,item.idm2022));
  }else if(state.activeMetric==='ipece_pib2023'){
    state.activeLevel='municipio';
    state.metricMeta={label:'PIB municipal 2023',unit:'R$',direction:'positive',period:'IPECE/IBGE · 2023'};
    Object.entries(state.indicators).forEach(([name,item])=>{if(item.pib2023Mil)state.metricValues.set(state.idsByName.get(name)||name,item.pib2023Mil*1000)});
  }else if(state.activeMetric==='ais_ocorrencias_2026'){
    state.activeLevel='ais';
    state.metricMeta={label:'Ocorrências atendidas por AIS',unit:'ocorrências',direction:'negative',period:'01 jan – 30 set 2026'};
    state.metricValues=aisMetricValues(state.activeNature);
  }else{
    const meta=state.dataEngine.metricCatalog().find(item=>item.id===state.activeMetric)||{label:state.activeMetric,unit:'',direction:'neutral'};
    state.metricMeta=meta;
    state.metricValues=state.dataEngine.aggregate(state.activeMetric,state.activeLevel);
  }

  const values=[...state.metricValues.values()].map(Number).filter(Number.isFinite);
  const min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):0;
  const palette=paletteFor(state.metricMeta.direction);

  if(state.activeLevel==='ais'){
    renderAisMap(min,max,palette);
    if(!state.currentCity)setContext('OCORRÊNCIAS ATENDIDAS POR AIS','497.094 ocorrências · 34 AIS · 01 jan – 30 set 2026');
    if(note)note.textContent='Ocorrências exibidas diretamente nas 34 AIS, conforme a divisão territorial SSPDS 2026.';
  }else if(state.currentCity&&state.activeLevel==='bairro'){
    const cityId=state.idsByName.get(state.currentCity);
    neighborhoodLayer.querySelectorAll('.neighborhood-map').forEach(path=>{
      const name=path.dataset.name;
      const value=state.metricValues.get(`${cityId}::${name}`)??state.metricValues.get(`${state.currentCity}::${name}`);
      const color=thematicColor(Number(value),min,max,palette);
      path.style.setProperty('--district-fill',color||'#d9dfdc');
      path.classList.toggle('no-data',!color);
    });
    if(note)note.textContent=`${values.length} bairros com valor para ${state.metricMeta.label}.`;
  }else if(['bairro','distrito','localidade'].includes(state.activeLevel)){
    restoreRegionColors();
    const geometryCount=renderCustomGeometries(min,max,palette);
    if(note)note.textContent=geometryCount?`${geometryCount} geometrias de ${state.activeLevel} preparadas para ${state.metricMeta.label}.`:`Carregue a geometria de ${state.activeLevel} em GeoJSON para visualizar este nível.`;
  }else if(['municipio','regiao'].includes(state.activeLevel)&&!state.currentCity){
    municipalityLayer.querySelectorAll('.municipality').forEach(path=>{
      const value=state.activeLevel==='regiao'?state.metricValues.get(path.dataset.region):(state.metricValues.get(path.dataset.id)??state.metricValues.get(path.dataset.name));
      const color=thematicColor(Number(value),min,max,palette);
      path.style.setProperty('--region-color',color||'#e8ece9');
      path.classList.toggle('no-data',!color);
    });
    if(note)note.textContent=`${values.length} unidades territoriais com valor para ${state.metricMeta.label}.`;
  }else{
    restoreRegionColors();
    if(note)note.textContent=`Selecione um município com a geometria de ${state.activeLevel} disponível para visualizar este nível.`;
  }
  renderMetricLegend(state.metricMeta,state.metricValues);
}

function renderOperationalPoints(){
  pointLayer.replaceChildren();
  if(!state.dataEngine||(!state.showOccurrences&&!state.showResources)||!state.activeProject)return;
  const points=state.dataEngine.points().filter(row=>{
    if(row._kind==='ocorrencia'&&!state.showOccurrences)return false;
    if(row._kind==='recurso'&&!state.showResources)return false;
    if(state.currentCity&&row.municipio&&fold(row.municipio)!==fold(state.currentCity))return false;
    return true;
  });
  points.forEach(row=>{
    const [x,y]=state.activeProject([Number(row.longitude),Number(row.latitude)]);
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    const point=el('circle',{cx:x,cy:y,r:4/state.transform.scale,class:`map-point ${row._kind==='ocorrencia'?'occurrence':'resource'}`,tabindex:'0'});
    const label=row._kind==='ocorrencia'?`${row.natureza||'Ocorrência'} · ${row.status||'sem status'}`:`${row.nome||row.tipo_recurso||'Recurso'} · ${row.quantidade||1}`;
    point.setAttribute('aria-label',label);
    point.addEventListener('pointermove',event=>showTip(label,event));point.addEventListener('pointerleave',hideTip);
    pointLayer.appendChild(point);
  });
}

function setContext(title,description){
  contextBox.querySelector('strong').textContent=title;
  contextBox.querySelector('span').textContent=description;
}

function showTip(text,event){
  tooltip.textContent=text;
  const margin=18;
  const estimatedWidth=Math.min(310,Math.max(130,text.length*4.4));
  const left=Math.min(event.clientX+11,window.innerWidth-estimatedWidth-margin);
  const top=Math.min(event.clientY+11,window.innerHeight-90);
  tooltip.style.left=`${Math.max(margin,left)}px`;
  tooltip.style.top=`${Math.max(margin,top)}px`;
  tooltip.style.opacity='1';
}

function hideTip(){tooltip.style.opacity='0'}

function validateData(){
  const errors=[];
  const regionNames=new Set(state.regions.values());
  const assigned=[...state.regions.values()].filter(Boolean).length;
  const idmCount=Object.keys(state.indicators).length;
  if(state.features.length!==184)errors.push(`${state.features.length}/184 municípios`);
  if(assigned!==184)errors.push(`${assigned}/184 regionalizados`);
  if(regionNames.size!==14)errors.push(`${regionNames.size}/14 regiões`);
  if(idmCount!==184)errors.push(`${idmCount}/184 indicadores IDM`);
  if(state.regionFeatures.length!==14)errors.push(`${state.regionFeatures.length}/14 limites regionais`);
  const quality=$('#dataQuality');
  quality.classList.toggle('error',Boolean(errors.length));
  quality.querySelector('b').textContent=errors.length?`REVISAR · ${errors.join(' · ')}`:`BASE VALIDADA · 184 MUNICÍPIOS · ${state.neighborhoods.size} COM BAIRROS`;
  if(errors.length)throw new Error(errors.join('; '));
}

async function init(){
  try{
    const geo=window.CEARA_GEOJSON||await fetch('data/ceara-municipios.geojson').then(response=>response.json());
    const cities=window.CEARA_MUNICIPIOS||await fetch('data/municipios.json').then(response=>response.json());
    const neighborhoods=window.CEARA_BAIRROS||await fetch('data/ceara-bairros.geojson').then(response=>response.json());
    const regions=window.CEARA_REGIOES||await fetch('data/regioes-planejamento.json').then(response=>response.json());
    const regionLimits=window.CEARA_REGION_LIMITS||await fetch('data/regioes-limites.geojson').then(response=>response.json());

    state.features=geo.features;
    state.regionFeatures=regionLimits.features;
    state.indicators=window.IPECE_INDICADORES?.municipios||{};
    state.dataEngine=new window.AtlasDataEngine(window.ATLAS_SCHEMA,window.ATLAS_DATA_PACKAGE);
    if(window.ATLAS_AIS_DATA){
      state.dataEngine.merge({indicadores:window.ATLAS_AIS_DATA.areas.map(area=>({
        indicador:'ais_ocorrencias_2026',nivel:'ais',ais:area.id,valor:area.total,
        periodo:window.ATLAS_AIS_DATA.period.label,unidade:'ocorrências',fonte:window.ATLAS_AIS_DATA.source
      }))});
    }
    cities.forEach(city=>{
      const id=String(city.id);
      state.names.set(id,city.nome);
      state.idsByName.set(city.nome,id);
    });
    regions.forEach(item=>state.regions.set(String(item.codigo),item.regiao));
    neighborhoods.features.forEach(feature=>{
      const city=feature.properties.Municipio;
      if(!state.neighborhoods.has(city))state.neighborhoods.set(city,[]);
      state.neighborhoods.get(city).push(feature);
    });

    validateData();
    renderState();
    renderRegionLegend();
    setupSearch();
    applyMetric();
    $('#mapLoading').style.display='none';

    const hashParams=new URLSearchParams(location.hash.slice(1));
    const requested=hashParams.get('municipio');
    if(requested&&state.idsByName.has(requested))openCity(requested);
  }catch(error){
    console.error(error);
    $('#mapLoading').innerHTML='BASE INCONSISTENTE · CONSULTE A VALIDAÇÃO';
    $('#mapLoading').style.color='#9a3e3e';
  }
}

function renderState(){
  municipalityLayer.replaceChildren();
  regionBoundaryLayer.replaceChildren();
  neighborhoodLayer.replaceChildren();
  neighborhoodLabelLayer.replaceChildren();
  customGeometryLayer.replaceChildren();
  pointLayer.replaceChildren();
  const project=projector(state.features,VIEW.width,690,38);
  state.project=project;state.activeProject=project;

  state.features.forEach(feature=>{
    const id=String(feature.properties.codarea);
    const name=state.names.get(id)||id;
    const region=state.regions.get(id)||'Sem classificação';
    const description=`${name}, ${region}. ${indicatorText(name,true)}`;
    const path=el('path',{
      d:pathData(feature.geometry,project),class:'municipality','data-id':id,'data-name':name,
      'data-region':region,'data-base-color':REGION_COLORS[region]||'#ccd4cf',style:`--region-color:${REGION_COLORS[region]||'#ccd4cf'}`,
      tabindex:'0','aria-label':description
    });
    path.addEventListener('pointermove',event=>showTip(municipalityTooltip(name,id,region),event));
    path.addEventListener('pointerleave',hideTip);
    path.addEventListener('click',()=>{if(Date.now()>=suppressClickUntil)openCity(name)});
    path.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openCity(name)}});
    municipalityLayer.appendChild(path);
  });

  state.regionFeatures.forEach(feature=>{
    regionBoundaryLayer.appendChild(el('path',{
      d:pathData(feature.geometry,project),class:'region-boundary','aria-label':feature.properties.Nome||'Limite regional'
    }));
  });
  updateScale();
}

function renderRegionLegend(){
  const container=$('#legendItems');
  const heading=$('#regionLegend').querySelector('.legend-heading');
  heading.querySelector('strong').textContent='REGIÕES DE PLANEJAMENTO';
  heading.querySelector('span').textContent='IPECE · 2025';
  container.replaceChildren();container.classList.remove('metric-legend');
  Object.entries(REGION_COLORS).forEach(([name,color])=>{
    const item=document.createElement('div');
    item.className='legend-item';
    const swatch=document.createElement('i');
    const label=document.createElement('span');
    swatch.style.background=color;
    label.textContent=name;
    item.append(swatch,label);
    container.appendChild(item);
  });
}

function setupSearch(){
  const input=$('#citySearch');
  const results=$('#searchResults');
  const close=()=>{results.replaceChildren();input.setAttribute('aria-expanded','false')};
  const update=()=>{
    const query=fold(input.value.trim());
    results.replaceChildren();
    if(!query){input.setAttribute('aria-expanded','false');return}
    const matches=[...state.names.entries()]
      .filter(([,name])=>fold(name).includes(query))
      .sort((a,b)=>fold(a[1]).indexOf(query)-fold(b[1]).indexOf(query)||a[1].localeCompare(b[1],'pt-BR'))
      .slice(0,8);
    matches.forEach(([id,name],index)=>{
      const button=document.createElement('button');
      const title=document.createElement('strong');
      const meta=document.createElement('span');
      title.textContent=name;
      meta.textContent=state.regions.get(id)||'';
      button.type='button';button.setAttribute('role','option');button.setAttribute('aria-selected',index===0?'true':'false');
      button.append(title,meta);
      button.addEventListener('click',()=>{input.value=name;close();openCity(name)});
      results.appendChild(button);
    });
    input.setAttribute('aria-expanded',String(Boolean(matches.length)));
  };
  input.addEventListener('input',update);
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter')results.querySelector('button')?.click();
    if(event.key==='Escape'){input.value='';close();input.blur()}
  });
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.map-toolbar'))close()});
  document.addEventListener('keydown',event=>{
    if(event.key==='/'&&document.activeElement!==input){event.preventDefault();input.focus();input.select()}
    if(event.key==='Escape'&&document.activeElement!==input)resetMap();
  });
}

function setMunicipalitySelection(id){
  document.querySelectorAll('.municipality').forEach(path=>{
    path.classList.toggle('focused',path.dataset.id===id);
    path.classList.toggle('dim',path.dataset.id!==id);
  });
}

function zoomToMunicipality(id){
  const path=document.querySelector(`.municipality[data-id="${id}"]`);
  if(!path)return;
  const box=path.getBBox();
  const scale=Math.min(9,Math.max(1.5,Math.min(650/Math.max(box.width,1),530/Math.max(box.height,1))*.78));
  state.transform.scale=scale;
  state.transform.x=VIEW.width/2-(box.x+box.width/2)*scale;
  state.transform.y=VIEW.height/2-(box.y+box.height/2)*scale;
  setView();
}

async function cityGeo(name){
  if(name==='Fortaleza'&&window.FORTALEZA_BAIRROS)return window.FORTALEZA_BAIRROS;
  return {type:'FeatureCollection',features:state.neighborhoods.get(name)||[]};
}

async function openCity(name){
  const id=state.idsByName.get(name);
  if(!id)return;
  const region=state.regions.get(id)||'Sem classificação';
  const neighborhoodFeatures=state.neighborhoods.get(name)||[];
  state.selectedMunicipality=name;
  history.replaceState(null,'',`#municipio=${encodeURIComponent(name)}`);
  $('#citySearch').value=name;

  if(neighborhoodFeatures.length||name==='Fortaleza'){
    state.currentCity=name;
    setContext(name.toLocaleUpperCase('pt-BR'),`${region} · ${neighborhoodFeatures.length||121} bairros · ${indicatorText(name,true)}`);
    await showNeighborhoods(name,region);
  }else{
    state.currentCity=null;
    neighborhoodLayer.replaceChildren();
    municipalityLayer.style.display='';
    regionBoundaryLayer.style.display='';
    $('#regionLegend').classList.remove('hidden');
    setMunicipalitySelection(id);
    setContext(name.toLocaleUpperCase('pt-BR'),`${region} · sem malha oficial de bairros · ${indicatorText(name,true)}`);
    zoomToMunicipality(id);
    applyMetric();
    renderOperationalPoints();
  }
}

async function showNeighborhoods(name,region){
  neighborhoodLayer.replaceChildren();
  neighborhoodLabelLayer.replaceChildren();
  try{
    const geo=await cityGeo(name);
    if(state.currentCity!==name)return;
    if(!geo.features.length){
      state.currentCity=null;
      openCity(name);
      return;
    }
    const project=projector(geo.features,VIEW.width,700,42);
    state.activeProject=project;
    const cityColor=REGION_COLORS[region]||'#9fbeb7';
    const labelRecords=[];
    geo.features.forEach((feature,index)=>{
      const districtName=feature.properties.Nome||'Bairro';
      const tone=[.52,.60,.68,.76][nameHash(districtName)%4];
      const districtFill=mixHex(cityColor,'#ffffff',tone);
      const labelId=`district-label-${index}`;
      const path=el('path',{
        d:pathData(feature.geometry,project),class:'neighborhood-map','data-name':districtName,'data-label-id':labelId,
        'data-base-fill':districtFill,style:`--city-color:${cityColor};--district-fill:${districtFill}`,tabindex:'0','aria-label':`${districtName}, ${name}`
      });
      neighborhoodLayer.appendChild(path);
      const center=project(representativePoint(feature.geometry));
      const label=el('text',{x:center[0],y:center[1],id:labelId,class:'neighborhood-label'});label.textContent=districtName;
      neighborhoodLabelLayer.appendChild(label);
      const box=path.getBBox();labelRecords.push({label,area:box.width*box.height});
      const neighborhoodDetails=()=>{
        const ais=aisForNeighborhood(name,districtName)||aisForMunicipality(name);
        const value=ais?state.metricValues?.get(ais):null;
        return ais?`${districtName}\n${name} · ${ais.replace('AIS','AIS ')}\n${formatMetricValue(value,'ocorrências')}`:`${districtName}\n${name} · ${region}`;
      };
      path.addEventListener('pointermove',event=>{label.classList.add('active');showTip(neighborhoodDetails(),event)});
      path.addEventListener('pointerleave',()=>{if(!path.classList.contains('selected'))label.classList.remove('active');hideTip()});
      path.addEventListener('click',()=>{
        if(Date.now()<suppressClickUntil)return;
        neighborhoodLayer.querySelectorAll('.neighborhood-map').forEach(item=>item.classList.remove('selected'));
        neighborhoodLabelLayer.querySelectorAll('.neighborhood-label').forEach(item=>item.classList.remove('active'));
        path.classList.add('selected');label.classList.add('active');
        const ais=aisForNeighborhood(name,districtName)||aisForMunicipality(name);
        const value=ais?state.metricValues?.get(ais):null;
        setContext(districtName.toLocaleUpperCase('pt-BR'),ais?`${name} · ${ais.replace('AIS','AIS ')} · ${formatMetricValue(value,'ocorrências')}`:`${name} · ${region} · bairro selecionado`);
      });
    });
    labelRecords.sort((a,b)=>b.area-a.area).slice(0,Math.min(18,labelRecords.length)).forEach(item=>item.label.classList.add('major'));
    municipalityLayer.style.display='none';
    regionBoundaryLayer.style.display='none';
    $('#regionLegend').classList.remove('hidden');
    state.transform={scale:1,x:0,y:0};
    setView();
    applyMetric();
    renderOperationalPoints();
  }catch(error){
    console.error(error);
    setContext(name.toLocaleUpperCase('pt-BR'),'Não foi possível preparar a malha de bairros.');
  }
}

function setView(){
  const {scale,x,y}=state.transform;
  [municipalityLayer,regionBoundaryLayer,neighborhoodLayer,neighborhoodLabelLayer,customGeometryLayer,pointLayer].forEach(layer=>layer.setAttribute('transform',`translate(${x} ${y}) scale(${scale})`));
  pointLayer.querySelectorAll('.map-point').forEach(point=>point.setAttribute('r',String(4/scale)));
  neighborhoodLabelLayer.classList.toggle('all-visible',scale>=1.6);
  neighborhoodLabelLayer.querySelectorAll('.neighborhood-label').forEach(label=>{label.style.fontSize=`${7.4/scale}px`;label.style.strokeWidth=String(3/scale)});
  updateScale();
}

function zoomAt(nextScale,screenX=VIEW.width/2,screenY=VIEW.height/2){
  const previous=state.transform.scale;
  const scale=Math.min(12,Math.max(.72,nextScale));
  const worldX=(screenX-state.transform.x)/previous;
  const worldY=(screenY-state.transform.y)/previous;
  state.transform.x=screenX-worldX*scale;
  state.transform.y=screenY-worldY*scale;
  state.transform.scale=scale;
  setView();
}

function updateScale(){
  if(!state.project)return;
  requestAnimationFrame(()=>{
    const rect=mapSvg.getBoundingClientRect();
    const pixelsPerKm=state.project.scale*state.transform.scale*(rect.width/VIEW.width)/110.5;
    const candidates=[5,10,20,25,50,100,200,250,500];
    const distance=candidates.reduce((best,value)=>Math.abs(value*pixelsPerKm-78)<Math.abs(best*pixelsPerKm-78)?value:best,100);
    const width=Math.max(38,Math.min(125,distance*pixelsPerKm));
    $('#scaleBlock span').style.width=`${width}px`;
    $('#scaleBlock b').textContent=`${distance} km`;
  });
}

function resetMap(){
  state.currentCity=null;
  state.selectedMunicipality=null;
  state.activeProject=state.project;
  state.transform={scale:1,x:0,y:0};
  history.replaceState(null,'',location.pathname+location.search);
  $('#citySearch').value='';
  neighborhoodLayer.replaceChildren();
  neighborhoodLabelLayer.replaceChildren();
  municipalityLayer.style.display='';
  regionBoundaryLayer.style.display='';
  $('#regionLegend').classList.remove('hidden');
  document.querySelectorAll('.municipality').forEach(path=>path.classList.remove('focused','dim'));
  setContext('CEARÁ','184 municípios · 14 regiões de planejamento · IDM IPECE 2022');
  setView();
  applyMetric();
  renderOperationalPoints();
}

mapSvg.addEventListener('wheel',event=>{
  event.preventDefault();
  mapSvg.classList.add('interacting');
  clearTimeout(interactionTimer);
  interactionTimer=setTimeout(()=>mapSvg.classList.remove('interacting'),130);
  const rect=mapSvg.getBoundingClientRect();
  const x=(event.clientX-rect.left)*(VIEW.width/rect.width);
  const y=(event.clientY-rect.top)*(VIEW.height/rect.height);
  zoomAt(state.transform.scale*Math.exp(-event.deltaY*.0015),x,y);
},{passive:false});

mapSvg.addEventListener('dblclick',event=>{
  event.preventDefault();
  const rect=mapSvg.getBoundingClientRect();
  zoomAt(state.transform.scale*1.55,(event.clientX-rect.left)*(VIEW.width/rect.width),(event.clientY-rect.top)*(VIEW.height/rect.height));
});

const drag={active:false,moved:false,x:0,y:0};
mapSvg.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  drag.active=true;drag.moved=false;drag.x=event.clientX;drag.y=event.clientY;
});
mapSvg.addEventListener('pointermove',event=>{
  if(!drag.active)return;
  const dx=event.clientX-drag.x;
  const dy=event.clientY-drag.y;
  if(!drag.moved&&Math.abs(dx)+Math.abs(dy)<=3)return;
  if(!drag.moved){
    drag.moved=true;
    mapSvg.classList.add('drag-active','interacting');
    mapSvg.setPointerCapture(event.pointerId);
  }
  const rect=mapSvg.getBoundingClientRect();
  state.transform.x+=dx*(VIEW.width/rect.width);
  state.transform.y+=dy*(VIEW.height/rect.height);
  drag.x=event.clientX;drag.y=event.clientY;
  setView();event.preventDefault();
});
function finishDrag(event){
  if(!drag.active)return;
  drag.active=false;
  mapSvg.classList.remove('drag-active','interacting');
  if(drag.moved)suppressClickUntil=Date.now()+250;
  if(mapSvg.hasPointerCapture(event.pointerId))mapSvg.releasePointerCapture(event.pointerId);
}
mapSvg.addEventListener('pointerup',finishDrag);
mapSvg.addEventListener('pointercancel',finishDrag);
mapSvg.addEventListener('pointerleave',event=>{if(drag.active&&event.pointerType==='mouse')finishDrag(event)});

$('#zoomIn').addEventListener('click',()=>zoomAt(state.transform.scale*1.3));
$('#zoomOut').addEventListener('click',()=>zoomAt(state.transform.scale/1.3));
$('#resetView').addEventListener('click',resetMap);
$('#infoButton').addEventListener('click',()=>$('#infoDialog').showModal());
$('#dialogClose').addEventListener('click',()=>$('#infoDialog').close());
$('#infoDialog').addEventListener('click',event=>{if(event.target===$('#infoDialog'))$('#infoDialog').close()});
window.addEventListener('resize',updateScale);

init();
