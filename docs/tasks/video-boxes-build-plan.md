# Video boxes build plan

1. Add pure geometry/keyframe helpers and meaningful boundary tests.
2. Extend the static editor with video loading, timeline and box editing. Keep image behavior.
3. Composite each decoded frame into an export-only canvas, attach source audio, and record. Handle failure, cancellation and cleanup.
4. Test the actual browser journey with a short video with audio. Inspect the downloaded output, verify image regression, and review error paths.

Files: index.html, app.js, video-model.js, README.md, tests and these docs. No build service or external dependency. Rollback: restore the original index.html and remove added runtime scripts.

Status: implementation complete. Geometry tests and Chrome integration checks pass. Output inspected with ffprobe/ffmpeg. The final review fixed timeline seeking, zero-time coverage near the beginning, solid-cover overlap ordering, direct-file script compatibility and tool accessibility. Ready for local use; deployment remains a separate action.
