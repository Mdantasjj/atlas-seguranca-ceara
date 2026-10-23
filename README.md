# Atlas de Segurança do Ceará

Mapa territorial interativo do Ceará preparado para estudos de segurança pública, cobertura policial e indicadores socioeconômicos.

## Recursos

- 184 municípios organizados pelas 14 regiões de planejamento do IPECE;
- malhas de bairros disponíveis para 105 municípios;
- detalhamento de Fortaleza, Caucaia e Juazeiro do Norte;
- busca, seleção, zoom, deslocamento e identificação territorial;
- estrutura para importar indicadores, ocorrências, efetivo, viaturas e equipamentos em CSV, JSON ou GeoJSON;
- dados de referência do IDM e PIB municipal.

## Primeira base operacional

O projeto inclui 497.094 ocorrências atendidas, agregadas por 34 Áreas Integradas de Segurança (AIS), de 1º de janeiro a 30 de setembro de 2026. O painel permite filtrar 602 naturezas e comparar o volume entre as AIS.

O relatório recebido não contém geometrias das AIS, municípios, bairros ou coordenadas. Por isso, estes dados são apresentados em ranking analítico e não são atribuídos artificialmente aos polígonos municipais.

Para regenerar a base consolidada a partir do relatório original em Windows-1252:

```bash
node scripts/import-ais-report.js "caminho/relatorio.csv" dist/data/ais-ocorrencias-2026.js
node scripts/validate-ais-data.js
```

## Executar localmente

Sirva a pasta `dist` com um servidor HTTP. Exemplo com Python:

```bash
python -m http.server 8765 --directory dist
```

Depois acesse `http://127.0.0.1:8765/`.

Os modelos de importação e a documentação dos dados estão em [`modelos`](modelos) e [`DADOS.md`](DADOS.md).

## Validação

```bash
node scripts/validate-data.js
node scripts/validate-ingestion.js
```

