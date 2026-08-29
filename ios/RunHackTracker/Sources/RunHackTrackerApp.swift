import SwiftUI

@main
struct RunHackTrackerApp: App {
    /// Point this at the machine running `npm run dev:api` (LAN IP or tunnel).
    private static let apiBaseURL = URL(string: "http://localhost:8787")!

    @StateObject private var tracker = RunTracker(api: RunHackAPI(baseURL: apiBaseURL))

    var body: some Scene {
        WindowGroup {
            TrackerView(tracker: tracker)
        }
    }
}
