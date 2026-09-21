import test from 'node:test';
import assert from 'node:assert/strict';
import { requestBody, taskRecord, requiredCredits, PLAN } from './scroll-world.mjs';
import { validManifest, segmentAt } from '../apps/landing/assets/scroll-world/runtime/engine.mjs';

const fixture = () => ({ version: 1, status: 'verified', architecture: 'A',
  clips: Array.from({ length: 4 }, (_, i) => ({ desktop: `media/leg-${i+1}.mp4`,
    mobile: `media/leg-${i+1}-m.mp4`, poster: `media/leg-${i+1}-poster.png`,
    posterMobile: `media/leg-${i+1}-m-poster.png`, duration: 5, fps: 24 })),
  seams: Array.from({ length: 3 }, () => ({ desktop: .98, mobile: .97 })) });

test('generation uses an actual first frame, no end frame or audio', () => {
  const body = requestBody('Continue the same forward drift', 'https://example.com/actual-frame.png');
  assert.equal(body.input.generate_audio, false);
  assert.equal(body.input.first_frame_url, 'https://example.com/actual-frame.png');
  assert.equal(body.input.duration, 5);
  assert.equal(body.input.resolution, '720p');
  assert.equal(body.input.nsfw_checker, true);
  assert.ok(!('last_frame_url' in body.input));
  assert.ok(!('reference_image_urls' in body.input));
  for (const url of ['http://example.com/x', 'file:///tmp/x', 'https://user:pass@example.com/x']) {
    assert.throws(() => requestBody('forward', url));
  }
  assert.throws(() => requestBody('', 'https://example.com/x'));
});

test('live budget is calculated in credits, not generation count', () => {
  assert.equal(requiredCredits(0), PLAN.maxCredits);
  assert.equal(requiredCredits(1), 123);
  assert.equal(requiredCredits(4), 0);
  for (const count of [-1, 5, .5, NaN]) assert.throws(() => requiredCredits(count));
  assert.throws(() => requiredCredits(0, NaN));
});

test('polling supports documented result and observed alternate shape', () => {
  const resultUrls = ['https://example.com/result.mp4'];
  for (const data of [{ resultJson: JSON.stringify({ resultUrls }) }, { response: { resultUrls } }]) {
    assert.equal(taskRecord({ code: 200, data: { state: 'success', ...data } }).url, resultUrls[0]);
  }
  assert.equal(taskRecord({ code: 200, data: { state: 'generating' } }).state, 'generating');
  assert.equal(taskRecord({ code: 200, data: { state: 'fail', failMsg: 'provider failure' } }).failure, 'provider failure');
  for (const value of [null, {code: 401}, {code:200,data:{state:'unknown'}}, {code:200,data:{state:'success'}}]) {
    assert.throws(() => taskRecord(value));
  }
});

test('runtime never enables missing, unsafe or unverified assets', () => {
  assert.equal(validManifest(fixture(), 4), true);
  for (const mutate of [m => m.status = 'pending', m => m.clips.pop(),
    m => m.clips[0].desktop = '../secret', m => m.clips[0].mobile = 'https://example.com/x',
    m => m.clips[0].duration = NaN, m => m.seams[1].mobile = .89, m => m.seams.pop(),
    m => m.clips[0] = null, m => m.seams[0] = null, m => m.clips = '1234', m => m.seams = '123']) {
    const m = fixture(); mutate(m); assert.equal(validManifest(m, 4), false);
  }
});

test('scroll mapping holds exact endpoints and reverses across boundaries', () => {
  assert.throws(() => segmentAt(NaN, 4));
  assert.throws(() => segmentAt(.5, 0));
  assert.deepEqual(segmentAt(-1, 4), {index:0,local:0});
  assert.deepEqual(segmentAt(0, 4), {index:0,local:0});
  assert.deepEqual(segmentAt(.25, 4), {index:1,local:0});
  assert.deepEqual(segmentAt(.5, 4), {index:2,local:0});
  assert.deepEqual(segmentAt(1, 4), {index:3,local:1});
  assert.deepEqual(segmentAt(2, 4), {index:3,local:1});
  for (let n = 100; n >= 0; n--) {
    const p = n / 100, {index, local} = segmentAt(p, 4);
    assert.ok(Math.abs((index + local) / 4 - p) < 1e-10);
  }
});
