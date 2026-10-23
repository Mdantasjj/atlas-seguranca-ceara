const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

const YEAR=2024;
const CATEGORIES={
  totalUnits:'117897',
  extractiveIndustry:'116880',
  manufacturingIndustry:'116910',
  electricityAndGas:'117296',
  waterWasteAndRemediation:'117307',
  construction:'117329',
  commerce:'117363',
  publicAdministration:'117774',
  education:'117788'
};
const API_URL=`https://servicodados.ibge.gov.br/api/v3/agregados/9528/periodos/${YEAR}/variaveis/706?localidades=N6[N3[23]]&classificacao=12762[${Object.values(CATEGORIES).join(',')}]`;
const OUTPUT=path.resolve(__dirname,'../dist/data/ibge-atividades-economicas.js');

function parseValue(value){
  if(value==='-')return 0;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

async function fetchRows(){
  if(process.argv[2])return JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8'));
  try{
    const response=await fetch(API_URL);
    if(!response.ok)throw new Error(`IBGE respondeu ${response.status}.`);
    return response.json();
  }catch(error){
    if(process.platform!=='win32')throw error;
    const powershell='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    const command=`(Invoke-WebRequest -Uri '${API_URL}' -UseBasicParsing -TimeoutSec 90).Content`;
    return JSON.parse(execFileSync(powershell,['-NoProfile','-Command',command],{encoding:'utf8',maxBuffer:8*1024*1024}));
  }
}

async function main(){
  const response=await fetchRows();
  const results=response?.[0]?.resultados||[];
  const fieldByCategory=new Map(Object.entries(CATEGORIES).map(([field,code])=>[code,field]));
  const municipalities={};

  results.forEach(result=>{
    const category=result.classificacoes?.[0]?.categoria;
    const categoryCode=category&&Object.keys(category)[0];
    const field=fieldByCategory.get(categoryCode);
    if(!field)return;
    result.series.forEach(item=>{
      const code=String(item.localidade.id);
      municipalities[code]??={name:String(item.localidade.nome).replace(/(?: \(CE\)| - CE)$/,'')};
      municipalities[code][field]=parseValue(item.serie[String(YEAR)]);
    });
  });

  const entries=Object.entries(municipalities).sort(([a],[b])=>a.localeCompare(b));
  if(entries.length!==184)throw new Error(`Esperados 184 municípios; recebidos ${entries.length}.`);
  entries.forEach(([code,item])=>{
    Object.keys(CATEGORIES).forEach(field=>{
      if(!Number.isFinite(item[field]))throw new Error(`${field} inválido para ${code} (${item.name}).`);
    });
    item.industry=item.extractiveIndustry+item.manufacturingIndustry+item.electricityAndGas+item.waterWasteAndRemediation+item.construction;
  });

  const payload={
    source:'IBGE · Cadastro Central de Empresas (CEMPRE) · Tabela 9528',
    sourceUrl:'https://sidra.ibge.gov.br/tabela/9528',
    referenceYear:YEAR,
    unit:'unidades locais',
    notes:{
      industry:'Soma das seções CNAE B a F.',
      education:'Unidades locais classificadas na seção CNAE P; não equivale a um inventário físico de escolas.',
      publicAdministration:'Unidades locais classificadas na seção CNAE O; não equivale a um inventário físico de prédios públicos.'
    },
    municipalities:Object.fromEntries(entries)
  };
  fs.writeFileSync(OUTPUT,`window.IBGE_ATIVIDADES_ECONOMICAS=${JSON.stringify(payload,null,2)};\n`,'utf8');
  console.log(JSON.stringify({ok:true,municipalities:entries.length,year:YEAR,output:OUTPUT},null,2));
}

main().catch(error=>{console.error(error);process.exitCode=1});
