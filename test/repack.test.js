import test from 'node:test';
import assert from 'node:assert/strict';
import {
  injectLinuxOpenTargetsPatch,
  injectLinuxTerminalLifecyclePatch
} from '../src/repack.js';

const OPEN_TARGETS_BLOCK =
  'var ua=[Hi,Wi,Bi,Zr,kr,Ni,ia,qi,Dr,ci,ei,jr,ai,Yr,Yi,ui,ii,Ki,$i,gi,_i,vi,yi,bi,xi,Si,Ci,Ii],da=e.sn(`open-in-targets`);function fa(e){return ua.flatMap(t=>{let n=t.platforms[e];return n?[{id:t.id,...n}]:[]})}var pa=fa(process.platform),ma=Ca(pa),ha=new Set(pa.filter(e=>e.kind===`editor`).map(e=>e.id)),ga=null,_a=null;';
const TERMINAL_PANEL_BLOCK =
  'function vDe(e){let ee,te;t[29]!==n||t[30]!==i||t[31]!==r||t[32]!==o||t[33]!==m?(ee=()=>{let e=T.current;if(!e)return;let t=o??St.create({conversationId:n,hostId:r??null,cwd:i??null});O.current=t,k.current=!1;let a=!1,s=new nDe.Terminal({allowTransparency:!0,cursorStyle:`bar`,fontSize:j.current,allowProposedApi:!0,cursorBlink:!0,fontFamily:A.current,letterSpacing:0,lineHeight:1.2,theme:RQ()}),c=null,l=()=>{c??=requestAnimationFrame(()=>{c=null,s.scrollToBottom()})};E.current=s;let u=new aDe.ClipboardAddon,d=new iDe.FitAddon;D.current=d;let f=new rDe.WebLinksAddon(bDe);s.loadAddon(u),s.loadAddon(d),s.loadAddon(f),s.attachCustomKeyEventHandler(e=>lDe({clipboard:typeof navigator<`u`&&navigator.clipboard!=null&&m?navigator.clipboard:void 0,event:e,sendText:e=>{St.write(t,e)},term:s})),s.open(e);let p=n=>{a||e.isConnected&&requestAnimationFrame(()=>{a||e.isConnected&&(k.current?IQ(s,d,t):LQ(d),n?.())})};p(),M.current=!1;let h=St.register(t,{onInitLog:e=>{s.write(e),l()},onData:e=>{M.current||(M.current=!0,P(`Running`),I(null)),s.write(e),l()},onExit:()=>{a||P(`Exited`)},onError:e=>{a||(P(`Error`),I(e))},onAttach:(e,t)=>{a||(k.current=!0,P(`Running`),I(null),R(t??null),p())}}),g=s.onData(e=>{St.write(t,e)}),_=s.onKey(yDe);o&&requestAnimationFrame(()=>{a||St.attach({sessionId:o,conversationId:n,hostId:r??null,cwd:i??null,cols:s.cols,rows:s.rows})});let v=new ResizeObserver(()=>{p()});return v.observe(e),()=>{a=!0,c!=null&&(cancelAnimationFrame(c),c=null),v.disconnect(),g.dispose(),_.dispose(),h(),D.current=null,O.current=null,k.current=!1,o||St.close(t),s.dispose(),E.current=null}},te=[n,i,r,o,m],t[29]=n,t[30]=i,t[31]=r,t[32]=o,t[33]=m,t[34]=ee,t[35]=te):(ee=t[34],te=t[35]),(0,Z.useEffect)(ee,te);return(0,$.jsx)(`div`,{"data-codex-terminal":!0})}';

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

test('injectLinuxTerminalLifecyclePatch adds a Linux terminal handoff guard to the renderer bundle', () => {
  const updated = injectLinuxTerminalLifecyclePatch(TERMINAL_PANEL_BLOCK);

  assert.match(updated, /codexLinuxTerminalMounts/);
  assert.match(updated, /codexLinuxResetTerminalMount\(codexLinuxTerminalMountKey\)/);
  assert.match(updated, /codexLinuxAttachFrame=requestAnimationFrame/);
  assert.match(updated, /codexLinuxPreserveSession=\!1/);
  assert.match(updated, /codexLinuxSetTerminalMount\(codexLinuxTerminalMountKey,codexLinuxDisposeCurrentMount\)/);
  assert.match(updated, /codexLinuxReleaseTerminalMount\(codexLinuxTerminalMountKey,codexLinuxDisposeCurrentMount\)/);
  assert.match(updated, /codexLinuxPreserveSession\|\|o\|\|St\.close\(t\)/);
});

test('injectLinuxTerminalLifecyclePatch is idempotent', () => {
  const once = injectLinuxTerminalLifecyclePatch(TERMINAL_PANEL_BLOCK);
  const twice = injectLinuxTerminalLifecyclePatch(once);

  assert.equal(twice, once);
});

test('injectLinuxTerminalLifecyclePatch fails when the terminal block is missing', () => {
  assert.throws(
    () => injectLinuxTerminalLifecyclePatch('const noop = true;'),
    /Could not inject the Linux terminal lifecycle helpers into the renderer bundle/
  );
});
