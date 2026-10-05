"""Pedido (ordem de serviço) e perfis de nível de esforço.

O arquivo niveis.json é compartilhado com a interface do Freela Hub, para que
o formulário e o motor usem exatamente as mesmas regras.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
NIVEIS = json.loads((DATA / "niveis.json").read_text(encoding="utf8"))
FONTES = json.loads((DATA / "fontes.json").read_text(encoding="utf8"))
ORDEM_NIVEIS = ["basico", "intermediario", "detalhado"]
CATEGORIAS = NIVEIS["categorias"]


def cor(categoria: str) -> list[int]:
    return CATEGORIAS.get(categoria, {}).get("cor", [130, 130, 130])


def recomendar_nivel(finalidade: str | None, area_m2: float | None = None) -> dict:
    """Mesma regra usada no formulário: a finalidade define o nível mínimo."""
    fin = NIVEIS["finalidades"].get(finalidade or "", None)
    nivel = fin["nivel_minimo"] if fin else "basico"
    alertas = []
    if area_m2 and area_m2 > NIVEIS["area_alerta_m2"]:
        alertas.append(
            f"Área de {area_m2:,.0f} m² acima de {NIVEIS['area_alerta_m2']:,} m²: "
            "processamento e lapidação mais longos; considere dividir em trechos."
        )
    return dict(nivel=nivel, finalidade=fin["rotulo"] if fin else None,
                prioridades=fin["prioridades"] if fin else [], alertas=alertas)


@dataclass
class PontoDeVista:
    nome: str
    lat: float | None = None
    lon: float | None = None
    x: float | None = None  # coordenadas UTM, alternativa a lat/lon
    y: float | None = None
    altura_olho_m: float = 1.6
    alvo: dict | None = None  # {lat, lon} ou {x, y}; padrão: centro do polígono
    fov: float = 60.0


@dataclass
class Pedido:
    codigo: str
    nome: str
    nivel: str = "basico"
    finalidade: str | None = None
    kml: Path | None = None
    centro: tuple[float, float] | None = None  # (lat, lon) quando não há KML
    area_m2: float | None = None
    entorno_m: float | None = None
    recorte: str = "entorno"  # "entorno" (forma do buffer) ou "retangulo"
    inclui_pista: bool | None = None
    pontos_de_vista: list[PontoDeVista] = field(default_factory=list)
    lapidacoes: list[Path] = field(default_factory=list)
    materiais: Path | None = None
    fonte: str = "rio_ipp"
    fonte_local: dict = field(default_factory=dict)
    epsg: int | None = None
    saida: Path = Path("saida")
    observacoes: str = ""

    @property
    def perfil(self) -> dict:
        return NIVEIS["niveis"][self.nivel]

    @property
    def entorno(self) -> float:
        return float(self.entorno_m if self.entorno_m is not None else self.perfil["entorno_m"])

    def validar(self) -> list[str]:
        """Erros impeditivos e avisos de escopo."""
        erros = []
        if self.nivel not in NIVEIS["niveis"]:
            erros.append(f"Nível desconhecido: {self.nivel}")
            return erros
        if not self.kml and not (self.centro and self.area_m2):
            erros.append("Informe o KML/KMZ do polígono ou o centro (lat, lon) + área em m².")
        if self.kml and not Path(self.kml).exists():
            erros.append(f"KML não encontrado: {self.kml}")
        for lap in self.lapidacoes:
            if not Path(lap).exists():
                erros.append(f"Arquivo de lapidação não encontrado: {lap}")
        if self.fonte != "local" and self.fonte not in FONTES:
            erros.append(f"Fonte de dados desconhecida: {self.fonte}")
        return erros

    def avisos(self) -> list[str]:
        out = []
        esperadas = self.perfil["rodadas_lapidacao"]
        if len(self.lapidacoes) < esperadas:
            out.append(
                f"Nível {self.perfil['rotulo']} prevê {esperadas} rodada(s) de lapidação; "
                f"recebidas {len(self.lapidacoes)}. A entrega fica marcada como parcial."
            )
        rec = recomendar_nivel(self.finalidade, self.area_m2)
        if ORDEM_NIVEIS.index(rec["nivel"]) > ORDEM_NIVEIS.index(self.nivel):
            out.append(
                f"A finalidade '{rec['finalidade']}' recomenda no mínimo o nível "
                f"{NIVEIS['niveis'][rec['nivel']]['rotulo']}."
            )
        if self.perfil["materiais"] == "texturas" and not self.materiais:
            out.append("Nível detalhado sem biblioteca de materiais: serão usadas cores lisas.")
        if not self.kml:
            out.append("Sem KML: polígono aproximado (quadrado) gerado a partir do centro e da área.")
        return out

    @classmethod
    def carregar(cls, caminho: str | Path) -> "Pedido":
        caminho = Path(caminho).resolve()
        base = caminho.parent
        d = json.loads(caminho.read_text(encoding="utf8"))

        def rel(p):
            return None if p in (None, "") else (base / p).resolve()

        return cls(
            codigo=d["codigo"],
            nome=d.get("nome", d["codigo"]),
            nivel=d.get("nivel", "basico"),
            finalidade=d.get("finalidade"),
            kml=rel(d.get("kml")),
            centro=tuple(d["centro"]) if d.get("centro") else None,
            area_m2=d.get("area_m2"),
            entorno_m=d.get("entorno_m"),
            recorte=d.get("recorte", "entorno"),
            inclui_pista=d.get("inclui_pista"),
            pontos_de_vista=[PontoDeVista(**p) for p in d.get("pontos_de_vista", [])],
            lapidacoes=[rel(p) for p in d.get("lapidacoes", [])],
            materiais=rel(d.get("materiais")),
            fonte=d.get("fonte", "rio_ipp"),
            fonte_local={k: rel(v) if isinstance(v, str) else v for k, v in d.get("fonte_local", {}).items()},
            epsg=d.get("epsg"),
            saida=rel(d.get("saida", f"saida/{d['codigo']}")),
            observacoes=d.get("observacoes", ""),
        )
