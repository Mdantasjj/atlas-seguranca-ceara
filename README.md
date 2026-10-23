# Atlas de Segurança do Ceará

Mapa territorial interativo do Ceará preparado para estudos de segurança pública, cobertura policial e indicadores socioeconômicos.

## Recursos

- 184 municípios organizados pelas 14 regiões de planejamento do IPECE;
- malhas de bairros disponíveis para 105 municípios;
- detalhamento de Fortaleza, Caucaia e Juazeiro do Norte;
- busca, seleção, zoom, deslocamento e identificação territorial;
- estrutura de dados para incorporar indicadores, ocorrências, efetivo, viaturas e equipamentos;
- população residente, área territorial e densidade demográfica dos 184 municípios (IBGE, Censo 2022);
- unidades locais por município, com recortes de indústria, comércio, educação e Administração Pública (IBGE/CEMPRE 2024);
- dados de referência do IDM e PIB municipal.

## Primeira base operacional

O projeto inclui 497.094 ocorrências atendidas, agregadas por 34 Áreas Integradas de Segurança (AIS), de 1º de janeiro a 30 de setembro de 2026. Os totais são apresentados diretamente no mapa, sem filtros laterais.

O relatório recebido não contém geometrias, mas a divisão territorial vigente foi reconstruída a partir da tabela oficial de 2026 da SIP/DIEST/SUPESP/SSPDS. Os municípios são coloridos diretamente no mapa; Fortaleza e Caucaia usam seus recortes de bairros. Dendê e Praia de Iracema permanecem neutros porque a tabela oficial consultada não os atribui a uma AIS.

Para regenerar a base consolidada a partir do relatório original em Windows-1252:

```bash
node scripts/import-ais-report.js "caminho/relatorio.csv" dist/data/ais-ocorrencias-2026.js
node scripts/validate-ais-data.js
```

Para atualizar a base demográfica com a tabela 4714 do SIDRA/IBGE:

```bash
node scripts/generate-ibge-demography.js
```

Para atualizar as atividades econômicas com a tabela 9528 do SIDRA/IBGE:

```bash
node scripts/generate-ibge-economic-activities.js
```

Essa base usa unidades locais do CEMPRE. Os campos de educação e Administração Pública representam estabelecimentos classificados nas seções CNAE P e O, respectivamente; não constituem um inventário físico completo de escolas ou prédios públicos.

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

