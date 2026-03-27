import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLinuxOpenTargetsPatch,
  applyLinuxTerminalLifecyclePatch,
  buildWrapperScript,
  createInstallDiagnosticManifest,
  injectLinuxOpenTargetsPatch,
  injectLinuxTerminalLifecyclePatch,
  parseArgs,
  renderHelp
} from '../src/repack.js';
import { CHANNELS } from '../src/constants.js';

const OPEN_TARGETS_BLOCK_LEGACY =
  'var ua=[Hi,Wi,Bi,Zr,kr,Ni,ia,qi,Dr,ci,ei,jr,ai,Yr,Yi,ui,ii,Ki,$i,gi,_i,vi,yi,bi,xi,Si,Ci,Ii],da=e.sn(`open-in-targets`);function fa(e){return ua.flatMap(t=>{let n=t.platforms[e];return n?[{id:t.id,...n}]:[]})}var pa=fa(process.platform),ma=Ca(pa),ha=new Set(pa.filter(e=>e.kind===`editor`).map(e=>e.id)),ga=null,_a=null;';
const OPEN_TARGETS_BLOCK_CURRENT =
  'var bo=[Za,$a,Ya,ia,Ii,Ba,mo,no,Pi,ha,Ua,sa,Ri,fa,na,io,_a,da,to,co,Ca,wa,Ta,Ea,Da,Oa,ka,Aa,Ga],xo=e.gn(`open-in-targets`);function So(e){return bo.flatMap(t=>{let n=t.platforms[e];return n?[{id:t.id,...n}]:[]})}var Co=So(process.platform),wo=No(Co),To=new Set(Co.filter(e=>e.kind===`editor`).map(e=>e.id)),Eo=null,Do=null;';
const TERMINAL_PANEL_BLOCK_LEGACY =
  'function vDe(e){let ee,te;t[29]!==n||t[30]!==i||t[31]!==r||t[32]!==o||t[33]!==m?(ee=()=>{let e=T.current;if(!e)return;let t=o??St.create({conversationId:n,hostId:r??null,cwd:i??null});O.current=t,k.current=!1;let a=!1,s=new nDe.Terminal({allowTransparency:!0,cursorStyle:`bar`,fontSize:j.current,allowProposedApi:!0,cursorBlink:!0,fontFamily:A.current,letterSpacing:0,lineHeight:1.2,theme:RQ()}),c=null,l=()=>{c??=requestAnimationFrame(()=>{c=null,s.scrollToBottom()})};E.current=s;let u=new aDe.ClipboardAddon,d=new iDe.FitAddon;D.current=d;let f=new rDe.WebLinksAddon(bDe);s.loadAddon(u),s.loadAddon(d),s.loadAddon(f),s.attachCustomKeyEventHandler(e=>lDe({clipboard:typeof navigator<`u`&&navigator.clipboard!=null&&m?navigator.clipboard:void 0,event:e,sendText:e=>{St.write(t,e)},term:s})),s.open(e);let p=n=>{a||e.isConnected&&requestAnimationFrame(()=>{a||e.isConnected&&(k.current?IQ(s,d,t):LQ(d),n?.())})};p(),M.current=!1;let h=St.register(t,{onInitLog:e=>{s.write(e),l()},onData:e=>{M.current||(M.current=!0,P(`Running`),I(null)),s.write(e),l()},onExit:()=>{a||P(`Exited`)},onError:e=>{a||(P(`Error`),I(e))},onAttach:(e,t)=>{a||(k.current=!0,P(`Running`),I(null),R(t??null),p())}}),g=s.onData(e=>{St.write(t,e)}),_=s.onKey(yDe);o&&requestAnimationFrame(()=>{a||St.attach({sessionId:o,conversationId:n,hostId:r??null,cwd:i??null,cols:s.cols,rows:s.rows})});let v=new ResizeObserver(()=>{p()});return v.observe(e),()=>{a=!0,c!=null&&(cancelAnimationFrame(c),c=null),v.disconnect(),g.dispose(),_.dispose(),h(),D.current=null,O.current=null,k.current=!1,o||St.close(t),s.dispose(),E.current=null}},te=[n,i,r,o,m],t[29]=n,t[30]=i,t[31]=r,t[32]=o,t[33]=m,t[34]=ee,t[35]=te):(ee=t[34],te=t[35]),(0,Z.useEffect)(ee,te);return(0,$.jsx)(`div`,{"data-codex-terminal":!0})}';
const TERMINAL_PANEL_BLOCK_CURRENT =
  'let ee,te;t[29]!==n||t[30]!==i||t[31]!==r||t[32]!==o||t[33]!==m?(ee=()=>{let e=T.current;if(!e)return;let t=o??ln.create({conversationId:n,hostId:r??null,cwd:i??null});O.current=t,k.current=!1;let a=!1,s=new jke.Terminal({allowTransparency:!0});let c=null,l=()=>{c??=requestAnimationFrame(()=>{c=null,s.scrollToBottom()})};E.current=s;let p=n=>{a||e.isConnected&&requestAnimationFrame(()=>{a||e.isConnected&&(k.current?V0(s,D.current,t):H0(D.current),n?.())})};p(),M.current=!1;let h=ln.register(t,{onInitLog:e=>{s.write(e),l()},onData:e=>{M.current||(M.current=!0,P(`Running`),I(null)),s.write(e),l()},onExit:()=>{a||P(`Exited`)},onError:e=>{a||(P(`Error`),I(e))},onAttach:(e,t)=>{a||(k.current=!0,P(`Running`),I(null),R(t??null),p())}}),g=s.onData(e=>{ln.write(t,e)}),_=s.onKey(Jke);o&&requestAnimationFrame(()=>{a||ln.attach({sessionId:o,conversationId:n,hostId:r??null,cwd:i??null,cols:s.cols,rows:s.rows})});let v=new ResizeObserver(()=>{p()});return v.observe(e),()=>{a=!0,c!=null&&(cancelAnimationFrame(c),c=null),v.disconnect(),g.dispose(),_.dispose(),h(),D.current=null,O.current=null,k.current=!1,o||ln.close(t),s.dispose(),E.current=null}},te=[n,i,r,o,m],t[29]=n,t[30]=i,t[31]=r,t[32]=o,t[33]=m,t[34]=ee,t[35]=te):(ee=t[34],te=t[35]),(0,Z.useEffect)(ee,te);return(0,$.jsx)(`div`,{"data-codex-terminal":!0})}';

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

test('buildWrapperScript includes perf toggles and runtime logging', () => {
  const script = buildWrapperScript({
    channel: CHANNELS.stable,
    electronBinary: '/tmp/codex/app/codex',
    bundledCodexCliPath: '/tmp/codex/app/resources/bin/codex',
    userDataDir: '/tmp/codex/state/user-data',
    runtimeLogDir: '/tmp/codex/state/logs',
    diagnosticManifestPath: '/tmp/codex/install-diagnostic-manifest.json',
    patchSummary: 'bootstrap=applied,openTargets=skipped,terminalLifecycle=applied'
  });

  assert.match(script, /CODEX_DESKTOP_DISABLE_GPU/);
  assert.match(script, /--disable-gpu/);
  assert.match(script, /CODEX_DESKTOP_OZONE_PLATFORM_HINT/);
  assert.match(script, /--ozone-platform-hint=/);
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
      terminalLifecycle: {
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
      terminalLifecycle: {
        status: 'applied',
        sourceName: 'index.js'
      }
    }
  });
});
