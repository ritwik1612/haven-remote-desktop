import Foundation

func check(_ value: Bool, _ message: String) { if !value { fatalError(message) } }
check(HostAddress.parse(" laptop.tailnet.ts.net ")?.absoluteString == "https://laptop.tailnet.ts.net:8443/connect", "Bare hostname normalization")
check(HostAddress.parse("https://laptop.ts.net:9443/connect")?.port == 9443, "Explicit port")
for invalid in ["http://laptop.ts.net", "https://laptop.ts.net.evil.com", "https://user:pass@laptop.ts.net", "https://laptop.ts.net/?pin=123456", "https://laptop.ts.net/admin", "https://laptop.ts.net:99999"] {
    check(HostAddress.parse(invalid) == nil, "Reject unsafe address: " + invalid)
}
let paired = HostAddress.parse("https://laptop.ts.net:8443/connect#pair=123456", pairing: true)!
check(HostAddress.savedAddress(paired).fragment == nil, "Never store pairing code")
check(HostAddress.parse("https://laptop.ts.net/connect#pair=12345", pairing: true) == nil, "Reject short QR")
check(HostAddress.parse("https://laptop.ts.net/connect#pair=123456&other=1", pairing: true) == nil, "Reject extra QR fields")
check(!HostAddress.sameOrigin(paired, URL(string:"https://other.ts.net:8443/connect")!), "Reject host switch")
check(!HostAddress.sameOrigin(paired, URL(string:"https://laptop.ts.net/connect")!), "Reject port switch")
print("All iOS host-address and QR security checks passed")
