import ExpoModulesCore

// Expo native module exposing a single SwiftUI-backed view, "AuroraWrapped".
// It takes one prop — `payload` (a JSON string describing the slide) — and
// renders the Aurora-derived wrapped card in real SwiftUI. Mirrors the
// cross-platform RN/canvas card so the shared image stays consistent.
public final class AuroraWrappedModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AuroraWrapped")

    View(AuroraWrappedView.self) {
      Prop("payload") { (view: AuroraWrappedView, payload: String) in
        view.setPayload(payload)
      }
    }
  }
}
