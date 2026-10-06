# Base 3D Cenografia — extensão para SketchUp 2026.
# Instalação: Extensões > Gerenciador de extensões > Instalar extensão > base3d_cenografia.rbz
require 'sketchup.rb'
require 'extensions.rb'

module V3A
  module Base3D
    VERSAO = '1.0.0'.freeze

    unless file_loaded?(__FILE__)
      ext = SketchupExtension.new('Base 3D Cenografia', 'base3d_cenografia/main')
      ext.description = 'Ferramentas para as bases geradas pelo motor Base 3D: ficha de procedência, ' \
                        'destaque por método de obtenção e exportação das vistas das cenas.'
      ext.version = VERSAO
      ext.creator = 'V3A'
      Sketchup.register_extension(ext, true)
      file_loaded(__FILE__)
    end
  end
end
