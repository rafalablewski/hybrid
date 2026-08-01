import ExpoModulesCore
import WidgetKit
import WatchConnectivity

// The phone side of the widget + Watch data path. See ../index.ts for the
// contract. The App Group suite is shared with the widget extension
// (targets/widget); the Watch gets the same JSON over WatchConnectivity
// because an App Group does not span two devices.

/// The suite the main app and the widget extension both declare. Keep in sync
/// with app.config.js (WITH_APPLE_TARGETS entitlements) and targets/widget.
private let APP_GROUP = "group.com.hybriddomain.xyz"
private let SNAPSHOT_KEY = "todaySnapshot"

/// WCSession requires a delegate before activate(); the callbacks themselves
/// have nothing to do — applicationContext is fire-and-forget by design.
private final class ConnectivityDelegate: NSObject, WCSessionDelegate {
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    // On (re)activation push whatever the app last published, so a Watch that
    // paired after the fact still gets a snapshot without waiting for the next
    // foreground.
    if activationState == .activated,
       let json = UserDefaults(suiteName: APP_GROUP)?.string(forKey: SNAPSHOT_KEY) {
      try? session.updateApplicationContext([SNAPSHOT_KEY: json])
    }
  }
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) {
    // Watch switched — reactivate for the new one.
    session.activate()
  }
}

public class WidgetBridgeModule: Module {
  private static let connectivityDelegate = ConnectivityDelegate()

  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    Function("publish") { (json: String) in
      // 1) The widget's data path: App Group defaults. Nil suite (entitlement
      //    not in this build) is fine — the widget doesn't exist then either.
      if let defaults = UserDefaults(suiteName: APP_GROUP) {
        defaults.set(json, forKey: SNAPSHOT_KEY)
      }

      // 2) Tell WidgetKit the timeline moved.
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }

      // 3) The Watch's data path: applicationContext keeps only the LATEST
      //    value, which is exactly right for a "today at a glance" payload.
      if WCSession.isSupported() {
        let session = WCSession.default
        if session.delegate == nil {
          session.delegate = Self.connectivityDelegate
        }
        if session.activationState == .activated {
          try? session.updateApplicationContext([SNAPSHOT_KEY: json])
        } else {
          session.activate() // the delegate pushes the stored snapshot on completion
        }
      }
    }
  }
}
