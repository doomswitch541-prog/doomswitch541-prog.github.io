# RG radio surfaces

This note records the radio system recovered from the USB copy of `rgradio`, how
its signal tester works, and how that design maps to the two browser-hosted RG HQ
receivers.

## Source snapshot

The recovered copy is a small Express and vanilla-JavaScript application last
modified between January 31 and February 2, 2026. It has no Git history, so this
copy cannot prove that it was the final off-machine revision. It contains the
Ghost Frequency receiver, ten-station dial, debug console, stream tests, and
relay route. It also contains literal placeholder comments where part of the CSS
and the static-canvas script may once have been. The substantive tuner and tester
logic is present, but the USB copy is a source snapshot rather than proof of a
complete final build.

The browser-hosted **RG Radio Legacy** keeps the recovered behavior and fills the
blank canvas hook with a lightweight local CRT-noise renderer. That reconstruction
uses no network data and becomes a still frame under reduced motion.

## What RG originally built

### 1. Directory request

The page sends a public GET request to Radio Browser:

```text
https://de1.api.radio-browser.info/json/stations/search
  ?limit=10
  &countrycode=US
  &tag=news
  &hidebroken=true
  &order=clickcount
  &reverse=true
```

Radio Browser is a keyless public directory API. Its response supplies station
names, resolved stream URLs, location fields, codec, bitrate, and tags. Its
`hidebroken` and `lastcheckok` data describe Radio Browser's last server-side
check; they do not prove that the current browser can decode a stream now.

### 2. Internet stations mapped onto a dial

The first ten results become ten positions on an FM-shaped interface. The USB
copy assigns them display frequencies from 88.0 through 106.0 MHz in 2 MHz
steps. Those numbers are interface positions, not claims about the stations'
terrestrial broadcast frequencies.

Dragging the dial measures distance to each assigned position:

- within 0.5 MHz: a station is selected;
- within 0.2 MHz: the display says `LOCKED`;
- farther from every position: the display returns to `NO SIGNAL`.

The gaps are meaningful. The receiver has a tuning state rather than behaving
like a dressed-up list of links.

### 3. Browser stream probe

Each station row has a `TEST` action. The original `testStream(index)` creates a
temporary HTML `Audio` element, points it at the station's resolved URL, and
waits up to five seconds:

- `canplay` marks the stream playable;
- `error` marks it blocked;
- the timer marks it timed out.

The result is cached in `state.testedStreams`, reflected in the station display,
and counted in the console header. This is the core system retained by both RG
HQ radio pages: directory metadata proposes candidates, but the user's browser
decides whether a signal is real.

### 4. Original relay decision

The Express server exposes:

```text
GET /proxy?url=<station stream URL>
```

It accepts an HTTP or HTTPS URL, requests it with `node-fetch`, and pipes the
body back with permissive CORS and no-store headers. When the browser probe fails,
the original interface changes `playbackMode` from `direct` to `proxy`.

Two details matter:

1. A browser audio element does not require CORS merely to play cross-origin
   audio. CORS is required when script needs to read the media through APIs such
   as Web Audio or canvas. Setting `crossorigin="anonymous"` can therefore reject
   a station that plain audio playback could use.
2. The UI labels a failed direct test `RELAYED` without testing the relay itself.
   That is an intended fallback choice, not proof of successful relayed audio.

The relay also accepts arbitrary HTTP(S) destinations, which makes it unsuitable
for a public static-site migration. RG Radio Legacy removes the relay rather than
publishing an open proxy.

## Surface types

| Surface | What it is | Key | Browser operation |
| --- | --- | --- | --- |
| Radio Browser station search | Public directory API | None | HTTPS GET returning JSON |
| Radio Browser server discovery | Public directory API | None | HTTPS GET returning mirror metadata |
| Radio Browser click counter | Optional directory popularity signal | None | HTTPS GET after successful playback |
| Station `url_resolved` | Direct media stream | None | HTML audio load/play |
| Official network feed | Direct media stream | None | HTML audio load/play |
| Google font files on Legacy | Static font assets | None | Stylesheet/font download |
| Original `/proxy` | RG's server-side stream relay | None | Server fetch and byte pipe |

Station streams and font files are network surfaces, but they are not APIs.
The click counter does not return, authorize, or relay a station. It only tells
Radio Browser that one directory entry was successfully played so its public
click-based rankings can reflect listener activity. Removing that request would
not remove a station or change playback.

## Browser-hosted architecture

### RG Radio Legacy

- Preserves the Ghost Frequency CRT, dial gaps, and station locks while removing
  the imported 365 counter and archive pagination.
- Uses HTTPS Radio Browser mirrors directly from the page.
- Combines US news and talk searches, removes duplicate results, and maps up to
  sixteen HTTPS stations onto the display band.
- Shows every loaded station in an always-visible lineup. Selecting a station
  tunes it, runs the browser signal check when needed, and starts playback.
- Keeps only real HTTPS stream candidates; it does not rewrite `http:` to
  `https:` and hope the station supports it.
- Tests direct audio in the browser and reports the exact browser media outcome.
- Never claims a relay state and never exposes a proxy endpoint.
- Keeps a collapsed API/media debugger at the bottom in normal page flow. It has
  no fixed overlay or nested scrolling and is not part of the listening flow.

### RG Broadcast

- Uses the same directory-candidate then browser-verification principle.
- Opens on a hand-curated **Top 20** stored in `js/broadcast.js`. It is an RG
  audience lock rather than a click-count chart: Behind the Sch3m3s, Alex Jones,
  U7 Art Bell / Coast to Coast, Ground Zero Plus, Free People of the Cosmos,
  Dr. J Radio, KHNC, and K-Star occupy the first eight positions. The music side
  favors grunge, emo, shoegaze, psychedelic/freeform, and spacey late-night
  listening. K-Star Talk Radio Network and Static: 90s & 2000s Alt Rock replace
  Radio BipTunia and Secret Agent. Every exact HTTPS stream remains visible in
  the surface monitor and is still tested by the listener's browser.
- Organizes discovery into six restrained bands: Top 20, News Desk, Conspiracy,
  Rock, Trippy, and Follow the Night. The broad US Live band was removed because
  it duplicated search, and Ambient was folded into Trippy. World, Talk, Jazz,
  and Classical remain out. All ordinary directory/search bands are US-filtered;
  Follow the Night remains geographically open because its actual function is
  finding stations currently broadcasting after dark.
- Rock merges live US directory searches for rock, grunge, shoegaze,
  alternative rock, emo, screamo, and post-hardcore, then leads with matching
  curated stations. Screamo Emo and Static appear in both Rock and Top 20
  alongside classic Seattle-era grunge and current shoegaze/dream-pop.
- Conspiracy leads with all matching Top 20 signals before adding live directory
  results, keeping the eight core alternative/paranormal picks together.
- Search has one field. Each query checks both Radio Browser `name` and `tag`
  results with `countrycode=US`, merges them, removes duplicate UUIDs/streams,
  and keeps only HTTPS candidates with a positive directory health check.
- Maps the first twenty active results onto an explicitly labeled **RG internet
  band**. Band positions are interaction slots, not terrestrial frequencies.
- Keeps quiet gaps between positions so `STATIC`, `ACQUIRING`, `LOCKED`,
  `TESTING`, `READY`, `PAUSED`, `ON AIR`, and `NO SIGNAL` are visible receiver
  states. Dragging can cross those gaps; tapping the range snaps to the nearest
  occupied station slot. The tuner sits below the primary music-player controls.
- The main player separates station identity from program data. Every station
  shows a plain-language description, genre, origin, stream quality, and source.
  The station list repeats a shorter description plus technical signal facts so
  listeners can choose without opening the debugger.
- For stations that publish browser-readable metadata, the player polls a
  keyless, read-only now-playing surface every 30 seconds and shows the current
  song or program. Stations that do not publish a usable browser endpoint stay
  honest: the player shows their format and says the live title is not published.
  It never invents a title from a schedule or station description.
- Enables **Share Card** only for stations in the curated Top 20. The browser
  draws a 1200 x 630 tuner capture locally on canvas with the station name, RG
  display position, signal state, and direct `?station=` listening URL. Phones
  that support file sharing receive the PNG in the native share sheet; other
  browsers download it and copy the station link when clipboard access is
  available. No image service, tracking call, or remote artwork is involved.

### Curated stream additions checked August 24–26, 2026

| Station | Programming role | Direct HTTPS media | Check |
| --- | --- | --- | --- |
| U7 Radio: Art Bell / Coast to Coast | 24/7 Art Bell and Coast to Coast archive programming | `https://u7radio.org/stream` | HTTP 200, `audio/mpeg`, audio bytes returned |
| LITT Live: Grunge | US 1990s grunge and rock | `https://das-sa39.cdnstream1.com/5570_128` | HTTP 200, `audio/mpeg`, audio bytes returned |
| DKFM Shoegaze Radio | Current shoegaze and dream pop | `https://kathy.torontocast.com:2005/stream` | HTTP 200, `audio/mpeg`, audio bytes returned |
| Ground Zero Plus | Clyde Lewis, paranormal, conspiracy, and fringe science | `https://s2.radio.co/s7a9080f05/listen` | HTTP 200, `audio/mpeg`, audio bytes returned |
| Free People of the Cosmos | UFO, UAP, and paranormal podcast rotation | `https://podradio.us/stream/free-cosmos` | HTTP 200, `audio/mpeg`, audio bytes returned |
| Dr. J Radio | Paranormal and UFO long-form interviews | `https://podradio.us/stream/drjradio-live` | HTTP 200, `audio/mpeg`, audio bytes returned |
| KHNC 1360 "The Lion" | Colorado conspiracy and independent talk | `https://www.ophanim.net:8444/s/7250/` | HTTP 200, `audio/mpeg`, audio bytes returned |
| K-Star Talk Radio Network | Conspiracy Radio, overnight talk, and alternative news | `https://c23.radioboss.fm/stream/204` | HTTP 200, `audio/mpeg`, audio bytes returned |
| Screamo Emo | Emo, screamo, and post-hardcore | `https://radio.hearme.fm:8478/stream` | HTTP 200, `audio/mpeg`, audio bytes returned |
| Static: 90s & 2000s Alt Rock | Alternative rock, grunge, and post-grunge | `https://r.bgp.rodeo/listen/static/radio.mp3` | HTTP 200, `audio/mpeg`, 320 kbps stream returned |
| DKFM Edge | New shoegaze and dream pop | `https://radio.streemlion.com:4405/stream` | HTTP 200, `audio/aacp`, audio bytes returned |

### Browser-readable now-playing surfaces

| Station group | Read-only endpoint | Browser result |
| --- | --- | --- |
| Behind the Sch3m3s | `https://scream.behindthesch3m3s.com/api/nowplaying/the_scaly_show` | AzuraCast JSON with CORS, current program title, and listener count |
| Ground Zero Plus | `https://public.radio.co/stations/s7a9080f05/status` | Radio.co JSON with CORS and a current-track title |
| Free People of the Cosmos and Dr. J Radio | `https://podradio.us/admin/modules/IceCastManager/nowplaying.php` | PodRadio JSON with CORS and a title keyed to each stream slug |
| K-Star Talk Radio Network | `https://c23.radioboss.fm/w/nowplayinginfo?u=204` | RadioBOSS JSON with CORS and current program fields |
| Static: 90s & 2000s Alt Rock | `https://r.bgp.rodeo/api/nowplaying/static` | AzuraCast JSON with CORS, artist, title, album, and listener count |
| Screamo Emo | Official `status-json.xsl` through `https://cors.eu.org/` | Exact Icecast title through a public CORS read bridge; rejected on bridge failure or placeholder data |
| SomaFM channels | `https://somafm.com/songs/<channel>.json` | Channel JSON with CORS, artist, title, and album |
| DKFM Shoegaze Radio | `https://kathy.torontocast.com:2005/status-json.xsl` | Icecast JSON with CORS, current title, genre, and listener count |
| DKFM Edge | `https://radio.streemlion.com:4405/status-json.xsl` | Icecast JSON with CORS, current title, genre, and listener count |
| HEADY | `https://c22.radioboss.fm:18364/status-json.xsl` | Icecast JSON with CORS and current title |

These hosts are explicitly allowed in the page and shared hosting CSP. The
endpoints require no API key, receive no RG identity, and are requested only for
the currently selected station. U7 and KHNC did not expose a browser-readable
CORS endpoint during this check, so their player state uses the format fallback.
Screamo Emo does publish an accurate official Icecast title but omits CORS; the
public read bridge is therefore best-effort. A bridge error, blank title, generic
placeholder, or station-name-only value immediately restores the honest format
fallback and also clears that title from the browser Media Session.

## Public-surface rules

- No API keys or credentials are stored in either page.
- The surface taxonomy distinguishes directory APIs, direct media, official
  media, and static assets. The live monitors show API and audio activity; the
  static Legacy font request is accounted for in this document.
- Signal-test probes remain labeled `DIRECT MEDIA`; the exact URL used by the
  main receiver appears separately as `PLAY STREAM` with its live playback state.
- Sensitive-looking query parameters are redacted before a URL is rendered.
- Radio Browser and the explicit now-playing providers are limited to their
  HTTPS hosts by CSP.
- Dynamic station audio is allowed only through HTTPS media URLs.
- The shared Cloudflare/Netlify headers carry the same Radio Browser and HTTPS
  media allowances as the page policies, so a host-level CSP cannot silently
  block the receivers.
- Both pages set `referrer-policy: no-referrer` in markup.
- A directory health flag is never presented as a successful browser signal.
- RG Broadcast exposes its optional Radio Browser click-count request in the
  surface monitor instead of treating it as a hidden background call.
- The pages open media directly in the listener's browser. They do not cache,
  relay, or rebroadcast a station stream.
- A public, keyless directory entry is a technical access fact, not proof of a
  station's ownership or programming rights. Directory results remain labeled
  as direct media; only hand-specified streams published by their own operators
  are labeled official.
