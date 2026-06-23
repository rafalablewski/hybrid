import SwiftUI

// ── Decoded payload (mirrors slidePayload() in app/workout.tsx) ──────────────
struct WStat: Codable, Identifiable { var id = UUID(); let label: String; let value: String
  enum CodingKeys: String, CodingKey { case label, value } }
struct WRow: Codable, Identifiable { var id = UUID(); let left: String; let right: String; let hot: Bool?
  enum CodingKeys: String, CodingKey { case left, right, hot } }
struct WBar: Codable, Identifiable { var id = UUID(); let label: String; let value: String; let pct: Double
  enum CodingKeys: String, CodingKey { case label, value, pct } }

struct WrappedModel: Codable {
  let kind: String
  let eyebrow: String
  var tracked: String = "Tracked with HYBRID."
  var title: String? = nil
  var stats: [WStat]? = nil
  var headline: String? = nil
  var rows: [WRow]? = nil
  var bars: [WBar]? = nil
  var emoji: String? = nil
  var text: String? = nil

  static let empty = WrappedModel(kind: "overview", eyebrow: "OVERVIEW")
}

private extension Color {
  init(hex: UInt) {
    self.init(.sRGB,
              red: Double((hex >> 16) & 0xff) / 255,
              green: Double((hex >> 8) & 0xff) / 255,
              blue: Double(hex & 0xff) / 255,
              opacity: 1)
  }
}

// The Aurora-derived wrapped card, in real SwiftUI: ink base, a system gradient,
// a lime + blue glow, a translucent .ultraThinMaterial slab, and the slide body.
struct AuroraWrappedCard: View {
  let model: WrappedModel

  private let chalk = Color(hex: 0xF3F4EF)
  private let ash = Color(hex: 0x8B8F86)
  private let lime = Color(hex: 0xC4F035)

  var body: some View {
    GeometryReader { geo in
      let w = geo.size.width
      let h = geo.size.height

      ZStack {
        LinearGradient(colors: [Color(hex: 0x141A2C), Color(hex: 0x0A0B0E)],
                       startPoint: .topLeading, endPoint: .bottomTrailing)

        glow(lime.opacity(0.18), w: w).frame(width: w, height: w)
          .position(x: w * 0.8, y: h * 0.14)
        glow(Color(hex: 0x0A84FF).opacity(0.18), w: w).frame(width: w * 1.1, height: w * 1.1)
          .position(x: w * 0.2, y: h * 0.85)

        RoundedRectangle(cornerRadius: w * 0.05)
          .fill(.ultraThinMaterial)
          .overlay(RoundedRectangle(cornerRadius: w * 0.05).stroke(Color.white.opacity(0.16), lineWidth: 1))
          .padding(w * 0.045)

        VStack(alignment: .leading, spacing: 0) {
          header(w)
          Spacer(minLength: 0)
          body(w)
          Spacer(minLength: 0)
          Text(model.tracked)
            .font(.system(size: w * 0.03, design: .monospaced))
            .foregroundColor(ash)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(w * 0.09)
      }
    }
    .aspectRatio(9.0 / 16.0, contentMode: .fit)
  }

  private func glow(_ color: Color, w: CGFloat) -> some View {
    Circle().fill(RadialGradient(colors: [color, .clear], center: .center, startRadius: 0, endRadius: w * 0.5))
  }

  private func header(_ w: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: w * 0.02) {
      HStack(spacing: 0) {
        Text("HYBRID").font(.system(size: w * 0.072, weight: .black)).foregroundColor(chalk)
        Text(".").font(.system(size: w * 0.072, weight: .black)).foregroundColor(lime)
      }
      Text(model.eyebrow.uppercased())
        .font(.system(size: w * 0.03, weight: .medium, design: .monospaced))
        .tracking(2).foregroundColor(lime)
    }
  }

  @ViewBuilder
  private func body(_ w: CGFloat) -> some View {
    switch model.kind {
    case "overview":
      VStack(alignment: .leading, spacing: w * 0.08) {
        Text(model.title ?? "Workout").font(.system(size: w * 0.088, weight: .black)).foregroundColor(chalk)
        HStack { ForEach(model.stats ?? []) { s in stat(s, w: w) } }
      }
    case "prs":
      VStack(alignment: .leading, spacing: w * 0.035) {
        Text(model.headline ?? "").font(.system(size: w * 0.07, weight: .heavy)).foregroundColor(lime)
        ForEach(model.rows ?? []) { r in
          HStack {
            Text((r.hot == true ? "🏆 " : "") + r.left).font(.system(size: w * 0.044, weight: .semibold)).foregroundColor(chalk)
            Spacer()
            Text(r.right).font(.system(size: w * 0.044, weight: .bold)).foregroundColor(r.hot == true ? lime : chalk)
          }
        }
      }
    case "muscle":
      VStack(alignment: .leading, spacing: w * 0.04) {
        ForEach(model.bars ?? []) { b in
          VStack(alignment: .leading, spacing: w * 0.015) {
            HStack {
              Text(b.label).font(.system(size: w * 0.04, weight: .semibold)).foregroundColor(chalk)
              Spacer()
              Text(b.value).font(.system(size: w * 0.035, design: .monospaced)).foregroundColor(ash)
            }
            GeometryReader { g in
              ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.10))
                Capsule().fill(lime).frame(width: g.size.width * CGFloat(max(4, b.pct)) / 100)
              }
            }.frame(height: w * 0.03)
          }
        }
      }
    default: // "fun"
      VStack(spacing: w * 0.05) {
        Text(model.emoji ?? "").font(.system(size: w * 0.22))
        Text(model.text ?? "").font(.system(size: w * 0.06, weight: .bold)).foregroundColor(chalk)
          .multilineTextAlignment(.center)
      }.frame(maxWidth: .infinity)
    }
  }

  private func stat(_ s: WStat, w: CGFloat) -> some View {
    VStack(spacing: w * 0.01) {
      Text(s.value).font(.system(size: w * 0.092, weight: .black)).foregroundColor(chalk)
      Text(s.label).font(.system(size: w * 0.03, design: .monospaced)).tracking(1).foregroundColor(ash)
    }.frame(maxWidth: .infinity)
  }
}
