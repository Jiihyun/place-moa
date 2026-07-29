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

        // 공유 익스텐션과 동일한 익명 계정(uid)으로 로드. resolvedURL()이 ?u=<IDFV>를
        // 실어 보내면 서버(미들웨어)가 moa_uid 쿠키를 확정한다 — WKWebView 쿠키스토어
        // 타이밍에 의존하던 방식이 랜덤 계정으로 갈리던 문제를 없앤다.
        webView.load(URLRequest(url: resolvedURL()))

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

    // 익명 계정 uid. 공유 익스텐션과 동일하게 identifierForVendor를 쓴다
    // (같은 벤더의 앱·익스텐션이 동일 값 → 저장 계정 일치).
    private func sharedUid() -> String {
        UIDevice.current.identifierForVendor?.uuidString ?? "moa-shared-fallback"
    }

    // 로드 URL에 항상 ?u=<uid>를 실어 서버가 moa_uid 쿠키를 확정하게 한다.
    // (WKWebView 쿠키스토어 타이밍에 의존하지 않는 확실한 계정 동기화)
    private func resolvedURL() -> URL {
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        var items = [URLQueryItem(name: "u", value: sharedUid())]

        if let sharedURL {
            // 공유된 링크는 /add 페이지로 보내 웹에서 자동으로 AI 분석 → 장소 추가
            components?.path = "/add"
            items.append(URLQueryItem(name: "url", value: sharedURL.absoluteString))
        }
        components?.queryItems = items

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
