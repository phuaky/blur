# Video boxes verification

Run `bun test`. Check keyframe boundaries, earlier edits, clamping, removal and immutable undo snapshots.

In the browser, open a short sample video with audio. Draw a box at zero, seek and move it, seek backward, undo/reapply, preview and export. Inspect output dimensions, frame pixels around both positions, duration and audio via ffprobe/ffmpeg. Export twice and cancel once. Verify the final frame and no selection outline. Load an image afterward and save a PNG. Test corrupt video rejection and unsupported export feedback. Inspect the narrow-screen layout.

Record actual results below after verification; unavailable checks stay unresolved.

## Evidence, 2026-10-11

- `bun test`: 5 pass, 0 fail, 13 assertions. `node --check app.js`, `node --check video-model.js`, and `git diff --check`: exit 0.
- Chrome integration harness on localhost: 15 checks pass on desktop and at a 390 px iframe width. These cover video loading, a fixed box, a change at 2 seconds, undo, backward seek, audio export, cancellation with no download, second export, change removal, redraw, box removal, invalid-file preservation, unsupported-recorder feedback, PNG regression and no unexpected browser errors.
- A real pointer drag and accessible timeline change also created a blur box and its 2-second position change. Save video from the actual UI produced a playable export.
- Generated fixture: 320 × 180, 30 fps, 4 seconds, H.264 video plus a 440 Hz audio tone. Export inspected with ffprobe: H.264 at 320 × 180, AAC audio, approximately 4.04 seconds of video and 4.095 seconds of audio. This confirms a small encoder timing extension.
- ffmpeg decoded frames at 0, 1, 1.9, 2.1, 3 and 3.95 seconds. The first mask covered the initial location until 2 seconds; the later location was covered afterward, through the final frame. Protected interior RGB means were between 0 and 0.15. Audio decoded to a non-silent waveform (RMS 0.1233). The PNG had black pixels in its mask and white pixels outside it.
- Saved blur-only export inspection: at 1 second, mean pixel difference from source was 41.94 in the initial box and 2.58 in the later box. At 3 seconds, it was 50.93 in the later box. Visual inspection confirmed blur and pixelation in the mixed-effect export.
- Screenshots: `video-boxes-desktop.jpg` and `video-boxes-mobile.jpg`. The recording canvas is separate from the editor canvas, and decoded exports have no selection outlines.

Interceptor was unavailable because no extension was connected. Chrome's available computer-use controls performed the verification. The extension file-chooser API required extra file-URL access, so the generated fixture was loaded by a temporary localhost harness instead of changing permissions. No user files were uploaded. Temporary fixture, harness and exported samples live under /tmp.

Unverified: other browsers, large/long clips, direct file-URL launch and the real tab-hiding interruption path. The background interruption path was reviewed in source. No deployment was performed.
