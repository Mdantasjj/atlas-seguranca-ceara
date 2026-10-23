const fs=require('fs');
const vm=require('vm');

const source=fs.readFileSync('dist/data/ais-ocorrencias-2026.js','utf8');
const context={window:{}};
vm.runInNewContext(source,context);
const data=context.window.ATLAS_AIS_DATA;
const errors=[];
if(!data)errors.push('ATLAS_AIS_DATA ausente');
if(data?.total!==497094)errors.push(`total ${data?.total}`);
if(data?.areaCount!==34||data?.areas?.length!==34)errors.push(`AIS ${data?.areas?.length}`);
if(data?.natureCount!==602)errors.push(`naturezas ${data?.natureCount}`);
const calculatedTotal=(data?.areas||[]).reduce((sum,area)=>sum+area.total,0);
if(calculatedTotal!==data?.total)errors.push(`soma ${calculatedTotal}`);
for(const area of data?.areas||[]){
  const subtotal=area.naturezas.reduce((sum,item)=>sum+item[1],0);
  if(subtotal!==area.total)errors.push(`${area.id}: ${subtotal} != ${area.total}`);
}
if(errors.length){console.error(JSON.stringify({ok:false,errors},null,2));process.exit(1)}
console.log(JSON.stringify({ok:true,total:data.total,areas:data.areaCount,naturezas:data.natureCount,periodo:data.period.label},null,2));
