const fs=require('fs');
const path=require('path');

const input=process.argv[2];
const output=process.argv[3];
if(!input||!output)throw new Error('Uso: node import-ais-report.js <relatorio.csv> <saida.js>');

const text=new TextDecoder('windows-1252').decode(fs.readFileSync(input));
const lines=text.split(/\r?\n/).filter(Boolean);
const records=new Map();
let title='Ocorrências atendidas por AIS';
let periodStart='';
let periodEnd='';

for(const line of lines){
  const match=line.match(/^"([^"]+)","Período:",([^,]+),"a",([^,]+),"(AIS\d{2})","([^"]+)",([0-9.]+)/);
  if(!match)throw new Error(`Linha não reconhecida: ${line.slice(0,160)}`);
  title=match[1].trim();
  periodStart=match[2].trim();
  periodEnd=match[3].trim();
  const area=match[4];
  const nature=match[5].trim();
  const quantity=Number(match[6].replace(/\./g,''));
  const key=`${area}\u0000${nature}`;
  const previous=records.get(key);
  if(previous!==undefined&&previous!==quantity)throw new Error(`Quantidade divergente para ${area} / ${nature}`);
  records.set(key,quantity);
}

const areas=new Map();
for(const [key,quantity] of records){
  const [id,nature]=key.split('\u0000');
  if(!areas.has(id))areas.set(id,[]);
  areas.get(id).push([nature,quantity]);
}

const outputAreas=[...areas].sort(([a],[b])=>a.localeCompare(b,'pt-BR',{numeric:true})).map(([id,natures])=>{
  natures.sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'));
  return{id,total:natures.reduce((sum,item)=>sum+item[1],0),naturezas:natures};
});
const total=outputAreas.reduce((sum,area)=>sum+area.total,0);
const natureCount=new Set([...records.keys()].map(key=>key.split('\u0000')[1])).size;

if(total!==lines.length)throw new Error(`Validação falhou: ${total} ocorrências informadas e ${lines.length} linhas.`);

const payload={
  version:'1.0.0',
  title,
  source:'Relatório operacional fornecido pelo usuário',
  sourceFile:path.basename(input),
  period:{start:periodStart,end:periodEnd,label:'01 jan – 30 set 2026'},
  importedAt:'2026-10-23',
  total,
  areaCount:outputAreas.length,
  natureCount,
  areas:outputAreas
};

fs.writeFileSync(output,`window.ATLAS_AIS_DATA=${JSON.stringify(payload)};\n`,'utf8');
process.stdout.write(`${JSON.stringify({ok:true,total,areas:outputAreas.length,natures:natureCount,records:records.size},null,2)}\n`);
