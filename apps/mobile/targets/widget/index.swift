import WidgetKit
import SwiftUI

// The HYBRID widget — today's session, the streak, one tap to start.
// "A free daily impression on the athlete's home screen" (the strategy
// review's table stakes). Data arrives via the App Group snapshot the app
// publishes on foreground (modules/widget-bridge); the widget renders what it
// has and says so honestly when the app hasn't run yet.

private let APP_GROUP = "group.com.hybriddomain.xyz"
private let SNAPSHOT_KEY = "todaySnapshot"

struct TodaySnapshot: Decodable {
  var title: String
  var sub: String
  var streak: Int
  var done: Bool
  var updatedAt: String
}

func loadSnapshot() -> TodaySnapshot? {
  guard
    let json = UserDefaults(suiteName: APP_GROUP)?.string(forKey: SNAPSHOT_KEY),
    let data = json.data(using: .utf8)
  else { return nil }
  return try? JSONDecoder().decode(TodaySnapshot.self, from: data)
}

struct TodayEntry: TimelineEntry {
  let date: Date
  let snapshot: TodaySnapshot?
}

struct TodayProvider: TimelineProvider {
  func placeholder(in context: Context) -> TodayEntry {
    TodayEntry(date: .now, snapshot: TodaySnapshot(title: "Upper body — day 12", sub: "Week 3 of 8", streak: 6, done: false, updatedAt: ""))
  }
  func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
    completion(TodayEntry(date: .now, snapshot: loadSnapshot()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
    // The app republishes on every foreground; between foregrounds the data
    // cannot change, so a slow self-refresh (to roll the date over midnight)
    // is all the timeline needs.
    let entry = TodayEntry(date: .now, snapshot: loadSnapshot())
    let next = Calendar.current.date(byAdding: .minute, value: 60, to: .now)!
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

struct TodayWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: TodayEntry

  private var lime: Color { Color(red: 0.776, green: 0.973, blue: 0.310) }
  private var chalk: Color { Color(red: 0.918, green: 0.890, blue: 0.831) }
  private var ash: Color { Color(red: 0.545, green: 0.561, blue: 0.525) }

  var body: some View {
    Group {
      switch family {
      case .accessoryCircular: circular
      case .accessoryRectangular: rectangular
      default: home
      }
    }
    .widgetURL(URL(string: "hybrid://"))
  }

  // Lock screen, circular: the streak — the number the athlete protects.
  private var circular: some View {
    VStack(spacing: 0) {
      Text("\(entry.snapshot?.streak ?? 0)").font(.system(size: 20, weight: .heavy, design: .rounded))
      Text("DAYS").font(.system(size: 8, weight: .bold)).opacity(0.7)
    }
  }

  // Lock screen, rectangular: title + state.
  private var rectangular: some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(entry.snapshot?.done == true ? "Done today" : "Today")
        .font(.system(size: 11, weight: .bold)).opacity(0.7)
      Text(entry.snapshot?.title ?? "Open HYBRID")
        .font(.system(size: 13, weight: .semibold)).lineLimit(2)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // Home screen (small + medium).
  private var home: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .firstTextBaseline) {
        Text(entry.snapshot?.done == true ? "DONE TODAY" : "TODAY")
          .font(.system(size: 10, weight: .bold, design: .monospaced))
          .foregroundStyle(entry.snapshot?.done == true ? lime : ash)
        Spacer()
        if let s = entry.snapshot, s.streak > 0 {
          Text("\(s.streak)d")
            .font(.system(size: 11, weight: .heavy, design: .monospaced))
            .foregroundStyle(lime)
        }
      }
      Spacer(minLength: 0)
      Text(entry.snapshot?.title ?? "Open HYBRID to plan today")
        .font(.system(size: family == .systemSmall ? 15 : 18, weight: .heavy))
        .foregroundStyle(chalk)
        .lineLimit(family == .systemSmall ? 3 : 2)
      if family != .systemSmall, let sub = entry.snapshot?.sub, !sub.isEmpty {
        Text(sub)
          .font(.system(size: 12, weight: .medium, design: .monospaced))
          .foregroundStyle(ash)
          .lineLimit(1)
      }
      Spacer(minLength: 0)
      if entry.snapshot?.done != true {
        Text("Start ›")
          .font(.system(size: 12, weight: .bold, design: .monospaced))
          .foregroundStyle(Color.black)
          .padding(.horizontal, 10).padding(.vertical, 4)
          .background(Capsule().fill(lime))
      }
    }
    .padding(2)
    .containerBackground(for: .widget) { Color(red: 0.047, green: 0.051, blue: 0.047) }
  }
}

struct HYBRIDTodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "HYBRIDToday", provider: TodayProvider()) { entry in
      TodayWidgetView(entry: entry)
    }
    .configurationDisplayName("Today")
    .description("Today's session, your streak, one tap to start.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
  }
}

@main
struct HYBRIDWidgets: WidgetBundle {
  var body: some Widget {
    HYBRIDTodayWidget()
  }
}
