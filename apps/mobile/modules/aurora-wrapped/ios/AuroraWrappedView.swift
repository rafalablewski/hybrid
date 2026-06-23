import ExpoModulesCore
import SwiftUI
import UIKit

// Hosts the SwiftUI `AuroraWrappedCard` inside an Expo view so React Native can
// mount it. The `payload` prop (JSON) is decoded into a `WrappedModel` and the
// SwiftUI root is rebuilt on each update. The whole view is a real UIView, so
// react-native-view-shot captures it for the share image.
public final class AuroraWrappedView: ExpoView {
  private var model = WrappedModel.empty
  private let host: UIHostingController<AuroraWrappedCard>

  public required init(appContext: AppContext? = nil) {
    host = UIHostingController(rootView: AuroraWrappedCard(model: WrappedModel.empty))
    super.init(appContext: appContext)

    clipsToBounds = true
    host.view.backgroundColor = .clear
    host.view.translatesAutoresizingMaskIntoConstraints = false
    addSubview(host.view)
    NSLayoutConstraint.activate([
      host.view.topAnchor.constraint(equalTo: topAnchor),
      host.view.bottomAnchor.constraint(equalTo: bottomAnchor),
      host.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      host.view.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
  }

  func setPayload(_ payload: String) {
    guard
      let data = payload.data(using: .utf8),
      let decoded = try? JSONDecoder().decode(WrappedModel.self, from: data)
    else { return }
    model = decoded
    host.rootView = AuroraWrappedCard(model: decoded)
  }
}
