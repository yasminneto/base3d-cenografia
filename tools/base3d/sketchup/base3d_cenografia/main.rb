# Base 3D Cenografia — comandos do menu Extensões > Base 3D.
#
# Lê os metadados que o motor grava no Attribute Dictionary 'base3d' de cada grupo e
# componente (fonte, confiança, método de obtenção, id de origem) e no próprio modelo
# (contrato: CRS, origem local, datum vertical, versão do gerador).
# Nenhum comando apaga geometria; os que mudam cores usam uma operação única (Ctrl+Z desfaz)
# e guardam o material original para a restauração.
require 'sketchup.rb'
require 'erb'

module V3A
  module Base3D
    DICIONARIO = 'base3d'.freeze
    DIC_VISUAL = 'base3d_visual'.freeze

    # Do mais ao menos confiável; o pior atributo define a cor do objeto.
    METODOS = {
      'surveyed' => ['Medido em levantamento', [52, 101, 164]],
      'source_attribute' => ['Atributo da base oficial', [56, 142, 60]],
      'derived' => ['Calculado de bases oficiais', [230, 167, 0]],
      'estimated' => ['Estimado / desenhado sobre imagem', [204, 51, 51]],
      'visual_only' => ['Só representação visual', [150, 150, 150]]
    }.freeze
    ORDEM = METODOS.keys.freeze

    def self.h(texto)
      ERB::Util.html_escape(texto.to_s)
    end

    def self.dicionario(ent)
      ent.respond_to?(:attribute_dictionary) ? ent.attribute_dictionary(DICIONARIO) : nil
    end

    # Pior método entre os atributos do objeto (metodo, metodo_geometria, metodo_base, metodo_altura).
    def self.pior_metodo(dic)
      metodos = dic.keys.select { |k| k == 'metodo' || k.start_with?('metodo_') }.map { |k| dic[k].to_s }
      metodos.select { |m| ORDEM.include?(m) }.max_by { |m| ORDEM.index(m) }
    end

    def self.cada_objeto(entidades, &bloco)
      entidades.each do |e|
        next unless e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
        yield e
        cada_objeto(e.definition.entities, &bloco)
      end
    end

    def self.tabela(pares)
      linhas = pares.map { |k, v| "<tr><th>#{h(k)}</th><td>#{h(v)}</td></tr>" }.join
      "<table>#{linhas}</table>"
    end

    def self.dialogo(titulo, corpo, largura = 520, altura = 560)
      d = UI::HtmlDialog.new(dialog_title: titulo, preferences_key: "v3a_base3d_#{titulo}",
                             width: largura, height: altura, style: UI::HtmlDialog::STYLE_DIALOG)
      d.set_html(<<~HTML)
        <html><head><meta charset="utf-8"><style>
          body{font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#26353d;margin:14px}
          h2{font-size:14px;margin:0 0 8px} table{border-collapse:collapse;width:100%}
          th{text-align:left;width:40%;color:#5a6b73;font-weight:600;padding:4px 6px;vertical-align:top}
          td{padding:4px 6px;border-bottom:1px solid #eee} .nota{color:#5a6b73;margin-top:10px}
          .cor{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:middle}
        </style></head><body>#{corpo}</body></html>
      HTML
      d.show
      d
    end

    # ---------------------------------------------------------------- comandos
    def self.ficha_selecao
      model = Sketchup.active_model
      ent = model.selection.find { |e| dicionario(e) }
      unless ent
        UI.messagebox('Selecione um grupo ou componente gerado pelo Base 3D (prédio, superfície, árvore, poste).')
        return
      end
      dic = dicionario(ent)
      pares = dic.keys.sort.map { |k| [k, dic[k]] }
      metodo = pior_metodo(dic)
      legenda = metodo ? "<p class='nota'>Método mais fraco deste objeto: <b>#{h(METODOS[metodo][0])}</b>.</p>" : ''
      dialogo('Base 3D — ficha do objeto', "<h2>#{h(ent.name.empty? ? ent.definition.name : ent.name)}</h2>" \
              "#{tabela(pares)}#{legenda}<p class='nota'>Projeção cadastral não é fachada medida. " \
              'Itens estimados devem ser conferidos em vistoria.</p>')
    end

    def self.sobre_base
      model = Sketchup.active_model
      dic = model.attribute_dictionary(DICIONARIO)
      unless dic
        UI.messagebox('Este modelo não tem o contrato do Base 3D (foi gerado por outra ferramenta ou versão antiga).')
        return
      end
      pares = dic.keys.sort.map { |k| [k, dic[k]] }
      dialogo('Base 3D — sobre esta base', "<h2>#{h(model.name)}</h2>#{tabela(pares)}" \
              "<p class='nota'>Para voltar às coordenadas UTM, some origem_local_E e origem_local_N às " \
              'coordenadas do modelo (em metros).</p>')
    end

    def self.destacar_metodos
      model = Sketchup.active_model
      materiais = {}
      METODOS.each do |chave, (_rotulo, rgb)|
        m = model.materials["Base3D_#{chave}"] || model.materials.add("Base3D_#{chave}")
        m.color = Sketchup::Color.new(*rgb)
        materiais[chave] = m
      end
      contagem = Hash.new(0)
      model.start_operation('Base 3D: destacar por método', true)
      cada_objeto(model.entities) do |e|
        dic = dicionario(e)
        next unless dic
        metodo = pior_metodo(dic)
        next unless metodo
        unless e.get_attribute(DIC_VISUAL, 'destacado')
          e.set_attribute(DIC_VISUAL, 'material_original', e.material ? e.material.name : '')
          e.set_attribute(DIC_VISUAL, 'destacado', true)
        end
        e.material = materiais[metodo]
        contagem[metodo] += 1
      end
      model.commit_operation
      legenda = METODOS.map do |chave, (rotulo, rgb)|
        "<tr><th><span class='cor' style='background:rgb(#{rgb.join(',')})'></span>#{h(rotulo)}</th>" \
          "<td>#{contagem[chave]} objeto(s)</td></tr>"
      end.join
      dialogo('Base 3D — destaque por método', "<h2>Como cada objeto foi obtido</h2><table>#{legenda}</table>" \
              "<p class='nota'>Use Extensões &gt; Base 3D &gt; Restaurar cores (ou Ctrl+Z) para voltar.</p>", 460, 340)
    end

    def self.restaurar_cores
      model = Sketchup.active_model
      n = 0
      model.start_operation('Base 3D: restaurar cores', true)
      cada_objeto(model.entities) do |e|
        next unless e.get_attribute(DIC_VISUAL, 'destacado')
        nome = e.get_attribute(DIC_VISUAL, 'material_original', '')
        e.material = nome.to_s.empty? ? nil : model.materials[nome]
        e.attribute_dictionaries.delete(DIC_VISUAL)
        n += 1
      end
      model.commit_operation
      UI.messagebox("#{n} objeto(s) com a cor original restaurada.")
    end

    def self.exportar_vistas
      model = Sketchup.active_model
      paginas = model.pages
      if paginas.size.zero?
        UI.messagebox('O modelo não tem cenas. As bases do Base 3D já vêm com cenas; crie uma com "Nova cena aqui".')
        return
      end
      pasta = UI.select_directory(title: 'Pasta para as vistas das cenas')
      return unless pasta
      escolha = UI.inputbox(['Largura (px)', 'Altura (px)'], ['3840', '2160'], 'Base 3D — resolução das vistas')
      return unless escolha
      largura, altura = escolha.map(&:to_i)
      opcoes = model.options['PageOptions']
      transicao = opcoes['ShowTransition']
      opcoes['ShowTransition'] = false
      atual = paginas.selected_page
      feitas = []
      begin
        paginas.each do |pagina|
          paginas.selected_page = pagina
          model.active_view.invalidate
          nome = pagina.name.gsub(/[^\w\-]+/, '_')
          arquivo = File.join(pasta, "#{nome}.png")
          ok = model.active_view.write_image(filename: arquivo, width: largura, height: altura,
                                             antialias: true, transparent: false)
          feitas << nome if ok
        end
      ensure
        paginas.selected_page = atual if atual
        opcoes['ShowTransition'] = transicao
      end
      UI.messagebox("#{feitas.size} vista(s) exportada(s) em:\n#{pasta}\n\nPara render fotorrealista, use estas " \
                    'mesmas cenas no V-Ray, Enscape ou D5.')
    end

    def self.nova_cena_aqui
      model = Sketchup.active_model
      nome = UI.inputbox(['Nome do ponto de vista'], ['Palco'], 'Base 3D — nova cena')
      return unless nome
      n = model.pages.count { |p| p.name.start_with?('PV_') } + 1
      model.start_operation('Base 3D: nova cena', true)
      model.pages.add(format('PV_%02d_%s', n, nome.first.to_s.gsub(/\s+/, '_')))
      model.commit_operation
    end

    unless file_loaded?(__FILE__)
      menu = UI.menu('Extensions').add_submenu('Base 3D')
      menu.add_item('Ficha do objeto selecionado') { ficha_selecao }
      menu.add_item('Sobre esta base (origem, CRS, datum)') { sobre_base }
      menu.add_separator
      menu.add_item('Destacar por método de obtenção') { destacar_metodos }
      menu.add_item('Restaurar cores') { restaurar_cores }
      menu.add_separator
      menu.add_item('Exportar vistas de todas as cenas…') { exportar_vistas }
      menu.add_item('Nova cena aqui (ponto de vista)…') { nova_cena_aqui }
      file_loaded(__FILE__)
    end
  end
end
