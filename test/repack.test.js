import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyLinuxOpenTargetsPatch,
  applyLinuxMenuBarPatch,
  applyLinuxNewThreadModelPatch,
  applyLinuxTerminalLifecyclePatch,
  applyLinuxVisualCompatCssPatch,
  applyLinuxVisualCompatJsPatch,
  buildWrapperScript,
  createInstallDiagnosticManifest,
  findExecutableInPath,
  injectLinuxOpenTargetsPatch,
  injectLinuxMenuBarPatch,
  injectLinuxNewThreadModelPatch,
  injectLinuxTerminalLifecyclePatch,
  injectLinuxVisualCompatCssPatch,
  injectLinuxVisualCompatJsPatch,
  parseArgs,
  renderHelp,
  resolveFirstExecutablePath
} from '../src/repack.js';
import { CHANNELS } from '../src/constants.js';

const OPEN_TARGETS_BLOCK_LEGACY =
  'var ua=[Hi,Wi,Bi,Zr,kr,Ni,ia,qi,Dr,ci,ei,jr,ai,Yr,Yi,ui,ii,Ki,$i,gi,_i,vi,yi,bi,xi,Si,Ci,Ii],da=e.sn(`open-in-targets`);function fa(e){return ua.flatMap(t=>{let n=t.platforms[e];return n?[{id:t.id,...n}]:[]})}var pa=fa(process.platform),ma=Ca(pa),ha=new Set(pa.filter(e=>e.kind===`editor`).map(e=>e.id)),ga=null,_a=null;';
const OPEN_TARGETS_BLOCK_CURRENT =
  'var bo=[Za,$a,Ya,ia,Ii,Ba,mo,no,Pi,ha,Ua,sa,Ri,fa,na,io,_a,da,to,co,Ca,wa,Ta,Ea,Da,Oa,ka,Aa,Ga],xo=e.gn(`open-in-targets`);function So(e){return bo.flatMap(t=>{let n=t.platforms[e];return n?[{id:t.id,...n}]:[]})}var Co=So(process.platform),wo=No(Co),To=new Set(Co.filter(e=>e.kind===`editor`).map(e=>e.id)),Eo=null,Do=null;';
const LINUX_MENU_BAR_BUNDLE_CURRENT =
  'new n.BrowserWindow({width:_,height:v,title:i??n.app.getName(),backgroundColor:T,show:l,...process.platform===`win32`?{autoHideMenuBar:!0}:{},...m,minWidth:w.width,minHeight:w.height,webPreferences:{contextIsolation:!0}});';
const TERMINAL_PANEL_BLOCK_LEGACY =
  'function vDe(e){let ee,te;t[29]!==n||t[30]!==i||t[31]!==r||t[32]!==o||t[33]!==m?(ee=()=>{let e=T.current;if(!e)return;let t=o??St.create({conversationId:n,hostId:r??null,cwd:i??null});O.current=t,k.current=!1;let a=!1,s=new nDe.Terminal({allowTransparency:!0,cursorStyle:`bar`,fontSize:j.current,allowProposedApi:!0,cursorBlink:!0,fontFamily:A.current,letterSpacing:0,lineHeight:1.2,theme:RQ()}),c=null,l=()=>{c??=requestAnimationFrame(()=>{c=null,s.scrollToBottom()})};E.current=s;let u=new aDe.ClipboardAddon,d=new iDe.FitAddon;D.current=d;let f=new rDe.WebLinksAddon(bDe);s.loadAddon(u),s.loadAddon(d),s.loadAddon(f),s.attachCustomKeyEventHandler(e=>lDe({clipboard:typeof navigator<`u`&&navigator.clipboard!=null&&m?navigator.clipboard:void 0,event:e,sendText:e=>{St.write(t,e)},term:s})),s.open(e);let p=n=>{a||e.isConnected&&requestAnimationFrame(()=>{a||e.isConnected&&(k.current?IQ(s,d,t):LQ(d),n?.())})};p(),M.current=!1;let h=St.register(t,{onInitLog:e=>{s.write(e),l()},onData:e=>{M.current||(M.current=!0,P(`Running`),I(null)),s.write(e),l()},onExit:()=>{a||P(`Exited`)},onError:e=>{a||(P(`Error`),I(e))},onAttach:(e,t)=>{a||(k.current=!0,P(`Running`),I(null),R(t??null),p())}}),g=s.onData(e=>{St.write(t,e)}),_=s.onKey(yDe);o&&requestAnimationFrame(()=>{a||St.attach({sessionId:o,conversationId:n,hostId:r??null,cwd:i??null,cols:s.cols,rows:s.rows})});let v=new ResizeObserver(()=>{p()});return v.observe(e),()=>{a=!0,c!=null&&(cancelAnimationFrame(c),c=null),v.disconnect(),g.dispose(),_.dispose(),h(),D.current=null,O.current=null,k.current=!1,o||St.close(t),s.dispose(),E.current=null}},te=[n,i,r,o,m],t[29]=n,t[30]=i,t[31]=r,t[32]=o,t[33]=m,t[34]=ee,t[35]=te):(ee=t[34],te=t[35]),(0,Z.useEffect)(ee,te);return(0,$.jsx)(`div`,{"data-codex-terminal":!0})}';
const TERMINAL_PANEL_BLOCK_CURRENT =
  'let ee,te;t[29]!==n||t[30]!==i||t[31]!==r||t[32]!==o||t[33]!==m?(ee=()=>{let e=T.current;if(!e)return;let t=o??ln.create({conversationId:n,hostId:r??null,cwd:i??null});O.current=t,k.current=!1;let a=!1,s=new jke.Terminal({allowTransparency:!0});let c=null,l=()=>{c??=requestAnimationFrame(()=>{c=null,s.scrollToBottom()})};E.current=s;let p=n=>{a||e.isConnected&&requestAnimationFrame(()=>{a||e.isConnected&&(k.current?V0(s,D.current,t):H0(D.current),n?.())})};p(),M.current=!1;let h=ln.register(t,{onInitLog:e=>{s.write(e),l()},onData:e=>{M.current||(M.current=!0,P(`Running`),I(null)),s.write(e),l()},onExit:()=>{a||P(`Exited`)},onError:e=>{a||(P(`Error`),I(e))},onAttach:(e,t)=>{a||(k.current=!0,P(`Running`),I(null),R(t??null),p())}}),g=s.onData(e=>{ln.write(t,e)}),_=s.onKey(Jke);o&&requestAnimationFrame(()=>{a||ln.attach({sessionId:o,conversationId:n,hostId:r??null,cwd:i??null,cols:s.cols,rows:s.rows})});let v=new ResizeObserver(()=>{p()});return v.observe(e),()=>{a=!0,c!=null&&(cancelAnimationFrame(c),c=null),v.disconnect(),g.dispose(),_.dispose(),h(),D.current=null,O.current=null,k.current=!1,o||ln.close(t),s.dispose(),E.current=null}},te=[n,i,r,o,m],t[29]=n,t[30]=i,t[31]=r,t[32]=o,t[33]=m,t[34]=ee,t[35]=te):(ee=t[34],te=t[35]),(0,Z.useEffect)(ee,te);return(0,$.jsx)(`div`,{"data-codex-terminal":!0})}';
const NEW_THREAD_MODEL_SELECTOR_BLOCK_CURRENT =
  'function xf(e){let t=(0,Q.c)(30),n=e===void 0?null:e,{authMethod:r}=Ds(),i=Un(),a;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(a={select:Tf},t[0]=a):a=t[0];let{data:o}=Le(`active-workspace-roots`,a),s=o??null,c;t[1]===s?c=t[2]:(c={hostId:De,cwd:s},t[1]=s,t[2]=c);let l=yf(c),u=_f(),d=Dn(n,wf),f=Dn(n,Cf),p;t[3]===f?p=t[4]:(p=f!=null&&f.trim().length>0?f:null,t[3]=f,t[4]=p);let m=p,h=Dn(n,Sf),g=r===`copilot`,_;t[5]!==i||t[6]!==n?(_=async(e,t)=>{n!=null&&await mf(i,n,e,t)},t[5]=i,t[6]=n,t[7]=_):_=t[7];let v=_,y;t[8]!==h||t[9]!==l||t[10]!==u||t[11]!==d||t[12]!==g||t[13]!==m?(y=d?{model:m??l.model,reasoningEffort:h,isLoading:!1}:g?u:l,t[8]=h,t[9]=l,t[10]=u,t[11]=d,t[12]=g,t[13]=m,t[14]=y):y=t[14];let{model:b,reasoningEffort:x,isLoading:S}=y,{setData:C}=Os(`copilot-default-model`),w=o??null,T;t[15]===w?T=t[16]:(T={hostId:De,cwd:w},t[15]=w,t[16]=T);let E=bf(T),D;t[17]!==i||t[18]!==v||t[19]!==g||t[20]!==E||t[21]!==C?(D=async(e,t)=>{if(await v(e,t),g){C(e);return}try{await i.setDefaultModelConfig(e,t)}catch(e){let t=e;O.error(`Failed to set default model and reasoning effort`,{safe:{},sensitive:{error:t}});return}await E()},t[17]=i,t[18]=v,t[19]=g,t[20]=E,t[21]=C,t[22]=D):D=t[22];let k=D,A;t[23]!==S||t[24]!==b||t[25]!==x?(A={model:b,reasoningEffort:x,isLoading:S},t[23]=S,t[24]=b,t[25]=x,t[26]=A):A=t[26];let j=A,M;return t[27]!==j||t[28]!==k?(M={setModelAndReasoningEffort:k,modelSettings:j},t[27]=j,t[28]=k,t[29]=M):M=t[29],M}';
const NEW_THREAD_MODEL_SUBMIT_BLOCK_CURRENT =
  'async function N({appServerManager:e=x,context:t,prompt:n,workspaceRoots:r,cwd:i}){let a=[{type:`text`,text:n,text_elements:[]},...t.imageAttachments.map(e=>o$(e.src,e.localPath))],o=await e.getUserSavedConfiguration(i);return{input:a,workspaceRoots:r,cwd:i,fileAttachments:t.fileAttachments,addedFiles:t.addedFiles,agentMode:j,model:null,serviceTier:A.serviceTier,reasoningEffort:null,collaborationMode:w,config:o}}';
const NEW_THREAD_MODEL_BUNDLE_CURRENT = `${NEW_THREAD_MODEL_SELECTOR_BLOCK_CURRENT}function Sf(e){return e?.latestCollaborationMode?.settings?.reasoning_effort??null}function Cf(e){return e?.latestCollaborationMode?.settings?.model??null}function wf(e){return e!=null}${NEW_THREAD_MODEL_SUBMIT_BLOCK_CURRENT}let P=async(e,t,n,r)=>{return null};`;
const LINUX_VISUAL_COMPAT_CSS_CURRENT =
  '.window-fx-sidebar-surface{transition:background-color var(--transition-duration-relaxed) var(--transition-ease-basic)}.app-header-tint{transition:background-color var(--transition-duration-relaxed) var(--transition-ease-basic)}.sidebar-resize-handle-line{transition:background-color var(--transition-duration-relaxed) var(--transition-ease-basic)}[data-codex-window-type=electron]:not([data-codex-os=win32]) body{background:0 0;background:var(--color-token-editor-background)}[data-codex-window-type=electron].electron-opaque body{background-color:var(--color-background-surface-under);--color-background-elevated-primary:var(--color-background-elevated-primary-opaque);background-image:none}';
const LINUX_VISUAL_COMPAT_JS_CURRENT =
  'let H,U;t[46]!==T||t[47]!==a?(H=()=>{if(a!==`electron`)return;let e=document.querySelector(`[data-codex-window-type="electron"]`);if(e){if(T.opaqueWindows&&!XZ()){e.classList.add(`electron-opaque`);return}e.classList.remove(`electron-opaque`)}}},U=[T,a],t[46]=T,t[47]=a,t[48]=H,t[49]=U):(H=t[48],U=t[49]),(0,Z.useLayoutEffect)(H,U);';

test('parseArgs accepts diagnostic and patch skip flags', () => {
  const options = parseArgs([
    '--beta',
    '--version',
    '26.325.21211',
    '--skip-open-targets-patch',
    '--skip-terminal-patch',
    '--diagnostic-manifest'
  ]);

  assert.deepEqual(options, {
    beta: true,
    version: '26.325.21211',
    help: false,
    skipOpenTargetsPatch: true,
    skipTerminalPatch: true,
    diagnosticManifest: true
  });
});

test('renderHelp lists the diagnostic and patch skip flags', () => {
  const helpText = renderHelp();

  assert.match(helpText, /--skip-open-targets-patch/);
  assert.match(helpText, /--skip-terminal-patch/);
  assert.match(helpText, /--diagnostic-manifest/);
});

test('findExecutableInPath returns the first executable in PATH order', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-path-order-'));
  try {
    const firstDir = path.join(rootDir, 'first');
    const secondDir = path.join(rootDir, 'second');
    await fs.promises.mkdir(firstDir, { recursive: true });
    await fs.promises.mkdir(secondDir, { recursive: true });

    const firstCandidate = path.join(firstDir, 'codex');
    const secondCandidate = path.join(secondDir, 'codex');
    await fs.promises.writeFile(firstCandidate, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    await fs.promises.writeFile(secondCandidate, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    await fs.promises.chmod(firstCandidate, 0o755);
    await fs.promises.chmod(secondCandidate, 0o755);

    const envPath = [firstDir, secondDir].join(path.delimiter);
    const resolved = await findExecutableInPath('codex', envPath);

    assert.equal(resolved, await fs.promises.realpath(firstCandidate));
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('resolveFirstExecutablePath skips missing and non-executable candidates', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-candidate-skip-'));
  try {
    const missingCandidate = path.join(rootDir, 'missing', 'codex');
    const nonExecutableCandidate = path.join(rootDir, 'nonexec', 'codex');
    const executableCandidate = path.join(rootDir, 'exec', 'codex');
    await fs.promises.mkdir(path.dirname(nonExecutableCandidate), { recursive: true });
    await fs.promises.mkdir(path.dirname(executableCandidate), { recursive: true });
    await fs.promises.writeFile(nonExecutableCandidate, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    await fs.promises.writeFile(executableCandidate, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    await fs.promises.chmod(nonExecutableCandidate, 0o644);
    await fs.promises.chmod(executableCandidate, 0o755);

    const resolved = await resolveFirstExecutablePath([
      missingCandidate,
      nonExecutableCandidate,
      executableCandidate
    ]);

    assert.equal(resolved, await fs.promises.realpath(executableCandidate));
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('resolveFirstExecutablePath preserves candidate precedence', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-candidate-order-'));
  try {
    const firstCandidate = path.join(rootDir, 'one', 'rg');
    const secondCandidate = path.join(rootDir, 'two', 'rg');
    await fs.promises.mkdir(path.dirname(firstCandidate), { recursive: true });
    await fs.promises.mkdir(path.dirname(secondCandidate), { recursive: true });
    await fs.promises.writeFile(firstCandidate, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    await fs.promises.writeFile(secondCandidate, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
    await fs.promises.chmod(firstCandidate, 0o755);
    await fs.promises.chmod(secondCandidate, 0o755);

    const resolved = await resolveFirstExecutablePath([secondCandidate, firstCandidate]);

    assert.equal(resolved, await fs.promises.realpath(secondCandidate));
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

for (const [label, fixture] of [
  ['legacy', OPEN_TARGETS_BLOCK_LEGACY],
  ['current', OPEN_TARGETS_BLOCK_CURRENT]
]) {
  test(`injectLinuxOpenTargetsPatch adds Linux editor targets to the ${label} main bundle`, () => {
    const updated = injectLinuxOpenTargetsPatch(fixture);

    assert.match(updated, /codexLinuxTargets/);
    assert.match(updated, /process\.platform===`linux`&&[A-Za-z_$][\w$]*\.push/);
    assert.match(updated, /id:`vscode`/);
    assert.match(updated, /id:`cursor`/);
    assert.match(updated, /id:`zed`/);
    assert.match(updated, /id:`pycharm`/);
    assert.match(updated, /id:`webstorm`/);
    assert.match(updated, /id:`phpstorm`/);
    assert.match(updated, /args:codexLinuxVscodeArgs/);
    assert.match(updated, /args:codexLinuxJetBrainsArgs/);
    assert.match(updated, /process\.getBuiltinModule/);
  });
}

test('injectLinuxOpenTargetsPatch is idempotent', () => {
  const once = injectLinuxOpenTargetsPatch(OPEN_TARGETS_BLOCK_CURRENT);
  const twice = injectLinuxOpenTargetsPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxOpenTargetsPatch skips patching when disabled', () => {
  const result = applyLinuxOpenTargetsPatch(OPEN_TARGETS_BLOCK_CURRENT, { skip: true });

  assert.equal(result.updated, OPEN_TARGETS_BLOCK_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxOpenTargetsPatch reports diagnostics when the upstream block is missing', () => {
  assert.throws(() => injectLinuxOpenTargetsPatch('const noop = true;', { sourceName: 'main.js' }), {
    message:
      /Could not patch the upstream open-in-targets registry for Linux\. Source: main\.js\. Missing anchors: open-in-targets marker, target registry declaration, platform target flatten function, editor target id set\. Detected anchors: openInTargets=no, targetRegistryDeclaration=no, platformFlatten=no, editorTargetIdSet=no\./
  });
});

test('injectLinuxMenuBarPatch enables Linux native menu-bar auto-hide with env escape hatch', () => {
  const updated = injectLinuxMenuBarPatch(LINUX_MENU_BAR_BUNDLE_CURRENT);

  assert.match(updated, /codexLinuxMenuBarAutoHide/);
  assert.match(
    updated,
    /process\.platform===`linux`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_AUTO_HIDE_MENU_BAR!==`1`/
  );
  assert.match(updated, /autoHideMenuBar:!0/);
});

test('injectLinuxMenuBarPatch is idempotent', () => {
  const once = injectLinuxMenuBarPatch(LINUX_MENU_BAR_BUNDLE_CURRENT);
  const twice = injectLinuxMenuBarPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxMenuBarPatch skips patching when disabled', () => {
  const result = applyLinuxMenuBarPatch(LINUX_MENU_BAR_BUNDLE_CURRENT, { skip: true });

  assert.equal(result.updated, LINUX_MENU_BAR_BUNDLE_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxMenuBarPatch reports diagnostics when menu-bar anchors are missing', () => {
  assert.throws(() => injectLinuxMenuBarPatch('const noop = true;', { sourceName: 'main.js' }), {
    message:
      /Could not patch Linux native menu-bar auto-hide behavior in the Electron main bundle\. Source: main\.js\. Missing anchors: BrowserWindow constructor, autoHideMenuBar option, win32-only autoHideMenuBar ternary\. Detected anchors: browserWindowConstructor=no, autoHideMenuBarOption=no, win32AutoHideMenuBarTernary=no\./
  });
});

for (const [label, fixture] of [
  ['legacy', TERMINAL_PANEL_BLOCK_LEGACY],
  ['current', TERMINAL_PANEL_BLOCK_CURRENT]
]) {
  test(
    `injectLinuxTerminalLifecyclePatch adds a Linux terminal handoff guard to the ${label} renderer bundle`,
    () => {
      const updated = injectLinuxTerminalLifecyclePatch(fixture);

      assert.match(updated, /codexLinuxTerminalMounts/);
      assert.match(updated, /codexLinuxResetTerminalMount\(codexLinuxTerminalMountKey\)/);
      assert.match(updated, /codexLinuxAttachFrame=requestAnimationFrame/);
      assert.match(updated, /codexLinuxPreserveSession=\!1/);
      assert.match(updated, /codexLinuxTraceTerminalAttachScheduled/);
      assert.match(updated, /codexLinuxTraceTerminalAttached/);
      assert.doesNotMatch(updated, /\$\{"\$\{"\}/);
      assert.match(
        updated,
        /codexLinuxSetTerminalMount\(codexLinuxTerminalMountKey,codexLinuxDisposeCurrentMount\)/
      );
      assert.match(
        updated,
        /codexLinuxReleaseTerminalMount\(codexLinuxTerminalMountKey,codexLinuxDisposeCurrentMount\)/
      );
      assert.match(updated, /codexLinuxPreserveSession\|\|o\|\|(?:St|ln)\.close\(t\)/);
    }
  );
}

test('injectLinuxTerminalLifecyclePatch is idempotent', () => {
  const once = injectLinuxTerminalLifecyclePatch(TERMINAL_PANEL_BLOCK_CURRENT);
  const twice = injectLinuxTerminalLifecyclePatch(once);

  assert.equal(twice, once);
});

test('injectLinuxTerminalLifecyclePatch emits parseable terminal helper code for the current fixture', () => {
  const updated = injectLinuxTerminalLifecyclePatch(TERMINAL_PANEL_BLOCK_CURRENT);
  const helperMatch = updated.match(
    /(var codexLinuxTerminalMounts[\s\S]*?function codexLinuxReleaseTerminalMount\(e,t\)\{[\s\S]*?\})let t=o\?\?/
  );

  assert.doesNotMatch(updated, /\$\{"\$\{"\}/);
  assert.ok(helperMatch);
  assert.doesNotThrow(() => new Function(`${helperMatch[1]};return true;`));
});

test('applyLinuxTerminalLifecyclePatch skips patching when disabled', () => {
  const result = applyLinuxTerminalLifecyclePatch(TERMINAL_PANEL_BLOCK_CURRENT, { skip: true });

  assert.equal(result.updated, TERMINAL_PANEL_BLOCK_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxTerminalLifecyclePatch reports diagnostics when the terminal block is missing', () => {
  assert.throws(
    () => injectLinuxTerminalLifecyclePatch('const noop = true;', { sourceName: 'index.js' }),
    {
      message:
        /Could not patch the renderer terminal lifecycle bundle for Linux\. Source: index\.js\. Missing anchors: data-codex-terminal marker, terminal onInitLog handler, terminal session creation, terminal post-init state reset, terminal attach scheduling, terminal attach completion hook, terminal cleanup handoff\. Detected anchors: terminalComponent=no, initLogHandler=no, sessionCreate=no, postInit=no, attach=no, onAttach=no, cleanup=no\./
    }
  );
});

test('injectLinuxNewThreadModelPatch adds optimistic fresh-thread model state to the renderer bundle', () => {
  const updated = injectLinuxNewThreadModelPatch(NEW_THREAD_MODEL_BUNDLE_CURRENT);

  assert.match(updated, /codexLinuxPendingModelSettings/);
  assert.match(updated, /codexLinuxIsFreshComposer=n==null/);
  assert.match(updated, /codexLinuxSetPendingModelSettings\(\{model:e,reasoningEffort:t,cwd:s\}\)/);
  assert.match(updated, /codexLinuxFreshComposerBaseSettings=g\?u:l/);
  assert.match(updated, /collaborationMode:s,config:o/);
  assert.match(updated, /model:w\.settings\?\.model\?\?o\.model\?\?null/);
});

test('injectLinuxNewThreadModelPatch is idempotent', () => {
  const once = injectLinuxNewThreadModelPatch(NEW_THREAD_MODEL_BUNDLE_CURRENT);
  const twice = injectLinuxNewThreadModelPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxNewThreadModelPatch skips patching when disabled', () => {
  const result = applyLinuxNewThreadModelPatch(NEW_THREAD_MODEL_BUNDLE_CURRENT, { skip: true });

  assert.equal(result.updated, NEW_THREAD_MODEL_BUNDLE_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxNewThreadModelPatch reports diagnostics when the model bundle is missing', () => {
  assert.throws(
    () => injectLinuxNewThreadModelPatch('const noop = true;', { sourceName: 'index.js' }),
    {
      message:
        /Could not patch the renderer new-thread model bundle for Linux\. Source: index\.js\. Missing anchors: model selector hook, fresh-thread selector state block, fresh-thread selector value branch, fresh-thread selector setter, fresh-thread submit builder, fresh-thread collaborationMode payload\. Detected anchors: selectorHook=no, selectorStateBlock=no, selectorValueBranch=no, selectorSetter=no, freshThreadSubmit=no, collaborationModeSubmit=no\./
    }
  );
});

test('injectLinuxVisualCompatCssPatch adds Linux sidebar rendering overrides', () => {
  const updated = injectLinuxVisualCompatCssPatch(LINUX_VISUAL_COMPAT_CSS_CURRENT);

  assert.match(updated, /codexLinuxVisualCompat/);
  assert.match(updated, /codex-linux-visual-compat/);
  assert.match(updated, /background:var\(--color-token-side-bar-background\)!important/);
  assert.match(updated, /transition:none!important/);
  assert.doesNotMatch(updated, /\.window-fx-sidebar-surface \*/);
  assert.doesNotMatch(updated, /animation:none!important/);
});

test('injectLinuxVisualCompatCssPatch is idempotent', () => {
  const once = injectLinuxVisualCompatCssPatch(LINUX_VISUAL_COMPAT_CSS_CURRENT);
  const twice = injectLinuxVisualCompatCssPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxVisualCompatCssPatch skips patching when disabled', () => {
  const result = applyLinuxVisualCompatCssPatch(LINUX_VISUAL_COMPAT_CSS_CURRENT, { skip: true });

  assert.equal(result.updated, LINUX_VISUAL_COMPAT_CSS_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxVisualCompatCssPatch reports diagnostics when CSS anchors are missing', () => {
  assert.throws(
    () => injectLinuxVisualCompatCssPatch('body{background:black}', { sourceName: 'index.css' }),
    {
      message:
        /Could not patch the renderer Linux visual-compat stylesheet\. Source: index\.css\. Missing anchors: electron window type selector, sidebar surface class, sidebar resize handle class\. Detected anchors: electronWindowTypeSelector=no, sidebarSurfaceClass=no, sidebarResizeHandleClass=no\./
    }
  );
});

test('injectLinuxVisualCompatJsPatch enables Linux visual compat class and opaque windows', () => {
  const updated = injectLinuxVisualCompatJsPatch(LINUX_VISUAL_COMPAT_JS_CURRENT);

  assert.match(updated, /codexLinuxVisualCompat/);
  assert.match(updated, /CODEX_DESKTOP_DISABLE_LINUX_VISUAL_COMPAT/);
  assert.match(updated, /classList\.toggle\(`codex-linux-visual-compat`,r\)/);
  assert.match(updated, /\(T\.opaqueWindows\|\|r\)&&!XZ\(\)/);
});

test('injectLinuxVisualCompatJsPatch is idempotent', () => {
  const once = injectLinuxVisualCompatJsPatch(LINUX_VISUAL_COMPAT_JS_CURRENT);
  const twice = injectLinuxVisualCompatJsPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxVisualCompatJsPatch skips patching when disabled', () => {
  const result = applyLinuxVisualCompatJsPatch(LINUX_VISUAL_COMPAT_JS_CURRENT, { skip: true });

  assert.equal(result.updated, LINUX_VISUAL_COMPAT_JS_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxVisualCompatJsPatch reports diagnostics when JS anchors are missing', () => {
  assert.throws(
    () => injectLinuxVisualCompatJsPatch('const noop = true;', { sourceName: 'index.js' }),
    {
      message:
        /Could not patch the renderer Linux visual-compat script\. Source: index\.js\. Missing anchors: electron window selector, electron-opaque class, codexOs dataset access, opaque window effect block\. Detected anchors: electronWindowSelector=no, electronOpaqueClass=no, codexOsDataset=no, opaqueEffectBlock=no\./
    }
  );
});

test('buildWrapperScript includes perf toggles and runtime logging', () => {
  const script = buildWrapperScript({
    channel: CHANNELS.stable,
    electronBinary: '/tmp/codex/app/codex',
    bundledCodexCliPath: '/tmp/codex/app/resources/bin/codex',
    userDataDir: '/tmp/codex/state/user-data',
    runtimeLogDir: '/tmp/codex/state/logs',
    diagnosticManifestPath: '/tmp/codex/install-diagnostic-manifest.json',
    patchSummary: 'bootstrap=applied,openTargets=skipped,terminalLifecycle=applied,newThreadModel=applied'
  });

  assert.match(script, /CODEX_DESKTOP_DISABLE_GPU/);
  assert.match(script, /--disable-gpu/);
  assert.match(script, /CODEX_DESKTOP_OZONE_PLATFORM_HINT/);
  assert.match(script, /--ozone-platform=/);
  assert.doesNotMatch(script, /--ozone-platform-hint=/);
  assert.match(script, /CODEX_DESKTOP_ENABLE_CHROMIUM_LOGGING/);
  assert.match(script, /runtime-launch-stable\.log/);
  assert.match(script, /install-diagnostic-manifest\.json/);
});

test('createInstallDiagnosticManifest includes release, runtime, native module, and patch state', () => {
  const manifest = createInstallDiagnosticManifest({
    installedAt: '2026-03-27T08:11:28.661Z',
    channel: CHANNELS.stable,
    release: {
      version: '26.325.21211',
      buildNumber: '1255'
    },
    flavor: 'prod',
    electronVersion: '40.0.0',
    runtimeSourceKind: 'local',
    nativeModules: ['better-sqlite3', 'node-pty'],
    nativeModuleVersions: {
      'better-sqlite3': '12.4.6',
      'node-pty': '1.1.0'
    },
    patches: {
      bootstrap: {
        status: 'applied',
        sourceName: 'bootstrap.js'
      },
      openTargets: {
        status: 'skipped',
        reason: 'cli-option-disabled'
      },
      linuxMenuBar: {
        status: 'applied',
        sourceName: 'main.js'
      },
      terminalLifecycle: {
        status: 'applied',
        sourceName: 'index.js'
      },
      newThreadModel: {
        status: 'applied',
        sourceName: 'index.js'
      },
      linuxVisualCompat: {
        status: 'applied',
        sourceName: 'index.js'
      }
    }
  });

  assert.deepEqual(manifest, {
    manifestVersion: 1,
    installedAt: '2026-03-27T08:11:28.661Z',
    channel: 'stable',
    upstream: {
      version: '26.325.21211',
      buildNumber: '1255',
      flavor: 'prod'
    },
    runtime: {
      electronVersion: '40.0.0',
      sourceKind: 'local'
    },
    nativeModules: [
      {
        name: 'better-sqlite3',
        version: '12.4.6'
      },
      {
        name: 'node-pty',
        version: '1.1.0'
      }
    ],
    patches: {
      bootstrap: {
        status: 'applied',
        sourceName: 'bootstrap.js'
      },
      openTargets: {
        status: 'skipped',
        reason: 'cli-option-disabled'
      },
      linuxMenuBar: {
        status: 'applied',
        sourceName: 'main.js'
      },
      terminalLifecycle: {
        status: 'applied',
        sourceName: 'index.js'
      },
      newThreadModel: {
        status: 'applied',
        sourceName: 'index.js'
      },
      linuxVisualCompat: {
        status: 'applied',
        sourceName: 'index.js'
      }
    }
  });
});
