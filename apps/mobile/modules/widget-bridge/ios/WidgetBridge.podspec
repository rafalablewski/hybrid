Pod::Spec.new do |s|
  s.name           = 'WidgetBridge'
  s.version        = '1.0.0'
  s.summary        = 'Feeds the HYBRID widget (App Group) and Watch app (WatchConnectivity) with the today snapshot.'
  s.description    = 'Local Expo module: writes the today snapshot to the App Group for WidgetKit and pushes it to the Watch as applicationContext.'
  s.author         = 'HYBRID'
  s.homepage       = 'https://github.com/rafalablewski/hybrid'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
end
