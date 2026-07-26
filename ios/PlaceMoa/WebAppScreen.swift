import SwiftUI
import WebKit

struct WebAppScreen: View {
    let url: URL
    let sharedURL: URL?

    @State private var canGoBack = false
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var reloadToken = UUID()

    var body: some View {
        ZStack(alignment: .top) {
            WebView(
                url: url,
                sharedURL: sharedURL,
                reloadToken: reloadToken,
                canGoBack: $canGoBack,
                isLoading: $isLoading,
                loadError: $loadError
            )
            .ignoresSafeArea(.container, edges: .bottom)

            if isLoading {
                ProgressView()
                    .controlSize(.large)
                    .padding(.top, 18)
            }

            if let loadError {
                VStack(spacing: 14) {
                    Text("장소모아를 불러오지 못했어요")
                        .font(.headline)
                    Text(loadError)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("다시 시도") {
                        self.loadError = nil
                        reloadToken = UUID()
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding(24)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(red: 0.94, green: 0.91, blue: 0.87))
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                if canGoBack {
                    Button {
                        NotificationCenter.default.post(name: .placeMoaGoBack, object: nil)
                    } label: {
                        Label("뒤로", systemImage: "chevron.left")
                    }
                }
            }

            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    reloadToken = UUID()
                } label: {
                    Label("새로고침", systemImage: "arrow.clockwise")
                }
            }
        }
    }
}

private struct WebView: UIViewRepresentable {
    let url: URL
    let sharedURL: URL?
    let reloadToken: UUID
    @Binding var canGoBack: Bool
    @Binding var isLoading: Bool
    @Binding var loadError: String?

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.applicationNameForUserAgent = "PlaceMoa"
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.backgroundColor = UIColor(red: 0.97, green: 0.97, blue: 0.97, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.isOpaque = false

        // 공유 익스텐션과 동일한 익명 계정(uid)으로 보이도록 쿠키 동기화 후 로드
        let target = resolvedURL()
        syncSharedIdentity(store: configuration.websiteDataStore.httpCookieStore) {
            webView.load(URLRequest(url: target))
        }

        context.coordinator.webView = webView
        context.coordinator.goBackObserver = NotificationCenter.default.addObserver(
            forName: .placeMoaGoBack,
            object: nil,
            queue: .main
        ) { [weak webView] _ in
            if webView?.canGoBack == true {
                webView?.goBack()
            }
        }
        // 공유 익스텐션이 백그라운드로 장소를 저장한 뒤 앱이 포그라운드로 오면 목록을 새로고침
        context.coordinator.reloadObserver = NotificationCenter.default.addObserver(
            forName: .placeMoaReload,
            object: nil,
            queue: .main
        ) { [weak webView] _ in
            webView?.reload()
        }

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // 1) 공유 링크가 새로 들어오면 reloadToken과 무관하게 항상 /add 로 이동해 분석
        if context.coordinator.lastSharedURL != sharedURL {
            context.coordinator.lastSharedURL = sharedURL
            context.coordinator.lastReloadToken = reloadToken
            loadError = nil
            if sharedURL != nil {
                webView.load(URLRequest(url: resolvedURL()))
                return
            }
        }

        // 2) 새로고침/재시도 버튼(reloadToken 변경) 처리
        guard context.coordinator.lastReloadToken != reloadToken else { return }
        context.coordinator.lastReloadToken = reloadToken
        loadError = nil

        if webView.url == nil {
            webView.load(URLRequest(url: resolvedURL()))
        } else {
            webView.reload()
        }
    }

    // 웹 쿠키(moa_uid)와 App Group의 공유 uid를 일치시킨다.
    // - 기존 웹 쿠키가 있으면 그 값을 App Group에 반영(기존 데이터 보존, 익스텐션이 동일 계정 사용)
    // - 없으면 App Group uid(없으면 생성)를 쿠키로 심는다
    private func syncSharedIdentity(store: WKHTTPCookieStore, completion: @escaping () -> Void) {
        let group = UserDefaults(suiteName: "group.com.jihyun.placemoa")
        let host = url.host ?? "place-moaa.vercel.app"

        store.getAllCookies { cookies in
            let cookieUid = cookies.first(where: { $0.name == "moa_uid" && !$0.value.isEmpty })?.value

            // App Group의 uid가 유일한 기준. 익스텐션이 저장한 계정과 반드시 일치해야 하므로
            // App Group에 값이 있으면 그걸 채택하고(절대 덮어쓰지 않음), 없을 때만
            // 기존 웹 쿠키(있으면 기존 데이터 보존) 또는 새 uid로 초기화한다.
            let uid: String
            if let existing = group?.string(forKey: "moaUid"), !existing.isEmpty {
                uid = existing
            } else {
                uid = cookieUid ?? UUID().uuidString
                group?.set(uid, forKey: "moaUid")
                group?.synchronize()
            }

            // 웹 쿠키를 항상 App Group uid로 강제(미들웨어가 다른 값을 심는 것 방지 + 익스텐션 저장분과 동일 계정 보장)
            if cookieUid == uid {
                completion()
                return
            }
            let props: [HTTPCookiePropertyKey: Any] = [
                .domain: host,
                .path: "/",
                .name: "moa_uid",
                .value: uid,
                .expires: Date(timeIntervalSinceNow: 60 * 60 * 24 * 365 * 2),
            ]
            if let cookie = HTTPCookie(properties: props) {
                store.setCookie(cookie) { completion() }
            } else {
                completion()
            }
        }
    }

    private func resolvedURL() -> URL {
        guard let sharedURL else { return url }

        // 공유된 링크는 /add 페이지로 보내 웹에서 자동으로 AI 분석 → 장소 추가
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        components?.path = "/add"
        components?.queryItems = [URLQueryItem(name: "url", value: sharedURL.absoluteString)]

        return components?.url ?? url
    }

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        if let observer = coordinator.goBackObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        if let observer = coordinator.reloadObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var parent: WebView
        weak var webView: WKWebView?
        var goBackObserver: NSObjectProtocol?
        var reloadObserver: NSObjectProtocol?
        var lastReloadToken: UUID
        var lastSharedURL: URL?

        init(_ parent: WebView) {
            self.parent = parent
            lastReloadToken = parent.reloadToken
            lastSharedURL = parent.sharedURL
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            parent.isLoading = true
            parent.loadError = nil
            parent.canGoBack = webView.canGoBack
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.isLoading = false
            parent.canGoBack = webView.canGoBack
            verifyRenderedContent(in: webView)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            fail(error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            fail(error)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let targetURL = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if ["http", "https"].contains(targetURL.scheme?.lowercased()) {
                decisionHandler(.allow)
                return
            }

            UIApplication.shared.open(targetURL) { opened in
                if !opened, targetURL.scheme?.lowercased() == "nmap" {
                    let query = URLComponents(url: targetURL, resolvingAgainstBaseURL: false)?
                        .queryItems?
                        .first(where: { $0.name == "query" })?
                        .value ?? ""
                    let fallback = URL(string: "https://map.naver.com/p/search/\(query.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? query)")
                    if let fallback {
                        webView.load(URLRequest(url: fallback))
                    }
                }
            }
            decisionHandler(.cancel)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil {
                webView.load(navigationAction.request)
            }

            return nil
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            parent.isLoading = true
            parent.loadError = nil
            webView.reload()
        }

        private func fail(_ error: Error) {
            let nsError = error as NSError
            guard nsError.code != NSURLErrorCancelled else { return }

            parent.isLoading = false
            parent.loadError = nsError.localizedDescription
            parent.canGoBack = webView?.canGoBack ?? false
        }

        private func verifyRenderedContent(in webView: WKWebView) {
            let script = """
            (() => {
              const text = (document.body && document.body.innerText || '').trim();
              const html = (document.body && document.body.innerHTML || '').trim();
              return {
                readyState: document.readyState,
                title: document.title || '',
                textLength: text.length,
                htmlLength: html.length,
                url: location.href
              };
            })()
            """

            webView.evaluateJavaScript(script) { [weak self] value, error in
                guard let self else { return }

                if let error {
                    self.parent.loadError = "웹 화면 스크립트를 실행하지 못했어요: \(error.localizedDescription)"
                    return
                }

                guard let result = value as? [String: Any] else { return }
                let htmlLength = result["htmlLength"] as? Int ?? 0

                if htmlLength == 0 {
                    let currentURL = result["url"] as? String ?? webView.url?.absoluteString ?? self.parent.url.absoluteString
                    self.parent.loadError = "웹 페이지가 비어 있어요. 주소를 확인해 주세요: \(currentURL)"
                }
            }
        }
    }
}

extension Notification.Name {
    static let placeMoaGoBack = Notification.Name("PlaceMoaGoBack")
    static let placeMoaReload = Notification.Name("PlaceMoaReload")
}
