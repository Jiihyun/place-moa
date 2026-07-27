import SwiftUI

@main
struct PlaceMoaApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var sharedURL: URL?
    @State private var wasBackgrounded = false

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                WebAppScreen(url: AppConfig.webURL, sharedURL: sharedURL)
            }
            .onAppear {
                consumeQueuedShare()
            }
            .onOpenURL { url in
                sharedURL = AppConfig.sharedURL(from: url)
                consumeQueuedShare()
            }
            .onChange(of: scenePhase) { phase in
                switch phase {
                case .active:
                    consumeQueuedShare()
                    // 백그라운드(공유 익스텐션이 장소를 저장했을 수 있음)에서 돌아오면
                    // 웹 목록을 새로고침해 방금 저장된 장소를 보이게 한다.
                    if wasBackgrounded {
                        wasBackgrounded = false
                        NotificationCenter.default.post(name: .placeMoaReload, object: nil)
                    }
                case .background:
                    wasBackgrounded = true
                default:
                    break
                }
            }
        }
    }

    private func consumeQueuedShare() {
        guard let url = SharedShareInbox.popNextURL() else { return }
        sharedURL = url
    }
}

enum AppConfig {
    static var webURL: URL {
        var components = URLComponents()
        components.scheme = bundleValue("PlaceMoaWebScheme", fallback: "https")
        components.host = bundleValue("PlaceMoaWebHost", fallback: "place-moa-kr.vercel.app")
        components.path = bundleValue("PlaceMoaWebPath", fallback: "")

        if let port = Int(bundleValue("PlaceMoaWebPort", fallback: "")) {
            components.port = port
        }

        guard let url = components.url else {
            preconditionFailure("Invalid PlaceMoa web URL configuration")
        }

        return url
    }

    private static func bundleValue(_ key: String, fallback: String) -> String {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String else {
            return fallback
        }

        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || trimmed.hasPrefix("$(") ? fallback : trimmed
    }

    static func sharedURL(from url: URL) -> URL? {
        guard url.scheme == "placemoa", url.host == "share" else { return nil }

        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        guard let rawURL = components?.queryItems?.first(where: { $0.name == "url" })?.value else {
            return nil
        }

        return URL(string: rawURL)
    }
}

enum SharedShareInbox {
    private static let suiteName = "group.com.jihyun.placemoa"
    private static let key = "pendingSharedURLs"

    static func popNextURL() -> URL? {
        guard let defaults = UserDefaults(suiteName: suiteName) else { return nil }

        var values = defaults.stringArray(forKey: key) ?? []
        guard !values.isEmpty else { return nil }

        let raw = values.removeFirst()
        defaults.set(values, forKey: key)
        defaults.synchronize()

        return URL(string: raw)
    }
}
