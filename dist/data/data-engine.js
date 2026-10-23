(function(global){
  const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const slug=value=>fold(value).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  const number=value=>{
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    const raw=String(value??'').trim().replace(/\s/g,'');
    if(!raw)return null;
    const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):/^-?\d{1,3}(\.\d{3})+$/.test(raw)?raw.replace(/\./g,''):raw;
    const parsed=Number(normalized);
    return Number.isFinite(parsed)?parsed:null;
  };
  const normalizedKey=value=>String(value??'').trim();

  function parseDelimited(text){
    const clean=String(text).replace(/^\uFEFF/,'');
    const firstLine=clean.split(/\r?\n/,1)[0];
    const delimiter=(firstLine.match(/;/g)||[]).length>(firstLine.match(/,/g)||[]).length?';':',';
    const rows=[];let row=[];let cell='';let quoted=false;
    for(let index=0;index<clean.length;index++){
      const char=clean[index],next=clean[index+1];
      if(char==='"'&&quoted&&next==='"'){cell+='"';index++;continue}
      if(char==='"'){quoted=!quoted;continue}
      if(char===delimiter&&!quoted){row.push(cell);cell='';continue}
      if((char==='\n'||char==='\r')&&!quoted){
        if(char==='\r'&&next==='\n')index++;
        row.push(cell);cell='';
        if(row.some(value=>value.trim()))rows.push(row);
        row=[];continue;
      }
      cell+=char;
    }
    row.push(cell);if(row.some(value=>value.trim()))rows.push(row);
    if(rows.length<2)return [];
    const headers=rows.shift().map(header=>slug(header));
    return rows.map(values=>Object.fromEntries(headers.map((header,index)=>[header,String(values[index]??'').trim()])));
  }

  class AtlasDataEngine{
    constructor(schema,initial={}){
      this.schema=schema||{catalog:[],datasets:{}};
      this.data={indicadores:[],ocorrencias:[],recursos:[],geometrias:{distritos:null,bairros:null,localidades:null}};
      this.merge(initial);
    }

    merge(input={}){
      for(const key of ['indicadores','ocorrencias','recursos']){
        if(Array.isArray(input[key]))this.data[key].push(...input[key].map(row=>this.normalizeRow(row)));
      }
      if(input.geometrias)Object.assign(this.data.geometrias,input.geometrias);
      return this.summary();
    }

    normalizeRow(row){
      const output={};
      Object.entries(row||{}).forEach(([key,value])=>output[slug(key)]=typeof value==='string'?value.trim():value);
      if(output.codigo_ibge)output.codigo_ibge=String(output.codigo_ibge).replace(/\D/g,'').slice(0,7);
      for(const field of ['valor','quantidade','latitude','longitude','tempo_atendimento_min']){
        if(output[field]!==undefined){const parsed=number(output[field]);if(parsed!==null)output[field]=parsed}
      }
      if(output.indicador)output.indicador=slug(output.indicador);
      if(output.nivel)output.nivel=slug(output.nivel);
      return output;
    }

    detectType(rows){
      const keys=new Set(Object.keys(rows[0]||{}));
      if(keys.has('indicador')&&keys.has('valor'))return'indicadores';
      if(keys.has('id_ocorrencia')||keys.has('natureza')||keys.has('data_hora'))return'ocorrencias';
      if(keys.has('tipo_recurso')||keys.has('quantidade'))return'recursos';
      return null;
    }

    async importFile(file){
      const text=await file.text();
      const extension=file.name.split('.').pop().toLowerCase();
      if(extension==='json'||extension==='geojson'){
        const parsed=JSON.parse(text);
        if(parsed.type==='FeatureCollection')return this.importGeoJSON(parsed,file.name);
        const before=this.summary();this.merge(parsed);
        return{type:'package',name:file.name,before,after:this.summary(),validation:this.validate()};
      }
      const rows=parseDelimited(text).map(row=>this.normalizeRow(row));
      if(!rows.length)throw new Error('O arquivo não possui registros legíveis.');
      const type=this.detectType(rows);
      if(!type)throw new Error('Não foi possível identificar o tipo do arquivo. Use um dos modelos fornecidos.');
      this.data[type].push(...rows);
      return{type,name:file.name,rows:rows.length,validation:this.validate(type)};
    }

    importGeoJSON(collection,name='geometrias.geojson'){
      const geometryType=fold(collection.features?.[0]?.geometry?.type);
      if(geometryType==='point'){
        const rows=collection.features.map((feature,index)=>this.normalizeRow({
          ...feature.properties,
          id_recurso:feature.properties?.id_recurso||`${name}-${index+1}`,
          longitude:feature.geometry.coordinates[0],latitude:feature.geometry.coordinates[1],
          tipo_recurso:feature.properties?.tipo_recurso||'equipamento',quantidade:feature.properties?.quantidade||1
        }));
        this.data.recursos.push(...rows);
        return{type:'recursos',name,rows:rows.length,validation:this.validate('recursos')};
      }
      const level=slug(collection.nivel||collection.name||'localidades');
      const target=['distritos','bairros','localidades'].find(item=>level.includes(item))||'localidades';
      this.data.geometrias[target]=collection;
      return{type:'geometria',level:target,name,rows:collection.features?.length||0,validation:this.validate()};
    }

    validate(type=null){
      const errors=[],warnings=[];
      const types=type?[type]:['indicadores','ocorrencias','recursos'];
      for(const dataset of types){
        const rows=this.data[dataset];
        const required=this.schema.datasets?.[dataset]?.required||[];
        rows.forEach((row,index)=>required.forEach(field=>{
          if(row[field]===undefined||row[field]==='')errors.push(`${dataset} · linha ${index+2}: campo ${field} ausente`);
        }));
        if(rows.some(row=>!row.codigo_ibge&&!row.regiao&&!row.municipio&&!row.bairro&&!row.latitude)){
          warnings.push(`${dataset}: existem registros sem vínculo territorial.`);
        }
      }
      return{ok:errors.length===0,errors,warnings,summary:this.summary()};
    }

    summary(){
      return{
        indicadores:this.data.indicadores.length,
        ocorrencias:this.data.ocorrencias.length,
        recursos:this.data.recursos.length,
        geometrias:Object.values(this.data.geometrias).filter(Boolean).length
      };
    }

    metricCatalog(){
      const catalog=new Map((this.schema.catalog||[]).map(item=>[item.id,{...item}]));
      for(const row of this.data.indicadores){
        const id=slug(row.indicador);
        if(!catalog.has(id))catalog.set(id,{id,label:row.rotulo||row.indicador,category:'Dados importados',unit:row.unidade||'',aggregation:row.agregacao||'sum',direction:'neutral'});
      }
      return[...catalog.values()];
    }

    availableMetrics(){
      const available=new Set(this.data.indicadores.map(row=>slug(row.indicador)));
      if(this.data.ocorrencias.length){
        ['ocorrencias','ocorrencias_canceladas','tempo_atendimento','roubos','homicidios','cvp','cvli'].forEach(id=>available.add(id));
      }
      if(this.data.recursos.length){
        ['efetivo_policial','viaturas','comercio','predios_publicos'].forEach(id=>available.add(id));
      }
      return this.metricCatalog().filter(metric=>available.has(metric.id));
    }

    territorialKey(row,level){
      if(level==='regiao')return normalizedKey(row.regiao);
      if(level==='municipio')return normalizedKey(row.codigo_ibge||row.municipio);
      if(level==='bairro')return normalizedKey(`${row.codigo_ibge||row.municipio||''}::${row.bairro||''}`);
      if(level==='distrito')return normalizedKey(`${row.codigo_ibge||row.municipio||''}::${row.distrito||''}`);
      if(level==='localidade')return normalizedKey(`${row.codigo_ibge||row.municipio||''}::${row.localidade||''}`);
      return normalizedKey(row.estado||'CE');
    }

    rowsForMetric(metricId){
      const id=slug(metricId);
      const catalog=this.metricCatalog().find(item=>item.id===id)||{aggregation:'sum'};
      const direct=this.data.indicadores.filter(row=>slug(row.indicador)===id).map(row=>({...row,_value:number(row.valor)}));
      if(direct.length)return{rows:direct,aggregation:catalog.aggregation};

      if(['ocorrencias','ocorrencias_canceladas','tempo_atendimento','roubos','homicidios','cvp','cvli'].includes(id)){
        let rows=this.data.ocorrencias;
        if(id==='ocorrencias_canceladas')rows=rows.filter(row=>fold(row.status).includes('cancel'));
        if(['roubos','homicidios','cvp','cvli'].includes(id))rows=rows.filter(row=>fold(`${row.grupo} ${row.natureza}`).includes(id==='homicidios'?'homicid':id));
        return{rows:rows.map(row=>({...row,_value:id==='tempo_atendimento'?number(row.tempo_atendimento_min):1})).filter(row=>row._value!==null),aggregation:id==='tempo_atendimento'?'average':'sum'};
      }

      const resourceTerms={efetivo_policial:['efetivo','policial'],viaturas:['viatura'],comercio:['comerc'],predios_publicos:['predio publico','prédio público','publico']};
      if(resourceTerms[id]){
        const rows=this.data.recursos.filter(row=>resourceTerms[id].some(term=>fold(`${row.tipo_recurso} ${row.nome}`).includes(fold(term))));
        return{rows:rows.map(row=>({...row,_value:number(row.quantidade)??1})),aggregation:'sum'};
      }
      return{rows:[],aggregation:catalog.aggregation||'sum'};
    }

    aggregate(metricId,level='municipio'){
      const {rows,aggregation}=this.rowsForMetric(metricId);
      const buckets=new Map();
      for(const row of rows){
        const key=this.territorialKey(row,level);
        if(!key)continue;
        if(!buckets.has(key))buckets.set(key,[]);
        buckets.get(key).push(number(row._value));
      }
      const values=new Map();
      for(const [key,items] of buckets){
        const valid=items.filter(Number.isFinite);
        if(!valid.length)continue;
        values.set(key,aggregation==='average'?valid.reduce((sum,value)=>sum+value,0)/valid.length:valid.reduce((sum,value)=>sum+value,0));
      }
      return values;
    }

    points(){
      const occurrencePoints=this.data.ocorrencias.filter(row=>Number.isFinite(number(row.latitude))&&Number.isFinite(number(row.longitude))).map(row=>({...row,_kind:'ocorrencia'}));
      const resourcePoints=this.data.recursos.filter(row=>Number.isFinite(number(row.latitude))&&Number.isFinite(number(row.longitude))).map(row=>({...row,_kind:'recurso'}));
      return occurrencePoints.concat(resourcePoints);
    }
  }

  global.AtlasDataEngine=AtlasDataEngine;
  global.AtlasDataUtils={parseDelimited,fold,slug,number};
})(window);
