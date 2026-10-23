window.ATLAS_SCHEMA={
  version:'1.0.0',
  primaryKey:'codigo_ibge',
  levels:[
    {id:'estado',label:'Estado'},
    {id:'regiao',label:'Região de planejamento'},
    {id:'municipio',label:'Município'},
    {id:'distrito',label:'Distrito'},
    {id:'bairro',label:'Bairro'},
    {id:'localidade',label:'Localidade'}
  ],
  datasets:{
    indicadores:{
      label:'Indicadores territoriais',
      required:['indicador','nivel','valor'],
      recommended:['codigo_ibge','regiao','municipio','distrito','bairro','localidade','periodo','unidade','fonte'],
      description:'Valores agregados como população, IDH, efetivo, viaturas, CVP, CVLI e indicadores econômicos.'
    },
    ocorrencias:{
      label:'Ocorrências policiais',
      required:['id_ocorrencia','data_hora','natureza'],
      recommended:['status','grupo','latitude','longitude','codigo_ibge','regiao','municipio','distrito','bairro','localidade','tempo_atendimento_min'],
      description:'Registros individualizados, georreferenciados ou vinculados a uma unidade territorial.'
    },
    recursos:{
      label:'Efetivo, viaturas e equipamentos',
      required:['tipo_recurso','quantidade'],
      recommended:['id_recurso','nome','status','latitude','longitude','codigo_ibge','regiao','municipio','distrito','bairro','localidade','periodo'],
      description:'Efetivo, viaturas, prédios públicos, comércio, unidades policiais e outros equipamentos.'
    }
  },
  catalog:[
    {id:'populacao',label:'População',category:'Demografia',unit:'pessoas',aggregation:'sum',direction:'neutral'},
    {id:'idh',label:'IDH',category:'Desenvolvimento',unit:'índice',aggregation:'average',direction:'positive'},
    {id:'idm',label:'IDM',category:'Desenvolvimento',unit:'índice',aggregation:'average',direction:'positive'},
    {id:'efetivo_policial',label:'Efetivo policial',category:'Recursos policiais',unit:'policiais',aggregation:'sum',direction:'positive'},
    {id:'viaturas',label:'Viaturas',category:'Recursos policiais',unit:'viaturas',aggregation:'sum',direction:'positive'},
    {id:'ocorrencias',label:'Ocorrências',category:'Segurança',unit:'ocorrências',aggregation:'count',direction:'negative'},
    {id:'ocorrencias_canceladas',label:'Ocorrências canceladas',category:'Atendimento',unit:'ocorrências',aggregation:'count',direction:'negative'},
    {id:'tempo_atendimento',label:'Tempo médio de atendimento',category:'Atendimento',unit:'min',aggregation:'average',direction:'negative'},
    {id:'roubos',label:'Roubos',category:'Criminalidade',unit:'ocorrências',aggregation:'count',direction:'negative'},
    {id:'homicidios',label:'Homicídios',category:'Criminalidade',unit:'ocorrências',aggregation:'count',direction:'negative'},
    {id:'cvp',label:'CVP',category:'Criminalidade',unit:'ocorrências',aggregation:'count',direction:'negative'},
    {id:'cvli',label:'CVLI',category:'Criminalidade',unit:'ocorrências',aggregation:'count',direction:'negative'},
    {id:'comercio',label:'Estabelecimentos comerciais',category:'Equipamentos',unit:'estabelecimentos',aggregation:'sum',direction:'neutral'},
    {id:'predios_publicos',label:'Prédios públicos',category:'Equipamentos',unit:'unidades',aggregation:'sum',direction:'neutral'},
    {id:'pib',label:'PIB',category:'Economia',unit:'R$',aggregation:'sum',direction:'positive'},
    {id:'pib_per_capita',label:'PIB per capita',category:'Economia',unit:'R$',aggregation:'average',direction:'positive'},
    {id:'renda_media',label:'Renda média',category:'Economia',unit:'R$',aggregation:'average',direction:'positive'}
  ]
};
