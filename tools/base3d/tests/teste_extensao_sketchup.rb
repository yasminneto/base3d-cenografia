# Simula o mínimo da API do SketchUp para exercitar a lógica da extensão fora do programa.
$carregados = []
def file_loaded?(f) = $carregados.include?(f)
def file_loaded(f) = $carregados << f
module Sketchup
  class Group; end
  class ComponentInstance; end
end
module UI
  def self.menu(_) = Class.new { def add_submenu(_) = self; def add_item(*) = nil; def add_separator = nil }.new
end
$LOADED_FEATURES << 'sketchup.rb'
load File.expand_path('base3d_cenografia/main.rb', ARGV[0])
include V3A::Base3D
Dic = Struct.new(:h) do
  def keys = h.keys
  def [](k) = h[k]
end
raise 'pior' unless V3A::Base3D.pior_metodo(Dic.new({'metodo_geometria' => 'source_attribute', 'metodo_altura' => 'estimated', 'fonte' => 'IPP'})) == 'estimated'
raise 'simples' unless V3A::Base3D.pior_metodo(Dic.new({'metodo' => 'derived'})) == 'derived'
raise 'vazio' unless V3A::Base3D.pior_metodo(Dic.new({'fonte' => 'x'})).nil?
raise 'html' unless V3A::Base3D.h('<b>') == '&lt;b&gt;'
puts 'ok: lógica da extensão'
