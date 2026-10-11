# Video boxes

Add local video editing to the existing static image editor. Open a browser-supported video, draw multiple blur/redact/pixelate boxes, preview, and save a processed video with its audio. A new box covers the whole clip. Pause and seek, then move or redraw a selected box to record a position change. Positions hold until the next change; there is no automatic tracking or interpolation.

The existing canvas UI remains. Native video decoding, canvas compositing, Web Audio and MediaRecorder avoid uploads and dependencies. Export runs in real time, uses the supported recording format, and disables editing. Cancel and backgrounding abort the export without downloading a partial file. Unsupported inputs and recording capabilities show an actionable error. Images retain PNG and clipboard export.

Regions hold style plus sorted geometry keyframes `{time,x,y,w,h}`. The first keyframe is always at zero. Editing at a later time inserts/replaces a keyframe. Undo restores a full region snapshot. Selection outlines are editor-only and never enter exports.

Acceptance: fixed boxes cover start/middle/end; position changes switch at the chosen time; seeking backwards restores prior positions; undo/removal work; decoded output has correct dimensions, audio, duration and protected pixels without outlines; cancellation allows another export; images still save correctly. Long/high-resolution clips may export slowly or drop frames on a busy device. Keep the tab visible and review the output.
