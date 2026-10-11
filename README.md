# blur

Redact, blur, or pixelate images and videos entirely in your browser. Nothing is uploaded. Files stay on your device.

Live: https://phuaky.github.io/blur

Static HTML and JavaScript, with no build step or external dependencies. Open `index.html` directly, or serve this folder over HTTP (for example, `python3 -m http.server 5188`), then open `http://localhost:5188`. Keep `index.html`, `app.js`, and `video-model.js` together.

## Images

Drag, paste, or open an image. Choose Redact, Blur, or Pixelate and draw rectangles over the content. Save PNG or copy to the clipboard.

## Videos

1. Open or drop an MP4, WebM, or another video your browser can decode.
2. Choose a tool and draw a box. Each new box covers the whole clip.
3. For another box, click **Draw new box**.
4. To change a box during the video, pause and seek to that time. Select the box and drag it, or use **Redraw box here** to change its size too. The position holds until the next change. Earlier positions stay as they were.
5. Click a position timestamp to jump to it. Use its × button to remove a change, **Remove box** to delete a box, or **Undo** to undo an edit.
6. Click **Save video**. Audio is included. Export runs at playback speed; keep the tab visible. Cancel stops the export without saving a partial file.

Export saves MP4 when the browser supports its recorder, or WebM otherwise. Videos are re-encoded at the source dimensions. The output may have a small timing difference, and frame rate depends on browser performance. Review the saved video before sharing it. Hiding the tab stops export. Large or long clips require more memory and processing time. There is no automatic object tracking or smooth movement between position changes.

Use a solid Redact box for sensitive text. Blur and pixelation may still reveal information.

## Verification

Run `bun test` for keyframe and geometry checks. Browser verification and output inspection are recorded in `docs/evals/video-boxes-verification.md`.
