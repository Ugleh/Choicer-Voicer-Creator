# Choicer Voicer format and AI research

Checked 26 September 2026. The implementation targets desktop Dub Packs in the 0.5.x family. The official store recommends 0.5.3 at the time of research.

## Authority and compatibility

The developer identifies the [itch.io listing](https://yeahmaybe.itch.io/the-choicer-voicer) and Neocities website as the official sources. Similarly named browser sites are separate projects; their checker rules are not the game's specification.

The current official [Dub Content Packs guide](https://thechoicervoicer.neocities.org/v2/content_guide/dub_packs) establishes `packs_voice`, the exact `dub_video.ogv` name, per-sample timestamps in seconds, character filtering, numbering, and a recommendation to keep lines under six seconds. It describes `_backing_track` as optional. Since Creator 0.1.12, scenes without a backing track export a silent WAV, including silent segments in a mixed collection. Supplied tracks still require review. Original-source dialogue samples can retain background sounds; silence does not perform voice isolation. Vocal isolation is optional in the game but useful for avoiding doubled music under replacement voices.

The official [Voice Content Packs guide](https://thechoicervoicer.neocities.org/v2/content_guide/voice_packs) supports WAV, MP3, and OGG and requires samples below 60 seconds. It recommends audible/normalized samples and describes captions, artwork, author credits, and descriptions. The [older official WAV guidance](https://thechoicervoicer.neocities.org/guides/voice_guide_v0-4) excludes compressed WAV. Creator emits PCM 16-bit WAV.

The official website does **not** specify the complete raw INI grammar. The [Content Manager's pack-format documentation](https://github.com/jojozagjos/Choicer-Voicer-Content-Manager/blob/main/docs/PACK_FORMATS.md), maintained alongside its parser and based on in-game documentation and real packs, provides the `[data]` section, caption strings, `dub_timestamps` numeric arrays, `dub_characters` string arrays, and `_pack_info.ini`. This is implementation evidence, not an official specification. The schema is also consistent with [another pack writer](https://github.com/Windy4/ChoicerVoicerAutoPack/blob/claude/new-session-p0hall/dubpack/ini_format.py).

The exporter uses matching `.wav` / `.ini` basenames, quoted/escaped strings, millisecond timestamps relative to the trimmed scene, and standard CRLF line endings. Clip length comes from the audio file. Optional dialogue padding extends the extracted interval within scene boundaries and moves its metadata start back by the same amount; combined exports then add the scene offset. Word timings stay in the transcript working data and are not required in the pack. Final compatibility still needs a game playback check.

The official [Dub Pack guide](https://thechoicervoicer.neocities.org/v2/content_guide/dub_packs) says performances play at their metadata timestamps and unselected characters use original audio. It does not explicitly document the behavior of four separate recordings with exactly the same timestamp, and searches of the official site/developer pages did not establish that edge case. Creator accepts and exports overlapping clips with identical start timestamps; integration coverage verifies four distinct WAV/INI pairs sharing one timestamp. This verifies file output, not simultaneous in-game playback. In addition, cutting a scene with overlapping speakers from the original audio or the combined vocal stem preserves all those speakers in each cut; character labels alone do not isolate their voices.

## AI options considered

| Option | Fit for this editor | Tradeoff |
| --- | --- | --- |
| ElevenLabs two-stem separation | Selected by the user; one API key for both processing tasks | Music-oriented vocals/instrumental separation may affect movie ambience and effects |
| LALAL.AI Voice/Noise API | Another cloud candidate with voice/background separation | Separate provider integration, account, billing, and quality comparison required |
| UVR models through audio-separator | Local alternative with no per-request API bill | Model downloads, Python/runtime setup, hardware-dependent speed, and model licenses to check |

ElevenLabs' [stem-separation endpoint](https://elevenlabs.io/docs/api-reference/music/separate-stems) accepts a file and `two_stems_v1` or `six_stems_v1`, returning a ZIP of audio stems. Creator requests two stems and converts the explicitly named instrumental output to WAV. The response naming is checked; the app does not guess when an instrumental label is absent. This integration has been tested with representative ZIP responses, not a paid live request.

ElevenLabs' [Voice Isolator](https://elevenlabs.io/docs/overview/capabilities/voice-isolator) keeps speech and removes background. That endpoint alone does not produce the wanted backing track. Subtracting a processed voice track from the original is not assumed to reconstruct clean effects.

[Scribe's transcription API](https://elevenlabs.io/docs/api-reference/speech-to-text/convert) returns timed words and can label speakers. Creator requests `scribe_v2`, word timing, and diarization; then suggests line breaks using punctuation, pauses, speaker changes, and a roughly six-second target. Suggested speaker labels are not character identities and need review.

LALAL.AI documents [API voice/background separation](https://www.lalal.ai/blog/meet-lalal-ai-api-v1/). The local [audio-separator project](https://github.com/nomadkaraoke/python-audio-separator) provides a CLI/Python wrapper for multiple separation model families. Neither alternative is installed or integrated in this version.

## Pricing and metering

Checked 2026-09-26 against the [public monthly API pricing](https://elevenlabs.io/pricing/api). Uploaded Scribe v2 is $0.22/hour in the Free/PAYG, Starter, Creator, Pro, Scale, and Business columns. Their listed included hours are respectively 4.5, 27, 100, 450, 1,359, and 4,500. Enterprise has custom terms. The editor does not request entity detection or keyterm prompting add-ons. The public table's Realtime pricing is separate from the uploaded-audio endpoint this editor calls. Account subscription quotes can differ; the user's reported Creator Realtime quote of $0.46/hour and 48 hours is not used as an uploaded Scribe v2 rate.

ElevenLabs' [Music feature announcement](https://elevenlabs.io/blog/eleven-music-new-tools-for-exploring-editing-and-producing-music-with-ai) states that two-stem separation costs 0.5 times generation and links its API endpoint. Applying that multiplier to the public $0.15/min Music rate yields **$0.075/min**. This is a derived, provisional estimate, not an independently verified account-specific stem API quote. The UI and confirmation label it accordingly. Voice Isolator pricing is not used. Generation minimums, billing rounding, and subscription-specific conversion rules have not been established for stem requests.

Settings offer the published plan presets plus custom hourly transcription, per-minute separation, and included-hour reference values. Legacy manual rates are retained. Presets do not automatically refresh. Included hours are displayed as plan reference values rather than remaining balances; the editor does not synchronize account-wide usage or assume independent free quotas for each product. See the provider's [billing documentation](https://elevenlabs.io/docs/overview/administration/billing) and [account subscription](https://elevenlabs.io/app/subscription/api) for actual terms and remaining usage. The account page was not accessible to public research tooling.

Each job snapshots its duration, selected plan/rate, estimate basis, request ID, time, and status. No invoice charge is inferred from success, an included allowance, or a usage header. Estimates are before allowances and taxes. Historical estimates are not recalculated after changing settings. An explicit upload/run action is required for every job; there are no automatic retries after uncertainty.

## Practical quality choices

Keep short, coherent scenes and clean phrase boundaries. Preserve breaths needed for imitation, but avoid long silent tails. Review overlapping speakers manually. Process only the selected scene to reduce cost and turnaround. Listen for dialogue bleed, reverberation, damaged effects, and start/end synchronization. The audio should remain aligned rather than being time-stretched to fit. Treat automatic captions and separation as drafts.

Creator normalizes exported dialogue by default, keeps originals untouched, generates local H.264 previews for MKV/codec compatibility, and uses original source media for final exports. Source language tracks are explicitly selectable. Export validation checks boundaries, captions, characters, backing alignment/review, PCM encoding, clip duration, and Theora video. A successful file check does not replace an in-game audition.

Combined collection exports first make matching lossless FFV1/PCM segments, then use FFmpeg's [concat demuxer](https://ffmpeg.org/ffmpeg-formats.html#concat) and encode one Theora/Vorbis output. Explicit segment durations, whole-frame video boundaries, and corresponding sample counts keep subsequent scene offsets aligned. A scene can receive less than one frame of held video and silent audio padding. The backing tracks follow the same boundaries, and each line's timestamp is offset by its scene's position in the combined video. Temporary segments are removed after export.

## Sharing formats

Reddit's [formatting guide](https://support.reddithelp.com/hc/en-us/articles/360043033952-Formatting-Guide) documents Markdown tables; its [post-formatting help](https://support.reddithelp.com/hc/en-us/articles/205191185-How-do-I-format-my-comment-or-post) says Markdown remains available on desktop while mobile moves to rich text. Creator labels its Reddit output for the desktop Markdown editor.

Discord documents [Markdown headings and lists](https://support.discord.com/hc/en-us/articles/210298617-Markdown-Text-101-Chat-Formatting-Bold-Italic-Underline) and a [2,000-character standard message cap](https://support.discord.com/hc/en-us/articles/360034632292-Sending-Messages), increased to 4,000 with Nitro. Creator uses the standard cap, splits long descriptions into numbered messages, and avoids table syntax.

GameBanana's own [editor update](https://gamebanana.com/blogs/18248) and [post-system update](https://gamebanana.com/blogs/19660) document rich-text editing and HTML content. Creator supplies escaped HTML and plain text together on the clipboard, plus raw HTML/plain-text copy options. The logged-in submission composer was not exercised; destination paste/rendering remains a manual check. Generated HTML contains only fixed formatting and an optional validated HTTP(S) link. No content is submitted by the sharing feature.

## Additional video inputs

The picker, drag-and-drop validation, and missing-source locator use one shared list of common container extensions. FFmpeg already supplies the demuxers and decoders used by the existing preview/export pipeline; no additional runtime dependency is introduced. See the official [FFmpeg format documentation](https://ffmpeg.org/ffmpeg-formats.html#Demuxers). Both a video stream and an audio stream are still required. Container acceptance does not guarantee that every codec variant is supported by every FFmpeg build. Individual TS/MTS/M2TS and VOB files are accepted as local inputs; this does not add disc-menu navigation or multi-file disc assembly.

## Range separation and sound effects (2026-09-27)

- [Sound generation API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert): `POST /v1/sound-generation`, JSON text prompt, `model_id=eleven_text_to_sound_v2`, requested duration 0.5–30 seconds, optional prompt influence/looping. This implementation requests one non-looping effect with influence 0.3 and MP3 44.1 kHz/128 kbps, then converts it to stereo 48 kHz PCM WAV. The API reference's 0.5-second minimum takes precedence over the overview's inconsistent 0.1-second text.
- [Public API pricing](https://elevenlabs.io/pricing/api) currently lists Sound Effects at $0.12/minute. The app uses that duration-based reference for estimates, retains custom-rate support, and records returned request/usage headers. Provider pages also use generation/credit terminology; the app does not infer an invoice or remaining balance from those values.
- Range repair uses the existing two-stem endpoint on exactly the selected input interval. Original-scene input and existing-backing input are both supported. A new full-length backing is assembled locally, preserving audio outside the range and keeping blends inside it. Existing vocal stems are retained because the requested operation repairs only the backing.
- Added effects are mixed into the game's existing backing WAV. No unverified game metadata format or extra runtime soundtrack is required. Original reference video audio and dialogue WAVs remain separate from effects.

## Four sound-effect choices (2026-09-27)

The [ElevenLabs Create sound effect API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert) returns one generated audio file and has no count/variation parameter. The creator requests four independent generations sequentially using the same prompt and duration, with a combined estimate before submission and a separate transaction per request. Completed choices are retained if later processing fails or is cancelled. The chooser auditions the full generated audio; imported placements remain bounded by the scene.
