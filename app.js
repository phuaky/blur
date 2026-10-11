(function(){
"use strict";
const { geometryAt, setGeometry, moveGeometry, snapshot } = globalThis.VideoBoxModel;

const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
// The export surface never contains editor outlines or an in-progress gesture.
const output = document.createElement('canvas'), outputCtx = output.getContext('2d');
const scratch = document.createElement('canvas'), scratchCtx = scratch.getContext('2d');
let source = null, video = null, sourceURL = null, loadVersion = 0;
let regions = [], history = [], selected = -1, mode = 'draw';
let tool = 'redact', fillColor = '#000000', strength = 14, fileName = 'image';
let gesture = null, frameHandle = null, exporting = false, cancelExport = null;
let audioContext = null, audioSource = null;
const time = () => video ? video.currentTime : 0;

function formatTime(seconds) {
  const cs = Math.round(Math.max(0, seconds) * 100);
  return `${Math.floor(cs / 6000)}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
function remember() { history.push(snapshot(regions)); if (history.length > 100) history.shift(); }
function undo() {
  if (exporting || !history.length) return;
  regions = history.pop(); selected = Math.min(selected, regions.length - 1);
  gesture = null; render(); updateUI();
}

function composite(target, at) {
  target.clearRect(0, 0, canvas.width, canvas.height);
  target.drawImage(source, 0, 0, canvas.width, canvas.height);
  // Solid covers stay on top even when another effect overlaps them.
  const ordered = [...regions.filter(r => r.type !== 'redact'), ...regions.filter(r => r.type === 'redact')];
  for (const region of ordered) {
    const r = { ...region, ...geometryAt(region, at) };
    if (r.type === 'redact') {
      target.fillStyle = r.color; target.fillRect(r.x, r.y, r.w, r.h);
    } else if (r.type === 'blur') {
      const pad = Math.ceil(r.strength * 3);
      const ax = Math.max(0, Math.floor(r.x - pad)), ay = Math.max(0, Math.floor(r.y - pad));
      const bx = Math.min(canvas.width, Math.ceil(r.x + r.w + pad));
      const by = Math.min(canvas.height, Math.ceil(r.y + r.h + pad));
      scratch.width = bx - ax; scratch.height = by - ay;
      scratchCtx.filter = `blur(${r.strength}px)`;
      scratchCtx.drawImage(source, ax, ay, scratch.width, scratch.height, 0, 0, scratch.width, scratch.height);
      target.drawImage(scratch, r.x - ax, r.y - ay, r.w, r.h, r.x, r.y, r.w, r.h);
    } else {
      scratch.width = Math.max(1, Math.round(r.w / r.strength));
      scratch.height = Math.max(1, Math.round(r.h / r.strength));
      scratchCtx.imageSmoothingEnabled = false;
      scratchCtx.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, scratch.width, scratch.height);
      target.imageSmoothingEnabled = false;
      target.drawImage(scratch, 0, 0, scratch.width, scratch.height, r.x, r.y, r.w, r.h);
      target.imageSmoothingEnabled = true;
    }
  }
}
function outline(r, active = false) {
  const scale = canvas.width / (canvas.getBoundingClientRect().width || canvas.width);
  ctx.save(); ctx.strokeStyle = active ? '#F5B301' : '#ECECEE'; ctx.lineWidth = (active ? 2 : 1) * scale;
  ctx.setLineDash([6 * scale, 4 * scale]); ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore();
}
function render(at = time()) {
  if (!source || (video && video.readyState < 2)) return;
  composite(ctx, at);
  if (video && video.paused && !exporting) {
    regions.forEach((r, i) => outline(geometryAt(r, at), i === selected));
  }
  if (gesture && gesture.kind !== 'move') {
    outline(dragRect(gesture), true);
  }
}
function updateTime() {
  $('timeline').value = time();
  $('timeLabel').textContent = `${formatTime(time())} / ${formatTime(video?.duration || 0)}`;
  $('playBtn').textContent = video && !video.paused ? 'Pause' : 'Play';
}
function queueFrame() {
  if (!video || frameHandle !== null) return;
  const currentVideo = video;
  const next = (_, metadata) => {
    frameHandle = null;
    if (video !== currentVideo) return;
    const at = metadata?.mediaTime ?? time();
    if (exporting) {
      composite(outputCtx, at);
      exportTrack?.requestFrame?.();
      $('exportProgress').value = at / video.duration * 100;
      $('exportStatus').textContent = `Exporting ${Math.min(100, Math.round(at / video.duration * 100))}%`;
    }
    render(at); updateTime();
    if (!video.paused && !video.ended) queueFrame();
  };
  frameHandle = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(next) : requestAnimationFrame(next);
}
function stopFrames() {
  if (frameHandle === null) return;
  if (video?.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameHandle);
  else cancelAnimationFrame(frameHandle);
  frameHandle = null;
}
function pause() { if (video) { video.pause(); stopFrames(); render(); updateTime(); } }

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(canvas.width, (e.clientX - r.left) * canvas.width / r.width)),
    y: Math.max(0, Math.min(canvas.height, (e.clientY - r.top) * canvas.height / r.height)) };
}
function dragRect(g) {
  return { x: Math.min(g.start.x, g.end.x), y: Math.min(g.start.y, g.end.y),
    w: Math.abs(g.end.x - g.start.x), h: Math.abs(g.end.y - g.start.y) };
}
canvas.addEventListener('pointerdown', e => {
  if (!source || exporting || e.button !== 0 || video?.seeking) return;
  pause();
  const p = toCanvas(e);
  if (video && mode === 'move') {
    // Prefer the selected region where overlapping boxes share a point.
    const hit = i => {
      const r = geometryAt(regions[i], time());
      return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    };
    let index = selected >= 0 && hit(selected) ? selected : -1;
    if (index < 0) for (let i = regions.length - 1; i >= 0; i--) if (hit(i)) { index = i; break; }
    if (index < 0) { selected = -1; render(); updateUI(); return; }
    selected = index;
    gesture = {kind: 'move', start: p, end: p, at: time(), before: snapshot(regions), original: {...geometryAt(regions[index], time())}};
  } else {
    gesture = {kind: video && mode === 'redraw' ? 'redraw' : 'draw', start: p, end: p, at: time(), before: snapshot(regions)};
  }
  canvas.setPointerCapture(e.pointerId); render(); updateUI();
});
canvas.addEventListener('pointermove', e => {
  if (!gesture) return;
  gesture.end = toCanvas(e);
  if (gesture.kind === 'move') {
    const g = moveGeometry(gesture.original, gesture.end.x - gesture.start.x, gesture.end.y - gesture.start.y, canvas.width, canvas.height);
    regions[selected] = setGeometry(gesture.before[selected], gesture.at, g);
  }
  render();
});
function finishGesture(cancelled = false) {
  if (!gesture) return;
  const g = gesture, rect = dragRect(g);
  gesture = null;
  if (cancelled) regions = g.before;
  else if (g.kind === 'move') {
    if (Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y) >= 1) history.push(g.before);
    else regions = g.before;
  } else if (rect.w >= 3 && rect.h >= 3) {
    history.push(g.before);
    if (g.kind === 'redraw') regions[selected] = setGeometry(regions[selected], g.at, rect);
    else {
      regions.push({ type: tool, color: fillColor, strength, keyframes: [{...rect, time: 0}] });
      selected = regions.length - 1;
    }
    if (video) mode = 'move';
  }
  render(); updateUI();
}
canvas.addEventListener('pointerup', () => finishGesture());
canvas.addEventListener('pointercancel', () => finishGesture(true));

function releaseSource() {
  stopFrames(); video?.pause();
  if (video) { video.removeAttribute('src'); video.load(); }
  if (sourceURL) URL.revokeObjectURL(sourceURL);
  if (audioContext) audioContext.close().catch(() => {});
  audioContext = null; audioSource = null; sourceURL = null; video = null;
}
function onceEvent(element, event, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); element.removeEventListener(event, ready); element.removeEventListener('error', fail); };
    const ready = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('This file could not be decoded. Try an MP4 (H.264) or WebM video.')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('The file took too long to load. Try another file.')); }, timeout);
    element.addEventListener(event, ready, {once: true}); element.addEventListener('error', fail, {once: true});
  });
}
async function loadFile(file) {
  if (!file || exporting) return;
  const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
  if (!isVideo && !file.type.startsWith('image/')) { toast('Open an image or a browser-supported video.', true); return; }
  const version = ++loadVersion, url = URL.createObjectURL(file);
  let candidate;
  try {
    if (isVideo) {
      candidate = document.createElement('video'); candidate.preload = 'auto'; candidate.playsInline = true;
      const ready = onceEvent(candidate, 'loadeddata'); candidate.src = url; await ready;
      if (!Number.isFinite(candidate.duration) || candidate.duration <= 0 || !candidate.videoWidth) throw new Error('This video has no playable duration. Try another file.');
    } else {
      candidate = new Image(); const ready = onceEvent(candidate, 'load'); candidate.src = url; await ready;
    }
    if (version !== loadVersion) { if (isVideo) { candidate.removeAttribute('src'); candidate.load(); } URL.revokeObjectURL(url); return; }
    releaseSource(); source = candidate; sourceURL = url; video = isVideo ? candidate : null;
    canvas.width = output.width = isVideo ? video.videoWidth : source.naturalWidth;
    canvas.height = output.height = isVideo ? video.videoHeight : source.naturalHeight;
    fileName = (file.name || (isVideo ? 'video' : 'image')).replace(/\.[^.]+$/, '') || 'file';
    regions = []; history = []; selected = -1; gesture = null; mode = 'draw';
    $('canvasWrap').classList.remove('empty'); $('emptyState').classList.add('hidden');
    if (video) {
      const current = video;
      current.addEventListener('play', () => { if (video === current) { queueFrame(); updateTime(); } });
      current.addEventListener('seeked', () => { if (video === current) { render(); updateTime(); } });
      current.addEventListener('pause', () => { if (video === current) { render(); updateTime(); } });
      current.addEventListener('ended', () => { if (video === current) { render(); updateTime(); } });
      $('timeline').max = video.duration;
    }
    render(); updateUI();
  } catch (error) {
    if (isVideo && candidate) { candidate.removeAttribute('src'); candidate.load(); }
    URL.revokeObjectURL(url);
    if (version === loadVersion) toast(error.message, true);
  }
}
$('fileInput').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });
$('openBtn').addEventListener('click', () => $('fileInput').click());
window.addEventListener('paste', e => {
  if (exporting) return;
  for (const item of e.clipboardData?.items || []) if (item.type.startsWith('image/')) { e.preventDefault(); loadFile(item.getAsFile()); return; }
});
['dragenter', 'dragover'].forEach(ev => $('stage').addEventListener(ev, e => { e.preventDefault(); $('stage').classList.add('dragover'); }));
['dragleave', 'drop'].forEach(ev => $('stage').addEventListener(ev, e => { e.preventDefault(); $('stage').classList.remove('dragover'); }));
$('stage').addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));

$('playBtn').addEventListener('click', async () => {
  if (!video || exporting) return;
  finishGesture(true);
  if (!video.paused) { pause(); return; }
  try { if (audioContext) await audioContext.resume(); if (video.ended) await seekTo(0); await video.play(); }
  catch { toast('Playback was blocked. Press Play again.', true); }
});
$('timeline').addEventListener('input', () => {
  if (!video || exporting) return;
  const at = Number($('timeline').value);
  finishGesture(true); pause(); video.currentTime = at; updateTime();
});
$('addBoxBtn').addEventListener('click', () => { pause(); mode = 'draw'; selected = -1; render(); updateUI(); });
$('boxSelect').addEventListener('change', () => { pause(); selected = Number($('boxSelect').value); mode = 'move'; render(); updateUI(); });
$('redrawBtn').addEventListener('click', () => { pause(); mode = 'redraw'; updateUI(); });
$('removeBoxBtn').addEventListener('click', () => {
  if (selected < 0 || exporting) return;
  remember(); regions.splice(selected, 1); selected = Math.min(selected, regions.length - 1); mode = selected < 0 ? 'draw' : 'move'; render(); updateUI();
});
$('undoBtn').addEventListener('click', undo);
$('clearBtn').addEventListener('click', () => { if (exporting) return; remember(); regions = []; selected = -1; mode = 'draw'; render(); updateUI(); });
window.addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  if (e.key === 'Escape') { if (exporting) cancelExport?.(); else finishGesture(true); }
  if (e.code === 'Space' && video && !exporting) { e.preventDefault(); $('playBtn').click(); }
});

document.querySelectorAll('.seg').forEach(button => button.addEventListener('click', () => {
  if (exporting) return;
  document.querySelectorAll('.seg').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-selected', String(b === button)); });
  tool = button.dataset.tool; syncControls();
}));
function syncControls() {
  $('colorCtl').classList.toggle('show', tool === 'redact'); $('strengthCtl').classList.toggle('show', tool !== 'redact');
  $('note').classList.toggle('warn', tool !== 'redact');
  $('noteText').textContent = tool === 'redact' ? 'Solid cover is safest for sensitive text. Choose a tool, then draw a new box.' : 'Blur and pixelation can reveal sensitive text. Use Redact for a solid cover.';
  $('strengthLabel').textContent = tool === 'blur' ? 'Radius' : 'Block';
  $('strength').min = tool === 'pixelate' ? 6 : 4; $('strength').max = tool === 'pixelate' ? 60 : 40;
  strength = Math.max(Number($('strength').min), Math.min(Number($('strength').max), strength));
  $('strength').value = strength; $('strengthVal').textContent = strength + 'px';
}
document.querySelectorAll('.swatch').forEach(button => button.addEventListener('click', () => {
  if (exporting) return;
  document.querySelectorAll('.swatch').forEach(b => b.classList.toggle('active', b === button)); fillColor = button.dataset.color;
}));
$('strength').addEventListener('input', e => { strength = Number(e.target.value); $('strengthVal').textContent = strength + 'px'; });

function seekTo(at) {
  if (Math.abs(time() - at) < 0.0001 && !video.seeking) return Promise.resolve();
  const ready = onceEvent(video, 'seeked'); video.currentTime = at; return ready;
}
function download(blob, extension) {
  const link = document.createElement('a'), url = URL.createObjectURL(blob);
  link.href = url; link.download = `${fileName}-redacted.${extension}`; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function imageBlob() {
  finishGesture(true); composite(outputCtx, 0);
  return new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the image.')), 'image/png'));
}
function recordingType() {
  if (!window.MediaRecorder || !canvas.captureStream) return null;
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type)) || null;
}
let exportTrack = null;
async function exportVideo() {
  const mimeType = recordingType();
  if (!mimeType) { toast('Video export is unavailable in this browser. Try current Chrome or Edge.', true); return; }
  if (document.hidden) { toast('Keep this tab visible while exporting.', true); return; }
  finishGesture(true); pause();
  const previousTime = time();
  exporting = true; $('exportProgress').value = 0; $('exportStatus').textContent = 'Preparing export…'; updateUI();
  let stream, destination, recorder, watchdog, failure = null, cancelled = false, stopRecording;
  const chunks = [];
  const abort = message => {
    cancelled = true; if (message) failure = new Error(message);
    video.pause(); stopRecording?.();
  };
  cancelExport = () => abort();
  const visibility = () => { if (document.hidden) abort('Export stopped because the tab was hidden. Keep it visible and try again.'); };
  const mediaError = () => abort('Video playback failed during export. Try another file.');
  document.addEventListener('visibilitychange', visibility); video.addEventListener('error', mediaError);
  try {
    // Resume audio in the button's activation before awaiting loading/seeking.
    if (!audioContext) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Audio export is unavailable in this browser. Try Chrome or Edge.');
      audioContext = new Audio(); audioSource = audioContext.createMediaElementSource(video);
      audioSource.connect(audioContext.destination);
    }
    await audioContext.resume();
    await seekTo(0);
    if (cancelled) return;
    composite(outputCtx, 0);
    stream = output.captureStream(0); exportTrack = stream.getVideoTracks()[0];
    if (!exportTrack.requestFrame) {
      stream.getTracks().forEach(track => track.stop()); stream = output.captureStream(30); exportTrack = stream.getVideoTracks()[0];
    }
    destination = audioContext.createMediaStreamDestination(); audioSource.connect(destination);
    for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
    recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond: 8000000});
    const done = new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', e => { if (e.data.size) chunks.push(e.data); });
      recorder.addEventListener('error', () => reject(new Error('Recording failed. Try a shorter clip or another browser.')), {once: true});
      recorder.addEventListener('stop', resolve, {once: true});
    });
    // Attach a rejection handler immediately, even if video.play() fails first.
    done.catch(() => {});
    let endTimer;
    stopRecording = () => { clearTimeout(endTimer); if (recorder.state !== 'inactive') recorder.stop(); };
    const ended = () => {
      if (!cancelled) { composite(outputCtx, video.duration); exportTrack?.requestFrame?.(); }
      // Allow the captured last frame to reach the encoder before stopping.
      endTimer = setTimeout(stopRecording, 100);
    };
    video.addEventListener('ended', ended, {once: true});
    try {
      recorder.start(1000); exportTrack.requestFrame?.();
      await video.play();
      let lastTime = time(), lastAdvance = performance.now();
      watchdog = setInterval(() => {
        if (time() > lastTime) { lastTime = time(); lastAdvance = performance.now(); }
        else if (performance.now() - lastAdvance > 15000) abort('Export stalled. Try again with this tab visible.');
      }, 1000);
      await done;
    } finally { video.removeEventListener('ended', ended); clearTimeout(endTimer); }
    if (failure) throw failure;
    if (!cancelled) {
      const blob = new Blob(chunks, {type: recorder.mimeType});
      if (!blob.size) throw new Error('The exported video was empty. Try again.');
      download(blob, recorder.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'); toast('Video saved to Downloads');
    } else toast('Export cancelled');
  } catch (error) { toast(error.message || 'Video export failed. Try again.', true); }
  finally {
    clearInterval(watchdog); stopRecording?.(); video.pause(); stopFrames();
    stream?.getTracks().forEach(track => track.stop());
    if (destination) { audioSource.disconnect(destination); destination.stream.getTracks().forEach(track => track.stop()); }
    exportTrack = null; cancelExport = null;
    document.removeEventListener('visibilitychange', visibility); video.removeEventListener('error', mediaError);
    try { await seekTo(previousTime); } catch { /* Keep the decoded frame if the source failed. */ }
    exporting = false; render(); updateUI();
  }
}
$('saveBtn').addEventListener('click', async () => {
  if (!source || exporting) return;
  if (video) { await exportVideo(); return; }
  try { download(await imageBlob(), 'png'); toast('Image saved to Downloads'); } catch (error) { toast(error.message, true); }
});
$('cancelExportBtn').addEventListener('click', () => cancelExport?.());
$('copyBtn').addEventListener('click', async () => {
  if (!source || video || exporting) return;
  try { const blob = await imageBlob(); await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]); toast('Copied to clipboard'); }
  catch { toast('Copy blocked here. Use Save PNG.', true); }
});

function updateUI() {
  const has = !!source;
  $('saveBtn').disabled = !has || exporting; $('openBtn').disabled = exporting;
  $('saveLabel').textContent = video ? 'Save video' : 'Save PNG';
  $('copyBtn').hidden = !!video; $('copyBtn').disabled = !has || !!video || exporting;
  $('undoBtn').disabled = exporting || !history.length; $('clearBtn').disabled = exporting || !regions.length;
  $('videoControls').hidden = !video; $('exportRow').hidden = !exporting;
  for (const id of ['playBtn', 'timeline', 'addBoxBtn', 'boxSelect']) $(id).disabled = exporting;
  $('redrawBtn').disabled = exporting || selected < 0; $('removeBoxBtn').disabled = exporting || selected < 0;
  document.querySelectorAll('.seg,.swatch,#strength').forEach(el => { el.disabled = exporting; });
  $('addBoxBtn').classList.toggle('active', mode === 'draw'); $('redrawBtn').classList.toggle('active', mode === 'redraw');
  canvas.style.cursor = video && mode === 'move' ? 'move' : 'crosshair';
  $('boxSelect').replaceChildren();
  if (selected < 0) $('boxSelect').add(new Option('Choose a box', '-1'));
  regions.forEach((r, i) => $('boxSelect').add(new Option(`Box ${i + 1} · ${r.type}`, String(i))));
  $('boxSelect').value = String(selected);
  $('videoHint').textContent = mode === 'redraw' ? 'Drag a new rectangle for the selected box. Its size and position change from the current time.' : mode === 'draw' ? 'Draw a box to cover the whole video. Choose Blur, Redact, or Pixelate above before drawing.' : 'Pause and seek, then drag a box to change its position from that point. Earlier positions stay as they were.';
  $('keyframeRow').hidden = selected < 0 || !video; $('keyframes').replaceChildren();
  if (selected >= 0 && video) regions[selected].keyframes.forEach((k, i) => {
    const button = document.createElement('button'); button.className = 'ghost'; button.textContent = formatTime(k.time); button.disabled = exporting;
    button.title = 'Jump to this position change'; button.addEventListener('click', async () => { pause(); try { await seekTo(k.time); } catch (error) { toast(error.message, true); } });
    $('keyframes').append(button);
    if (i > 0) {
      const remove = document.createElement('button'); remove.className = 'ghost'; remove.textContent = '×'; remove.disabled = exporting;
      remove.setAttribute('aria-label', `Remove position change at ${formatTime(k.time)}`);
      remove.addEventListener('click', () => { remember(); regions[selected].keyframes.splice(i, 1); render(); updateUI(); }); $('keyframes').append(remove);
    }
  });
  const noun = video ? (regions.length === 1 ? 'box' : 'boxes') : (regions.length === 1 ? 'region' : 'regions');
  $('meta').textContent = has ? `${canvas.width} × ${canvas.height} px · ${regions.length} ${noun}` : 'No file';
  if (video) updateTime();
}
let toastTimer;
function toast(message, warn = false) {
  $('toastText').textContent = message; $('toast').querySelector('.dot').style.background = warn ? 'var(--warn)' : 'var(--good)';
  $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), warn ? 7000 : 3000);
}
syncControls(); updateUI();

})();
