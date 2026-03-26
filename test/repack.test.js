import test from 'node:test';
import assert from 'node:assert/strict';
import { injectLinuxOpenTargetsPatch } from '../src/repack.js';

const OPEN_TARGETS_BLOCK =
  'var ua=[Hi,Wi,Bi,Zr,kr,Ni,ia,qi,Dr,ci,ei,jr,ai,Yr,Yi,ui,ii,Ki,$i,gi,_i,vi,yi,bi,xi,Si,Ci,Ii],da=e.sn(`open-in-targets`);function fa(e){return ua.flatMap(t=>{let n=t.platforms[e];return n?[{id:t.id,...n}]:[]})}var pa=fa(process.platform),ma=Ca(pa),ha=new Set(pa.filter(e=>e.kind===`editor`).map(e=>e.id)),ga=null,_a=null;';

test('injectLinuxOpenTargetsPatch adds Linux editor targets to the main bundle', () => {
  const updated = injectLinuxOpenTargetsPatch(OPEN_TARGETS_BLOCK);

  assert.match(updated, /codexLinuxTargets/);
  assert.match(updated, /process\.platform===`linux`&&ua\.push/);
  assert.match(updated, /id:`vscode`/);
  assert.match(updated, /id:`cursor`/);
  assert.match(updated, /id:`zed`/);
  assert.match(updated, /id:`pycharm`/);
  assert.match(updated, /id:`webstorm`/);
  assert.match(updated, /id:`phpstorm`/);
  assert.match(updated, /linux:\{detect:\(\)=>codexLinuxDetectAny/);
  assert.match(updated, /linux:\{detect:\(\)=>codexLinuxDetectJetBrains/);
});

test('injectLinuxOpenTargetsPatch is idempotent', () => {
  const once = injectLinuxOpenTargetsPatch(OPEN_TARGETS_BLOCK);
  const twice = injectLinuxOpenTargetsPatch(once);

  assert.equal(twice, once);
});

test('injectLinuxOpenTargetsPatch fails when the upstream block is missing', () => {
  assert.throws(
    () => injectLinuxOpenTargetsPatch('const noop = true;'),
    /Could not patch the upstream open-in-targets registry for Linux/
  );
});
