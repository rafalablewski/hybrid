import SwiftUI
import WatchConnectivity

// HYBRID on the wrist, v1 — today at a glance. The phone publishes a compact
// snapshot (modules/widget-bridge) as WatchConnectivity applicationContext;
// this app renders the latest one it has, including while the phone is out of
// reach (applicationContext survives). Honest empty state until the first
// publish. Logging from the wrist is the next rung, not this one.

struct TodaySnapshot: Decodable {
  var title: String
  var sub: String
  var streak: Int
  var done: Bool
  var updatedAt: String
}

final class SnapshotStore: NSObject, ObservableObject, WCSessionDelegate {
  @Published var snapshot: TodaySnapshot?

  override init() {
    super.init()
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
    // The last context received is cached by the system — render immediately.
    apply(session.receivedApplicationContext)
  }

  private func apply(_ context: [String: Any]) {
    guard
      let json = context["todaySnapshot"] as? String,
      let data = json.data(using: .utf8),
      let parsed = try? JSONDecoder().decode(TodaySnapshot.self, from: data)
    else { return }
    DispatchQueue.main.async { self.snapshot = parsed }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    apply(applicationContext)
  }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    apply(session.receivedApplicationContext)
  }
}

struct ContentView: View {
  @ObservedObject var store: SnapshotStore

  private var lime: Color { Color(red: 0.776, green: 0.973, blue: 0.310) }
  private var chalk: Color { Color(red: 0.918, green: 0.890, blue: 0.831) }
  private var ash: Color { Color(red: 0.545, green: 0.561, blue: 0.525) }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 6) {
        if let s = store.snapshot {
          HStack(alignment: .firstTextBaseline) {
            Text(s.done ? "DONE TODAY" : "TODAY")
              .font(.system(size: 11, weight: .bold, design: .monospaced))
              .foregroundStyle(s.done ? lime : ash)
            Spacer()
            if s.streak > 0 {
              Text("\(s.streak)d")
                .font(.system(size: 12, weight: .heavy, design: .monospaced))
                .foregroundStyle(lime)
            }
          }
          Text(s.title)
            .font(.system(size: 17, weight: .heavy))
            .foregroundStyle(chalk)
          if !s.sub.isEmpty {
            Text(s.sub)
              .font(.system(size: 12, weight: .medium, design: .monospaced))
              .foregroundStyle(ash)
          }
          if !s.done {
            Text("Log on your iPhone — the wrist logger is next.")
              .font(.system(size: 11))
              .foregroundStyle(ash)
              .padding(.top, 4)
          }
        } else {
          Text("HYBRID")
            .font(.system(size: 15, weight: .heavy))
            .foregroundStyle(lime)
          Text("Open HYBRID on your iPhone once and today's session will appear here.")
            .font(.system(size: 12))
            .foregroundStyle(ash)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

@main
struct HYBRIDWatchApp: App {
  @StateObject private var store = SnapshotStore()
  var body: some Scene {
    WindowGroup {
      ContentView(store: store)
    }
  }
}
