import { test, expect } from 'bun:test';
import '../video-model.js';
const { geometryAt, setGeometry, moveGeometry, snapshot } = globalThis.VideoBoxModel;
const initial = {time: 0, x: 10, y: 20, w: 50, h: 30};
const region = {type: 'blur', strength: 14, keyframes: [initial]};

test('fixed boxes cover the entire clip; changes switch exactly at their timestamp', () => {
  expect(geometryAt(region, 100)).toEqual(initial);
  const changed = setGeometry(region, 2, {...initial, x: 80});
  expect(geometryAt(changed, 1.999).x).toBe(10);
  expect(geometryAt(changed, 2).x).toBe(80);
  expect(geometryAt(changed, 50).x).toBe(80);
  expect(geometryAt(changed, 0).x).toBe(10);
});
test('editing earlier preserves later changes and replaces the current change', () => {
  let changed = setGeometry(region, 3, {...initial, x: 90});
  changed = setGeometry(changed, 1, {...initial, x: 40});
  changed = setGeometry(changed, 1, {...initial, x: 60});
  expect(changed.keyframes.map(k => k.time)).toEqual([0, 1, 3]);
  expect(geometryAt(changed, 2).x).toBe(60);
  expect(geometryAt(changed, 4).x).toBe(90);
});
test('moves stay inside the source dimensions', () => {
  expect(moveGeometry(initial, -100, 200, 200, 100)).toEqual({...initial, x: 0, y: 70});
});
test('an adjustment near the beginning keeps the zero-time coverage', () => {
  const changed = setGeometry(region, 0.001, {...initial, x: 80});
  expect(changed.keyframes.map(k => k.time)).toEqual([0, 0.001]);
  expect(geometryAt(changed, 0).x).toBe(10);
});
test('undo snapshots do not alias live geometry or style', () => {
  const copy = snapshot([region]);
  copy[0].strength = 30;
  copy[0].keyframes[0].x = 999;
  expect(region.strength).toBe(14);
  expect(initial.x).toBe(10);
});
