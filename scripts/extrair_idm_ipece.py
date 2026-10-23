import json
import re
import sys
import unicodedata
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
MUNICIPIOS = ROOT / "dist" / "data" / "municipios.json"
OUTPUT = ROOT / "dist" / "data" / "ipece-indicadores.js"


def key(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn").casefold()


def decimal(value: str) -> float:
    return float(value.replace(".", "").replace(",", "."))


def main(pdf_path: str) -> None:
    cities = json.loads(MUNICIPIOS.read_text(encoding="utf-8"))
    names = [item["nome"] for item in cities]
    aliases = {
        "Deputado Irapuan Pinheiro": "Deputado Irapuan Pinheiro",
        "Ereré": "Ererê",
        "São Luís do Curu": "São Luís do Curu",
    }

    document = fitz.open(pdf_path)
    appendix = " ".join(document[index].get_text() for index in range(63, 68))
    appendix = re.sub(r"\s+", " ", appendix)
    found = {}

    row_tail = (
        r"\s+(0,\d{4})\s+(\d+)º"
        r"\s+(0,\d{4})\s+(\d+)º"
        r"\s+(0,\d{4})\s+(\d+)º"
        r"\s+(0,\d{4})\s+(\d+)º"
        r"\s+(-?\d+,\d+)"
    )

    source_to_city = {aliases.get(city, city): city for city in names}
    name_pattern = "|".join(re.escape(name) for name in sorted(source_to_city, key=len, reverse=True))
    row_pattern = re.compile(r"(?<!\w)(" + name_pattern + r")(?!\w)" + row_tail)

    for match in row_pattern.finditer(appendix):
        city = source_to_city[match.group(1)]
        values = match.groups()[1:]
        found[city] = {
            "idm2019": decimal(values[0]),
            "rank2019": int(values[1]),
            "idm2020": decimal(values[2]),
            "rank2020": int(values[3]),
            "idm2021": decimal(values[4]),
            "rank2021": int(values[5]),
            "idm2022": decimal(values[6]),
            "rank2022": int(values[7]),
            "variacao": decimal(values[8]),
        }

    missing = [name for name in names if name not in found]
    if missing:
        by_key = {key(name): name for name in names}
        print(f"IDM ausente para {len(missing)} municípios: {', '.join(missing)}", file=sys.stderr)
        print(f"Chaves esperadas: {', '.join(by_key[key(name)] for name in missing)}", file=sys.stderr)
        raise SystemExit(1)

    # O informe do PIB municipal 2022/2023 destaca os municípios com maior
    # participação. Valores correntes abaixo estão em R$ 1.000 (ano de 2023).
    gdp = {
        "Fortaleza": (86939832, 37.44, 1),
        "Maracanaú": (13540094, 5.83, 2),
        "Caucaia": (9873557, 4.25, 3),
        "São Gonçalo do Amarante": (6908373, 2.97, 4),
        "Sobral": (6588929, 2.84, 5),
        "Juazeiro do Norte": (6457543, 2.78, 6),
        "Eusébio": (4940352, 2.13, 7),
        "Aquiraz": (4851008, 2.09, 8),
        "Horizonte": (2964814, 1.28, 9),
        "Itapipoca": (2550371, 1.10, 10),
        "Crato": (2445567, 1.05, 11),
        "Itaitinga": (2352737, 1.01, 12),
        "Iguatu": (2342034, 1.01, 13),
        "Tianguá": (2265253, 0.98, 14),
        "Maranguape": (2011194, 0.87, 15),
        "Pacajus": (1808068, 0.78, 20),
    }
    for city, (value, share, rank) in gdp.items():
        found[city]["pib2023Mil"] = value
        found[city]["participacaoPib2023"] = share
        found[city]["rankPib2023"] = rank

    payload = {
        "fonte": {
            "idm": "IPECE — Índice de Desenvolvimento Municipal 2019–2022",
            "pib": "IPECE/IBGE — PIB dos Municípios Cearenses 2022–2023",
            "mediaIdm2022": 0.5703,
            "municipiosComIdm": len(found),
            "anoIdm": 2022,
            "anoPib": 2023,
        },
        "municipios": found,
    }
    content = "window.IPECE_INDICADORES=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
    OUTPUT.write_text(content, encoding="utf-8")
    print(f"Gerados indicadores para {len(found)} municípios em {OUTPUT}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Uso: python extrair_idm_ipece.py <IDM_2019-2022.pdf>")
    main(sys.argv[1])
