(function(){
  "use strict";
// Geometry changes hold until the next keyframe. Time stays in media seconds.
function geometryAt(region, time) {
  let result = region.keyframes[0];
  for (const frame of region.keyframes) {
    if (frame.time > time + 1e-6) break;
    result = frame;
  }
  return result;
}

function setGeometry(region, time, geometry) {
  const frame = { ...geometry, time: Math.max(0, Math.round(time * 1000) / 1000) };
  const frames = region.keyframes.filter(k => Math.abs(k.time - frame.time) > 0.0005);
  return { ...region, keyframes: [...frames, frame].sort((a, b) => a.time - b.time) };
}

function moveGeometry(geometry, dx, dy, width, height) {
  return { ...geometry,
    x: Math.max(0, Math.min(width - geometry.w, geometry.x + dx)),
    y: Math.max(0, Math.min(height - geometry.h, geometry.y + dy)) };
}

function snapshot(regions) {
  return regions.map(r => ({ ...r, keyframes: r.keyframes.map(k => ({ ...k })) }));
}

  globalThis.VideoBoxModel = Object.freeze({geometryAt, setGeometry, moveGeometry, snapshot});
})();
