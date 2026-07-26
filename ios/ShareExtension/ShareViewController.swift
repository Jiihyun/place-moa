import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let statusLabel = UILabel()
    private let spinner = UIActivityIndicatorView(style: .medium)

    // 웹 서비스 호스트 (메인 앱과 동일). 공유 익스텐션은 여기로 직접 분석 요청을 보낸다.
    private let ingestEndpoint = URL(string: "https://place-moaa.vercel.app/api/ingest")!
    private let appGroup = "group.com.jihyun.placemoa"

    override func viewDidLoad() {
        super.viewDidLoad()
        configureView()
        extractSharedURL()
    }

    private func configureView() {
        view.backgroundColor = UIColor(red: 0.97, green: 0.95, blue: 0.93, alpha: 1)

        statusLabel.text = "장소모아로 보내는 중…"
        statusLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        statusLabel.textColor = UIColor(red: 0.13, green: 0.13, blue: 0.13, alpha: 1)
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0
        statusLabel.translatesAutoresizingMaskIntoConstraints = false

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
            finish(message: "공유된 링크를 찾지 못했어요", delay: 1.4)
            return
        }

        let providers = extensionItems.flatMap { $0.attachments ?? [] }

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

        finish(message: "공유된 링크를 찾지 못했어요", delay: 1.4)
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
            finish(message: "공유된 링크를 찾지 못했어요", delay: 1.4)
            return
        }

        ingest(url)
    }

    private func firstURL(in text: String) -> URL? {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return detector?.firstMatch(in: text, options: [], range: range)?.url
    }

    // 백그라운드에서 서버에 분석 요청 → 단일=목록 / 다중=대기함 저장. 앱을 열지 않는다.
    private func ingest(_ sharedURL: URL) {
        DispatchQueue.main.async { self.statusLabel.text = "AI가 장소를 분석 중…" }

        var request = URLRequest(url: ingestEndpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // 메인 앱 WebView와 동일한 익명 계정(uid)로 저장되도록 쿠키를 실어 보낸다.
        request.setValue("moa_uid=\(sharedUid())", forHTTPHeaderField: "Cookie")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["url": sharedURL.absoluteString])
        request.timeoutInterval = 30

        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self else { return }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0

            if error != nil || status == 0 {
                // 네트워크 실패 — 앱에서 재시도할 수 있도록 인박스에 보관
                self.enqueue(sharedURL)
                self.finish(message: "지금 저장하지 못했어요.\n앱에서 다시 시도해 주세요", delay: 1.8)
                return
            }

            if status == 200, let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                self.markNeedsRefresh()
                if json["saved"] != nil {
                    self.finish(message: "저장됐어요! ✅\n목록·지도에서 확인하세요", delay: 1.4)
                } else if let pending = json["pending"] as? [String: Any],
                          let cands = pending["candidates"] as? [[String: Any]] {
                    self.finish(message: "장소 \(cands.count)곳을 찾았어요 ✨\n대기함에서 확정하세요", delay: 1.6)
                } else {
                    self.finish(message: "저장됐어요! ✅", delay: 1.4)
                }
                return
            }

            // 장소 못 찾음(422) 등 — 앱에서 캡션 붙여넣어 재시도
            self.enqueue(sharedURL)
            let msg = self.errorMessage(from: data) ?? "장소를 못 찾았어요.\n앱에서 캡션을 붙여넣어 보세요"
            self.finish(message: msg, delay: 2.0)
        }
        task.resume()
    }

    private func errorMessage(from data: Data?) -> String? {
        guard let data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let err = json["error"] as? String else { return nil }
        return err
    }

    // App Group에 저장되는 안정적 익명 uid. 메인 앱과 공유되어 저장 계정이 일치한다.
    private func sharedUid() -> String {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return UUID().uuidString }
        if let existing = defaults.string(forKey: "moaUid"), !existing.isEmpty {
            return existing
        }
        let uid = UUID().uuidString
        defaults.set(uid, forKey: "moaUid")
        defaults.synchronize()
        return uid
    }

    // 앱이 포그라운드로 올 때 목록을 새로고침하도록 플래그를 남긴다
    private func markNeedsRefresh() {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        defaults.set(true, forKey: "pendingRefresh")
        defaults.synchronize()
    }

    // 실패 시 재시도용으로 URL 보관 (앱이 열릴 때 /add 로 복구)
    private func enqueue(_ sharedURL: URL) {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        var values = defaults.stringArray(forKey: "pendingSharedURLs") ?? []
        let raw = sharedURL.absoluteString
        if !values.contains(raw) { values.append(raw) }
        defaults.set(values, forKey: "pendingSharedURLs")
        defaults.synchronize()
    }

    private func finish(message: String, delay: TimeInterval) {
        DispatchQueue.main.async {
            self.statusLabel.text = message
            self.spinner.stopAnimating()
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                self.extensionContext?.completeRequest(returningItems: nil)
            }
        }
    }
}
