import Foundation

enum HostAddress {
    static func parse(_ value: String, pairing: Bool = false) -> URL? {
        let raw = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var c = URLComponents(string: raw.contains("://") ? raw : "https://" + raw),
              c.scheme?.lowercased() == "https", let host = c.host?.lowercased(),
              host.hasSuffix(".ts.net"), c.user == nil, c.password == nil, c.query == nil,
              ["", "/", "/connect"].contains(c.path) else { return nil }
        if pairing {
            guard c.path == "/connect", let fragment = c.fragment,
                  fragment.range(of: "^pair=[0-9]{6}$", options: .regularExpression) != nil else { return nil }
        } else if c.fragment != nil { return nil }
        c.scheme = "https"; c.host = host; c.path = "/connect"
        if c.port == nil { c.port = 8443 }
        guard let port = c.port, (1...65535).contains(port) else { return nil }
        return c.url
    }
    static func savedAddress(_ url: URL) -> URL {
        var c = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        c.fragment = nil
        return c.url!
    }
    static func sameOrigin(_ a: URL, _ b: URL) -> Bool {
        a.scheme == b.scheme && a.host == b.host && (a.port ?? 443) == (b.port ?? 443)
    }
}
