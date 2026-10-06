# Aprendizados incorporados do projeto paralelo

Origem: documento "Aprendizados para um agente que cria modelos 3D a partir de mapas"
(revisão de 05/10/2026), com os casos Shopping Cidade São Paulo, Rua Rodrigo de Brito
(Botafogo), Café Rio de Janeiro e o Topography Lab. Aquele projeto continua independente:
nada dele foi copiado nem alterado aqui. Este arquivo registra o que foi **adaptado** para o
motor `base3d`, o que ficou de fora e por quê.

## Adotado no motor (versão 1.1.0)

| Aprendizado | Como entrou no `base3d` |
|---|---|
| Confiança **por atributo**, não uma nota global | Campo `metodo` em toda superfície, árvore e poste (`surveyed`, `source_attribute`, `derived`, `estimated`, `visual_only`). Nas edificações, por atributo: `metodo_geometria`, `metodo_base`, `metodo_altura`. Lapidação aceita `metodo` (padrão `estimated`) |
| Procedência visível no modelador | Atributos gravados em Attribute Dictionary `base3d` de cada grupo e componente do `.skp`, em user strings do Rhino e nas propriedades do GeoJSON |
| ID estável da feição de origem | `id_origem` em cada edificação, para atualizar sem duplicar |
| Distâncias com os dois extremos declarados | `distancias_evento` no relatório e no LEIA-ME: do limite do evento até projeção da edificação, meio-fio modelado e eixo oficial, com pontos de origem e destino e o método de cada extremo. Avisa que eixo não é borda de pista |
| Projeções sobrepostas do mesmo prédio (A101/A103/A104) | Projeções com mais de 80% de sobreposição viram um volume só (fica o mais alto); a contagem entra nas pendências |
| Datum vertical não é resolvido por SIRGAS/UTM | `datum_vertical` por fonte; quando não declarado, pendência explícita: cotas valem para desnível relativo |
| Acesso público ≠ licença livre | `licenca` por fonte; IPP marcado como pendente de confirmação comercial, sobretudo edificações |
| MDT, não MDS | Registrado em `fontes.json`; o terreno usa MDT para não dobrar alturas |
| Resolução não é exatidão | Dito no LEIA-ME; a malha segue a grade do MDT (5 m), sem densificar |
| Manifesto com versão e parâmetros | `*_contrato.json` (versão do gerador, CRS, datum, origem, nível, entorno, fonte, licença, datas) gravado também no `.skp` e resumido no `.3dm`; o MANIFESTO já traz os checksums das fontes |
| Eixos declarados (o OBJ Y-up virou parede no caso Paulista) | OBJ com "Z para cima" no cabeçalho e no LEIA-ME; o relatório confere o envelope |
| Políticas do Google | LEIA-ME declara que nada vem de imagens ou malhas Google/Earth; o cliente só desenha o polígono |
| Vegetação só intencional | Árvores e postes entram apenas por inventário ou lapidação (já era assim) |
| Câmeras repetíveis para QA | Cenas calculadas da geometria, iguais entre revisões (já era assim) |

## Não adotado agora (e por quê)

- **Famílias de fachada / gramáticas arquitetônicas.** Úteis para o nível detalhado, mas o próprio
  estudo mostra que variedade aleatória não aproxima o prédio real. Só faz sentido com fotos
  autorizadas por edifício. Proposta: perfil arquitetônico opcional por edificação na lapidação
  (`perfil`, `pavimentos`, `fachada_principal`), com `metodo` próprio.
- **Fonte OSM/Overpass e GeoSampa (São Paulo).** Proposta de próximas fontes: `osm` (ODbL, com
  atribuição; recortes pequenos e retentativas por causa de HTTP 504) e `sp_geosampa` (LiDAR 2017
  para terreno; quadra fiscal por WFS). Não implementadas porque não dá para testar daqui.
- **Extensão Ruby com atualização incremental.** O motor grava o `.skp` pelo SDK. Uma extensão para
  atualizar o recorte dentro do modelo aberto (via `id_origem`, `persistent_id` e
  `start_operation`/`commit_operation`) é o passo seguinte, sem rodar Ruby arbitrário gerado por IA.
- **Add Location do SketchUp.** Pode servir de conferência rápida de contexto, mas usa Bing/DigitalGlobe
  e cobertura variável; não substitui as fontes municipais.
- **Câmera calibrada com fotos (COLMAP).** Fica para o nível detalhado com captura própria.

## Piloto recomendado (adaptado para o `base3d`)

Antes de investir em acabamento, provar no Windows, com Botafogo:

1. Rodar o mesmo pedido duas vezes e obter a mesma origem, unidades e contagens (VERIFICACAO idêntico).
2. Comparar área e altura dos volumes com as fontes (624 edificações do R03; tolerância conforme a fonte).
3. Abrir o `.skp` sem troca de eixo, sem dupla contagem de altura e com o norte correto.
4. Selecionar um prédio e ver fonte, `metodo_altura` e `id_origem` em Informações da entidade;
   calçadas sem medição aparecem como `derived` ou `estimated`.
5. Rodar uma lapidação e conferir que só os itens desenhados mudaram (status `lapidado_R1`).
