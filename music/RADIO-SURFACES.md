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
- Defaults toward US stations and supplies a separate curated News Desk query.
- Maps a smaller active result set onto an explicitly labeled **RG internet
  band**. Band positions are interaction slots, not terrestrial frequencies.
- Keeps quiet gaps between positions so `STATIC`, `ACQUIRING`, `LOCKED`,
  `TESTING`, `READY`, `PAUSED`, `ON AIR`, and `NO SIGNAL` are visible receiver
  states.

## Public-surface rules

- No API keys or credentials are stored in either page.
- The surface taxonomy distinguishes directory APIs, direct media, official
  media, and static assets. The live monitors show API and audio activity; the
  static Legacy font request is accounted for in this document.
- Signal-test probes remain labeled `DIRECT MEDIA`; the exact URL used by the
  main receiver appears separately as `PLAY STREAM` with its live playback state.
- Sensitive-looking query parameters are redacted before a URL is rendered.
- Radio Browser requests are limited to its HTTPS API hosts by CSP.
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
  as direct media; only the hand-specified network feed is labeled official.
