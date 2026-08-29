# RunHackTracker (iOS prototype — source only, not built)

SwiftUI + CoreLocation tracker that streams live pace into the Audio Roast Engine and
posts the finished run to the leaderboard as `source: "ios"`.

**Status: unbuilt.** These sources were written on Linux; no Xcode project or
signing exists yet and nothing here has been compiled or run on a device or
simulator. Treat it as a head start for a Mac, not a working app. Strava is the
tracking path that is actually runnable today (see the repo README).

## Files

| File | Role |
| --- | --- |
| `Sources/RunHackTrackerApp.swift` | App entry point; holds the API base URL |
| `Sources/TrackerView.swift` | Session picker, live distance/pace, start/finish |
| `Sources/RunTracker.swift` | CoreLocation delegate, rolling-window pace, sample upload |
| `Sources/RunHackAPI.swift` | `/api/sessions`, `/api/sessions/:id/samples`, `/api/activities` |
| `Sources/RoastAudioPlayer.swift` | Plays `/api/audio/:id` clips, ducking other audio |

## Bringing it up on a Mac

1. Xcode → new **iOS App** target named `RunHackTracker` (SwiftUI, Swift 5.9+, iOS 17+ for
   `NavigationStack`/`LabeledContent`), then add `Sources/*.swift` to it.
2. Set `apiBaseURL` in `RunHackTrackerApp.swift` to the LAN IP or tunnel of the machine
   running `npm run dev:api` — `localhost` resolves to the phone itself on device.
3. Info.plist keys:
   - `NSLocationWhenInUseUsageDescription`
   - `NSLocationAlwaysAndWhenInUseUsageDescription` (background tracking)
   - `UIBackgroundModes` → `location`, `audio`
   - `NSAppTransportSecurity` → `NSAllowsLocalNetworking` (plain-HTTP dev server), or use HTTPS
4. Signing & Capabilities: an Apple Developer account (free account works for a 7-day
   device build), a Team + bundle identifier, and the **Background Modes** capability with
   *Location updates* and *Audio, AirPlay, and Picture in Picture* checked.

## Known gaps

- No Xcode project, tests, or CI — nothing has been compiled.
- Sample upload has no offline queue: samples posted while the network is down are dropped.
- The run→session link is chosen manually in the picker; there is no auth or per-user identity.
