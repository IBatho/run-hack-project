import SwiftUI

struct TrackerView: View {
    @ObservedObject var tracker: RunTracker

    @State private var sessions: [RunHackAPI.Session] = []
    @State private var selectedSessionID: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Session") {
                    Picker("Roast session", selection: $selectedSessionID) {
                        Text("None").tag(String?.none)
                        ForEach(sessions) { session in
                            Text("\(session.runnerName) · \(paceLabel(session.targetPaceSecPerKm))")
                                .tag(String?.some(session.id))
                        }
                    }
                    TextField("Runner name", text: $tracker.runnerName)
                }

                Section("Live") {
                    LabeledContent("Distance", value: String(format: "%.2f km", tracker.distanceKm))
                    LabeledContent("Pace", value: paceLabel(tracker.currentPaceSecPerKm))
                    LabeledContent("Elapsed", value: durationLabel(tracker.elapsedSec))
                }

                if let roast = tracker.lastRoast {
                    Section("Latest roast") { Text(roast) }
                }

                if let error = tracker.errorMessage {
                    Section("Error") { Text(error).foregroundStyle(.red) }
                }

                Section {
                    if tracker.isTracking {
                        Button("Finish run", role: .destructive) {
                            Task { await tracker.finish() }
                        }
                    } else {
                        Button("Start run") {
                            tracker.sessionID = selectedSessionID
                            tracker.start()
                        }
                        .disabled(selectedSessionID == nil)
                    }
                }
            }
            .navigationTitle("Run Hack")
            .task {
                tracker.requestAuthorization()
                sessions = (try? await tracker.api.listSessions()) ?? []
                selectedSessionID = sessions.first?.id
            }
        }
    }

    private func paceLabel(_ secPerKm: Double) -> String {
        guard secPerKm > 0 else { return "—" }
        let total = Int(secPerKm.rounded())
        return String(format: "%d:%02d/km", total / 60, total % 60)
    }

    private func durationLabel(_ seconds: Double) -> String {
        let total = Int(seconds)
        return String(format: "%02d:%02d", total / 60, total % 60)
    }
}
