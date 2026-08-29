import CoreLocation
import Foundation

/// Tracks location, distance and rolling pace, and streams pace samples to the API.
///
/// Pace is computed over a rolling window of recent fixes rather than from
/// `CLLocation.speed`, which is noisy on phones; samples are only sent every
/// `sampleInterval` seconds so the server-side debounce/cooldown logic stays
/// the single source of truth for when a roast fires.
@MainActor
final class RunTracker: NSObject, ObservableObject {
    @Published private(set) var distanceKm: Double = 0
    @Published private(set) var currentPaceSecPerKm: Double = 0
    @Published private(set) var elapsedSec: Double = 0
    @Published private(set) var isTracking = false
    @Published private(set) var lastRoast: String?
    @Published private(set) var errorMessage: String?

    var api: RunHackAPI
    var sessionID: String?
    var runnerName: String = "Isaac"

    private let manager = CLLocationManager()
    private let sampleInterval: TimeInterval = 15
    private let paceWindow: TimeInterval = 60
    private var startedAt: Date?
    private var lastSampleAt: Date?
    private var lastLocation: CLLocation?
    private var recentFixes: [(at: Date, distanceKm: Double)] = []

    init(api: RunHackAPI) {
        self.api = api
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.activityType = .fitness
        manager.distanceFilter = 5
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = false
    }

    func requestAuthorization() {
        manager.requestWhenInUseAuthorization()
    }

    func start() {
        distanceKm = 0
        elapsedSec = 0
        currentPaceSecPerKm = 0
        lastRoast = nil
        errorMessage = nil
        lastLocation = nil
        recentFixes = []
        startedAt = Date()
        lastSampleAt = Date()
        isTracking = true
        manager.startUpdatingLocation()
    }

    /// Stops tracking and posts the completed run to the leaderboard.
    func finish() async {
        manager.stopUpdatingLocation()
        isTracking = false
        guard let startedAt, distanceKm > 0 else { return }

        do {
            _ = try await api.finishRun(
                runnerName: runnerName,
                distanceKm: distanceKm,
                durationSec: Date().timeIntervalSince(startedAt),
                name: "iPhone tracked run"
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func ingest(_ location: CLLocation) {
        guard location.horizontalAccuracy >= 0, location.horizontalAccuracy < 50 else { return }

        if let previous = lastLocation {
            distanceKm += location.distance(from: previous) / 1000
        }
        lastLocation = location

        let now = Date()
        if let startedAt { elapsedSec = now.timeIntervalSince(startedAt) }

        recentFixes.append((at: now, distanceKm: distanceKm))
        recentFixes.removeAll { now.timeIntervalSince($0.at) > paceWindow }
        if let oldest = recentFixes.first, distanceKm > oldest.distanceKm {
            currentPaceSecPerKm = now.timeIntervalSince(oldest.at) / (distanceKm - oldest.distanceKm)
        }

        guard let lastSampleAt, now.timeIntervalSince(lastSampleAt) >= sampleInterval else { return }
        self.lastSampleAt = now
        sendSample()
    }

    private func sendSample() {
        guard let sessionID, currentPaceSecPerKm > 0 else { return }
        let pace = currentPaceSecPerKm
        let distance = distanceKm

        Task {
            do {
                if let roast = try await api.sendSample(sessionID: sessionID, paceSecPerKm: pace, distanceKm: distance) {
                    lastRoast = roast.text
                    if let urlString = roast.audio?.url, let url = URL(string: urlString) {
                        RoastAudioPlayer.shared.play(url: url)
                    }
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

extension RunTracker: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in self.ingest(location) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.errorMessage = error.localizedDescription }
    }
}
