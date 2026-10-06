import json
import sys
from pathlib import Path

import ezdxf
import numpy as np
import pytest
import rhino3dm

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import sintetico  # noqa: E402
from base3d.area import epsg_sirgas_utm, ler_kml, montar_area  # noqa: E402
from base3d.classificacao import classificar  # noqa: E402
from base3d.config import NIVEIS, Pedido, recomendar_nivel  # noqa: E402
from base3d.fontes import carregar_fonte  # noqa: E402
from base3d.lapidacao import carregar_lapidacoes, normalizar_categoria  # noqa: E402
from base3d.malha import montar_modelo  # noqa: E402
from base3d.pipeline import executar  # noqa: E402
from base3d.verificacao import cobertura_ruas, sobreposicoes, topologia_edificacoes  # noqa: E402


@pytest.fixture
def pedido_int(tmp_path):
    lap = sintetico.lapidacao_exemplo(tmp_path)
    return Pedido.carregar(sintetico.gerar(tmp_path, "intermediario", [lap]))


def preparar(p):
    area = montar_area(p)
    dados = carregar_fonte(p, area, p.saida / "cache")
    laps, _ = carregar_lapidacoes(p.lapidacoes, area)
    return area, dados, laps


def test_epsg_por_longitude():
    assert epsg_sirgas_utm(-43.18, -22.94) == 31983  # Rio
    assert epsg_sirgas_utm(-46.63, -23.55) == 31983  # São Paulo
    assert epsg_sirgas_utm(-38.5, -12.97) == 31984  # Salvador
    assert epsg_sirgas_utm(-60.02, -3.1) == 31980  # Manaus


def test_kml_preserva_vertices_e_area(pedido_int):
    area = montar_area(pedido_int)
    assert area.vertices_kml == 4
    assert area.poligono.area == pytest.approx(12 * 300, rel=1e-4)
    assert len(ler_kml(pedido_int.kml)) == 1
    x0, y0, x1, y1 = area.extensao
    assert all(v % 50 == 0 for v in area.extensao)
    assert area.recorte.contains(area.poligono)
    assert area.origem[0] % 10 == 0 and area.origem[1] % 10 == 0


def test_centro_e_area_sem_kml(tmp_path):
    caminho = sintetico.gerar(tmp_path, extras=dict(kml=None, centro=[-22.945, -43.1808], area_m2=7680))
    p = Pedido.carregar(caminho)
    assert not p.validar()
    a = montar_area(p)
    assert a.aproximado and a.poligono.area == pytest.approx(7680, rel=1e-6)
    assert any("aproximado" in x for x in p.avisos())


def test_recomendacao_e_niveis():
    assert recomendar_nivel("evento_via_publica")["nivel"] == "intermediario"
    assert recomendar_nivel("ativacao_marca")["nivel"] == "detalhado"
    assert recomendar_nivel(None)["nivel"] == "basico"
    assert recomendar_nivel("estudo_viabilidade", 80000)["alertas"]
    rodadas = [NIVEIS["niveis"][n]["rodadas_lapidacao"] for n in ("basico", "intermediario", "detalhado")]
    assert rodadas == [0, 1, 2]


def test_apelidos_de_lapidacao():
    assert normalizar_categoria("calçada") == "04_CALCADAS_CAMINHOS"
    assert normalizar_categoria("03_RUAS_IPP2013") == "03_PISTAS"  # código do R03
    assert normalizar_categoria("09_ARVORES_TRONCOS_EST") == "08_ARVORES_COPAS"
    assert normalizar_categoria("xyz") is None


def test_classificacao_sem_sobreposicao_e_ruas_cobertas(pedido_int):
    area, dados, laps = preparar(pedido_int)
    geo = classificar(area, dados, pedido_int.perfil, laps)
    assert not sobreposicoes(geo)
    cob = cobertura_ruas(geo, area.recorte)["ruas"]
    assert cob["Rua Vertical 2"]["dentro_da_pista_pct"] >= 99
    cats = {s["categoria"] for s in geo.superficies}
    assert {"03_PISTAS", "04_CALCADAS_CAMINHOS", "12_AREAS_INTERNAS_LOTES", "05_CICLOVIA"} <= cats
    assert geo.estatisticas["arvores"] == 18 and geo.estatisticas["postes"] == 9
    assert geo.meio_fio, "nível intermediário deve gerar meio-fio"
    alto = [p for p in geo.edificacoes if p["status"] == "lapidado_R1"]
    assert alto and all(p["altura"] == 40 for p in alto)
    assert any(s["status"] == "lapidado_R1" for s in geo.superficies)


def test_basico_sem_meio_fio(tmp_path):
    p = Pedido.carregar(sintetico.gerar(tmp_path, "basico"))
    area, dados, laps = preparar(p)
    geo = classificar(area, dados, p.perfil, laps)
    assert not geo.meio_fio
    assert any("Árvores" in x for x in geo.pendencias)


def test_malha_fechada_e_area(pedido_int):
    area, dados, laps = preparar(pedido_int)
    geo = classificar(area, dados, pedido_int.perfil, laps)
    modelo, rel = montar_modelo(area, geo, dados, pedido_int.perfil)
    assert rel["max_surface_area_error_m2"] < 0.05
    topo = topologia_edificacoes(modelo)
    assert topo["volumes"] == geo.estatisticas["edificacoes"] and not topo["volumes_nao_fechados"]
    curb = [o for o in modelo["objects"] if o["kind"] == "curb"]
    assert curb and np.ptp(np.array(curb[0]["vertices"])[:, 2]) > 0
    pista = np.array(next(o for o in modelo["objects"] if o["layer"] == "03_PISTAS")["vertices"])
    terreno = dados.elevacao()(pista[:, :2] + area.origem[:2])
    assert np.allclose(pista[:, 2], terreno - pedido_int.perfil["altura_meio_fio_m"], atol=1e-3)


def test_pipeline_completo(tmp_path):
    lap = sintetico.lapidacao_exemplo(tmp_path)
    res = executar(sintetico.gerar(tmp_path, "detalhado", [lap, lap]), skp=False, dwg=False, verbose=False)
    saida = Path(res["saida"])
    rel = res["relatorio"]
    assert saida.name.endswith("_R03")
    for sufixo in ["_modelo.obj", "_modelo.mtl", "_Rhino6.3dm", "_base_local.dxf", "_base_UTM.dxf",
                   "_modelo3D_local.dxf", "_planta.png", "_vista_3D.png", "_area_evento.png", "_cenas_planta.png",
                   "_geografia.geojson"]:
        assert list(saida.glob(f"*{sufixo}")), sufixo
    assert (saida / "LEIA-ME.txt").exists() and (saida / "VERIFICACAO_R03.json").exists()
    assert Path(res["pacote"]).exists()
    assert rel["formatos"]["obj"]["releitura"]["invalid_faces"] == 0
    assert rel["formatos"]["obj"]["releitura"]["z_para_cima_ok"]
    assert rel["formatos"]["rhino"]["named_views"] >= 7
    for modo in ("local", "UTM"):
        doc = ezdxf.readfile(saida / rel["formatos"]["cad"][modo]["arquivo"])
        assert not doc.audit().has_errors
        assert "00_LIMITE_EVENTO" in doc.layers
    m3 = rhino3dm.File3dm.Read(str(next(saida.glob("*_Rhino6.3dm"))))
    assert m3.Settings.ModelUnitSystem == rhino3dm.UnitSystem.Meters
    assert any("SKP não gerado" in p for p in rel["pendencias"])
    manifesto = json.loads((saida / "MANIFESTO_R03.json").read_text())
    assert "LEIA-ME.txt" in manifesto


def test_fonte_arcgis_com_respostas_simuladas(tmp_path, monkeypatch, pedido_int):
    """Resolve camadas por nome, pagina por objectIds e lê o MDT por Identify, sem rede."""
    from base3d.fontes import arcgis

    area = montar_area(pedido_int)
    x, y = area.poligono.centroid.coords[0]
    anel = [[x - 5, y - 5], [x - 5, y + 5], [x + 5, y + 5], [x + 5, y - 5], [x - 5, y - 5]]  # horário = externo

    def falso_get(self, url, params=None, post=False, binario=False):
        if params.get("f") == "pjson":
            return dict(layers=[dict(id=0, name="Edificações"), dict(id=1, name="Lotes"), dict(id=2, name="Quadras"),
                                dict(id=5, name="Eixo de Logradouros"), dict(id=7, name="Ciclovias")])
        if url.endswith("/identify"):
            return dict(results=[dict(attributes={"Pixel Value": "2,35"})])
        if params.get("returnIdsOnly"):
            return dict(objectIds=[1, 2])
        if url.endswith("/5/query"):
            return dict(features=[dict(attributes=dict(completo="Rua Teste"), geometry=dict(paths=[[[x - 50, y], [x + 50, y]]]))])
        if url.endswith("/7/query"):
            return dict(features=[])
        return dict(features=[dict(attributes=dict(OBJECTID=i, BASE=2.0, ALTURA=12.0), geometry=dict(rings=[anel]))
                              for i in (1, 2)])

    monkeypatch.setattr(arcgis.FonteArcGIS, "_get", falso_get)
    monkeypatch.setattr(arcgis.FonteArcGIS, "ortofoto", lambda self: None)
    monkeypatch.setattr(arcgis, "amostras_terreno_pontos", lambda a: np.array([[x, y], [x + 10, y], [x, y + 10]]))
    d = arcgis.FonteArcGIS("rio_ipp", area, tmp_path).carregar()
    assert len(d.edificacoes) == 2 and d.edificacoes[0]["altura"] == 12.0
    assert d.logradouros[0]["nome"] == "Rua Teste"
    assert np.allclose(d.amostras_terreno[:, 2], 2.35)
    assert (tmp_path / "edificacoes.json").exists() and (tmp_path / "terrain_samples.json").exists()
    assert any("Edificações" in linha for linha in d.log)


def test_texturas_no_detalhado(tmp_path):
    from PIL import Image
    mat = tmp_path / "materiais"
    mat.mkdir()
    Image.new("RGB", (8, 8), (90, 90, 90)).save(mat / "asfalto.png")
    (mat / "materiais.json").write_text(json.dumps({"03_PISTAS": {"textura": "asfalto.png", "largura_m": 2}}))
    caminho = sintetico.gerar(tmp_path, "detalhado", extras=dict(materiais="materiais"))
    res = executar(caminho, skp=False, dwg=False, verbose=False)
    saida = Path(res["saida"])
    assert res["relatorio"]["formatos"]["obj"]["textured_layers"] == ["03_PISTAS"]
    assert res["relatorio"]["formatos"]["obj"]["releitura"]["uv"] > 0
    assert "map_Kd texturas/asfalto.png" in next(saida.glob("*.mtl")).read_text()
    assert (saida / "texturas" / "asfalto.png").exists()


def test_conversao_entrega_anterior(tmp_path):
    """Lê um GeoPackage no formato do R03 e gera lapidação só com camadas interpretadas."""
    import sqlite3
    import struct
    from shapely.geometry import box as caixa
    from base3d.r03 import converter

    def blob(g):  # cabeçalho GPKG sem envelope + WKB
        return b"GP" + bytes([0, 1]) + struct.pack("<i", 31983) + g.wkb

    gp = tmp_path / "r03.gpkg"
    con = sqlite3.connect(gp)
    con.execute("create table gpkg_geometry_columns (table_name, column_name)")
    con.execute("insert into gpkg_geometry_columns values ('modelo_poligonos', 'geom')")
    con.execute("create table modelo_poligonos (geom blob, category text, object_name text)")
    linhas = [(caixa(0, 0, 10, 10), "02_PRAIA_AREIA_VISUAL"), (caixa(0, 0, 4, 4), "08_ARVORES_COPAS_EST"),
              (caixa(5, 5, 6, 6), "10_POSTES_CANDIDATOS"), (caixa(0, 0, 50, 50), "03_RUAS_IPP2013")]
    con.executemany("insert into modelo_poligonos values (?,?,?)", [(blob(g), c, f"obj{i}") for i, (g, c) in enumerate(linhas)])
    con.commit()
    con.close()
    cont = converter(gp, tmp_path / "lap.geojson")
    assert cont == {"02_PRAIA_AREIA": 1, "arvore": 1, "poste": 1}  # pista vem do cadastro, não da lapidação
    fc = json.loads((tmp_path / "lap.geojson").read_text())
    arvore = next(f for f in fc["features"] if f["properties"]["categoria"] == "arvore")
    assert arvore["geometry"]["type"] == "Point" and arvore["properties"]["copa_m"] == pytest.approx(4.51, abs=0.01)


def test_procedencia_por_atributo_e_contrato(tmp_path):
    """Cada objeto diz como foi obtido; o pacote traz contrato, distâncias e pendência de licença."""
    lap = sintetico.lapidacao_exemplo(tmp_path)
    res = executar(sintetico.gerar(tmp_path, "intermediario", [lap]), skp=False, dwg=False, verbose=False)
    saida, rel = Path(res["saida"]), res["relatorio"]
    geo = json.loads(next(saida.glob("*_geografia.geojson")).read_text())
    predios = [f["properties"] for f in geo["features"] if f["properties"]["category"] == "07_EDIFICACOES"]
    assert all(p["metodo_geometria"] == "source_attribute" and p["id_origem"] for p in predios)
    assert any(p["metodo_altura"] == "estimated" for p in predios)  # ajuste de altura desenhado na lapidação
    pistas = [f["properties"] for f in geo["features"] if f["properties"]["category"] == "03_PISTAS"]
    assert all(p["metodo"] == "derived" for p in pistas)
    assert rel["metodos_de_obtencao"]["arvores_postes"] == {"estimated": 27}
    contrato = json.loads(next(saida.glob("*_contrato.json")).read_text())
    assert contrato["crs_horizontal"] == "EPSG:31983" and contrato["origem_local_E"] == rel["area"]["origem"][0]
    dists = {d["ate"].split(" ")[0]: d for d in rel["distancias_evento"]}
    assert {"projeção", "meio-fio", "eixo"} <= set(dists)
    assert all(len(d["ponto_de"]) == 2 and len(d["ponto_ate"]) == 2 for d in rel["distancias_evento"])
    assert any("Licença das fontes" in p for p in rel["pendencias"])
    assert any("Datum vertical" in p for p in rel["pendencias"])
    m3 = rhino3dm.File3dm.Read(str(next(saida.glob("*_Rhino6.3dm"))))
    textos = [dict(o.Attributes.GetUserStrings()) for o in m3.Objects]
    assert any(t.get("metodo_altura") for t in textos)


def test_projecoes_sobrepostas_viram_um_volume(tmp_path):
    from shapely.geometry import box as caixa
    from base3d.classificacao import _remover_sobrepostas
    a = dict(g=caixa(0, 0, 10, 10), base=0.0, altura=20.0)
    b = dict(g=caixa(0.5, 0, 10, 10), base=0.0, altura=12.0)  # mesmo prédio, registro duplicado
    c = dict(g=caixa(20, 0, 30, 10), base=0.0, altura=9.0)
    restantes, removidos = _remover_sobrepostas([b, a, c])
    assert removidos == 1 and a in restantes and c in restantes and b not in restantes


def test_atributos_skp_sem_sdk():
    """Grava strings e números no Attribute Dictionary usando as chamadas certas do SDK."""
    from base3d.exportar.skp import atributos_entidade, Ref
    chamadas = []

    class FakeSU:
        def __call__(self, nome, *args):
            chamadas.append((nome, args))

        def criar(self, nome):
            chamadas.append((nome, ()))
            return Ref()

    atributos_entidade(FakeSU(), Ref(), dict(fonte="IPP", altura_m=12.5))
    nomes = [c[0] for c in chamadas]
    assert nomes[0] == "SUEntityGetAttributeDictionary" and chamadas[0][1][1] == b"base3d"
    assert "SUTypedValueSetString" in nomes and "SUTypedValueSetDouble" in nomes
    assert nomes.count("SUAttributeDictionarySetValue") == 2 and nomes[-1] == "SUTypedValueRelease"
