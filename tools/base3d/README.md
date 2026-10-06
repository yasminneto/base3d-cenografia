# Base 3D — motor de bases 2D/3D para cenografia

Transforma um polígono do Google Earth (KML/KMZ) — ou um centro + área em m² — num pacote
de entrega verificado: **SketchUp 2026 (.skp) com cenas**, DWG/DXF para AutoCAD, Rhino (.3dm),
OBJ/MTL, GeoJSON para QGIS, vistas PNG, LEIA-ME e relatório de verificação.

É a versão reutilizável do processo que gerou **Botafogo R01 → R03**: os scripts originais
(`explore_sources.py`, `spatial_base.py`, `build_model.py`, `export_*.py`, `package_revision.py`)
foram reorganizados em etapas testáveis, sem coordenadas fixas no código.

## Níveis de esforço

Definidos em `base3d/data/niveis.json`, o mesmo arquivo lido pela interface do Freela Hub.

| Nível | Rodadas de lapidação | O que muda | Precisão estimada |
|---|---|---|---|
| **Básico** | 0 | Só dado oficial, automático. Cenas: geral, planta, área do evento, pedestre | ±1 a 3 m |
| **Intermediário** | 1 | + meio-fio vertical (pista rebaixada 15 cm), ortofoto 15 cm, cenas de pedestre nos extremos e de drone | ±0,3 a 0,5 m |
| **Detalhado** | 2 | + materiais com textura, cenas nos pontos de vista do evento, preparo para renders | ±0,1 a 0,3 m (centimétrica só com levantamento) |

A **finalidade** do pedido define o nível mínimo recomendado (ex.: evento em via pública → intermediário;
ativação de marca → detalhado). `python -m base3d recomendar --finalidade evento_via_publica --area 7680`.

## Instalação (Windows, máquina de produção)

```powershell
py -3.11 -m venv .venv ; .venv\Scripts\activate
pip install -r requirements.txt
# SketchUp: baixe o SketchUp C SDK (Trimble Developer) e aponte para a pasta com SketchUpAPI.dll
setx SKETCHUP_SDK_DIR "C:\SDKs\SketchUpSDK_2026\binaries\sketchup\x64"
# DWG: instale o ODA File Converter (gratuito) — ou deixe o AutoCAD 2026 instalado (accoreconsole.exe)
setx ODA_FILE_CONVERTER "C:\Program Files\ODA\ODAFileConverter 26.x\ODAFileConverter.exe"
```

OBJ, 3DM, DXF, vistas e verificação rodam em qualquer sistema. **SKP** precisa do SDK (Windows/macOS);
**DWG** precisa do ODA File Converter ou do AutoCAD. Sem eles, o pacote sai com DXF e a pendência registrada.

## Uso

```powershell
python -m base3d validar exemplos\botafogo\pedido.json
python -m base3d gerar   exemplos\botafogo\pedido.json            # --sem-skp / --sem-dwg / --sdk PASTA
python -m base3d descobrir rio_ipp                                # lista as camadas dos serviços do IPP
python -m base3d extensao base3d_cenografia.rbz                   # instalador da extensão SketchUp
python -m base3d.processador                                      # processador automático (Supabase)
python -m pytest tests                                            # 20 testes com bairro sintético, sem rede
```

### Pedido (`pedido.json`)

| Campo | Descrição |
|---|---|
| `codigo`, `nome` | ID do Job (`XX-XXXX-XXX`) e nome do local (vira prefixo dos arquivos) |
| `nivel` | `basico`, `intermediario` ou `detalhado` |
| `finalidade` | chave de `finalidades` em `niveis.json` |
| `kml` **ou** `centro` + `area_m2` | polígono do Google Earth, ou `[lat, lon]` + área (gera quadrado aproximado) |
| `entorno_m`, `recorte` | sobrescreve o entorno do nível; `entorno` (forma do buffer) ou `retangulo` |
| `inclui_pista` | o polígono inclui faixa de rolamento de propósito (evita alerta falso) |
| `pontos_de_vista` | `[{nome, lat, lon, altura_olho_m, alvo:{lat, lon}, fov}]` → cenas `PV_*` |
| `lapidacoes` | lista de GeoJSON, um por rodada (R1, R2...) |
| `materiais` | pasta com `materiais.json` = `{categoria: {textura, largura_m, altura_m}}` (detalhado) |
| `fonte` | `rio_ipp` (cadastro da Prefeitura do Rio), `osm` (OpenStreetMap + Copernicus DEM, qualquer cidade) ou `local` com `fonte_local` (GeoJSONs próprios; `licenca` e `datum_vertical` opcionais) |

## Lapidação

Cada rodada é um GeoJSON desenhado no QGIS sobre `*_geografia.geojson` + `*_ortofoto.jpg`, contendo
**só o que muda**. Propriedade `categoria` (código, número ou apelido: `calcada`, `ciclovia`, `agua`,
`praia`, `arvore`, `poste`...), `acao` (`adicionar`, `substituir`, `remover`, `ajustar_altura`) e
`altura_m` / `copa_m` quando couber, e `metodo` (`estimated` por padrão; `surveyed` para dado de levantamento).
A origem de cada pedaço fica registrada (`lapidado_R1`, `R2`).

Para reaproveitar Botafogo: `python -m base3d.r03 Botafogo_R03_cartografia.gpkg exemplos\botafogo\lapidacao_R03.geojson`
(leva praia, areia úmida, água, ciclovia, pinturas, árvores e postes do R03) e copie
`fontes\Poligono_original_usuario.kml` do pacote R03 para `exemplos\botafogo\`.

## Procedência de cada dado

Todo objeto leva `metodo` — `surveyed`, `source_attribute`, `derived`, `estimated` ou `visual_only` — e as
edificações levam um método por atributo (`metodo_geometria`, `metodo_base`, `metodo_altura`) e `id_origem`.
Isso fica no Attribute Dictionary `base3d` do `.skp` (Informações da entidade), nas user strings do `.3dm` e no
GeoJSON. O relatório traz distâncias do limite do evento com os dois extremos declarados (projeção do prédio,
meio-fio, eixo), o datum vertical e a situação de licença das fontes. Detalhes e origem dessas regras:
`docs/aprendizados_projeto_paralelo.md`.

## Como funciona

```
pedido.json ─► área (recorte e origem calculados) ─► fontes (IPP ou local, com cache em fontes/)
   ─► classificação 00–17 (pista = terra − quadras; calçada = quadras − lotes) + lapidações
   ─► malha (paredes quad, coberturas com pátios, terreno Delaunay 5/15 m, meio-fio) ─► cenas
   ─► SKP · 3DM · OBJ · DXF/DWG · PNG ─► VERIFICACAO_Rnn.json · PENDENCIAS · LEIA-ME · MANIFESTO · ZIP
```

| Módulo | Origem no R03 |
|---|---|
| `area.py` | novo (substitui `B=[686150,...]` e a origem fixa) |
| `fontes/arcgis.py` | `explore_sources.py` + downloads não versionados |
| `classificacao.py` | `spatial_base.py` + script de classificação (não recuperado; reescrito) |
| `malha.py` | `build_model.py` (+ meio-fio e componentes gerados) |
| `cenas.py` | novo (o R03 tinha 2 cenas fixas) |
| `exportar/skp.py` | `export_skp.py` (declarações do SDK agora explícitas, sem `exec`) |
| `exportar/rhino.py`, `exportar/obj.py` | `export_formats.py` (+ vistas nomeadas e texturas) |
| `exportar/cad.py` | `export_cad.py` (+ DXF 3D e conversor ODA) |
| `verificacao.py`, `pipeline.py` | `package_revision.py` |

## Interface no Freela Hub

Menu **Base 3D / Cenografia** (perfis Master, C-Level, Operação e Núcleo), em `components/Base3DPanel.tsx`:

1. **Novo pedido:** Job vinculado, nome do local, finalidade, KML do Google Earth (área e perímetro calculados
   na hora) ou coordenadas + área, link do Earth, "inclui faixa de rolamento", pontos de vista, prazo. O nível
   recomendado vem da finalidade; escolher um nível abaixo gera alerta.
2. **Processamento automático:** o processador (abaixo) pega o pedido, gera o pacote, envia o ZIP ao Storage e
   registra a rodada com pendências, distâncias e indicador de entrega completa/parcial.
3. **Lapidação:** a operação baixa o pacote, desenha a rodada no QGIS e envia o GeoJSON pela própria tela; o
   pedido vai para "Em lapidação" e o processador gera a R02 (e a R03 no detalhado).
4. **Status:** solicitado → em processamento → base gerada → em lapidação → em revisão → entregue
   (ou erro, com a mensagem na tela e opção de reprocessar). O registro manual continua disponível.

Migrações: `supabase/migrations/20261005000000_base3d_pedidos.sql` e `20261006000000_base3d_automacao.sql`
(campos de lapidação/erro/fonte, reserva atômica e bucket privado `base3d`). Sem elas, o módulo funciona em
modo local (navegador) e avisa na tela.

## Processador automático

Roda na máquina Windows de produção e liga o Freela Hub ao motor:

```powershell
setx SUPABASE_URL "https://<projeto>.supabase.co"
setx SUPABASE_SERVICE_ROLE_KEY "<chave de serviço>"     # só nesta máquina; nunca no front-end ou no repositório
python -m base3d.processador                            # escuta a cada 60 s (--uma-vez para um pedido só)
```

Reserva o pedido com `base3d_reservar_pedido` (dois processadores nunca pegam o mesmo), monta `pedido.json`,
KML e lapidações, roda o motor, envia o ZIP para `base3d/<pedido>/<Rnn>/` e registra a rodada. Falhas deixam o
pedido em "erro" com a mensagem, sem travar a fila. Pode rodar como Tarefa Agendada do Windows.

## Extensão SketchUp

`extensao_sketchup/base3d_cenografia.rbz` vai em todo pacote (ou `python -m base3d extensao`). Depois de
instalar (Extensões > Gerenciador de extensões > Instalar extensão), o menu **Extensões > Base 3D** oferece:

- **Ficha do objeto selecionado:** fonte, confiança, método de cada atributo e `id_origem`;
- **Sobre esta base:** origem local, CRS, datum vertical, versão do gerador;
- **Destacar por método de obtenção:** pinta cada objeto pela confiança (azul medido, verde oficial, amarelo
  calculado, vermelho estimado, cinza visual) — **Restaurar cores** ou Ctrl+Z voltam;
- **Exportar vistas de todas as cenas:** PNG em 4K de cada cena, as vistas do nível detalhado;
- **Nova cena aqui:** cria um ponto de vista `PV_nn` a partir da câmera atual.

## Fonte OpenStreetMap (fora do Rio)

`fonte: osm` usa Overpass (com servidores alternativos e cache) e o Copernicus DEM de 90 m via Open-Meteo.
Prédios com `height` entram como atributo; com `building:levels`, altura derivada (3 m/pavimento). Pistas usam
`width`, `lanes` × 3,5 m ou a largura típica do tipo de via; a calçada é uma faixa estimada; calçadões, ciclovias,
água, praia, árvores e postes vêm do OSM quando mapeados. Precisão bem menor que a do cadastro do IPP: o
intermediário e o detalhado dependem das lapidações. A API gratuita do Open-Meteo é para uso não comercial.

## Limitações conhecidas

- Validado com dados sintéticos. A execução real contra os serviços do IPP e a gravação de SKP/DWG
  precisam ser testadas na máquina Windows (o ambiente de desenvolvimento não alcança `pgeo3.rio.rj.gov.br`).
- O método pista/calçada depende do cadastro do Rio (quadra = meio-fio; lote = alinhamento). Fora do Rio,
  `fonte: osm` estima larguras por tipo de via; para precisão, usar cadastro municipal via `fonte: local`.
- A extensão SketchUp e o processador foram testados com a API do SketchUp e o Supabase simulados; a primeira
  execução real deve ser acompanhada.
- Costa, areia, ciclovia interpretada, pinturas, árvores e postes não vêm do cadastro: entram por lapidação
  (ou por inventário, quando a fonte tiver).
- Renders fotorrealistas saem das cenas do .skp no motor de render (V-Ray, Enscape, D5); o motor gera as
  câmeras e vistas de conferência, não o render.
- A escala de textura no SKP (`SUTextureCreateFromFile`) precisa ser conferida no SketchUp na primeira entrega detalhada.
