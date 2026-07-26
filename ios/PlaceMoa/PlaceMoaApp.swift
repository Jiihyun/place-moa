import SwiftUI

@main
struct PlaceMoaApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var sharedURL: URL?

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                WebAppScreen(url: AppConfig.webURL, sharedURL: sharedURL)
            }
            .onAppear {
                consumeQueuedShare()
                refreshIfNeeded()
            }
            .onOpenURL { url in
                sharedURL = AppConfig.sharedURL(from: url)
                consumeQueuedShare()
            }
            .onChange(of: scenePhase) { phase in
                if phase == .active {
                    consumeQueuedShare()
                    refreshIfNeeded()
                }
            }
        }
    }

    private func consumeQueuedShare() {
        guard let url = SharedShareInbox.popNextURL() else { return }
        sharedURL = url
    }

    // 공유 익스텐션이 백그라운드로 장소를 저장하면 플래그를 남긴다.
    // 앱이 포그라운드로 오면 웹 목록을 새로고침해 방금 저장된 장소를 보이게 한다.
    private func refreshIfNeeded() {
        guard let defaults = UserDefaults(suiteName: "group.com.jihyun.placemoa"),
              defaults.bool(forKey: "pendingRefresh") else { return }
        defaults.set(false, forKey: "pendingRefresh")
        defaults.synchronize()
        NotificationCenter.default.post(name: .placeMoaReload, object: nil)
    }
}

enum AppConfig {
    static var webURL: URL {
        var components = URLComponents()
        components.scheme = bundleValue("PlaceMoaWebScheme", fallback: "https")
        components.host = bundleValue("PlaceMoaWebHost", fallback: "place-moaa.vercel.app")
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
