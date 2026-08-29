import AVFoundation

/// Plays roast clips served by `GET /api/audio/:id`, ducking other audio so the
/// roast is audible over music during a run.
final class RoastAudioPlayer {
    static let shared = RoastAudioPlayer()

    private var player: AVPlayer?

    private init() {
        try? AVAudioSession.sharedInstance().setCategory(
            .playback,
            mode: .spokenAudio,
            options: [.duckOthers, .mixWithOthers]
        )
    }

    func play(url: URL) {
        try? AVAudioSession.sharedInstance().setActive(true)
        player = AVPlayer(url: url)
        player?.play()
    }
}
