const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

const API_URL='https://apisidra.ibge.gov.br/values/t/4714/n6/in%20n3%2023/v/allxp/p/last%201?formato=json';
const OUTPUT=path.resolve(__dirname,'../dist/data/ibge-demografia.js');
const VARIABLES={
  '93':'population',
  '6318':'areaKm2',
  '614':'density'
};

async function main(){
  let rows;
  if(process.argv[2]){
    rows=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8'));
  }else{
    try{
      const response=await fetch(API_URL);
      if(!response.ok)throw new Error(`IBGE SIDRA respondeu ${response.status}.`);
      rows=await response.json();
    }catch(error){
      if(process.platform!=='win32')throw error;
      const powershell='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      const command=`(Invoke-WebRequest -Uri '${API_URL}' -UseBasicParsing -TimeoutSec 60).Content`;
      rows=JSON.parse(execFileSync(powershell,['-NoProfile','-Command',command],{encoding:'utf8',maxBuffer:4*1024*1024}));
    }
  }
  const municipalities={};

  rows.slice(1).forEach(row=>{
    const field=VARIABLES[row.D2C];
    if(!field)return;
    const code=String(row.D1C);
    municipalities[code]??={name:String(row.D1N).replace(/ - CE$/,''),population:null,areaKm2:null,density:null};
    municipalities[code][field]=Number(row.V);
  });

  const entries=Object.entries(municipalities).sort(([a],[b])=>a.localeCompare(b));
  if(entries.length!==184)throw new Error(`Esperados 184 municípios; recebidos ${entries.length}.`);
  entries.forEach(([code,item])=>{
    if(!Number.isFinite(item.population)||!Number.isFinite(item.areaKm2)||!Number.isFinite(item.density)){
      throw new Error(`Dados incompletos para ${code} (${item.name}).`);
    }
  });

  const payload={
    source:'IBGE · SIDRA · Censo Demográfico 2022 · Tabela 4714',
    sourceUrl:'https://sidra.ibge.gov.br/tabela/4714',
    referenceYear:2022,
    municipalities:Object.fromEntries(entries)
  };
  const content=`window.IBGE_DEMOGRAFIA=${JSON.stringify(payload,null,2)};\n`;
  fs.writeFileSync(OUTPUT,content,'utf8');
  console.log(JSON.stringify({ok:true,municipalities:entries.length,output:OUTPUT},null,2));
}

main().catch(error=>{console.error(error);process.exitCode=1});
