# Preparação e integração de dados

O mapa aceita três grupos de dados independentes. Os modelos estão na pasta `modelos/` e podem ser preenchidos em Excel, LibreOffice ou outro sistema que exporte CSV em UTF-8.

## 1. Indicadores territoriais

Use `modelos/indicadores_territoriais.csv` para dados agregados: população, IDH, IDM, efetivo policial, viaturas, CVP, CVLI, roubos, homicídios, comércio, prédios públicos, PIB, renda ou qualquer novo indicador.

Campos principais:

- `indicador`: identificador sem ambiguidade, por exemplo `populacao`, `idh`, `efetivo_policial` ou `cvli`.
- `nivel`: `estado`, `regiao`, `municipio`, `distrito`, `bairro` ou `localidade`.
- `codigo_ibge`: código municipal de sete dígitos. É a chave preferencial para municípios.
- `periodo`: ano, mês ou intervalo de referência no formato adotado pela fonte.
- `valor`: número sem texto adicional.
- `unidade`: pessoas, policiais, viaturas, ocorrências, minutos, reais ou índice.
- `fonte`: órgão ou sistema responsável.

## 2. Ocorrências policiais

Use `modelos/ocorrencias_policiais.csv` para registros individualizados. Cada ocorrência deve ter um identificador único.

- Coordenadas devem estar em latitude/longitude decimal, datum SIRGAS 2000 ou WGS84.
- `status` permite separar atendidas, canceladas e outras situações.
- `natureza` e `grupo` permitem calcular roubos, homicídios, CVP, CVLI e outras categorias.
- `tempo_atendimento_min` deve conter apenas o número de minutos.
- Quando não houver coordenadas, informe o código IBGE e o recorte territorial mais detalhado disponível.

Não coloque nomes de vítimas, documentos, telefones ou outros dados pessoais no arquivo destinado ao mapa.

## 3. Recursos e equipamentos

Use `modelos/recursos_equipamentos.csv` para efetivo, viaturas, delegacias, batalhões, bases, comércio, prédios públicos e demais equipamentos.

- `tipo_recurso`: `efetivo_policial`, `viatura`, `unidade_policial`, `comercio`, `predio_publico` ou outro identificador estável.
- `quantidade`: total associado ao registro.
- Latitude e longitude são opcionais quando o dado for apenas agregado por território.

## Geometrias de distritos e localidades

Polígonos adicionais podem ser enviados em GeoJSON usando `modelos/geometrias_localidades.geojson` como base. Cada feição deve trazer nas propriedades:

- `nome`;
- `nivel`;
- `codigo_ibge` do município;
- `municipio`;
- uma chave estável, quando disponível.

## Pacote JSON

Também é possível entregar um único arquivo JSON:

```json
{
  "version": "1.0.0",
  "updatedAt": "AAAA-MM-DD",
  "source": "Órgão responsável",
  "indicadores": [],
  "ocorrencias": [],
  "recursos": [],
  "geometrias": {
    "distritos": null,
    "bairros": null,
    "localidades": null
  }
}
```

## Regras de qualidade

1. Usar UTF-8 para preservar acentos.
2. Usar código IBGE de sete dígitos sempre que o registro se referir a município.
3. Informar período, unidade e fonte em todos os indicadores.
4. Não misturar totais e taxas na mesma coluna.
5. Não duplicar registros com a mesma chave, território e período.
6. Informar a metodologia de CVP, CVLI e demais classificações policiais.
7. Remover ou agregar dados que permitam identificar pessoas.
8. Para séries históricas, usar uma linha por indicador, território e período.

Os arquivos podem ser carregados pelo painel **Dados e camadas** no próprio mapa. O carregamento é local ao navegador e não envia dados para a internet.

## Base AIS de ocorrências atendidas · 2026

O arquivo `dist/data/ais-ocorrencias-2026.js` foi consolidado a partir de um relatório operacional em Windows-1252, referente ao período de 1º de janeiro a 30 de setembro de 2026.

- 497.094 ocorrências atendidas;
- 34 Áreas Integradas de Segurança;
- 602 naturezas distintas;
- 7.524 combinações únicas de AIS e natureza.

No relatório original, cada combinação era repetida conforme sua quantidade total e a última linha do grupo recebia campos adicionais de rodapé. A rotina `scripts/import-ais-report.js` usa uma única quantidade por combinação `AIS + natureza` e valida se a soma consolidada coincide com a quantidade de linhas do relatório.

Como o relatório não contém geometrias das AIS, municípios, bairros ou coordenadas, a visualização é apresentada em ranking analítico. Nenhum valor foi associado por aproximação aos municípios do mapa.
