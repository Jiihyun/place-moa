import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let statusLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        configureView()
        extractSharedURL()
    }

    private func configureView() {
        view.backgroundColor = UIColor(red: 0.97, green: 0.95, blue: 0.93, alpha: 1)

        statusLabel.text = "장소모아로 보내는 중..."
        statusLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        statusLabel.textColor = UIColor(red: 0.13, green: 0.13, blue: 0.13, alpha: 1)
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0
        statusLabel.translatesAutoresizingMaskIntoConstraints = false

        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.startAnimating()
        spinner.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(statusLabel)
        view.addSubview(spinner)

        NSLayoutConstraint.activate([
            statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            statusLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -14),
            spinner.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 14),
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
        ])
    }

    private func extractSharedURL() {
        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
            finishWithMessage("공유된 링크를 찾지 못했어요")
            return
        }

        let providers = extensionItems
            .flatMap { $0.attachments ?? [] }

        if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }) {
            provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] item, _ in
                self?.handle(item)
            }
            return
        }

        if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }) {
            provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] item, _ in
                self?.handle(item)
            }
            return
        }

        finishWithMessage("공유된 링크를 찾지 못했어요")
    }

    private func handle(_ item: NSSecureCoding?) {
        let url: URL?

        if let sharedURL = item as? URL {
            url = sharedURL
        } else if let text = item as? String {
            url = firstURL(in: text)
        } else {
            url = nil
        }

        guard let url else {
            finishWithMessage("공유된 링크를 찾지 못했어요")
            return
        }

        openContainingApp(with: url)
    }

    private func firstURL(in text: String) -> URL? {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return detector?
            .firstMatch(in: text, options: [], range: range)?
            .url
    }

    private func openContainingApp(with sharedURL: URL) {
        enqueue(sharedURL)

        var components = URLComponents()
        components.scheme = "placemoa"
        components.host = "share"
        components.queryItems = [
            URLQueryItem(name: "url", value: sharedURL.absoluteString),
        ]

        guard let appURL = components.url else {
            finishWithMessage("장소모아 앱을 열지 못했어요")
            return
        }

        DispatchQueue.main.async {
            self.statusLabel.text = "장소모아에서 AI 분석을 시작할게요"
            self.open(url: appURL)
        }
    }

    private func open(url: URL) {
        // 공유 익스텐션 → 컨테이너 앱 열기: responder chain의 openURL: 호출 (표준 방식).
        // 인박스에 이미 저장돼 있어(enqueue) 실행에 실패해도 앱을 열면 복구된다.
        let selector = NSSelectorFromString("openURL:")
        var responder: UIResponder? = self

        while let current = responder {
            if current.responds(to: selector) {
                _ = current.perform(selector, with: url)
                break
            }
            responder = current.next
        }

        // 어떤 경우에도 공유 시트는 닫는다.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            self.extensionContext?.completeRequest(returningItems: nil)
        }
    }

    private func enqueue(_ sharedURL: URL) {
        guard let defaults = UserDefaults(suiteName: "group.com.jihyun.placemoa") else { return }

        var values = defaults.stringArray(forKey: "pendingSharedURLs") ?? []
        let raw = sharedURL.absoluteString
        if !values.contains(raw) {
            values.append(raw)
        }
        defaults.set(values, forKey: "pendingSharedURLs")
        defaults.synchronize()
    }

    private func finishWithMessage(_ message: String) {
        DispatchQueue.main.async {
            self.statusLabel.text = message
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                self.extensionContext?.completeRequest(returningItems: nil)
            }
        }
    }
}
