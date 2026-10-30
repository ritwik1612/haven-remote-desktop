import UIKit
import WebKit
import AVFoundation

private let accent = UIColor(red: 0.60, green: 0.36, blue: 1, alpha: 1)

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        let nav = UINavigationController(rootViewController: HomeController())
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground(); appearance.backgroundColor = .black
        appearance.titleTextAttributes = [.foregroundColor: UIColor.white]
        nav.navigationBar.standardAppearance = appearance; nav.navigationBar.scrollEdgeAppearance = appearance
        nav.navigationBar.tintColor = accent
        window.rootViewController = nav; window.overrideUserInterfaceStyle = .dark
        window.makeKeyAndVisible(); self.window = window
        return true
    }
}

class HomeController: UIViewController, UITextFieldDelegate {
    private let address = UITextField()
    private let stack = UIStackView()
    private let savedKey = "haven.savedPC"
    override func viewDidLoad() {
        super.viewDidLoad(); title = "Haven"; view.backgroundColor = .black
        navigationItem.backButtonTitle = "Saved PC"
        let scroll = UIScrollView(); scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        stack.axis = .vertical; stack.spacing = 20; stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 24), stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -30),
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 24), stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -24),
            stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -48)
        ])
        rebuild()
    }
    override func viewWillAppear(_ animated: Bool) { super.viewWillAppear(animated); if isViewLoaded { rebuild() } }
    private func label(_ text: String, size: CGFloat = 15, color: UIColor = .lightGray) -> UILabel {
        let label = UILabel(); label.text = text; label.numberOfLines = 0
        label.font = .systemFont(ofSize: size, weight: size > 25 ? .bold : .regular); label.textColor = color
        return label
    }
    private func button(_ text: String, action: Selector, primary: Bool = true) -> UIButton {
        let b = UIButton(type: .system); var config = UIButton.Configuration.filled()
        config.title = text; config.baseBackgroundColor = primary ? accent : UIColor(white: 0.12, alpha: 1)
        config.baseForegroundColor = .white; config.cornerStyle = .large
        config.contentInsets = NSDirectionalEdgeInsets(top: 17, leading: 15, bottom: 17, trailing: 15)
        b.configuration = config; b.addTarget(self, action: action, for: .touchUpInside)
        return b
    }
    private func rebuild() {
        for child in stack.arrangedSubviews { stack.removeArrangedSubview(child); child.removeFromSuperview() }
        let logo = UIImageView(image: UIImage(named: "HavenLogo")); logo.contentMode = .scaleAspectFit
        logo.heightAnchor.constraint(equalToConstant: 64).isActive = true
        stack.addArrangedSubview(logo)
        stack.addArrangedSubview(label("Your space.\nNo distance.", size: 38, color: .white))
        if let saved = UserDefaults.standard.string(forKey: savedKey), HostAddress.parse(saved) != nil {
            stack.addArrangedSubview(label("SAVED PC", size: 12, color: accent))
            stack.addArrangedSubview(label(saved, size: 13))
            stack.addArrangedSubview(button("Connect saved PC", action: #selector(connectSaved)))
        }
        stack.addArrangedSubview(button("Scan QR · Pair a PC", action: #selector(scan), primary: false))
        stack.addArrangedSubview(label("Pair once. Your own six-digit PIN unlocks each new six-hour session. Keep Tailscale connected on both devices."))
        address.placeholder = "Laptop address · laptop.tailnet.ts.net"
        address.text = UserDefaults.standard.string(forKey: savedKey)
        address.keyboardType = .URL; address.autocapitalizationType = .none; address.autocorrectionType = .no
        address.borderStyle = .roundedRect; address.backgroundColor = UIColor(white: 0.08, alpha: 1)
        address.returnKeyType = .go; address.delegate = self
        address.heightAnchor.constraint(equalToConstant: 52).isActive = true
        address.accessibilityLabel = "Laptop Tailscale address"
        stack.addArrangedSubview(address)
        stack.addArrangedSubview(button("Connect with address", action: #selector(connectAddress), primary: false))
        stack.addArrangedSubview(label("On the PC: open Haven → Security to choose your PIN, then Connect phone to show a fresh pairing QR. Approve the phone once under Devices. Your PIN is never saved by this app.", size: 13))
    }
    func textFieldShouldReturn(_ textField: UITextField) -> Bool { connectAddress(); return true }
    @objc private func connectSaved() {
        if let saved = UserDefaults.standard.string(forKey: savedKey), let url = HostAddress.parse(saved) { open(url) }
    }
    @objc private func connectAddress() {
        guard let url = HostAddress.parse(address.text ?? "") else { message("Enter the private HTTPS .ts.net address shown in Haven on your PC."); return }
        open(url)
    }
    private func open(_ url: URL) {
        view.endEditing(true)
        UserDefaults.standard.set(HostAddress.savedAddress(url).absoluteString, forKey: savedKey)
        navigationController?.pushViewController(RemoteController(url: url), animated: true)
    }
    @objc private func scan() {
        let scanner = QRController()
        scanner.onScan = { [weak self] url in self?.open(url) }
        present(UINavigationController(rootViewController: scanner), animated: true)
    }
    private func message(_ text: String) {
        let alert = UIAlertController(title: "Haven", message: text, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default)); present(alert, animated: true)
    }
}

class RemoteController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let startURL: URL
    private var web: WKWebView!
    init(url: URL) { startURL = url; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidLoad() {
        super.viewDidLoad(); title = "Haven PC"; view.backgroundColor = .black
        let config = WKWebViewConfiguration(); config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        web = WKWebView(frame: .zero, configuration: config); web.navigationDelegate = self; web.uiDelegate = self
        web.isOpaque = false; web.backgroundColor = .black; web.scrollView.backgroundColor = .black
        web.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(web)
        NSLayoutConstraint.activate([web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),web.bottomAnchor.constraint(equalTo: view.bottomAnchor),web.leadingAnchor.constraint(equalTo: view.leadingAnchor),web.trailingAnchor.constraint(equalTo: view.trailingAnchor)])
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .refresh, target: self, action: #selector(retry))
        web.load(URLRequest(url: startURL))
    }
    @objc private func retry() { web.reload() }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, HostAddress.sameOrigin(url, startURL) else { decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        let alert = UIAlertController(title: "PC unreachable", message: "Check Tailscale on both devices and that your PC is awake. Your saved PC and pairing have not been removed.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Retry", style: .default) { [weak self] _ in guard let self = self else { return }; self.web.load(URLRequest(url: HostAddress.savedAddress(self.startURL))) })
        alert.addAction(UIAlertAction(title: "Saved PC", style: .cancel) { [weak self] _ in self?.navigationController?.popViewController(animated: true) })
        if presentedViewController == nil { present(alert, animated: true) }
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let permitted = origin.protocol == "https" && origin.host == startURL.host && (origin.port == 0 ? 443 : origin.port) == (startURL.port ?? 443) && frame.isMainFrame && type == .camera
        decisionHandler(permitted ? .prompt : .deny)
    }
}

class QRController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onScan: ((URL) -> Void)?
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "app.haven.camera")
    private let hint = UILabel()
    private var preview: AVCaptureVideoPreviewLayer?
    private let stateLock = NSLock()
    private var didFinish = false
    private var finished: Bool {
        get { stateLock.lock(); defer { stateLock.unlock() }; return didFinish }
        set { stateLock.lock(); didFinish = newValue; stateLock.unlock() }
    }
    override func viewDidLoad() {
        super.viewDidLoad(); title = "Scan Haven QR"; view.backgroundColor = .black
        navigationItem.leftBarButtonItem = UIBarButtonItem(barButtonSystemItem: .cancel, target: self, action: #selector(cancel))
        hint.text = "Point your camera at the pairing QR on your PC."; hint.textColor = .white; hint.numberOfLines = 0; hint.textAlignment = .center
        hint.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(hint)
        NSLayoutConstraint.activate([hint.leadingAnchor.constraint(equalTo: view.leadingAnchor,constant:24),hint.trailingAnchor.constraint(equalTo: view.trailingAnchor,constant:-24),hint.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor,constant:-24)])
        NotificationCenter.default.addObserver(self, selector: #selector(background), name: UIApplication.didEnterBackgroundNotification, object: nil)
        AVCaptureDevice.requestAccess(for: .video) { [weak self] allowed in
            guard let self = self else { return }
            if allowed { self.queue.async { self.configure() } }
            else { DispatchQueue.main.async { self.hint.text = "Camera permission is off. Allow it in Settings, or connect with your PC address and pairing code." } }
        }
    }
    private func configure() {
        guard !finished, let camera = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: camera), session.canAddInput(input) else { return }
        session.beginConfiguration(); session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { session.commitConfiguration(); return }
        session.addOutput(output); output.setMetadataObjectsDelegate(self, queue: .main); output.metadataObjectTypes = [.qr]; session.commitConfiguration()
        DispatchQueue.main.async { [weak self] in
            guard let self = self, !self.finished else { return }
            let layer = AVCaptureVideoPreviewLayer(session: self.session); layer.videoGravity = .resizeAspectFill
            self.view.layer.insertSublayer(layer, at: 0); self.preview = layer; self.view.setNeedsLayout()
        }
        if !finished { session.startRunning() }
    }
    override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); preview?.frame = view.bounds }
    override func viewWillDisappear(_ animated: Bool) { super.viewWillDisappear(animated); stop() }
    private func stop() { finished = true; queue.async { [session] in if session.isRunning { session.stopRunning() } } }
    @objc private func cancel() { stop(); dismiss(animated: true) }
    @objc private func background() { cancel() }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !finished, let value = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue else { return }
        guard let url = HostAddress.parse(value, pairing: true) else { hint.text = "Use a fresh Haven pairing QR from Connect phone on your PC."; return }
        let callback = onScan
        stop(); dismiss(animated: true) { callback?(url) }
    }
    deinit { NotificationCenter.default.removeObserver(self) }
}
