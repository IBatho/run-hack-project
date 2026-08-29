import Foundation

/// Minimal client for the run-hack-project API.
///
/// Mirrors `src/web/api.ts`: pace samples drive the Audio Roast Engine while
/// the run is live, and the finished run is posted as an activity so it lands
/// on the leaderboard with `source: "ios"`.
struct RunHackAPI {
    var baseURL: URL
    var session: URLSession = .shared

    struct Session: Decodable, Identifiable {
        let id: String
        let runnerName: String
        let targetPaceSecPerKm: Double
    }

    struct Roast: Decodable {
        let text: String
        let audio: AudioClip?

        struct AudioClip: Decodable {
            let url: String
        }
    }

    struct SampleResult: Decodable {
        let roast: Roast?
    }

    private struct SessionsResponse: Decodable {
        let sessions: [Session]
    }

    private struct ActivityResponse: Decodable {
        let activity: Activity

        struct Activity: Decodable {
            let id: String
            let avgPaceSecPerKm: Double
        }
    }

    func listSessions() async throws -> [Session] {
        try await get(SessionsResponse.self, path: "/api/sessions").sessions
    }

    /// Posts one pace sample; a non-nil roast means the threshold fired.
    func sendSample(sessionID: String, paceSecPerKm: Double, distanceKm: Double) async throws -> Roast? {
        try await post(
            SampleResult.self,
            path: "/api/sessions/\(sessionID)/samples",
            body: ["paceSecPerKm": paceSecPerKm, "distanceKm": distanceKm]
        ).roast
    }

    func finishRun(runnerName: String, distanceKm: Double, durationSec: Double, name: String) async throws -> String {
        try await post(
            ActivityResponse.self,
            path: "/api/activities",
            body: [
                "runnerName": runnerName,
                "distanceKm": distanceKm,
                "durationSec": durationSec,
                "name": name,
                "source": "ios",
            ]
        ).activity.id
    }

    private func get<T: Decodable>(_ type: T.Type, path: String) async throws -> T {
        let (data, response) = try await session.data(from: baseURL.appendingPathComponent(path))
        try check(response, data: data)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func post<T: Decodable>(_ type: T.Type, path: String, body: [String: Any]) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        try check(response, data: data)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func check(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "unknown error"
            throw NSError(domain: "RunHackAPI", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
}
