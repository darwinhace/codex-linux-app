import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  applyLinuxBrowserCommentPositionPatch,
  applyLinuxBrowserCommentSubmitCleanupPatch,
  applyLinuxBrowserCommentSubmitModePatch,
  applyLinuxBrowserWebviewStackingPatch,
  applyLinuxBrowserViewportSurfacePatch,
  applyLinuxRightPanelPaneTabsPatch,
  applyLinuxBackgroundSubagentsPanelPatch,
  applyLinuxBrowserUseHostFetchPatch,
  applyLinuxChromeExtensionSettingsPatch,
  applyLinuxRemoteControlPatch,
  applyLinuxRemoteControlVisibilityPatch,
  applyLinuxPowerSaveBlockerPatch,
  applyLinuxRemoteControlKeepAwakePatch,
  applyLinuxAvatarOverlayPatch,
  applyLinuxAvatarOverlayRendererPatch,
  applyLinuxPetYappingUsageMainPatch,
  applyLinuxPetYappingUsagePatch,
  applyLinuxCloseCancelPatch,
  applyLinuxWorktreeEnvironmentMainPatch,
  applyLinuxWorktreeEnvironmentWorkerPatch,
  applyLinuxLatestAgentTurnExpansionPatch,
  applyLinuxNotificationSoundPatch,
  applyLinuxOpenTargetsPatch,
  applyLinuxMenuBarPatch,
  applyLinuxNewThreadModelPatch,
  applyLinuxTerminalLifecyclePatch,
  applyLinuxTodoProgressPatch,
  applyLinuxVisualCompatCssPatch,
  applyLinuxVisualCompatJsPatch,
  buildWrapperScript,
  buildLinuxChromeExtensionHostModule,
  copyUpstreamResources,
  createInstallDiagnosticManifest,
  findExecutableInPath,
  installBrowserUseRuntime,
  installLinuxChromeBundledPluginHost,
  installLinuxChromeExtensionHost,
  injectLinuxBrowserCommentPositionPatch,
  injectLinuxBrowserCommentSubmitCleanupPatch,
  injectLinuxBrowserCommentSubmitModePatch,
  injectLinuxBrowserWebviewStackingPatch,
  injectLinuxBrowserViewportSurfacePatch,
  injectLinuxRightPanelPaneTabsPatch,
  injectLinuxBackgroundSubagentsPanelPatch,
  injectLinuxBrowserUseHostFetchPatch,
  injectLinuxChromeExtensionSettingsPatch,
  injectLinuxRemoteControlPatch,
  injectLinuxRemoteControlVisibilityPatch,
  injectLinuxPowerSaveBlockerPatch,
  injectLinuxRemoteControlKeepAwakePatch,
  injectLinuxAvatarOverlayPatch,
  injectLinuxAvatarOverlayRendererPatch,
  injectLinuxPetYappingUsageCssPatch,
  injectLinuxPetYappingUsageMainPatch,
  injectLinuxPetYappingUsagePatch,
  injectLinuxCloseCancelPatch,
  injectLinuxWorktreeEnvironmentMainPatch,
  injectLinuxWorktreeEnvironmentWorkerPatch,
  injectLinuxLatestAgentTurnExpansionPatch,
  injectLinuxNotificationSoundPatch,
  injectLinuxOpenTargetsPatch,
  injectLinuxMenuBarPatch,
  injectLinuxNewThreadModelPatch,
  injectLinuxTerminalLifecyclePatch,
  injectLinuxTodoProgressPatch,
  injectLinuxVisualCompatCssPatch,
  injectLinuxVisualCompatJsPatch,
  isChannelAppProcessCommandLine,
  isLinuxChromeExtensionHostProcessCommandLine,
  patchRendererCompactSlashCommandBundle,
  patchRendererBackgroundSubagentsPanelBundle,
  patchRendererLinuxBrowserCommentSubmitCleanupBundle,
  patchRendererLinuxBrowserCommentSubmitModeBundle,
  patchRendererLinuxBrowserWebviewStackingBundle,
  patchRendererLinuxBrowserViewportSurfaceBundle,
  patchRendererLinuxRightPanelPaneTabsBundle,
  patchRendererLatestAgentTurnExpansionBundle,
  patchRendererLinuxBrowserCommentPositionBundle,
  patchRendererNewThreadModelBundle,
  patchRendererLinuxVisualCompat,
  patchRendererTodoProgressBundle,
  patchBetterSqlite3V8ExternalPointerTagSource,
  parseArgs,
  parseProcCmdline,
  readPinnedInstallVersion,
  renderHelp,
  resolveInstallRelease,
  resolveBrowserUseRuntimeSources,
  resolveFirstExecutablePath,
  stopRunningLinuxChromeExtensionHostProcesses
} from '../src/repack.js';
import { CHANNELS } from '../src/constants.js';

const EMPTY_TEST_CODEX_HOME = path.join(os.tmpdir(), 'codex-linux-app-test-empty-codex-home');
const EMPTY_TEST_HOME = path.join(os.tmpdir(), 'codex-linux-app-test-empty-home');

function nodeReplTestEnv() {
  const hasExplicitCodexHome = process.env.CODEX_HOME != null;
  return {
    ...process.env,
    CODEX_HOME: process.env.CODEX_HOME ?? EMPTY_TEST_CODEX_HOME,
    HOME: hasExplicitCodexHome ? process.env.HOME : EMPTY_TEST_HOME
  };
}

async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isExecutable(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeTestExecutable(filePath, contents = '#!/usr/bin/env bash\nexit 0\n') {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, contents, 'utf8');
  await fs.promises.chmod(filePath, 0o755);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function encodeNativePipeTestMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const frame = Buffer.alloc(4 + body.length);
  if (os.endianness() === 'LE') {
    frame.writeUInt32LE(body.length, 0);
  } else {
    frame.writeUInt32BE(body.length, 0);
  }
  body.copy(frame, 4);
  return frame;
}

function decodeNativePipeTestMessages(buffer) {
  const messages = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const length = os.endianness() === 'LE' ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
    const frameEnd = offset + 4 + length;
    if (buffer.length < frameEnd) {
      break;
    }
    messages.push(JSON.parse(buffer.subarray(offset + 4, frameEnd).toString('utf8')));
    offset = frameEnd;
  }
  return { messages, remainingData: buffer.subarray(offset) };
}

async function startNativePipeHostFetchServer(socketPath, handler) {
  await fs.promises.mkdir(path.dirname(socketPath), { recursive: true });
  await fs.promises.rm(socketPath, { force: true });
  const server = net.createServer((socket) => {
    let pendingData = Buffer.alloc(0);
    socket.on('data', async (chunk) => {
      pendingData = Buffer.concat([pendingData, chunk]);
      const decoded = decodeNativePipeTestMessages(pendingData);
      pendingData = decoded.remainingData;
      for (const message of decoded.messages) {
        try {
          const result = await handler(message);
          socket.write(encodeNativePipeTestMessage({ jsonrpc: '2.0', id: message.id, result }));
        } catch (err) {
          socket.write(
            encodeNativePipeTestMessage({
              jsonrpc: '2.0',
              id: message.id,
              error: { code: 1, message: err instanceof Error ? err.message : String(err) }
            })
          );
        }
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return {
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await fs.promises.rm(socketPath, { force: true });
    }
  };
}

const OPEN_TARGETS_BLOCK_LEGACY =
  'var ua=[Hi,Wi,Bi,Zr,kr,Ni,ia,qi,Dr,ci,ei,jr,ai,Yr,Yi,ui,ii,Ki,$i,gi,_i,vi,yi,bi,xi,Si,Ci,Ii],da=e.sn(`open-in-targets`);function fa(e){return ua.flatMap(t=>{let n=t.platforms[e];return n?[{id:t.id,...n}]:[]})}var pa=fa(process.platform),ma=Ca(pa),ha=new Set(pa.filter(e=>e.kind===`editor`).map(e=>e.id)),ga=null,_a=null;';
const OPEN_TARGETS_BLOCK_CURRENT =
  'var bo=[Za,$a,Ya,ia,Ii,Ba,mo,no,Pi,ha,Ua,sa,Ri,fa,na,io,_a,da,to,co,Ca,wa,Ta,Ea,Da,Oa,ka,Aa,Ga],xo=e.gn(`open-in-targets`);function So(e){return bo.flatMap(t=>{let n=t.platforms[e];return n?[{id:t.id,...n}]:[]})}var Co=So(process.platform),wo=No(Co),To=new Set(Co.filter(e=>e.kind===`editor`).map(e=>e.id)),Eo=null,Do=null;';
const OPEN_TARGETS_BLOCK_26_422 =
  'var Cd=[td,rd,$u,au,Il,Uu,_d,od,Pl,_u,Ku,lu,Rl,mu,ru,cd,yu,pu,ad,fd,Tu,Eu,Du,Ou,ku,Au,ju,Mu,Yu],wd=t.Or(`open-in-targets`);function Td(e){return Cd.flatMap(t=>{let n=t.platforms[e];return n?[{id:t.id,...n}]:[]})}var Ed=Td(process.platform),Dd=Id(Ed),Od=new Set(Ed.filter(e=>e.kind===`editor`).map(e=>e.id)),kd=null,Ad=null;';
const LINUX_MENU_BAR_BUNDLE_CURRENT =
  'new n.BrowserWindow({width:_,height:v,title:i??n.app.getName(),backgroundColor:T,show:l,...process.platform===`win32`?{autoHideMenuBar:!0}:{},...m,minWidth:w.width,minHeight:w.height,webPreferences:{contextIsolation:!0}});';
const LINUX_CLOSE_CANCEL_BUNDLE_CURRENT =
  'function dp({isWindows:e,disableQuitConfirmationPrompt:n,quitState:r,windows:i,applicationMenuManager:a,ensureHostWindow:o,appEvent:d,errorReporter:f}){let p=!1,m=!1;t.app.on(`window-all-closed`,()=>{(process.platform===`darwin`&&!t.app.isPackaged||process.platform!==`darwin`&&!e)&&t.app.quit()}),t.app.on(`before-quit`,a=>{if(e||r.canQuitWithoutPrompt()||n){m=!0,i.markAppQuitting();return}let o=t.app.getName();if(t.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${o}?`,message:`Quit ${o}?`,detail:`Any local threads running on this machine will be interrupted and scheduled automations won\'t run`})!==0){a.preventDefault();return}r.markQuitApproved(),m=!0,i.markAppQuitting()}),t.app.on(`activate`,()=>{m||(i.showLastActivePrimaryWindow()||o(`local`),a.refresh())})}';
const LINUX_CLOSE_CANCEL_BUNDLE_26_422 =
  'function Zl({isWindows:e,disableQuitConfirmationPrompt:r,quitState:i,windows:a,applicationMenuManager:o,ensureHostWindow:s,automationManager:t,flushAndDisposeContexts:n,disposables:c,appEvent:l,errorReporter:u}){let d=!1,g=!1;n.app.on(`window-all-closed`,()=>{(process.platform===`darwin`&&!n.app.isPackaged||process.platform!==`darwin`&&!e)&&n.app.quit()}),n.app.on(`before-quit`,o=>{let s=y_(),c=t.Wn().some(e=>e.status===`ACTIVE`);if(e||i.canQuitWithoutPrompt()||r||!s&&!c){g=!0,a.markAppQuitting();return}let l=n.app.getName();if(n.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${l}?`,message:`Quit ${l}?`,detail:Mb({hasInProgressLocalConversation:s,hasEnabledAutomations:c})})!==0){o.preventDefault();return}i.markQuitApproved(),g=!0,a.markAppQuitting()}),n.app.on(`activate`,()=>{g||(a.showLastActivePrimaryWindow()||s(`local`),o.refresh())})}';
const LINUX_CLOSE_CANCEL_BUNDLE_26_422_STABLE =
  'function Mb({isWindows:e,disableQuitConfirmationPrompt:r,quitState:i,windows:a,applicationMenuManager:o,ensureHostWindow:s,hotkeyWindowLifecycleManager:c,globalDictationLifecycleManager:l,globalStatesByHostId:u,flushAndDisposeContexts:d,disposables:f,appEvent:p,errorReporter:m}){let h=!1,g=!1;n.app.on(`window-all-closed`,()=>{(process.platform===`darwin`&&!n.app.isPackaged||process.platform!==`darwin`&&!e)&&n.app.quit()}),n.app.on(`before-quit`,o=>{let s=b_(),c=t.Gn().some(e=>e.status===`ACTIVE`);if(e||i.canQuitWithoutPrompt()||r||!s&&!c){g=!0,a.markAppQuitting();return}let l=n.app.getName();if(n.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${l}?`,message:`Quit ${l}?`,detail:Nb({hasInProgressLocalConversation:s,hasEnabledAutomations:c})})!==0){o.preventDefault();return}i.markQuitApproved(),g=!0,a.markAppQuitting()}),n.app.on(`activate`,()=>{g||(a.showLastActivePrimaryWindow()||s(`local`),o.refresh())})}';
const LINUX_CLOSE_CANCEL_BUNDLE_26_429 =
  'function TD({isWindows:e,disableQuitConfirmationPrompt:r,quitState:i,windows:a,applicationMenuManager:o,ensureHostWindow:s,hotkeyWindowLifecycleManager:c,globalDictationLifecycleManager:l,globalStatesByHostId:u,flushAndDisposeContexts:d,disposables:f,appEvent:p,errorReporter:m}){let h=!1,g=!1;n.app.on(`window-all-closed`,()=>{(process.platform===`darwin`&&!n.app.isPackaged||process.platform!==`darwin`&&!e)&&n.app.quit()}),n.app.on(`before-quit`,o=>{let s=Pw(),c=t.Yn().some(e=>e.status===`ACTIVE`);if(e||i.canQuitWithoutPrompt()||r||!s&&!c){g=!0,a.markAppQuitting();return}let l=n.app.getName();if(n.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${l}?`,message:`Quit ${l}?`,detail:ED({hasInProgressLocalConversation:s,hasEnabledAutomations:c})})!==0){o.preventDefault();return}i.markQuitApproved(),g=!0,a.markAppQuitting()}),n.app.on(`child-process-gone`,(e,t)=>{if(t.reason!==`clean-exit`){m.reportFatal(Error(`Child process gone (${t.type})`),{tags:{errorType:`child-process-gone`}})}}),n.app.on(`activate`,()=>{g||(a.showLastActivePrimaryWindow()||s(`local`),o.refresh())})}';
const LINUX_CLOSE_CANCEL_BUNDLE_26_429_30905 =
  'function TD({isWindows:e,disableQuitConfirmationPrompt:r,quitState:i,windows:a,applicationMenuManager:o,ensureHostWindow:s,hotkeyWindowLifecycleManager:c,globalDictationLifecycleManager:l,globalStatesByHostId:u,flushAndDisposeContexts:d,disposables:f,appEvent:p,errorReporter:m}){let h=!1,g=!1;n.app.on(`window-all-closed`,()=>{(process.platform===`darwin`&&!n.app.isPackaged||process.platform!==`darwin`&&!e)&&n.app.quit()}),n.app.on(`before-quit`,o=>{let s=Iw(),c=t.Yn().some(e=>e.status===`ACTIVE`);if(e||i.canQuitWithoutPrompt()||r||!s&&!c){g=!0,a.markAppQuitting();return}let l=n.app.getName();if(n.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${l}?`,message:`Quit ${l}?`,detail:OD({hasInProgressLocalConversation:s,hasEnabledAutomations:c})})!==0){o.preventDefault();return}i.markQuitApproved(),g=!0,a.markAppQuitting()}),n.app.on(`child-process-gone`,(e,t)=>{if(t.reason!==`clean-exit`){if(kD(t)){AD(t);return}m.reportFatal(Error(`Child process gone (${t.type})`),{tags:{errorType:`child-process-gone`,processType:t.type,reason:t.reason},extra:{exitCode:t.exitCode,name:t.name,serviceName:t.serviceName}})}}),n.app.on(`activate`,()=>{g||(a.showLastActivePrimaryWindow()||s(`local`),o.refresh())})}';
const LINUX_CLOSE_CANCEL_BUNDLE_26_513 =
  'function kH({isWindows:e,disableQuitConfirmationPrompt:r,quitState:i,windows:a,applicationMenuManager:o,ensureLocalWindow:s,hotkeyWindowLifecycleManager:c,globalDictationLifecycleManager:l,globalStatesByHostId:u,flushAndDisposeContexts:d,disposables:f,appEvent:p,errorReporter:m}){let h=!1,g=!1;n.app.on(`window-all-closed`,()=>{(process.platform===`darwin`&&!n.app.isPackaged||process.platform!==`darwin`&&!e)&&n.app.quit()}),n.app.on(`before-quit`,o=>{let s=WR(),c=t.dr().some(e=>e.status===`ACTIVE`);if(e||i.canQuitWithoutPrompt()||r||!s&&!c){g=!0,a.markAppQuitting();return}let l=n.app.getName();if(n.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${l}?`,message:`Quit ${l}?`,detail:AH({hasInProgressLocalConversation:s,hasEnabledAutomations:c})})!==0){o.preventDefault();return}i.markQuitApproved(),g=!0,a.markAppQuitting()}),n.app.on(`child-process-gone`,(e,t)=>{if(t.reason!==`clean-exit`){if(jH(t)){MH(t);return}m.reportFatal(Error(`Child process gone (${t.type})`),{tags:{errorType:`child-process-gone`,processType:t.type,reason:t.reason},extra:{exitCode:t.exitCode,name:t.name,serviceName:t.serviceName}})}}),n.app.on(`activate`,()=>{g||(a.showLastActivePrimaryWindow()||s(),o.refresh())}),n.app.on(`browser-window-blur`,()=>{n.BrowserWindow.getFocusedWindow()??p.emit(`background`)}),n.app.on(`browser-window-focus`,()=>{p.emit(`foreground`),o.refresh()}),n.app.on(`will-quit`,e=>{if(g=!0,!h){if(i.shouldSkipDrainBeforeQuit()){EH({hotkeyWindowLifecycleManager:c,globalDictationLifecycleManager:l,flushAndDisposeContexts:d,disposables:f});return}e.preventDefault(),h=!0,c.dispose(),l.dispose(),Promise.all([...u.values()].map(e=>e.flush())).finally(()=>{d(),f.dispose(),n.app.quit()})}})}';
const LINUX_NOTIFICATION_SOUND_BUNDLE_CURRENT =
  'const e=require(`./app-session.js`);let n=require(`electron`);n=e.lr(n);let r=require(`node:os`);r=e.lr(r);let i=require(`node:path`);i=e.lr(i);let a=require(`node:util`),o=require(`node:fs`);o=e.lr(o);let s=require(`node:crypto`),c=require(`node:child_process`),l=require(`node:process`);l=e.lr(l);var Fi=`codex-notification`,Ii=`${Fi}.wav`,Li=t.Or(`desktop-notifications`),Ri=class{isSupported;createNotification;logger=Li();notificationSoundStaged=!1;notifications=new Map;constructor(e){this.options=e,this.isSupported=e.isSupported??(()=>n.Notification.isSupported()),e.createNotification?this.createNotification=e.createNotification:this.createNotification=e=>{let t=new n.Notification(e);return{show:()=>t.show(),on:(e,n)=>{switch(e){case`action`:return t.on(`action`,(e,t)=>{n(e,t)});case`click`:return t.on(`click`,()=>{n(void 0)});case`close`:return t.on(`close`,()=>{n(void 0)})}},close:()=>t.close()}}}showNotification(e,t,n){if(this.stageNotificationSoundIfNeeded(),!this.isSupported())return;let r=(e.actions??[]).slice(0,4),i=e.kind===`permission`||e.kind===`question`?`never`:void 0,a=e.kind===`turn-complete`&&typeof e.replyPlaceholder==`string`;this.notifications.get(e.id)?.notification.close?.();let o=this.createNotification({title:e.title,body:e.body,silent:!1,sound:this.options.platform===`darwin`?Fi:void 0,timeoutType:i,hasReply:a,replyPlaceholder:a?e.replyPlaceholder??void 0:void 0,actions:r.map(e=>({type:`button`,text:e.title}))});o.on(`close`,()=>{this.notifications.delete(e.id)}),this.notifications.set(e.id,{notification:o,conversationId:e.conversationId??null}),o.show()}stageNotificationSoundIfNeeded(){if(this.notificationSoundStaged||(this.notificationSoundStaged=!0,this.options.platform!==`darwin`)||typeof process.resourcesPath!=`string`)return;let e=i.default.join(process.resourcesPath,Ii),t=i.default.join(__dirname,`..`,`assets`,`sounds`,Ii),n=(0,o.existsSync)(e)?e:t;if(!(0,o.existsSync)(n))return;let a=i.default.join(r.default.homedir(),`Library`,`Sounds`);try{(0,o.mkdirSync)(a,{recursive:!0}),(0,o.copyFileSync)(n,i.default.join(a,Ii))}catch(e){this.logger.warning(`failed to stage notification sound`,{safe:{},sensitive:{error:e}})}}};';
const BROWSER_USE_HOST_FETCH_BUNDLE_CURRENT =
  'function Qc({action:e,appServerClient:t,desktopOriginator:n,headers:r={},refreshToken:i=!1}){return t.getAuthToken({refreshToken:i})}var Gi=`desktop`,EC=`about:blank`,DC=15e3,OC=2e4,kC=1500,AC=t.Pr(`browser-use-iab-api`),jC=class{tabsById=new Map;constructor(e,t,n={}){this.getBrowserHost=e,this.options=n,this.disposeBrowserUseNavigationBlockedListener=t(e=>{this.emitBrowserUseNavigationBlockedEvent(e)})}ping(){return`pong`}requireBrowserUseSession(e){return e}emitBrowserUseNavigationBlockedEvent(e){}};function WC(){return{apiImpl:null,server:null,starting:null}}var GC=class{constructor(n={appSessionId:e.t,buildFlavor:t.C.Dev,errorReporter:{reportNonFatal:()=>void 0}}){this.options=n}ensureBackendForBrowserRoute(e){let n={};n.starting=(async()=>{let t=null;t=new jC(t=>this.canServeTurnForBrowserRoute(t,e)?this.getBrowserUseHost(t):null,e=>this.getDelegate().addBrowserUseNavigationBlockedListener(e),{appSessionId:this.options.appSessionId,browserRoute:e,buildFlavor:this.options.buildFlavor,canServeRoute:t=>this.canServeTurnForBrowserRoute(t,e)}),n.apiImpl=t})()}};class App{constructor(){this.browserSessionRegistry=new GC({appSessionId:e.t,buildFlavor:T,errorReporter:this.errorReporter})}getAppServerConnection(e){return null}}';
const BROWSER_USE_HOST_FETCH_BUNDLE_26_506 = BROWSER_USE_HOST_FETCH_BUNDLE_CURRENT
  .replace(
    'function Qc({action:e,appServerClient:t,desktopOriginator:n,headers:r={},refreshToken:i=!1}){return t.getAuthToken({refreshToken:i})}',
    'async function ju({action:e,appServerClient:t,desktopOriginator:n,headers:r={},refreshToken:i=!1}){let a=await t.getAuthToken({refreshToken:i});if(!a)throw Error(`Sign in to ChatGPT in Codex Desktop to ${e}.`);return r}'
  )
  .replace(
    'var Gi=`desktop`,EC=`about:blank`',
    'var Co=`Codex Desktop`,So=`dev`,xo=`prod`,$E={desktopOriginator:Co,devApiBaseUrl:So,prodApiBaseUrl:xo},EC=`about:blank`'
  )
  .replace(
    'this.browserSessionRegistry=new GC({appSessionId:e.t,buildFlavor:T,errorReporter:this.errorReporter})',
    'this.browserSessionRegistry=new GC({appSessionId:e.t,buildFlavor:w,errorReporter:this.errorReporter})'
  );
const BROWSER_USE_HOST_FETCH_BUNDLE_26_527 =
  'let i=require(`electron`);i=e.Hi(i);async function ju({action:e,appServerClient:t,desktopOriginator:n,headers:r={},refreshToken:i=!1}){let a=await t.getAuthToken({refreshToken:i});if(!a)throw Error(`Sign in to ChatGPT in Codex Desktop to ${e}.`);return r}var Co=`Codex Desktop`,So=`dev`,xo=`prod`,$E={desktopOriginator:Co,devApiBaseUrl:So,prodApiBaseUrl:xo},wH=`about:blank`,TH=15e3,EH=2e4,DH=1500,AH=t.Fr(`browser-use-iab-api`),ke=[`e88baf79f1e54dcfa8069716ec625735541b4636`],jH=class{tabsById=new Map;constructor(e,t,n={}){this.getBrowserHost=e,this.options=n,this.disposeBrowserUseNavigationBlockedListener=t(e=>{this.emitBrowserUseNavigationBlockedEvent(e)})}ping(){return`pong`}requireBrowserUseSession(e){return e}emitBrowserUseNavigationBlockedEvent(e){}};var nU=class{backendState={apiImpl:null,server:null,starting:null};constructor(n={appSessionId:r.t,buildFlavor:t.C.Dev,errorReporter:{reportNonFatal:()=>void 0}}){this.options=n}ensureBackend(){this.backendState.starting=(async()=>{let e=null;e=new jH(e=>this.ensureSessionRoute(e)?this.getBrowserUseHost(e):null,e=>this.getDelegate().addBrowserUseNavigationBlockedListener(e),{appSessionId:this.options.appSessionId,buildFlavor:this.options.buildFlavor,ensureSessionRoute:e=>this.ensureSessionRoute(e)}),this.backendState.apiImpl=e})()}};class App{constructor(){this.browserSessionRegistry=new nU({appSessionId:r.t,buildFlavor:w,errorReporter:this.errorReporter})}getAppServerConnection(e){return null}}';
const BROWSER_USE_HOST_FETCH_BUNDLE_26_608 = BROWSER_USE_HOST_FETCH_BUNDLE_26_527
  .replaceAll('appSessionId:r.t', 'appSessionId:n.N')
  .replace('buildFlavor:w,errorReporter:this.errorReporter', 'buildFlavor:C,errorReporter:this.errorReporter');
const CHROME_EXTENSION_SETTINGS_BUNDLE_26_519 =
  'function aa(e){return`chrome://extensions/?id=${ua(e)}`}function oa({extensionId:e,homeDir:t=(0,r.homedir)(),localAppDataDir:n=process.env.LOCALAPPDATA,platform:a=process.platform}){let s=ua(e),c=da({homeDir:t,localAppDataDir:n,platform:a});return c==null||!(0,o.existsSync)(c)?!1:(0,o.readdirSync)(c,{withFileTypes:!0}).some(e=>e.isDirectory()&&(0,o.existsSync)((0,i.join)(c,e.name,`Extensions`,s)))}async function sa({extensionId:e,platform:t=process.platform,detectChromeCommand:n=ca,runCommand:r=zi}){if(t===`darwin`){await r(ra,[`-b`,na,aa(e)]);return}if(t===`win32`){let t=n();if(t==null)throw Error(`Google Chrome is not installed`);await r(t,[aa(e)]);return}throw Error(`Opening Chrome extension settings is only supported on macOS and Windows`)}function da({homeDir:e,localAppDataDir:t,platform:n}){return n===`darwin`?(0,i.join)(e,`Library`,`Application Support`,`Google`,`Chrome`):n===`win32`?(0,i.join)(t??(0,i.join)(e,`AppData`,`Local`),`Google`,`Chrome`,`User Data`):null}function ua(e){return e}';
const REMOTE_CONTROL_FEATURE_AVAILABILITY_BUNDLE_26_513 =
  'var ce={avatarOverlay:!1,ambientSuggestions:!1,artifactsPane:!1,browserAgent:!1,browserAgentAvailable:!1,browserPane:!1,computerUse:!1,computerUseNodeRepl:!1,control:!1,multiWindow:!1},le=Object.keys(ce),ue={...ce};function de(){return ue}function fe(e){return le.every(t=>typeof e[t]==`boolean`)}function pe(e){let t={...ue,...e};return le.every(e=>t[e]===ue[e])?!1:(ue=t,!0)}function me(e,{env:t=process.env,platform:n=process.platform}={}){return n!==`win32`||t.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE!==`1`?e:{...e,computerUse:!0,computerUseNodeRepl:!0}}function he(t){return de().ambientSuggestions&&t.get(e.Rt.AMBIENT_SUGGESTIONS_ENABLED)===!0}';
const REMOTE_CONTROL_FEATURE_AVAILABILITY_BUNDLE_26_513_20950 =
  'var fe={ambientSuggestions:!1,artifactsPane:!1,browserPane:!1,inAppBrowserUse:!1,inAppBrowserUseAllowed:!1,externalBrowserUse:!1,externalBrowserUseAllowed:!1,computerUse:!1,computerUseNodeRepl:!1,control:!1,deviceAttestation:!1,multiWindow:!1},pe=Object.keys(fe),me={...fe},he=`CODEX_ELECTRON_DESKTOP_FEATURE_OVERRIDES`;function ge(){return me}function _e(e){return pe.every(t=>typeof e[t]==`boolean`)}function ve(e){let t={...me,...e};return pe.every(e=>t[e]===me[e])?!1:(me=t,!0)}function ye(e,{buildFlavor:n=t.D.resolve(),env:r=d.default.env,platform:i=d.default.platform}={}){let a=i===`win32`&&r.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE===`1`?{...e,computerUse:!0,computerUseNodeRepl:!0}:e,o=n===t.D.Dev?be(r):null;return o==null?a:{...a,...o}}function be(e){let t=e[he]?.trim();if(!t)return null;return JSON.parse(t)}';
const REMOTE_CONTROL_FEATURE_AVAILABILITY_BUNDLE_26_601 =
  'var fe={ambientSuggestions:!1,artifactsPane:!1,browserPane:!1,inAppBrowserUse:!1,inAppBrowserUseAllowed:!1,externalBrowserUse:!1,externalBrowserUseAllowed:!1,computerUse:!1,computerUseNodeRepl:!1,control:!1,deviceAttestation:!1,multiWindow:!1},pe=Object.keys(fe),me={...fe},he=`CODEX_ELECTRON_DESKTOP_FEATURE_OVERRIDES`;function ge(){return me}function _e(e){return pe.every(t=>typeof e[t]==`boolean`)}function ve(e){let t={...me,...e};return pe.every(e=>t[e]===me[e])?!1:(me=t,!0)}function ye(e,{buildFlavor:n=t.D.resolve(),env:r=d.default.env,platform:i=d.default.platform}={}){let a=i===`win32`&&r.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE===`1`?{...e,computerUse:!0,computerUseNodeRepl:!0}:e,o=n===t.D.Dev?be(r):null;return o==null?{...a,deviceAttestation:xe({platform:i})}:{...a,...o,deviceAttestation:xe({platform:i})}}function be(e){let t=e[he]?.trim();if(!t)return null;return JSON.parse(t)}';
const REMOTE_CONTROL_FEATURE_AVAILABILITY_BUNDLE_26_608 =
  'var Ne={ambientSuggestions:!1,appshotsEnabled:!1,browserPane:!1,inAppBrowserUse:!1,inAppBrowserUseAllowed:!1,externalBrowserUse:!1,externalBrowserUseAllowed:!1,computerUse:!1,computerUseNodeRepl:!1,sites:!1,control:!1,deviceAttestation:ve(),dil:!1,multiBrowserTabs:!1,multiWindow:!1,processManager:!1,visualize:!1},Pe=Object.keys(Ne),Fe={...Ne},Ie=`CODEX_ELECTRON_DESKTOP_FEATURE_OVERRIDES`;function Le(){return Fe}function Re(e){return Pe.every(t=>typeof e[t]==`boolean`)}function ze(e,t){return Pe.some(n=>e[n]!==t[n])}function Be(e){let t={...Fe,...e,deviceAttestation:ve()};return Pe.every(e=>t[e]===Fe[e])?!1:(Fe=t,!0)}function Ve(e,{buildFlavor:t=n.P.resolve(),env:r=p.default.env,platform:i=p.default.platform}={}){let a=i===`darwin`&&!n.P.isInternal(t)&&e.computerUseNodeRepl!=null?{...e,computerUseNodeRepl:!1}:e,o=i===`win32`&&e.computerUse===!0?{...a,computerUseNodeRepl:!0}:a,s=i===`win32`&&r.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE===`1`?{...o,computerUse:!0,computerUseNodeRepl:!0}:o,c=t===n.P.Dev?He(r):null;return c==null?{...s,deviceAttestation:ve({platform:i})}:{...s,...c,deviceAttestation:ve({platform:i})}}function He(e){let t=e[Ie]?.trim();if(!t)return null;return JSON.parse(t)}';
const REMOTE_CONTROL_VISIBILITY_BUNDLE_26_513 =
  'import{p as e,pt as t}from"./vscode-api-DH_DWhkY.js";import{r as n}from"./remote-connection-visibility-CMLPP7XS.js";var r=t();function i(){let t=(0,r.c)(3),[i]=e(`remote_control_connections_state`),o=n(),s;return t[0]!==i||t[1]!==o?(s=a({remoteControlConnectionsState:i,slingshotEnabled:o}),t[0]=i,t[1]=o,t[2]=s):s=t[2],s}function a({remoteControlConnectionsState:e,slingshotEnabled:t}){return t&&(e?.available??!0)&&e?.accessRequired!==!0}export{i as t};';
const POWER_SAVE_BLOCKER_BUNDLE_26_513 =
  'var Zz=class{powerSaveBlockerId=null;powerSaveBlockingWebContentsIds=new Set;pluggedInRemoteControlPowerSaveWebContentsIds=new Set;powerSaveTrackedWebContentsIds=new Set;constructor(){n.powerMonitor.on(`on-ac`,()=>{this.syncPowerSaveBlocker()}),n.powerMonitor.on(`on-battery`,()=>{this.syncPowerSaveBlocker()})}updatePowerSaveBlocker(e,t,n){let r=e.id;this.powerSaveTrackedWebContentsIds.has(r)||(this.powerSaveTrackedWebContentsIds.add(r),e.once(`destroyed`,()=>{this.powerSaveTrackedWebContentsIds.delete(r),this.powerSaveBlockingWebContentsIds.delete(r),this.pluggedInRemoteControlPowerSaveWebContentsIds.delete(r),this.syncPowerSaveBlocker()})),t?this.powerSaveBlockingWebContentsIds.add(r):this.powerSaveBlockingWebContentsIds.delete(r),n?this.pluggedInRemoteControlPowerSaveWebContentsIds.add(r):this.pluggedInRemoteControlPowerSaveWebContentsIds.delete(r),this.syncPowerSaveBlocker()}syncPowerSaveBlocker(){let e=this.powerSaveBlockingWebContentsIds.size>0||!n.powerMonitor.isOnBatteryPower()&&this.pluggedInRemoteControlPowerSaveWebContentsIds.size>0;if(e&&this.powerSaveBlockerId==null){this.powerSaveBlockerId=n.powerSaveBlocker.start(`prevent-app-suspension`);return}!e&&this.powerSaveBlockerId!=null&&(n.powerSaveBlocker.stop(this.powerSaveBlockerId),this.powerSaveBlockerId=null)}async sendCustomPrompts(e){return null}};';
const REMOTE_CONTROL_KEEP_AWAKE_BUNDLE_26_513 =
  'function jP(){let e=(0,Z.c)(7),t=K(G),{data:n}=Qc(y.PREVENT_SLEEP_WHILE_RUNNING),{data:r}=Qc(y.KEEP_REMOTE_CONTROL_AWAKE_WHILE_PLUGGED_IN),[i]=zo(`local_app_server_feature_enablement`),a=i?.remote_control??!1,o,s;e[0]!==r||e[1]!==n||e[2]!==a||e[3]!==t?(o=()=>t.watch(e=>{let{get:t}=e;J.dispatchMessage(`power-save-blocker-set`,{shouldBlock:!!n&&t(Ct),keepRemoteControlAwakeWhilePluggedIn:!!r&&a})}),s=[r,n,a,t],e[0]=r,e[1]=n,e[2]=a,e[3]=t,e[4]=o,e[5]=s):(o=e[4],s=e[5]),(0,Q.useEffect)(o,s);let c;return e[6]===Symbol.for(`react.memo_cache_sentinel`)?(c=[],e[6]=c):c=e[6],(0,Q.useEffect)(MP,c),null}';
const REMOTE_CONTROL_KEEP_AWAKE_BUNDLE_26_519 =
  'function mM(){let e=(0,Z.c)(7),t=K(G),n=qr(fe.preventSleepWhileRunning),r=qr(fe.keepRemoteControlAwakeWhilePluggedIn),i=K(tt,Tt),a,o;e[0]!==r||e[1]!==n||e[2]!==i||e[3]!==t?(a=()=>t.watch(e=>{let{get:t}=e;X.dispatchMessage(`power-save-blocker-set`,{shouldBlock:!!n&&t(He),keepRemoteControlAwakeWhilePluggedIn:!!r&&i})}),o=[r,n,i,t],e[0]=r,e[1]=n,e[2]=i,e[3]=t,e[4]=a,e[5]=o):(a=e[4],o=e[5]),(0,Q.useEffect)(a,o);let s;return e[6]===Symbol.for(`react.memo_cache_sentinel`)?(s=[],e[6]=s):s=e[6],(0,Q.useEffect)(dM,s),null}';
const PET_YAPPING_USAGE_MAIN_BUNDLE_26_513 =
  'var WD=class{constructor(){this.handlers={"fast-mode-rollout-metrics":async n=>e.zt(this.hostConfig)?null:t.sn({codexHome:t.Rr({preferWsl:MD,hostConfig:this.hostConfig}),params:n}),"refresh-remote-connections":async()=>this.remoteConnectionsHandler.refreshRemoteConnections()}}handleVSCodeRequest(n,r,i,a,o){let s=r,c=this.handlers[s];if(typeof c!=`function`)throw Error(`${r} not implemented`);return c({...a,origin:n,windowHostId:i})}};';
const PET_YAPPING_USAGE_MAIN_BUNDLE_26_527 =
  'var WD=class{constructor(){this.handlers={"app-connect-oauth-callback-url":async()=>({callbackUrl:`codex://connector/oauth_callback`}),"fast-mode-rollout-metrics":async e=>t.Tt({codexHome:t.Sr({preferWsl:qA,hostConfig:zl}),params:e}),"refresh-remote-connections":async()=>this.remoteConnectionsHandler.refreshRemoteConnections()}}handleVSCodeRequest(n,r,i,a,o){let s=r,c=this.handlers[s];if(typeof c!=`function`)throw Error(`${r} not implemented`);return c({...a,origin:n,windowHostId:i})}};';
const AVATAR_OVERLAY_BUNDLE_26_429_30905 = fs.readFileSync(
  new URL('./fixtures/upstream/26.429.30905/.vite/build/main-SLemWUtC.js', import.meta.url),
  'utf8'
);
const AVATAR_OVERLAY_CONTENT_BOUNDS_BUNDLE_CURRENT = AVATAR_OVERLAY_BUNDLE_26_429_30905
  .replace(
    'setWindowBounds(e,t){e.isDestroyed()||EO(e.getBounds(),t)||e.setBounds(t,!1)}',
    'setWindowBounds(e,t){e.isDestroyed()||EO(e.getContentBounds(),t)||e.setContentBounds(t,!1)}'
  )
  .replace(
    'persistWindowBounds(e){e.isDestroyed()||this.globalState.set(xe,{...e.getBounds()',
    'persistWindowBounds(e){e.isDestroyed()||this.globalState.set(xe,{...e.getContentBounds()'
  );
const AVATAR_OVERLAY_RESOLUTION_KEY_DRAG_BUNDLE_26_519 =
  AVATAR_OVERLAY_BUNDLE_26_429_30905.replace(
    't.displayBounds=i,this.anchor={...this.anchor,x:r.x-t.pointerAnchorX,y:r.y-t.pointerAnchorY},this.applyLayout(e,i)',
    't.displayBounds=i,this.resolutionKey=WG(i),this.anchor={...this.anchor,x:r.x-t.pointerAnchorX,y:r.y-t.pointerAnchorY},this.applyLayout(e,i)'
  );
const AVATAR_OVERLAY_NATIVE_COMPOSITION_BUNDLE_26_608 = AVATAR_OVERLAY_BUNDLE_26_429_30905
  .replace(
    'async open(e){let t=await this.ensureWindow(e);this.globalState.set(be,!0),this.positionWindow(t,e),this.rendererReady&&(this.showWindow(t),this.applyPointerInteractivityPolicy())}',
    'async open(e){let t=await this.ensureWindow();this.globalState.set(be,!0),this.positionWindow(t,e),this.showWindowIfReady(t)}'
  )
  .replace(
    'setWindowBounds(e,t){e.isDestroyed()||EO(e.getBounds(),t)||e.setBounds(t,!1)}',
    'setWindowBounds(e,t,n,r){if(e.isDestroyed())return;let i=e.getContentBounds();if(EO(i,t))return;let a=i.width===t.width&&i.height===t.height;a&&!r&&this.compositionHost.prepareDragFollowForOverlayMove(t),e.setContentBounds(t,n),(r||!a)&&this.compositionHost.moveBackingCanvases()}'
  )
  .replace(
    'showWindow(e){if(e.isDestroyed())return;let t=this.isOpen();e.moveTop(),e.showInactive(),!t&&this.isOpen()&&this.broadcastOpenState()}',
    'showWindow(e){if(e.isDestroyed())return;let t=this.isOpen();this.windowStagedForNativePresentation&&=(e.setOpacity(1),!1),e.moveTop(),e.showInactive(),!t&&this.isOpen()&&this.broadcastOpenState()}showWindowIfReady(e){!this.rendererReady||this.initialPresentationState!==`ready`||(this.showWindow(e),this.applyPointerInteractivityPolicy())}'
  )
  .replace(
    'moveDragToCurrentCursor(e){let t=this.dragState;if(t==null)return;let r=n.screen.getCursorScreenPoint(),i=SO(r,t.displayBounds);t.displayBounds=i,this.anchor={...this.anchor,x:r.x-t.pointerAnchorX,y:r.y-t.pointerAnchorY},this.applyLayout(e,i)}',
    'moveDragToCurrentCursor(e){let t=this.dragState;if(t==null)return;let r=n.screen.getCursorScreenPoint(),i=SO(r,t.displayBounds),a=n.screen.getDisplayMatching(i);t.displayBounds=a.bounds,this.anchor={...this.anchor,x:r.x-t.pointerAnchorX,y:r.y-t.pointerAnchorY},this.applyLayout(e,a,!1,!1)}'
  );
const AVATAR_OVERLAY_RENDERER_BUNDLE_CURRENT =
  'function $e(){let P={current:null};let Y=e=>{let t=P.current;if(t==null||t.pointerId!==e.pointerId)return;let n=V(e);t.samples=U([...t.samples,n]);let r=n.screenX-t.screenX,i=n.screenY-t.screenY;Math.abs(r)<Ge&&Math.abs(i)<Ge||(t.hasMoved=!0,t.screenX=n.screenX,t.screenY=n.screenY,s(e=>ut({currentDragState:e,deltaX:r})),f.dispatchMessage(`avatar-overlay-drag-move`,{}))}}';
const AVATAR_OVERLAY_RENDERER_BUNDLE_26_506 = AVATAR_OVERLAY_RENDERER_BUNDLE_CURRENT.replace(
  'let n=V(e);',
  'let n=W(e);'
);
const PET_YAPPING_USAGE_RENDERER_BUNDLE_CURRENT =
  'import{_r as r,d as i}from"./vscode-api-Cvzk5den.js";import{v as u}from"./codex-api-DPPuXJuP.js";import{t as d}from"./jsx-runtime-lEsnPbkx.js";var R=e(t(),1);var G=d();function K(e){let x=(0,G.jsx)(E,{assetRef:r,className:`relative z-10`,spritesheetUrl:s,state:m}),w=null;return(0,G.jsxs)(`div`,{children:[x,w]})}function dt(e){if(e==null)return null;let t=ft(e.querySelector(`[data-avatar-overlay-hit-region="mascot"]`))??ft(e.querySelector(qe)),n=ft(e.querySelector(Je));return t==null?null:{mascot:t,tray:n}}';
const PET_YAPPING_USAGE_RENDERER_BUNDLE_26_429 =
  'import{_r as r,d as i}from"./vscode-api-Cvzk5den.js";import{v as u}from"./codex-api-DPPuXJuP.js";import{t as d}from"./jsx-runtime-lEsnPbkx.js";var R=e(t(),1);var G=d();function K(e){let x=(0,G.jsx)(E,{assetRef:r,className:`relative z-10`,spritesheetUrl:s,state:m}),w=null;return(0,G.jsxs)(`div`,{children:[x,w]})}function dt(e){if(e==null)return null;let t=ft(e.querySelector(qe)),n=ft(e.querySelector(Je));return t==null?null:{mascot:t,tray:n}}';
const PET_YAPPING_USAGE_RENDERER_BUNDLE_26_506 =
  'import{_r as r,d as i}from"./vscode-api-Cvzk5den.js";import{v as u}from"./codex-api-DPPuXJuP.js";import{t as f}from"./jsx-runtime-lEsnPbkx.js";var ae=m(),B=e(d(),1),V=1600;var K=f();function ce(e){let S=(0,K.jsx)(E,{assetRef:r,className:`relative z-10`,spritesheetUrl:s,state:m}),C=null;return(0,K.jsxs)(`div`,{children:[S,C]})}function ht(e){if(e==null)return null;let t=_t(e.querySelector($e)),n=vt(e.querySelector(et));return t==null?null:{mascot:t,tray:n}}';
const PET_YAPPING_USAGE_RENDERER_BUNDLE_26_513 =
  'import{n as g,t as _}from"./jsx-runtime-Bj4hVTj7.js";import{y as P}from"./codex-api-BlFw_ca9.js";import{B as y,H as b,pt as x,v as S,y as ee}from"./vscode-api-DH_DWhkY.js";var I=x(),L=e(g(),1),ve=1600,R=100,z=320;function ct(e){let g=(0,Q.jsx)(M,{}),_=null;return(0,Q.jsxs)(k.button,{children:[g,_]})}var Q=_(),$=w({mascotLabel:{id:`petOverlay.mascotLabel`}});function it(e){let{avatar:t,notificationBadge:n}=e;return(0,Q.jsx)(`div`,{"data-avatar-overlay-hit-region":`mascot`,className:`absolute`,style:{width:112},children:(0,Q.jsx)(me,{ariaLabel:`Pet`,assetRef:t.assetRef,spritesheetUrl:t.spritesheetUrl,notificationBadge:n,resizeHandle:void 0,state:t.mascotState,style:{},transientState:null})})}function on(e){if(e==null)return null;let t=_t(e.querySelector($e)),n=vt(e.querySelector(et));return t==null?null:{mascot:t,tray:n}}';
const PET_YAPPING_USAGE_RENDERER_BUNDLE_26_519 =
  'import{Cr as t,aa as l}from"./app-server-manager-signals-Csopz8aM.js";import{n as g,t as _}from"./jsx-runtime-CiQ1k8xo.js";import{t as v}from"./clsx-DDuZWq6Y.js";import{B as y,J as b,W as ee,X as x,b as te,xt as S,y as C,z as ne}from"./setting-storage-EK1Te68s.js";import{b as ie}from"./codex-api-5vE1HRY8.js";var Z=_(),R=e(g(),1),$=w({mascotLabel:{id:`petOverlay.mascotLabel`}});function it(e){let{avatar:t,notificationBadge:k}=e,o={height:121,left:244,top:191,width:112};return(0,Z.jsx)(`div`,{"data-avatar-overlay-hit-region":`mascot`,className:v(`absolute`),style:{height:o.height,left:o.left,top:o.top,width:o.width},children:(0,Z.jsx)(I,{ariaLabel:ne.formatMessage(Q.mascotLabel,{petName:e.displayName}),assetRef:t.assetRef,spritesheetUrl:t.spritesheetUrl,notificationBadge:k,resizeHandle:l,state:T.mascotState,style:s,transientState:b})})}var an=`.codex-avatar-root`,on=`[data-avatar-overlay-size="notification-tray"]`;function kn(e){if(e==null)return null;let t=jn(e.querySelector(an)),n=Mn(e.querySelector(on));return t==null?null:{mascot:t,tray:n}}';
const PET_YAPPING_USAGE_CSS_CURRENT =
  '.codex-avatar-root{aspect-ratio:192/208;width:7.04rem;image-rendering:pixelated;background-repeat:no-repeat;background-size:800% 900%}\n';
const WORKTREE_ENVIRONMENT_MAIN_BUNDLE_CURRENT =
  'function im({globalState:t,worktreeDir:n}){let r=e.yt(n).replace(/\\/+$/,``);return B(t).some(t=>{let n=e.yt(t).replace(/\\/+$/,``);return n===r||n.startsWith(`${r}/`)})}var am=32e3,om=e.mr(`worktree-service`),sm=class{statesById=new Map;async start(t){let n=this.statesById.get(t);if(!n)return;let{entry:r}=n,i={abortController:new AbortController,outputDecoder:new TextDecoder,streamId:(0,o.randomUUID)()};try{let n=await this.requestGitWorker({method:`create-worktree`,params:{hostConfig:this.options.hostConfig,cwd:e.Zr(r.sourceWorkspaceRoot),startingState:r.startingState,localEnvironmentConfigPath:r.localEnvironmentConfigPath,streamId:i.streamId,setUpSyncedBranch:r.launchMode===`create-stable-worktree`?!1:void 0},signal:i.abortController.signal});om().info(`[worktree-create] ready`,{safe:{worktreeId:e.Dt(n.worktreeGitRoot),flow:`pending`,launchMode:r.launchMode,hasLocalEnvironment:r.localEnvironmentConfigPath!=null,wasNewbornProtected:this.newbornWorktreeRoots.has(n.worktreeGitRoot),protectedNewbornCount:this.newbornWorktreeRoots.size},sensitive:{}})}catch(e){}}async createManagedWorktree({hostId:t,cwd:n,startingState:r,localEnvironmentConfigPath:i,streamId:a}){try{let o=await this.requestGitWorker({method:`create-worktree`,params:{hostConfig:this.options.getHostConfigForHostId(t),cwd:e.Zr(n),startingState:r,localEnvironmentConfigPath:i,streamId:a}}),s=this.newbornWorktreeRoots.has(o.worktreeGitRoot);return this.newbornWorktreeRoots.add(o.worktreeGitRoot),om().info(`[worktree-create] ready`,{safe:{worktreeId:e.Dt(o.worktreeGitRoot),flow:`managed`,hasLocalEnvironment:i!=null,wasNewbornProtected:s,protectedNewbornCount:this.newbornWorktreeRoots.size},sensitive:{}}),this.runCleanup(),o}catch(e){throw this.forgetNewbornWorktreeStream(a),e}}};';
const WORKTREE_ENVIRONMENT_MAIN_BUNDLE_26_417 = WORKTREE_ENVIRONMENT_MAIN_BUNDLE_CURRENT
  .replace(
    'function im({globalState:t,worktreeDir:n}){let r=e.yt(n).replace(/\\/+$/,``);return B(t).some(t=>{let n=e.yt(t).replace(/\\/+$/,``);return n===r||n.startsWith(`${r}/`)})}',
    'function gm({globalState:t,worktreeDir:n}){let r=e.Nt(n).replace(/\\/+$/,``);return e.o(t).some(t=>{let n=e.Nt(t).replace(/\\/+$/,``);return n===r||n.startsWith(`${r}/`)})}'
  )
  .replace(
    'var am=32e3,om=e.mr(`worktree-service`),sm=class{statesById=new Map;',
    'var _m=32e3,vm=e.kr(`worktree-service`),ym=class{statesById=new Map;newbornWorktreeRoots=new Set;newbornWorktreeRootsByStreamId=new Map;cleanupRunning=!1;cleanupPending=!1;'
  )
  .replace(
    'async start(t){let n=this.statesById.get(t);if(!n)return;let{entry:r}=n,i={abortController:new AbortController,outputDecoder:new TextDecoder,streamId:(0,o.randomUUID)()};try{',
    'async start(t){let n=this.statesById.get(t);if(!n)return;let{entry:r}=n,i={abortController:new AbortController,outputDecoder:new TextDecoder,streamId:(0,o.randomUUID)()};n.runtime=i,this.updateEntry(t,e=>({...e,phase:`creating`,outputText:bm(``,`[info] Starting worktree creation\n`)}));try{'
  )
  .replace('cwd:e.Zr(r.sourceWorkspaceRoot)', 'cwd:e.pi(r.sourceWorkspaceRoot)')
  .replace(
    'om().info(`[worktree-create] ready`,{safe:{worktreeId:e.Dt(n.worktreeGitRoot),flow:`pending`,launchMode:r.launchMode,hasLocalEnvironment:r.localEnvironmentConfigPath!=null,wasNewbornProtected:this.newbornWorktreeRoots.has(n.worktreeGitRoot),protectedNewbornCount:this.newbornWorktreeRoots.size},sensitive:{}})',
    'if(this.updateEntry(t,e=>({...e,phase:`worktree-ready`,worktreeGitRoot:n.worktreeGitRoot,worktreeWorkspaceRoot:n.worktreeWorkspaceRoot})),vm().info(`[worktree-create] ready`,{safe:{worktreeId:e.Vt(n.worktreeGitRoot),flow:`pending`,launchMode:r.launchMode,hasLocalEnvironment:r.localEnvironmentConfigPath!=null,wasNewbornProtected:this.newbornWorktreeRoots.has(n.worktreeGitRoot),protectedNewbornCount:this.newbornWorktreeRoots.size},sensitive:{}}),this.forgetNewbornWorktreeStream(i.streamId),r.launchMode===`create-stable-worktree`){this.addWorkspaceRoot(n.worktreeWorkspaceRoot,r.label),this.statesById.delete(t),this.publish();return}let a=this.statesById.get(t);a&&(a.runtime=null),this.runCleanup()'
  )
  .replace(
    '}catch(e){}}async createManagedWorktree',
    '}catch(e){this.forgetNewbornWorktreeStream(i.streamId);let n=this.statesById.get(t);if(n&&(n.runtime=null),xm(e))return;let r=e instanceof Error?e.message:String(e);this.updateEntry(t,e=>({...e,phase:`failed`,errorMessage:r,needsAttention:!0,outputText:bm(e.outputText,`[stderr] ${r}\n`)})),this.notifyFailure(t,r)}}async createManagedWorktree'
  )
  .replace('cwd:e.Zr(n)', 'cwd:e.pi(n)')
  .replace(
    'om().info(`[worktree-create] ready`,{safe:{worktreeId:e.Dt(o.worktreeGitRoot),flow:`managed`,hasLocalEnvironment:i!=null,wasNewbornProtected:s,protectedNewbornCount:this.newbornWorktreeRoots.size},sensitive:{}})',
    'vm().info(`[worktree-create] ready`,{safe:{worktreeId:e.Vt(o.worktreeGitRoot),flow:`managed`,hasLocalEnvironment:i!=null,wasNewbornProtected:s,protectedNewbornCount:this.newbornWorktreeRoots.size},sensitive:{}})'
  );
const WORKTREE_ENVIRONMENT_MAIN_BUNDLE_26_422 =
  'function ov({globalState:e,worktreeDir:n}){let r=t.Ft(n).replace(/\\/+$/,``);return t.o(e).some(e=>{let n=t.Ft(e).replace(/\\/+$/,``);return n===r||n.startsWith(`${r}/`)})}var sv=32e3,cv=t.Or(`worktree-service`),lv=class{statesById=new Map;newbornWorktreeRoots=new Set;newbornWorktreeRootsByStreamId=new Map;cleanupRunning=!1;cleanupPending=!1;async start(n){let r=this.statesById.get(n);if(!r)return;let{entry:i}=r,a={abortController:new AbortController,outputDecoder:new TextDecoder,streamId:(0,s.randomUUID)()};r.runtime=a,this.updateEntry(n,e=>({...e,phase:`creating`,outputText:uv(``,`[info] Starting worktree creation\n`)}));try{let r=await this.requestGitWorker({method:`create-worktree`,params:{hostConfig:this.options.hostConfig,cwd:e.Ot(i.sourceWorkspaceRoot),startingState:i.startingState,localEnvironmentConfigPath:i.localEnvironmentConfigPath,streamId:a.streamId,setUpSyncedBranch:i.launchMode===`create-stable-worktree`?!1:void 0},signal:a.abortController.signal});if(this.updateEntry(n,e=>({...e,phase:`worktree-ready`,worktreeGitRoot:r.worktreeGitRoot,worktreeWorkspaceRoot:r.worktreeWorkspaceRoot})),cv().info(`[worktree-create] ready`,{safe:{worktreeId:t.Ut(r.worktreeGitRoot),flow:`pending`,launchMode:i.launchMode,hasLocalEnvironment:i.localEnvironmentConfigPath!=null,wasNewbornProtected:this.newbornWorktreeRoots.has(r.worktreeGitRoot),protectedNewbornCount:this.newbornWorktreeRoots.size},sensitive:{}}),this.forgetNewbornWorktreeStream(a.streamId),i.launchMode===`create-stable-worktree`){this.addWorkspaceRoot(r.worktreeWorkspaceRoot,i.label),this.statesById.delete(n),this.publish();return}let o=this.statesById.get(n);o&&(o.runtime=null),this.runCleanup()}catch(e){}}async createManagedWorktree({hostId:n,cwd:r,startingState:i,localEnvironmentConfigPath:a,streamId:o}){try{let s=await this.requestGitWorker({method:`create-worktree`,params:{hostConfig:this.options.getHostConfigForHostId(n),cwd:e.Ot(r),startingState:i,localEnvironmentConfigPath:a,streamId:o}}),c=this.newbornWorktreeRoots.has(s.worktreeGitRoot);return this.newbornWorktreeRoots.add(s.worktreeGitRoot),cv().info(`[worktree-create] ready`,{safe:{worktreeId:t.Ut(s.worktreeGitRoot),flow:`managed`,hasLocalEnvironment:a!=null,wasNewbornProtected:c,protectedNewbornCount:this.newbornWorktreeRoots.size},sensitive:{}}),this.runCleanup(),s}catch(e){throw this.forgetNewbornWorktreeStream(o),e}}};';
const WORKTREE_ENVIRONMENT_MAIN_BUNDLE_26_506 = WORKTREE_ENVIRONMENT_MAIN_BUNDLE_26_422
  .replace(
    'hostConfig:this.options.hostConfig,cwd:e.Ot(i.sourceWorkspaceRoot)',
    'hostConfig:this.options.hostConfig,operationSource:`worktree_pending_create`,cwd:e.Ot(i.sourceWorkspaceRoot)'
  )
  .replace(
    'hostConfig:this.options.getHostConfigForHostId(n),cwd:e.Ot(r)',
    'hostConfig:this.options.getHostConfigForHostId(n),operationSource:`worktree_managed_create`,cwd:e.Ot(r)'
  );
const WORKTREE_ENVIRONMENT_MAIN_BUNDLE_26_527 = WORKTREE_ENVIRONMENT_MAIN_BUNDLE_26_506
  .replace(
    'streamId:a.streamId,setUpSyncedBranch:i.launchMode===`create-stable-worktree`?!1:void 0',
    'streamId:a.streamId,allowSetupFailure:!0,setUpSyncedBranch:i.launchMode===`create-stable-worktree`?!1:void 0'
  )
  .replace(
    'if(this.updateEntry(n,e=>({...e,phase:`worktree-ready`',
    'if(r.setupError!=null){cv().info(`[worktree-create] setup-failed`,{safe:{worktreeId:t.Ut(r.worktreeGitRoot),flow:`pending`,launchMode:i.launchMode,hasLocalEnvironment:i.localEnvironmentConfigPath!=null},sensitive:{}}),this.updateEntry(n,e=>({...e,phase:`failed`,errorMessage:r.setupError,worktreeGitRoot:r.worktreeGitRoot,worktreeWorkspaceRoot:r.worktreeWorkspaceRoot,needsAttention:!0}));let e=this.statesById.get(n);e&&(e.runtime=null),this.notifyFailure(n,r.setupError);return}if(this.updateEntry(n,e=>({...e,phase:`worktree-ready`'
  );
const WORKTREE_ENVIRONMENT_WORKER_BUNDLE_CURRENT = `async function MZ(e,t,n){let r=await AZ(e,t,n);r!=null&&await cz.rm(r,void 0,t)}async function cX(e,t,n,r,i,a){return uX({workspaceRoot:e,localEnvironment:t,scriptType:\`setup\`,appServerClient:a,injectedEnvironment:i,onLog:n,signal:r})}async function lX(e,t,n,r,i){return(await uX({workspaceRoot:e,localEnvironment:t,scriptType:\`cleanup\`,appServerClient:i,onLog:n,signal:r}))?.setupResult??null}async function NZ({gitManager:e,workspaceRoot:t,startingState:n,localEnvironmentConfigPath:r,setUpSyncedBranch:i=!0,appServerClient:a,signal:o,onLog:s,onWorktreePathAllocated:c}){if(o?.aborted)return{success:!1,error:Error(\`Request canceled\`)};let l=(await e.getWorktreeRepository(NL(t),a))?.root;if(!l)return{success:!1,error:Error(\`Not a git repository\`)};let m={worktreeGitRoot:\`/tmp/source/.git\`,worktreeWorkspaceRoot:\`/tmp/worktree\`},{worktreeGitRoot:h,worktreeWorkspaceRoot:g}=m;c?.(h);if(s?.(\`info\`,ce.Buffer.from(\`Worktree created at \${g}\n\`,\`utf8\`)),await vZ(g,r??\`__none__\`,a,\`worktree\`,o)||s?.(\`stderr\`,ce.Buffer.from(\`Failed to store selected environment in git config
\`,\`utf8\`)),r==null)return s?.(\`info\`,ce.Buffer.from(\`No local environment selected
\`,\`utf8\`)),{success:!0,worktreeGitRoot:h,worktreeWorkspaceRoot:g,setupResult:null};let v=await QJ(r,a);if(v.type===\`error\`)return s?.(\`stderr\`,ce.Buffer.from(\`\${v.error.message}\n\`,\`utf8\`)),{success:!1,error:v.error};s?.(\`info\`,ce.Buffer.from(\`Running setup script \${v.configPath}\n\`,\`utf8\`));let y=await cX(h,v,(e,t)=>{s?.(e,t)},o,{[UL]:t,[WL]:g},a);return{success:!0,worktreeGitRoot:h,worktreeWorkspaceRoot:g,setupResult:y?.setupResult??null}}async function RX(e,t,n,r){let i=await nX(e,n,\`worktree\`,r);if(i==null||i===\`__none__\`)return;let a=await QJ(i,n);if(a.type===\`error\`){NX().warning(\`[worktree-delete] cleanup-config-unavailable\`,{safe:{worktreeId:t},sensitive:{configPath:i,error:a.error}});return}if(!a.environment.cleanup)return;NX().info(\`[worktree-delete] cleanup-script-start\`,{safe:{worktreeId:t},sensitive:{configPath:i}});let o=await lX(e,a,void 0,r,n);if(o!=null){if(o?.status===\`failed\`)throw Error(o.error??\`Cleanup script failed\`)}}async function W1(e,{appServerClient:t,signal:n,onProgress:r}){let i=[];if(e.sourceBranch.trim().length===0)return X({status:\`error\`,error:\`invalid-params\`,message:\`Missing source branch\`,rollbackErrors:[],warnings:i});let a=null,o=null,s=!1,c=!1;try{if(await YY(e.sourceWorktreeCwd,t,n)==null)return X({status:\`error\`,error:\`source-not-on-branch\`,message:\`Source worktree must be on a branch to move to local\`,rollbackErrors:[],warnings:i});o=await YY(e.localGitRoot,t,n);let l=await B1(e.sourceWorktreeCwd,t,n);if(l==null)return X({status:\`error\`,error:\`source-detach-failed\`,message:\`Unable to resolve worktree HEAD commit\`,rollbackErrors:[],warnings:i});let u=await XZ({cwd:e.sourceWorktreeCwd,branch:l,stashUncommitted:!0},t,{onStashStatusChange:e=>{r?.(\`stash-source-changes\`,e)},onCheckoutStatusChange:e=>{r?.(\`detach-worktree-branch\`,e)}});if(u.status===\`error\`)return X({status:\`error\`,error:\`source-detach-failed\`,message:u.error,rollbackErrors:[],warnings:i,execOutput:u.execOutput});a=u.stashRef,s=!0;if(o!==e.sourceBranch){let n=await XZ({cwd:e.localGitRoot,branch:e.sourceBranch,stashUncommitted:!1},t,{onCheckoutStatusChange:e=>{r?.(\`checkout-local-branch\`,e)}});if(n.status===\`error\`)return X({status:\`error\`,error:\`checkout-local-failed\`,message:n.error,rollbackErrors:[],warnings:i,execOutput:n.execOutput});c=!0}else r?.(\`checkout-local-branch\`,\`skipped\`);if(a!=null){r?.(\`apply-changes-to-local\`,\`started\`);let n=await V1({cwd:e.localGitRoot,stashRef:a,mode:\`apply\`},t);if(n.status===\`error\`)return X({status:\`error\`,error:\`apply-source-stash-failed\`,message:n.error,rollbackErrors:[],warnings:i,execOutput:n.execOutput});r?.(\`apply-changes-to-local\`,\`completed\`),(await V1({cwd:e.localGitRoot,stashRef:a,mode:\`drop\`},t)).status===\`error\`&&i.push(\`drop-source-stash-failed\`)}else r?.(\`apply-changes-to-local\`,\`skipped\`);return X({status:\`success\`,warnings:i})}catch{return c&&(await U1({cwd:e.localGitRoot,branch:o,stashRef:null,restoreBranchError:\`restore-local-branch-failed\`,restoreStashError:\`restore-local-stash-failed\`,appServerClient:t})),s&&(await U1({cwd:e.sourceWorktreeCwd,branch:e.sourceBranch,stashRef:a,restoreBranchError:\`restore-source-branch-failed\`,restoreStashError:\`restore-source-stash-failed\`,appServerClient:t})),X({status:\`error\`,error:\`unexpected-error\`,message:\`Failed to move thread to local\`,rollbackErrors:[],warnings:i})}}`;
const WORKTREE_ENVIRONMENT_WORKER_BUNDLE_26_422 = `async function aX(e,t,n,r,i,a){return sX({workspaceRoot:e,localEnvironment:t,scriptType:\`setup\`,appServerClient:a,injectedEnvironment:i,onLog:n,signal:r})}async function oX(e,t,n,r,i){return(await sX({workspaceRoot:e,localEnvironment:t,scriptType:\`cleanup\`,appServerClient:i,onLog:n,signal:r}))?.setupResult??null}async function jZ({gitManager:e,workspaceRoot:t,startingState:n,localEnvironmentConfigPath:r,setUpSyncedBranch:i=!0,appServerClient:a,signal:o,onLog:s,onWorktreePathAllocated:c}){if(o?.aborted)return{success:!1,error:Error(\`Request canceled\`)};let l=(await e.getWorktreeRepository(PL(t),a))?.root;if(!l)return{success:!1,error:Error(\`Not a git repository\`)};let m={worktreeGitRoot:\`/tmp/source/.git\`,worktreeWorkspaceRoot:\`/tmp/worktree\`},{worktreeGitRoot:h,worktreeWorkspaceRoot:g}=m;c?.(h);if(s?.(\`info\`,ce.Buffer.from(\`Worktree created at \${g}\n\`,\`utf8\`)),await gZ(g,r??\`__none__\`,a,\`worktree\`,o)||s?.(\`stderr\`,ce.Buffer.from(\`Failed to store selected environment in git config
\`,\`utf8\`)),r==null)return s?.(\`info\`,ce.Buffer.from(\`No local environment selected
\`,\`utf8\`)),{success:!0,worktreeGitRoot:h,worktreeWorkspaceRoot:g,setupResult:null};let v=await YJ(r,a);if(v.type===\`error\`)return s?.(\`stderr\`,ce.Buffer.from(\`\${v.error.message}\n\`,\`utf8\`)),{success:!1,error:v.error};s?.(\`info\`,ce.Buffer.from(\`Running setup script \${v.configPath}\n\`,\`utf8\`));let y=await aX(h,v,(e,t)=>{s?.(e,t)},o,{[JL]:t,[YL]:g},a);return{success:!0,worktreeGitRoot:h,worktreeWorkspaceRoot:g,setupResult:y?.setupResult??null}}async function FX(e,t,n,r){let i=await $Y(e,n,\`worktree\`,r);if(i==null||i===\`__none__\`)return;let a=await YJ(i,n);if(a.type===\`error\`){AX().warning(\`[worktree-delete] cleanup-config-unavailable\`,{safe:{worktreeId:t},sensitive:{configPath:i,error:a.error}});return}if(!a.environment.cleanup)return;AX().info(\`[worktree-delete] cleanup-script-start\`,{safe:{worktreeId:t},sensitive:{configPath:i}});let o=await oX(e,a,void 0,r,n);if(o!=null){if(o?.status===\`failed\`)throw AX().warning(\`[worktree-delete] cleanup-script-failed\`,{safe:{worktreeId:t},sensitive:{configPath:i,error:o.error}}),Error(o.error??\`Cleanup script failed\`);AX().info(\`[worktree-delete] cleanup-script-finished\`,{safe:{worktreeId:t},sensitive:{configPath:i}})}}async function P1(e,{appServerClient:t,signal:n,onProgress:r}){let i=[];if(e.sourceBranch.trim().length===0)return X({status:\`error\`,error:\`invalid-params\`,message:\`Missing source branch\`,rollbackErrors:[],warnings:i});let a=null,o=null,s=!1,c=!1;try{if(await KY(e.sourceWorktreeCwd,t,n)==null)return X({status:\`error\`,error:\`source-not-on-branch\`,message:\`Source worktree must be on a branch to move to local\`,rollbackErrors:[],warnings:i});o=await KY(e.localGitRoot,t,n);if(o!==e.sourceBranch){let n=await UZ({cwd:e.localGitRoot,branch:e.sourceBranch,stashUncommitted:!1},t,{onCheckoutStatusChange:e=>{r?.(\`checkout-local-branch\`,e)}});if(n.status===\`error\`)return X({status:\`error\`,error:\`checkout-local-failed\`,message:n.error,rollbackErrors:i,warnings:i,execOutput:n.execOutput});c=!0}else r?.(\`checkout-local-branch\`,\`skipped\`);if(a!=null){r?.(\`apply-changes-to-local\`,\`started\`);let n=await j1({cwd:e.localGitRoot,stashRef:a,mode:\`apply\`},t);if(n.status===\`error\`)return X({status:\`error\`,error:\`apply-source-stash-failed\`,message:n.error,rollbackErrors:[],warnings:i,execOutput:n.execOutput});r?.(\`apply-changes-to-local\`,\`completed\`),(await j1({cwd:e.localGitRoot,stashRef:a,mode:\`drop\`},t)).status===\`error\`&&i.push(\`drop-source-stash-failed\`)}else r?.(\`apply-changes-to-local\`,\`skipped\`);return X({status:\`success\`,warnings:i})}catch{let n=[];return c&&(n=[...n]),s&&(n=[...n]),X({status:\`error\`,error:\`unexpected-error\`,message:\`Failed to move thread to local\`,rollbackErrors:n,warnings:i})}}`;
const WORKTREE_ENVIRONMENT_WORKER_BUNDLE_26_506 = WORKTREE_ENVIRONMENT_WORKER_BUNDLE_CURRENT.replace(
  'return X({status:`success`,warnings:i})',
  'return Z({status:`success`,warnings:i})'
);
const WORKTREE_ENVIRONMENT_WORKER_BUNDLE_26_513 = WORKTREE_ENVIRONMENT_WORKER_BUNDLE_CURRENT
  .replaceAll('ce.Buffer', 'le.Buffer')
  .replace('cz.rm', 'bq.rm');
const WORKTREE_ENVIRONMENT_WORKER_BUNDLE_26_527 = WORKTREE_ENVIRONMENT_WORKER_BUNDLE_CURRENT
  .replace(
    'localEnvironmentConfigPath:r,setUpSyncedBranch:i=!0,appServerClient:a,signal:o,onLog:s,onWorktreePathAllocated:c',
    'localEnvironmentConfigPath:r,allowSetupFailure:i=!1,setUpSyncedBranch:a=!0,appServerClient:o,signal:s,onLog:c,onWorktreePathAllocated:l'
  )
  .replaceAll('s?.(`info`', 'c?.(`info`')
  .replaceAll('s?.(`stderr`', 'c?.(`stderr`')
  .replace('if(o?.aborted)', 'if(s?.aborted)')
  .replace('getWorktreeRepository(NL(t),a)', 'getWorktreeRepository(NL(t),o)')
  .replace('c?.(h);', 'l?.(h);')
  .replace('await vZ(g,r??`__none__`,a,`worktree`,o)', 'await vZ(g,r??`__none__`,o,`worktree`,s)')
  .replace(
    '{success:!0,worktreeGitRoot:h,worktreeWorkspaceRoot:g,setupResult:null};let v=await QJ(r,a);',
    '{success:!0,worktreeGitRoot:h,worktreeWorkspaceRoot:g,setupResult:null,setupError:null};let v=await QJ(r,o);'
  )
  .replace(
    '{success:!1,error:v.error};c?.(`info`',
    'i?{success:!0,worktreeGitRoot:h,worktreeWorkspaceRoot:g,setupResult:null,setupError:v.error}:{success:!1,error:v.error};c?.(`info`'
  )
  .replace(
    'let y=await cX(h,v,(e,t)=>{c?.(e,t)},o,{[UL]:t,[WL]:g},a);',
    'let y=await cX(h,v,(e,t)=>{c?.(e,t)},s,{[UL]:t,[WL]:g},o);'
  );
const TERMINAL_PANEL_BLOCK_LEGACY =
  'function vDe(e){let ee,te;t[29]!==n||t[30]!==i||t[31]!==r||t[32]!==o||t[33]!==m?(ee=()=>{let e=T.current;if(!e)return;let t=o??St.create({conversationId:n,hostId:r??null,cwd:i??null});O.current=t,k.current=!1;let a=!1,s=new nDe.Terminal({allowTransparency:!0,cursorStyle:`bar`,fontSize:j.current,allowProposedApi:!0,cursorBlink:!0,fontFamily:A.current,letterSpacing:0,lineHeight:1.2,theme:RQ()}),c=null,l=()=>{c??=requestAnimationFrame(()=>{c=null,s.scrollToBottom()})};E.current=s;let u=new aDe.ClipboardAddon,d=new iDe.FitAddon;D.current=d;let f=new rDe.WebLinksAddon(bDe);s.loadAddon(u),s.loadAddon(d),s.loadAddon(f),s.attachCustomKeyEventHandler(e=>lDe({clipboard:typeof navigator<`u`&&navigator.clipboard!=null&&m?navigator.clipboard:void 0,event:e,sendText:e=>{St.write(t,e)},term:s})),s.open(e);let p=n=>{a||e.isConnected&&requestAnimationFrame(()=>{a||e.isConnected&&(k.current?IQ(s,d,t):LQ(d),n?.())})};p(),M.current=!1;let h=St.register(t,{onInitLog:e=>{s.write(e),l()},onData:e=>{M.current||(M.current=!0,P(`Running`),I(null)),s.write(e),l()},onExit:()=>{a||P(`Exited`)},onError:e=>{a||(P(`Error`),I(e))},onAttach:(e,t)=>{a||(k.current=!0,P(`Running`),I(null),R(t??null),p())}}),g=s.onData(e=>{St.write(t,e)}),_=s.onKey(yDe);o&&requestAnimationFrame(()=>{a||St.attach({sessionId:o,conversationId:n,hostId:r??null,cwd:i??null,cols:s.cols,rows:s.rows})});let v=new ResizeObserver(()=>{p()});return v.observe(e),()=>{a=!0,c!=null&&(cancelAnimationFrame(c),c=null),v.disconnect(),g.dispose(),_.dispose(),h(),D.current=null,O.current=null,k.current=!1,o||St.close(t),s.dispose(),E.current=null}},te=[n,i,r,o,m],t[29]=n,t[30]=i,t[31]=r,t[32]=o,t[33]=m,t[34]=ee,t[35]=te):(ee=t[34],te=t[35]),(0,Z.useEffect)(ee,te);return(0,$.jsx)(`div`,{"data-codex-terminal":!0})}';
const TERMINAL_PANEL_BLOCK_CURRENT =
  'let ee,te;t[29]!==n||t[30]!==i||t[31]!==r||t[32]!==o||t[33]!==m?(ee=()=>{let e=T.current;if(!e)return;let t=o??ln.create({conversationId:n,hostId:r??null,cwd:i??null});O.current=t,k.current=!1;let a=!1,s=new jke.Terminal({allowTransparency:!0});let c=null,l=()=>{c??=requestAnimationFrame(()=>{c=null,s.scrollToBottom()})};E.current=s;let p=n=>{a||e.isConnected&&requestAnimationFrame(()=>{a||e.isConnected&&(k.current?V0(s,D.current,t):H0(D.current),n?.())})};p(),M.current=!1;let h=ln.register(t,{onInitLog:e=>{s.write(e),l()},onData:e=>{M.current||(M.current=!0,P(`Running`),I(null)),s.write(e),l()},onExit:()=>{a||P(`Exited`)},onError:e=>{a||(P(`Error`),I(e))},onAttach:(e,t)=>{a||(k.current=!0,P(`Running`),I(null),R(t??null),p())}}),g=s.onData(e=>{ln.write(t,e)}),_=s.onKey(Jke);o&&requestAnimationFrame(()=>{a||ln.attach({sessionId:o,conversationId:n,hostId:r??null,cwd:i??null,cols:s.cols,rows:s.rows})});let v=new ResizeObserver(()=>{p()});return v.observe(e),()=>{a=!0,c!=null&&(cancelAnimationFrame(c),c=null),v.disconnect(),g.dispose(),_.dispose(),h(),D.current=null,O.current=null,k.current=!1,o||ln.close(t),s.dispose(),E.current=null}},te=[n,i,r,o,m],t[29]=n,t[30]=i,t[31]=r,t[32]=o,t[33]=m,t[34]=ee,t[35]=te):(ee=t[34],te=t[35]),(0,Z.useEffect)(ee,te);return(0,$.jsx)(`div`,{"data-codex-terminal":!0})}';
const TERMINAL_PANEL_BLOCK_26_406 =
  'let G,K;t[26]!==n||t[27]!==i||t[28]!==r||t[29]!==a||t[30]!==f?(G=()=>{let e=C.current;if(!e)return;let t=a??Ir.create({conversationId:n,hostId:r??null,cwd:i??null});E.current=t,D.current=!1;let o=!1,s=new aye.Terminal({allowTransparency:!0,cursorStyle:`bar`,fontSize:k.current,allowProposedApi:!0,cursorBlink:!0,fontFamily:O.current,letterSpacing:0,lineHeight:1.2,theme:b0()}),c=null,l=()=>{c??=requestAnimationFrame(()=>{c=null,s.scrollToBottom()})};w.current=s;let u=new cye.ClipboardAddon,d=new sye.FitAddon;T.current=d;let p=new oye.WebLinksAddon(Cye);s.loadAddon(u),s.loadAddon(d),s.loadAddon(p),s.attachCustomKeyEventHandler(e=>fye({clipboard:typeof navigator<`u`&&navigator.clipboard!=null&&f?navigator.clipboard:void 0,event:e,sendText:e=>{Ir.write(t,e)},term:s})),s.open(e);let m=n=>{o||e.isConnected&&requestAnimationFrame(()=>{o||e.isConnected&&(D.current?v0(s,d,t):y0(d),n?.())})};m(),A.current=!1;let h=Ir.register(t,{onInitLog:e=>{s.write(e),l()},onData:e=>{A.current||(A.current=!0,M(`Running`),P(null)),s.write(e),l()},onExit:()=>{o||M(`Exited`)},onError:e=>{o||(M(`Error`),P(e))},onAttach:(e,t)=>{o||(D.current=!0,M(`Running`),P(null),I(t??null),m())}}),g=s.onData(e=>{Ir.write(t,e)}),_=s.onKey(Sye);a&&requestAnimationFrame(()=>{o||Ir.attach({sessionId:a,conversationId:n,hostId:r??null,cwd:i??null,cols:s.cols,rows:s.rows})});let v=new ResizeObserver(()=>{m()});return v.observe(e),()=>{o=!0,c!=null&&(cancelAnimationFrame(c),c=null),v.disconnect(),g.dispose(),_.dispose(),h(),T.current=null,E.current=null,D.current=!1,a||Ir.close(t),s.dispose(),w.current=null}},K=[n,i,r,a,f],t[26]=n,t[27]=i,t[28]=r,t[29]=a,t[30]=f,t[31]=G,t[32]=K):(G=t[31],K=t[32]),(0,Z.useEffect)(G,K);return(0,$.jsx)(`div`,{"data-codex-terminal":!0})}';
const TERMINAL_PANEL_BLOCK_26_415 =
  'let ee,te;t[33]!==n||t[34]!==i||t[35]!==r||t[36]!==o||t[37]!==a||t[38]!==d?(ee=()=>{let e=w.current,t=C.current;if(!e||!t)return;let s=a??Ye.create({conversationId:n,hostId:r??null,cwd:i??null});D.current=s,O.current=!1;let c=!1,l=new Jve.Terminal({allowTransparency:!0}),u=null,f=()=>{u??=requestAnimationFrame(()=>{u=null,l.scrollToBottom()})};T.current=l;let m=new Kve.FitAddon;E.current=m;l.open(e);let g=t=>{c||e.isConnected&&requestAnimationFrame(()=>{c||e.isConnected&&(O.current?k8(l,m,s):m.fit(),t?.())})};g();let _=Ye.register(s,{onInitLog:e=>{l.write(e),f()},onData:e=>{l.write(e),f()},onAttach:()=>{c||(O.current=!0,g())}}),v=l.onData(e=>{Ye.write(s,e)}),y=l.onTitleChange(e=>{Ye.setTitle(s,e)}),b=l.onKey(eye);a&&requestAnimationFrame(()=>{c||Ye.create({sessionId:a,conversationId:n,hostId:r??null,cwd:i??null,cols:l.cols,rows:l.rows})});let x=new ResizeObserver(()=>{g()});return x.observe(e),()=>{c=!0,u!=null&&(cancelAnimationFrame(u),u=null),x.disconnect(),v.dispose(),y.dispose(),b.dispose(),_(),E.current=null,D.current=null,O.current=!1,a||Ye.close(s),l.dispose(),T.current=null}},te=[n,i,r,o,a,d],t[33]=n,t[34]=i,t[35]=r,t[36]=o,t[37]=a,t[38]=d,t[39]=ee,t[40]=te):(ee=t[39],te=t[40]),(0,K.useEffect)(ee,te);return(0,q.jsx)(`div`,{"data-codex-terminal":!0})}';
const TERMINAL_PANEL_BLOCK_26_513 =
  'let fe;t[32]!==n||t[33]!==a||t[34]!==A||t[35]!==i||t[36]!==s||t[37]!==c||t[38]!==o||t[39]!==u?(fe=()=>{let e=ee.current,t=C.current;if(!e||!t)return;let r=A(),l=o??H.create({conversationId:n,conversationTitle:r,hostId:i??null,cwd:a??null});T.current=l,E.current=!1;let d=!1,f=new LT.Terminal({allowTransparency:!0}),p=null,m=()=>{p??=requestAnimationFrame(()=>{p=null,f.scrollToBottom()})};w.current=f;let h=new PT.ClipboardAddon,g=new FT.FitAddon;te.current=g;let _=new IT.WebLinksAddon(UT);f.loadAddon(h),f.loadAddon(g),f.loadAddon(_),f.attachCustomKeyEventHandler(e=>ST({sendText:e=>{H.write(l,e)},term:f})),f.open(e);let v=t=>{d||e.isConnected&&requestAnimationFrame(()=>{d||e.isConnected&&(E.current?RT(f,g,l):g.fit(),t?.())})};v();let y=H.register(l,{onInitLog:e=>{f.write(e),m()},onData:e=>{f.write(e),m()},onAttach:()=>{d||(E.current=!0,v())}}),b=f.onData(e=>{H.write(l,e)}),x=f.onTitleChange(e=>{H.setTitle(l,e)}),S=f.onKey(HT);o&&requestAnimationFrame(()=>{d||H.create({sessionId:o,conversationId:n,conversationTitle:r,hostId:i??null,cwd:a??null,cols:f.cols,rows:f.rows})});let D=new ResizeObserver(()=>{v()});return D.observe(e),()=>{d=!0,p!=null&&(cancelAnimationFrame(p),p=null),D.disconnect(),b.dispose(),x.dispose(),S.dispose(),y(),te.current=null,T.current=null,E.current=!1,o||H.close(l),f.dispose(),w.current=null}},t[32]=n,t[33]=a,t[34]=A,t[35]=i,t[36]=s,t[37]=c,t[38]=o,t[39]=u,t[40]=fe):fe=t[40];let pe;t[41]!==n||t[42]!==a||t[43]!==i||t[44]!==s||t[45]!==c||t[46]!==o||t[47]!==u?(pe=[n,a,i,s,c,o,u],t[41]=n,t[42]=a,t[43]=i,t[44]=s,t[45]=c,t[46]=o,t[47]=u,t[48]=pe):pe=t[48],(0,L.useEffect)(fe,pe);return(0,$.jsx)(`div`,{"data-codex-terminal":!0})}';
const TERMINAL_PANEL_BLOCK_26_602 =
  'let G;t[29]!==n||t[30]!==s||t[31]!==ce||t[32]!==o||t[33]!==l||t[34]!==u||t[35]!==c||t[36]!==f?(G=()=>{let e=T.current,t=w.current;if(!e||!t)return;let r=ce(),a=c??i.create({conversationId:n,conversationTitle:r,hostId:o??null,cwd:s??null});O.current=a,k.current=!1;let d=!1,p=new ve.Terminal({allowTransparency:!0}),m=null,h=()=>{m??=requestAnimationFrame(()=>{m=null,p.scrollToBottom()})};E.current=p;let g=new he.ClipboardAddon,_=new ge.FitAddon;D.current=_;p.loadAddon(g),p.loadAddon(_),p.open(e);let y=()=>{d||e.isConnected&&requestAnimationFrame(()=>{d||e.isConnected&&(k.current?ye(p,_,a):_.fit())})};y();let b=i.register(a,{onInitLog:e=>{let t=te(p);p.reset(),p.write(e),t&&h()},onData:e=>{let t=te(p);p.write(e),t&&h()},onAttach:()=>{d||(k.current=!0,y())}}),x=p.onData(e=>{i.write(a,e)}),S=p.onTitleChange(e=>{i.setTitle(a,e)}),ee=p.onKey(Ce);c&&requestAnimationFrame(()=>{d||i.create({sessionId:c,conversationId:n,conversationTitle:r,hostId:o??null,cwd:s??null,cols:p.cols,rows:p.rows})});let C=new ResizeObserver(()=>{y()});return C.observe(e),()=>{d=!0,m!=null&&(cancelAnimationFrame(m),m=null),C.disconnect(),x.dispose(),S.dispose(),ee.dispose(),b(),D.current=null,O.current=null,k.current=!1,c||i.close(a),p.dispose(),E.current=null}},t[29]=n,t[30]=s,t[31]=ce,t[32]=o,t[33]=l,t[34]=u,t[35]=c,t[36]=f,t[37]=G):G=t[37];let K;t[38]!==n||t[39]!==s||t[40]!==o||t[41]!==l||t[42]!==u||t[43]!==c||t[44]!==f?(K=[n,s,o,l,u,c,f],t[38]=n,t[39]=s,t[40]=o,t[41]=l,t[42]=u,t[43]=c,t[44]=f,t[45]=K):K=t[45],(0,Z.useEffect)(G,K);return(0,H.jsx)(`div`,{"data-codex-terminal":!0})}';
const NEW_THREAD_MODEL_SELECTOR_BLOCK_CURRENT =
  'function xf(e){let t=(0,Q.c)(30),n=e===void 0?null:e,{authMethod:r}=Ds(),i=Un(),a;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(a={select:Tf},t[0]=a):a=t[0];let{data:o}=Le(`active-workspace-roots`,a),s=o??null,c;t[1]===s?c=t[2]:(c={hostId:De,cwd:s},t[1]=s,t[2]=c);let l=yf(c),u=_f(),d=Dn(n,wf),f=Dn(n,Cf),p;t[3]===f?p=t[4]:(p=f!=null&&f.trim().length>0?f:null,t[3]=f,t[4]=p);let m=p,h=Dn(n,Sf),g=r===`copilot`,_;t[5]!==i||t[6]!==n?(_=async(e,t)=>{n!=null&&await mf(i,n,e,t)},t[5]=i,t[6]=n,t[7]=_):_=t[7];let v=_,y;t[8]!==h||t[9]!==l||t[10]!==u||t[11]!==d||t[12]!==g||t[13]!==m?(y=d?{model:m??l.model,reasoningEffort:h,isLoading:!1}:g?u:l,t[8]=h,t[9]=l,t[10]=u,t[11]=d,t[12]=g,t[13]=m,t[14]=y):y=t[14];let{model:b,reasoningEffort:x,isLoading:S}=y,{setData:C}=Os(`copilot-default-model`),w=o??null,T;t[15]===w?T=t[16]:(T={hostId:De,cwd:w},t[15]=w,t[16]=T);let E=bf(T),D;t[17]!==i||t[18]!==v||t[19]!==g||t[20]!==E||t[21]!==C?(D=async(e,t)=>{if(await v(e,t),g){C(e);return}try{await i.setDefaultModelConfig(e,t)}catch(e){let t=e;O.error(`Failed to set default model and reasoning effort`,{safe:{},sensitive:{error:t}});return}await E()},t[17]=i,t[18]=v,t[19]=g,t[20]=E,t[21]=C,t[22]=D):D=t[22];let k=D,A;t[23]!==S||t[24]!==b||t[25]!==x?(A={model:b,reasoningEffort:x,isLoading:S},t[23]=S,t[24]=b,t[25]=x,t[26]=A):A=t[26];let j=A,M;return t[27]!==j||t[28]!==k?(M={setModelAndReasoningEffort:k,modelSettings:j},t[27]=j,t[28]=k,t[29]=M):M=t[29],M}';
const NEW_THREAD_MODEL_SUBMIT_BLOCK_CURRENT =
  'async function N({appServerManager:e=x,context:t,prompt:n,workspaceRoots:r,cwd:i}){let a=[{type:`text`,text:n,text_elements:[]},...t.imageAttachments.map(e=>o$(e.src,e.localPath))],o=await e.getUserSavedConfiguration(i);return{input:a,workspaceRoots:r,cwd:i,fileAttachments:t.fileAttachments,addedFiles:t.addedFiles,agentMode:j,model:null,serviceTier:A.serviceTier,reasoningEffort:null,collaborationMode:w,config:o}}';
const NEW_THREAD_MODEL_BUNDLE_CURRENT = `${NEW_THREAD_MODEL_SELECTOR_BLOCK_CURRENT}function Sf(e){return e?.latestCollaborationMode?.settings?.reasoning_effort??null}function Cf(e){return e?.latestCollaborationMode?.settings?.model??null}function wf(e){return e!=null}${NEW_THREAD_MODEL_SUBMIT_BLOCK_CURRENT}let P=async(e,t,n,r)=>{return null};`;
const NEW_THREAD_MODEL_SELECTOR_BLOCK_26_406 =
  'function vm(e=null){let t=Ae(yt),n=mm(e),r=Rn(n.hostId),i=n.hostId,a=Do(i),o=Hi(),s=n.cwd,c=wee({hostId:i,cwd:s}),l=gm(),u=Vr(e,e=>e!=null),d=Vr(e,e=>e?.latestCollaborationMode?.settings?.model??null),f=d!=null&&d.trim().length>0?d:null,p=Vr(e,e=>e?.latestCollaborationMode?.settings?.reasoning_effort??null),m=a?.authMethod===`copilot`,h=(0,Z.useCallback)(async(t,n)=>{e==null||r==null||await rm(r,e,t,n)},[e,r]),g=u?{model:f??c.model,reasoningEffort:p,profile:c.profile,isLoading:!1}:m?l:c,{setData:_}=Mo(`copilot-default-model`),v=Tee({hostId:i,cwd:s});return{setModelAndReasoningEffort:(0,Z.useCallback)(async(e,n)=>{try{if(await h(e,n),m){_(e);return}if(k.info(`Setting default model and reasoning effort`,{safe:{newModel:e,newEffort:n,profile:c.profile}}),r==null)return;await Qc(`set-default-model-config-for-host`,{hostId:i,model:e,reasoningEffort:n,profile:c.profile}),await v()}catch(e){k.error(`Failed to update model and reasoning effort`,{safe:{},sensitive:{error:e}});let n=t.get(xl),r=Eee(o,e);um(e)?n.danger(r,{id:`composer.modelSettings.updateError`,description:(0,Z.createElement)(`div`,{className:`mt-4`},(0,Z.createElement)(Ro))}):n.danger(r,{id:`composer.modelSettings.updateError`})}},[o,m,_,h,c.profile,v,r,t]),modelSettings:g}}';
const NEW_THREAD_MODEL_SUBMIT_BLOCK_26_406 =
  'async function F({requestClient:e,context:t,prompt:n,workspaceRoots:r,cwd:i,hostId:a}){let o=[{type:`text`,text:n,text_elements:[]},...t.imageAttachments.map(e=>hQ(e.src,{localPath:e.localPath,isRemoteHost:a!==Ve}))],s=await Gn(e,i);return{input:o,workspaceRoots:r,cwd:i,fileAttachments:t.fileAttachments,addedFiles:t.addedFiles,agentMode:M,model:null,serviceTier:j.serviceTier,reasoningEffort:null,collaborationMode:T,config:s}}';
const NEW_THREAD_MODEL_BUNDLE_26_406 = `${NEW_THREAD_MODEL_SELECTOR_BLOCK_26_406}${NEW_THREAD_MODEL_SUBMIT_BLOCK_26_406}let I=async()=>null;`;
const NEW_THREAD_MODEL_BUNDLE_26_406_DRIFTED = NEW_THREAD_MODEL_BUNDLE_26_406.replace(
  'modelSettings:g}}',
  'modelSettings:g,version:1}}'
);
const NEW_THREAD_MODEL_SELECTOR_BLOCK_26_415 =
  'function $9(e){let t=(0,J.c)(30),n=e===void 0?null:e,r=fe(g),i=Gl(n),a=i.hostId,o=me(XCe,a),s=Xn(a),c=xn(),l=i.cwd,u;t[0]!==a||t[1]!==l?(u={hostId:a,cwd:l},t[0]=a,t[1]=l,t[2]=u):u=t[2];let d=ZCe(u),f=JCe(),p=me(Ft,n),m=me(_t,n),_=m?.settings.model??null,v;t[3]===_?v=t[4]:(v=_!=null&&_.trim().length>0?_:null,t[3]=_,t[4]=v);let y=v,b=s?.authMethod===`copilot`,x;t[5]!==n||t[6]!==p?(x=async(e,t)=>{n==null||!p||await on(`set-model-and-reasoning-for-next-turn`,{conversationId:n,model:e,reasoningEffort:t})},t[5]=n,t[6]=p,t[7]=x):x=t[7];let S=x,C;t[8]!==d||t[9]!==f||t[10]!==p||t[11]!==b||t[12]!==m?.settings||t[13]!==y?(C=p?{model:y??d.model,reasoningEffort:m?.settings.reasoning_effort??null,profile:d.profile,isLoading:!1}:b?f:d,t[8]=d,t[9]=f,t[10]=p,t[11]=b,t[12]=m?.settings,t[13]=y,t[14]=C):C=t[14];let w=C,T;t[15]!==a||t[16]!==l?(T={hostId:a,cwd:l},t[15]=a,t[16]=l,t[17]=T):T=t[17];let E=QCe(T),D;t[18]!==S||t[19]!==d.profile||t[20]!==a||t[21]!==c||t[22]!==o||t[23]!==b||t[24]!==E||t[25]!==r?(D=async(e,t)=>{try{if(await S(e,t),b){zn(r,`copilot-default-model`,e);return}if(h.info(`Setting default model and reasoning effort`,{safe:{newModel:e,newEffort:t,profile:d.profile}}),!o)return;await on(`set-default-model-config-for-host`,{hostId:a,model:e,reasoningEffort:t,profile:d.profile}),await E()}catch(e){let t=e;h.error(`Failed to update model and reasoning effort`,{safe:{},sensitive:{error:t}});let n=r.get(bo),i=$Ce(c,t);Q9(t)?n.danger(i,{id:`composer.modelSettings.updateError`,description:(0,K.createElement)(`div`,{className:`mt-4`},(0,K.createElement)(RCe))}):n.danger(i,{id:`composer.modelSettings.updateError`})}},t[18]=S,t[19]=d.profile,t[20]=a,t[21]=c,t[22]=o,t[23]=b,t[24]=E,t[25]=r,t[26]=D):D=t[26];let O=D,k;return t[27]!==w||t[28]!==O?(k={setModelAndReasoningEffort:O,modelSettings:w},t[27]=w,t[28]=O,t[29]=k):k=t[29],k}';
const NEW_THREAD_MODEL_SUBMIT_BLOCK_26_415 =
  'async function OB({context:e,prompt:t,workspaceRoots:n,cwd:r,hostId:i,agentMode:a,serviceTier:o,collaborationMode:s,memoryPreferences:c,workspaceKind:l=`project`,projectlessOutputDirectory:u}){let d=[{type:`text`,text:t,text_elements:[]},...DB(e,i!==he)],{config:f}=await ci(`read-config-for-host`,{hostId:i,includeLayers:!1,cwd:r});return{input:d,commentAttachments:e.commentAttachments,workspaceRoots:n,cwd:r,fileAttachments:e.fileAttachments,addedFiles:e.addedFiles,agentMode:a,model:null,serviceTier:o,reasoningEffort:null,collaborationMode:s,config:Ir(f),memoryPreferences:c,workspaceKind:l,...l===`projectless`?{projectlessOutputDirectory:u}:{}}}';
const NEW_THREAD_MODEL_SUBMIT_BLOCK_26_417 =
  'async function Nve({input:e,mode:t,model:n,projectId:r,thinking:i}){let{config:a}=await en(`read-config-for-host`,{hostId:F,includeLayers:!1,cwd:r});return{input:e,workspaceRoots:[r],cwd:r,fileAttachments:[],addedFiles:[],agentMode:zt(`agent-mode-by-host-id`,{})[F]??`auto`,model:null,reasoningEffort:null,collaborationMode:Pve(t,n,i),config:gt(a),workspaceKind:`project`}}';
const NEW_THREAD_MODEL_SELECTOR_BLOCK_26_422 =
  'function $9(e=null){let t=x(ue),n=au(e),r=n.hostId,i=C(xwe,r),a=rr(r),o=En(),s=n.cwd,c=Swe({hostId:r,cwd:s}),l=bwe(),u=C(At,e),d=C(Ze,e),f=d?.settings.model??null,p=f!=null&&f.trim().length>0?f:null,m=a?.authMethod===`copilot`,g=(0,q.useCallback)(async(t,n)=>e==null||!u?!1:(await Wt(`set-model-and-reasoning-for-next-turn`,{conversationId:e,model:t,reasoningEffort:n}),!0),[e,u]),_=u?{model:p??c.model,reasoningEffort:d?.settings.reasoning_effort??null,profile:c.profile,isLoading:c.isLoading&&p==null}:m?l:c,v=Cwe({hostId:r,cwd:s}),y=(0,q.useCallback)(e=>{},[o,t]);return{setModelAndReasoningEffortForNextTurn:(0,q.useCallback)(async(e,t)=>{try{if(!await g(e,t))throw Error(`No conversation available for next-turn model update`)}catch(e){throw y(e),e}},[g,y]),setModelAndReasoningEffort:(0,q.useCallback)(async(e,n)=>{try{if(await g(e,n))return;if(m){qn(t,`copilot-default-model`,e);return}if(h.info(`Setting default model and reasoning effort`,{safe:{newModel:e,newEffort:n,profile:c.profile}}),!i)return;await Wt(`set-default-model-config-for-host`,{hostId:r,model:e,reasoningEffort:n,profile:c.profile}),await v(),await t.query.fetch(bs,{hostId:r,cwd:s})}catch(e){y(e)}},[m,g,c.profile,v,i,r,t,y,s]),modelSettings:_}}';
const NEW_THREAD_MODEL_SUBMIT_BLOCK_26_422 =
  'async function bve({input:e,mode:t,model:n,projectId:r,thinking:i}){let{config:a}=await Wt(`read-config-for-host`,{hostId:P,includeLayers:!1,cwd:r});return{input:e,workspaceRoots:[r],cwd:r,fileAttachments:[],addedFiles:[],agentMode:Yt(`agent-mode-by-host-id`,{})[P]??`auto`,model:null,reasoningEffort:null,collaborationMode:xve(t,n,i),config:zt(a),workspaceKind:`project`}}';
const NEW_THREAD_MODEL_SELECTOR_BLOCK_26_422_71525 =
  'function $9(e=null){let t=j(fe),n=au(e),r=n.hostId,i=w(xwe,r),a=ir(r),o=Dn(),s=n.cwd,c=Swe({hostId:r,cwd:s}),l=bwe(),u=w(jt,e),d=w(Qe,e),f=d?.settings.model??null,p=f!=null&&f.trim().length>0?f:null,m=a?.authMethod===`copilot`,g=(0,q.useCallback)(async(t,n)=>e==null||!u?!1:(await Gt(`set-model-and-reasoning-for-next-turn`,{conversationId:e,model:t,reasoningEffort:n}),!0),[e,u]),_=u?{model:p??c.model,reasoningEffort:d?.settings.reasoning_effort??null,profile:c.profile,isLoading:c.isLoading&&p==null}:m?l:c,v=Cwe({hostId:r,cwd:s}),y=(0,q.useCallback)(e=>{h.error(`Failed to update model and reasoning effort`,{safe:{},sensitive:{error:e}});let n=t.get(jo),r=wwe(o,e);n.danger(r,{id:`composer.modelSettings.updateError`})},[o,t]);return{setModelAndReasoningEffortForNextTurn:(0,q.useCallback)(async(e,t)=>{try{if(!await g(e,t))throw Error(`No conversation available for next-turn model update`)}catch(e){throw y(e),e}},[g,y]),setModelAndReasoningEffort:(0,q.useCallback)(async(e,n)=>{try{if(await g(e,n))return;if(m){Jn(t,`copilot-default-model`,e);return}if(h.info(`Setting default model and reasoning effort`,{safe:{newModel:e,newEffort:n,profile:c.profile}}),!i)return;await Gt(`set-default-model-config-for-host`,{hostId:r,model:e,reasoningEffort:n,profile:c.profile}),await v(),await t.query.fetch(Ss,{hostId:r,cwd:s})}catch(e){y(e)}},[m,g,c.profile,v,i,r,t,y,s]),modelSettings:_}}';
const NEW_THREAD_MODEL_SUBMIT_BLOCK_26_422_71525 =
  'async function bve({input:e,mode:t,model:n,projectId:r,thinking:i}){let{config:a}=await Gt(`read-config-for-host`,{hostId:I,includeLayers:!1,cwd:r});return{input:e,workspaceRoots:[r],cwd:r,fileAttachments:[],addedFiles:[],agentMode:Xt(`agent-mode-by-host-id`,{})[I]??`auto`,model:null,reasoningEffort:null,collaborationMode:xve(t,n,i),config:Bt(a),workspaceKind:`project`}}';
const NEW_THREAD_MODEL_SELECTOR_BLOCK_26_519 =
  'function X(e=null){let t=v(h),n=t.queryClient,r=N(e),i=r.hostId,c=f(K,i),u=D(i),p=_(),m=r.cwd,g=q({hostId:i,cwd:m,isHostRegistered:c}),y=G(),b=f(a,e),x=f(s,e),S=x?.settings.model??null,C=S!=null&&S.trim().length>0?S:null,w=u?.authMethod===`copilot`,T=(0,U.useCallback)(async(t,n)=>e==null||!b?!1:(await l(`set-model-and-reasoning-for-next-turn`,{conversationId:e,model:t,reasoningEffort:n}),!0),[e,b]),E=b?{model:C??g.model,reasoningEffort:x?.settings.reasoning_effort??null,profile:g.profile,isLoading:g.isLoading&&C==null}:w?y:g,A=J({hostId:i,cwd:m}),j=(0,U.useCallback)(e=>{},[i,p,t]);return{setModelAndReasoningEffortForNextTurn:(0,U.useCallback)(async(e,t)=>{try{if(!await T(e,t))throw Error(`No conversation available for next-turn model update`)}catch(e){throw j(e),e}},[T,j]),setModelAndReasoningEffort:(0,U.useCallback)(async(e,r)=>{let a=null,s;try{if(await T(e,r))return;if(w){o(t,`copilot-default-model`,e);return}if(d.info(`Setting default model and reasoning effort`,{safe:{newModel:e,newEffort:r,profile:g.profile}}),!c)return;a=W(i,m),await n.cancelQueries({exact:!0,queryKey:a}),s=n.getQueryData(a),n.setQueryData(a,t=>t==null?t:Object.assign(structuredClone(t),{model:e,model_reasoning_effort:r})),await l(`set-default-model-config-for-host`,{hostId:i,model:e,reasoningEffort:r,profile:g.profile}),await A(),await t.query.fetch(I,{hostId:i,cwd:m})}catch(e){a!=null&&n.setQueryData(a,s),j(e)}},[w,T,g.profile,A,c,i,n,t,j,m]),modelSettings:E}}';
const NEW_THREAD_MODEL_SUBMIT_BLOCK_26_519 =
  'function o({agentMode:e,workspaceRoots:t,config:r,configOverrides:o,threadDetailLevel:s,input:c,commentAttachments:l,collaborationMode:u,serviceTier:d,cwd:f,fileAttachments:p,addedFiles:m,memoryPreferences:h,threadSource:g,workspaceKind:_=`project`,projectlessOutputDirectory:v,additionalDeveloperInstructions:y}){if(_===`projectless`&&v==null)throw Error(`Projectless conversations require an output directory`);let b=(0,a.default)([...p,...m],i.default),x=n(e,t,r);return{input:c,commentAttachments:l,workspaceRoots:t,collaborationMode:u,...d===void 0?{}:{serviceTier:d},permissions:x,approvalsReviewer:x.approvalsReviewer,cwd:f,attachments:b,workspaceKind:_,...g===void 0?{}:{threadSource:g},...s===void 0?{}:{threadDetailLevel:s},...o===void 0?{}:{config:o},..._===`projectless`?{projectlessOutputDirectory:v}:{},...h===void 0?{}:{memoryPreferences:h},...y===void 0?{}:{additionalDeveloperInstructions:y}}}';
const NEW_THREAD_MODEL_STATE_BUNDLE_26_415 = `${NEW_THREAD_MODEL_SELECTOR_BLOCK_26_415}function _t(e){return e?.latestCollaborationMode?.settings?.reasoning_effort??null}function Ft(e){return e?.latestCollaborationMode?.settings?.model??null}`;
const NEW_THREAD_MODEL_STATE_BUNDLE_26_415_DRIFTED = NEW_THREAD_MODEL_STATE_BUNDLE_26_415
  .replace('r.get(bo)', 'r.get(So)')
  .replace('$Ce(c,t)', 'lwe(c,t)')
  .replace('(0,K.createElement)(RCe)', '(0,K.createElement)(JCe)');
const NEW_THREAD_MODEL_STATE_BUNDLE_26_415_32059 = NEW_THREAD_MODEL_STATE_BUNDLE_26_415_DRIFTED.replace(
  'let y=v,b=s?.authMethod===`copilot`,x;',
  'let y=_,b=s?.authMethod===`copilot`,x;'
);
const NEW_THREAD_MODEL_STATE_BUNDLE_26_415_DECOY_PREFIX =
  'function codexLinuxDecoy(){let C=null,w=C,T;return T}';
const LINUX_VISUAL_COMPAT_CSS_CURRENT =
  '.window-fx-sidebar-surface{transition:background-color var(--transition-duration-relaxed) var(--transition-ease-basic)}.app-header-tint{transition:background-color var(--transition-duration-relaxed) var(--transition-ease-basic)}.sidebar-resize-handle-line{transition:background-color var(--transition-duration-relaxed) var(--transition-ease-basic)}[data-codex-window-type=electron]:not([data-codex-os=win32]) body{background:0 0;background:var(--color-token-editor-background)}[data-codex-window-type=electron].electron-opaque body{background-color:var(--color-background-surface-under);--color-background-elevated-primary:var(--color-background-elevated-primary-opaque);background-image:none}';
const LINUX_VISUAL_COMPAT_CSS_26_406 =
  '[data-codex-window-type=electron] body{--padding-row-y:calc(var(--spacing)*1.25)}[data-codex-window-type=electron]:not([data-codex-os=win32]) body{background:0 0;background:var(--color-token-editor-background)}[data-codex-window-type=electron].electron-opaque{background-color:var(--color-background-surface-under);background-image:none}[data-codex-window-type=electron].electron-opaque body{background-color:var(--color-background-surface-under);--color-background-elevated-primary:var(--color-background-elevated-primary-opaque);background-image:none}.app-header-tint{background-color:var(--codex-titlebar-tint,transparent)}.main-surface:where([data-codex-window-type=electron] .main-surface){background-color:var(--color-token-main-surface-primary)}';
const LINUX_VISUAL_COMPAT_CSS_26_519 =
  '[data-codex-window-type=electron]{background:0 0;overflow:hidden}[data-codex-window-type=electron]:not([data-codex-os=win32]) body{background:0 0}[data-codex-window-type=electron]:not([data-codex-os=win32]) .app-shell-left-panel{background:color-mix(in srgb, var(--color-token-editor-background) 55%, transparent)}[data-codex-window-type=electron].electron-opaque{background-color:var(--color-background-surface-under);background-image:none}[data-codex-window-type=electron].electron-opaque body{background-color:var(--color-background-surface-under);--color-background-elevated-primary:var(--color-background-elevated-primary-opaque);background-image:none}';
const LINUX_VISUAL_COMPAT_JS_CURRENT =
  'let H,U;t[46]!==T||t[47]!==a?(H=()=>{if(a!==`electron`)return;let e=document.querySelector(`[data-codex-window-type="electron"]`);if(e){if(T.opaqueWindows&&!XZ()){e.classList.add(`electron-opaque`);return}e.classList.remove(`electron-opaque`)}}},U=[T,a],t[46]=T,t[47]=a,t[48]=H,t[49]=U):(H=t[48],U=t[49]),(0,Z.useLayoutEffect)(H,U);';
const LINUX_VISUAL_COMPAT_JS_26_406 =
  'let H,U;t[46]!==T||t[47]!==a?(H=()=>{if(a!==`electron`)return;let e=document.querySelector(`[data-codex-window-type="electron"]`);if(e){if(T.opaqueWindows&&!xY()){e.classList.add(`electron-opaque`);return}e.classList.remove(`electron-opaque`)}}},U=[T,a],t[46]=T,t[47]=a,t[48]=H,t[49]=U):(H=t[48],U=t[49]),(0,Z.useLayoutEffect)(H,U);';
const LINUX_VISUAL_COMPAT_JS_26_409 =
  'let H,U;t[46]!==T||t[47]!==a?(H=()=>{if(a!==`electron`)return;let e=document.querySelector(`[data-codex-window-type="electron"]`);if(e){if(T.opaqueWindows&&!wX()){e.classList.add(`electron-opaque`);return}e.classList.remove(`electron-opaque`)}}},U=[T,a],t[46]=T,t[47]=a,t[48]=H,t[49]=U):(H=t[48],U=t[49]),(0,Z.useLayoutEffect)(H,U);';
const LINUX_VISUAL_COMPAT_JS_26_519 =
  '(0,Q.useLayoutEffect)(()=>{let e=document.querySelector(`[data-codex-window-type="electron"]`);if(e){if((g.opaqueWindows||i)&&!pc()){e.classList.add(`electron-opaque`);return}e.classList.remove(`electron-opaque`)}},[g,i]),(0,Q.useLayoutEffect)(()=>{let e=document.documentElement;if(e.dataset.codexOs===`darwin`)return},[p]);';
const LINUX_BROWSER_COMMENT_POSITION_BUNDLE_CURRENT =
  'function wP(e){let x;let{message:N,root:P,popupWindow:F}=x,I=N.session.sessionId;let U;t[31]!==N.editorFrame.height||t[32]!==N.editorFrame.width||t[33]!==N.editorFrame.x||t[34]!==N.editorFrame.y?(U={left:N.editorFrame.x,top:N.editorFrame.y,width:N.editorFrame.width,height:N.editorFrame.height},t[31]=N.editorFrame.height,t[32]=N.editorFrame.width,t[33]=N.editorFrame.x,t[34]=N.editorFrame.y,t[35]=U):U=t[35];return U}function TP({conversationId:e,openerWindow:t,existingPopup:n,message:r}){let i=ze({windowId:ve.BROWSER_COMMENT_POPUP,conversationId:e});if(n!=null&&!n.window.closed&&n.frameName===i)return n;let{x:a,y:o,width:s,height:c}=r.overlayWindowBounds,l=t.open(`about:blank`,i,[`popup=yes`,`left=${Math.round(a)}`,`top=${Math.round(o)}`,`width=${Math.round(s)}`,`height=${Math.round(c)}`].join(`,`));return l==null?null:{frameName:i,window:l}}d(`browser-sidebar-comment-overlay-session`,k,A);';
const LINUX_BROWSER_COMMENT_SUBMIT_MODE_BUNDLE_CURRENT =
  'let H=(e,t)=>{let{body:r,attachedImages:o}=e,{submitDirectly:s}=t===void 0?{}:t,c=s===void 0?!1:s;Pi.dispatchMessage(`browser-sidebar-comment-overlay-submit`,{conversationId:n,sessionId:I,body:r,attachedImages:o,...c?{submitDirectly:!0}:{}})},U=H,ne;t[42]===U?ne=t[43]:(ne=e=>{U(e,{submitDirectly:!0})},t[42]=U,t[43]=ne);let ie;t[47]!==z||t[48]!==G||t[49]!==V||t[50]!==C||t[51]!==M.editorFrame.height||t[52]!==M.session||t[53]!==P||t[54]!==I||t[55]!==U||t[56]!==ne||t[57]!==re?(ie=(0,Q.jsx)(df,{defaultCreateSubmitMode:`direct`,session:M.session,windowHeight:M.editorFrame.height,keyboardEventTarget:P,onSubmit:U,onDirectSubmit:ne,onDelete:re,onCancel:z,onEscape:V,onMounted:C,onAttachmentPreviewOpenChange:G,onLightDismissibilityChange:D},I),t[47]=z,t[48]=G,t[49]=V,t[50]=C,t[51]=M.editorFrame.height,t[52]=M.session,t[53]=P,t[54]=I,t[55]=U,t[56]=ne,t[57]=re,t[58]=ie):ie=t[58];';
const LINUX_BROWSER_COMMENT_SUBMIT_MODE_BUNDLE_26_519 =
  'function yd(e){let t=(0,q.c)(97),{conversationId:n,defaultCreateSubmitMode:i,onActiveEditorDismissRequestChange:a,showAdjustEntry:o}=e,s=i===void 0?`direct`:i,c=o===void 0?!0:o;let A=(e,t,r)=>{Ae.dispatchMessage(`browser-sidebar-comment-overlay-submit`,{conversationId:n,sessionId:e,body:t.body,attachedImages:t.attachedImages,...r?{submitDirectly:!0}:{}})};let be=s===`direct`,Ce=H.session.target.mode===`design`?`saved`:s;return null}';
const LINUX_BROWSER_COMMENT_SUBMIT_MODE_CALLER_BUNDLE_26_519 =
  'function yd(e){let{conversationId:n,defaultCreateSubmitMode:i}=e,s=i===void 0?`saved`:i/* codexLinuxBrowserCommentSubmitMode */;let A=(e,t,r)=>{Ae.dispatchMessage(`browser-sidebar-comment-overlay-submit`,{conversationId:n,sessionId:e,body:t.body,attachedImages:t.attachedImages,...r?{submitDirectly:!0}:{}})};return null}function Ng(){return (0,Y.jsx)(yd,{conversationId:t,defaultCreateSubmitMode:vt?`saved`:`direct`,onActiveEditorDismissRequestChange:Un,showAdjustEntry:v})}';
const LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_BUNDLE_26_601 =
  'import{r as Mc}from"./browser-sidebar-state.js";import{a as rc,o as cc}from"./above-composer-panel-row.js";const view={commentAttachments:pi};d(`browser-sidebar-comment-overlay-submit`,e=>{});mc=()=>{va(rc(pi))},hc=()=>{va(cc(pi))},_c=({discardFileAttachments:e=!1}={})=>{X.setText(``),Mc({browserConversationId:q,browserTabId:je,fallbackBrowserConversationId:U,comments:pi,onCommentsChange:va})||va([]),ba([])};let x=await bc(v,void 0,U,h??void 0);vc(p,u),xn(!0);let S=async()=>{return await A(x)};';
const LINUX_BROWSER_VIEWPORT_SURFACE_BUNDLE_26_519 =
  'function Pf({bounds:e,conversationId:t,initialUrl:n,isVisible:r,scale:i,transferSourceConversationId:a,webviewRef:o,windowZoom:s}){let c=(0,J.useRef)(null);return(0,J.useLayoutEffect)(()=>{c.current?.sync({bounds:e,isVisible:r,scale:i,windowZoom:s},o)},[e,t,r,i,o,s]),null}function Yf(){let N=(0,J.useRef)(null),P=(0,J.useRef)(null),Qt=`var(--color-token-editor-background)`,Ae={dispatchMessage(){}};Ae.dispatchMessage(`browser-sidebar-sync`,{});return (0,Y.jsx)(`div`,{className:`relative min-h-0 min-w-0 flex-1`,children:(0,Y.jsxs)(`div`,{ref:N,className:`relative h-full min-h-0 min-w-0 overflow-hidden`,style:{backgroundColor:Qt},children:[(0,Y.jsx)(Pf,{bounds:Gt,conversationId:t,initialUrl:ct?at.url:`about:blank`,isVisible:p,scale:qt,transferSourceConversationId:b,webviewRef:P,windowZoom:T})]})})}';
const LINUX_BROWSER_VIEWPORT_SURFACE_BUNDLE_26_601 =
  'import{t as ma}from"./browser-sidebar-webview-D1L6cqaW.js";import{t as ha}from"./browser-sidebar-retained-webview-DS1n6LTx.js";function Yf(){let j=(0,J.useRef)(null),M=(0,J.useRef)(null),An=`var(--color-token-editor-background)`,Ae={dispatchMessage(){}};Ae.dispatchMessage(`browser-sidebar-sync`,{});return(0,$.jsx)(`div`,{className:`relative min-h-0 min-w-0 flex-1`,children:(0,$.jsxs)(`div`,{ref:j,className:`relative h-full min-h-0 min-w-0 overflow-hidden`,style:{backgroundColor:An},children:[(0,$.jsx)(ma,{bounds:xn,browserTabId:n,conversationId:t,initialUrl:X.url.length===0?`about:blank`:X.url,isVisible:d,scale:Cn,webviewRef:M,windowZoom:x})]})})}';
const LINUX_BROWSER_VIEWPORT_SURFACE_BUNDLE_26_608 =
  'function Tl({bounds:e,browserTabId:t,children:n,conversationId:r,hostKind:i,initialUrl:a,isVisible:o,scale:s,webviewRef:c,windowZoom:l}){let u=(0,J.useRef)(null),d={dispatchMessage(){}};return u.current??=Nt.getRetainedWebview({browserTabId:t,conversationId:r,hostKind:i,initialUrl:a}),d.dispatchMessage(`browser-sidebar-sync`,{}),(0,J.useLayoutEffect)(()=>{u.current?.sync({bounds:e,isVisible:o,scale:s,windowZoom:l},c)},[e,o,s,c,l]),(0,J.useEffect)(()=>()=>u.current?.detach(c),[c]),n}function Yf(){let N=(0,J.useRef)(null),P=(0,J.useRef)(null),Qt=`var(--color-token-editor-background)`;return(0,Y.jsx)(`div`,{className:`relative min-h-0 min-w-0 flex-1`,children:(0,Y.jsxs)(`div`,{ref:N,className:`relative h-full min-h-0 min-w-0 overflow-hidden`,style:{backgroundColor:Qt},children:[(0,Y.jsx)(Tl,{bounds:Gt,browserTabId:b,children:null,conversationId:t,hostKind:`side-panel`,initialUrl:X.url.length===0?`about:blank`:X.url,isVisible:p,scale:qt,webviewRef:P,windowZoom:T})]})})}';
const LINUX_BROWSER_WEBVIEW_STACKING_BUNDLE_26_519 =
  'var k=`data-browser-sidebar-conversation-id`,A={zIndex:``},M=`2147483647`,N=`#fff`;class L{container=document.createElement(`div`);webview=document.createElement(`webview`);constructor(){this.webview.setAttribute(k,e),n.info(`IAB_LIFECYCLE renderer created hidden browser sidebar webview`)}sync(e,t){this.isAttached=!0,this.state=e,this.webview.style.backgroundColor=N,K(t,this.webview),this.syncContainerStyle()}detach(e){this.isAttached=!1,K(e,null,this.webview),this.syncContainerStyle()}syncContainerStyle(){B(this.container,this.webview,{x:1,y:2,width:300,height:200},1,1)}}function B(e,t,n,r,i){let a=r*i;Object.assign(e.style,{contain:``,height:`${Math.round(n.height*a)}px`,left:`${n.x*i}px`,opacity:`1`,overflow:`hidden`,pointerEvents:``,position:`fixed`,top:`${n.y*i}px`,transform:``,transformOrigin:``,visibility:`visible`,willChange:``,width:`${Math.round(n.width*a)}px`,zIndex:``}),Object.assign(t.style,{height:`${n.height}px`,transform:a===1?``:`scale(${a})`,transformOrigin:`top left`,willChange:a===1?``:`transform`,width:`${n.width}px`})}function H(e,t,n){Object.assign(e.style,{contain:`layout paint size style`,height:`${n.height}px`,left:`${P.x}px`,opacity:j,overflow:``,pointerEvents:`none`,position:`fixed`,top:`${P.y}px`,transform:`translate3d(0, 0, 0)`,transformOrigin:``,visibility:`visible`,willChange:`transform`,width:`${n.width}px`,zIndex:M})}';
const LINUX_BROWSER_WEBVIEW_STACKING_BUNDLE_WITH_CAPTURE_26_519 =
  LINUX_BROWSER_WEBVIEW_STACKING_BUNDLE_26_519.replace(
    'syncContainerStyle(){B(this.container,this.webview,{x:1,y:2,width:300,height:200},1,1)}',
    'syncContainerStyle(){let e=z({bounds:this.state.bounds,browserUseCaptureSurfaceSize:this.browserUseCaptureSurfaceSize,browserUseViewportSize:this.browserUseViewportSize,hasBrowserUsePaintHost:this.hasBrowserUsePaintHost,isVisible:this.state.isVisible,lastVisibleBounds:this.lastVisibleBounds});if(e==null){V(this.container,this.webview,this.lastVisibleBounds,this.browserUseViewportSize,this.isBrowserUseActive||this.browserUseViewportSize!=null);return}if(this.browserUseCaptureSurfaceSize!=null){H(this.container,this.webview,e);return}if(this.state.isVisible){this.lastVisibleBounds=e,B(this.container,this.webview,e,this.state.scale,this.state.windowZoom??1);return}H(this.container,this.webview,e)}'
  );
const LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_519 =
  'function $t(){let e=C(ie),t=C(Ae),n=C(R),r=C(ce),i=C(ne),a=C(ge),{headerLeftWidth:o,headerRightWidth:s}=Oe(),c=Dt`max(0px, calc(${s}px)`;return(0,Q.jsx)(Vt,{headerHeight:`toolbar`,beforeList:(0,Q.jsxs)(Q.Fragment,{children:[i&&!a&&(0,Q.jsx)(P.div,{"aria-hidden":!0,className:`pointer-events-none h-full shrink-0`,style:{width:o}}),n]}),afterListSticky:t,emptyState:r,afterList:(0,Q.jsxs)(Q.Fragment,{children:[e,(0,Q.jsx)(Qt,{}),(0,Q.jsx)(P.div,{"aria-hidden":!0,"data-testid":`right-panel-tab-bar-header-spacer`,className:`pointer-events-none flex h-full shrink-0 items-center`,style:{width:c}})]}),controller:Ve})}function Un({children:e}){let l=C(G);return(0,Q.jsx)(`div`,{children:(0,Q.jsx)(P.div,{children:(0,Q.jsxs)(`div`,{className:`h-full min-h-0 min-w-0 overflow-hidden [--thread-content-top-inset:calc(var(--spacing)*8)]`,children:[e,l]})})})}var Mr={RightPanelTabs:(0,Z.memo)(fr)};function Qt(){return S().formatMessage({id:`codex.rightPanel.expandFullWidth`})}';
const LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_527 =
  'function xr({children:e}){let o=T(F),s=D(ge),c=D(ve),u=D(be);return(0,Q.jsx)(B.aside,{"data-app-shell-focus-area":`right-panel`,children:(0,Q.jsx)(`div`,{children:(0,Q.jsx)(B.div,{children:(0,Q.jsxs)(`div`,{className:`h-full min-h-0 min-w-0 overflow-hidden [contain:layout_paint] [--thread-content-top-inset:calc(var(--spacing)*8)]`,children:[e,s]})})})})}function Zr(){let e=(0,$.c)(5),t=D(nt.activeTab$),n=D(J),r=D(Me),i=D(ue);if(t!=null){let t;return e[0]!==r||e[1]!==i?(t=(0,Q.jsx)(ln,{headerHeight:`pane`,afterList:r,afterListSticky:i,controller:nt}),e[0]=r,e[1]=i,e[2]=t):t=e[2],t}let a;return e[3]===n?a=e[4]:(a=n==null?null:(0,Q.jsx)(Q.Fragment,{children:n}),e[3]=n,e[4]=a),a}function $r(e){let{children:n}=e;return li(T(F),ge,n),null}var _i={RightPanelTabs:(0,Z.memo)(Zr),RightPanelOutlet:(0,Z.memo)($r)};';
const LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_601 =
  'function Sn(){let e=(0,$.c)(5),t=D(nt.activeTab$),n=D(J),r=D(Me),i=D(ue);if(t!=null)return(0,Q.jsx)(ln,{headerHeight:`pane`,afterList:r,afterListSticky:i,controller:nt});return null}function Tn(){let e=y(ue),t=y(Ce),n=y(Se),r=y(we),i=y(xe),a=y(Ze),{headerLeftWidth:o,headerRightWidth:s}=Je(),c=Jt`max(0px, calc(${s}px)`;return(0,Q.jsx)(fn,{headerHeight:`toolbar`,beforeList:(0,Q.jsxs)(Q.Fragment,{children:[i&&!a&&(0,Q.jsx)(U.div,{"aria-hidden":!0,className:`pointer-events-none h-full shrink-0`,style:{width:o}}),n]}),afterListSticky:t,emptyState:r,afterList:(0,Q.jsxs)(Q.Fragment,{children:[e,(0,Q.jsx)(Cn,{}),(0,Q.jsx)(U.div,{"aria-hidden":!0,"data-testid":`right-panel-tab-bar-header-spacer`,className:`pointer-events-none flex h-full shrink-0 items-center`,style:{width:c}})]}),controller:rt})}function Or({children:e,isRightPanelOpen:t,mainContentWidth:n,rightPanelWidth:r,rightPanelWidthRatio:i,widthMode:a}){let o=v(I),s=y(de),l=y(We),u=y(_e),d=y(Fe),{rightPanelLayoutTick:f}=Je(),p=a===`full`,m=Jt`${r}px`;return(0,Q.jsx)(U.aside,{"data-app-shell-focus-area":`right-panel`,children:(0,Q.jsx)(`div`,{children:(0,Q.jsx)(U.div,{children:(0,Q.jsxs)(`div`,{className:`h-full min-h-0 min-w-0 overflow-hidden [contain:layout_paint] [--thread-content-top-inset:calc(var(--spacing)*8)]`,children:[e,s]})})})})}function Cn(){return D().formatMessage({id:`codex.rightPanel.expandFullWidth`})}function ri(e){return null}function ii(){return(0,Q.jsx)(Tn,{})}function oi(e){let{children:n}=e,o=v(I);return gi(o,de,n),null}var wi={RightPanelTabs:(0,Z.memo)(ii),RightPanelOutlet:(0,Z.memo)(oi)};';
const LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_602 =
  LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_601.replace('s=y(de)', 's=y(ae)');
const LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_608 =
  'function Cn(){let e=c(L),t=c(ee),n=c(Y),r=c(te),i=c(J),a=c(Oe),{headerLeftWidth:o,headerRightWidth:s}=Te(),l=Jt`max(0px, calc(${s}px)`;return(0,Q.jsx)(un,{headerHeight:`toolbar`,beforeList:(0,Q.jsxs)(Q.Fragment,{children:[i&&!a&&(0,Q.jsx)(w.div,{"aria-hidden":!0,className:`pointer-events-none h-full shrink-0`,style:{width:o}}),n]}),afterListSticky:t,emptyState:r,afterList:(0,Q.jsxs)(Q.Fragment,{children:[e,(0,Q.jsx)(xn,{}),(0,Q.jsx)(w.div,{"aria-hidden":!0,"data-testid":`right-panel-tab-bar-header-spacer`,className:`pointer-events-none flex h-full shrink-0 items-center`,style:{width:l}})]}),controller:nt})}function Tn(){return(0,Q.jsx)(`div`,{"data-app-shell-tab-strip-controller":!0})}function xn(){return S().formatMessage({id:`codex.rightPanel.expandFullWidth`})}var Mr={RightPanelTabs:(0,Z.memo)(Cn)};';
const BACKGROUND_SUBAGENTS_PANEL_BUNDLE_CURRENT =
  'function YR(e){let t=(0,Q.c)(39),{canStopAll:n,onOpenThread:r,onStopAll:i,rows:a}=e,o=ea();if(a.length===0)return null;let s;t[0]===a?s=t[1]:(s=a.reduce(XR,{linesAdded:0,linesRemoved:0}),t[0]=a,t[1]=s);let u,d;if(t[2]!==o||t[3]!==a.length){u=o.formatMessage({id:`composer.backgroundSubagents.summary`,defaultMessage:`{count, plural, one {# background agent} other {# background agents}}`,description:`Summary label for the background subagents panel header.`},{count:a.length});let e=o.formatMessage({id:`composer.backgroundSubagents.invokeAgents`,defaultMessage:`(@ to tag agents)`,description:`Hint shown after the background agent summary when the panel is expanded.`});d=o.formatMessage({id:`composer.backgroundSubagents.summary.expanded`,defaultMessage:`{summary} {hint}`,description:`Background agent summary label when the panel is expanded.`},{summary:u,hint:e}),t[2]=o,t[3]=a.length,t[4]=u,t[5]=d}else u=t[4],d=t[5];return d}let zn=Po(Ln,e=>Zl.getState(e.view.state)?.active===!0),Bn=Ye.length>0&&!$e&&!zn&&!it&&!tt,Vn=et||Ce||we||zn||tt;function mB({intl:e,followUpType:t,composerMode:n,cloudStartingState:r,isBackgroundSubagentsPanelVisible:i}){return e.formatMessage(hB(t,n,r,i))}let composer=(0,$.jsx)(Gc,{placeholder:p??mB({intl:yt,followUpType:R?.type,composerMode:Qn,cloudStartingState:si,isBackgroundSubagentsPanelVisible:Bn})});';
const BACKGROUND_SUBAGENTS_PANEL_BUNDLE_26_513 =
  'function sR(e){let t=(0,Z.c)(39),{canStopAll:n,onOpenThread:r,onStopAll:i,rows:a}=e,o=$i();if(a.length===0)return null;return o.formatMessage({id:`composer.backgroundSubagents.summary`,defaultMessage:`{count, plural, one {# background agent} other {# background agents}}`,description:`Summary label for the background subagents panel header.`},{count:a.length})}let On=Vu(Dn,e=>sd.getState(e.view.state)?.active===!0),kn=Ge.length>0&&!mo,An=Ye||we||Te||ct!=null||On||Xe,wc=h??Az({intl:rt,followUpType:n?.type,composerMode:hr,cloudStartingState:mr,isBackgroundSubagentsPanelVisible:kn,isGoalModeActive:Vr}),panel=kn?(0,Q.jsx)(sR,{canStopAll:Ot,onOpenThread:e=>{Et(e)},onStopAll:kt,rows:Ge}):null;';
const BACKGROUND_SUBAGENTS_PANEL_BUNDLE_26_513_ALREADY_RELAXED =
  BACKGROUND_SUBAGENTS_PANEL_BUNDLE_26_513.replace('kn=Ge.length>0&&!mo', 'kn=Ge.length>0&&!1');
const BACKGROUND_SUBAGENTS_PANEL_BUNDLE_26_417 = BACKGROUND_SUBAGENTS_PANEL_BUNDLE_CURRENT
  .replace('function YR(e){', 'function eB(e){')
  .replace('o=ea()', 'o=pa()')
  .replace('s=a.reduce(XR,{linesAdded:0,linesRemoved:0})', 's=a.reduce(tB,{linesAdded:0,linesRemoved:0})')
  .replace(
    'let zn=Po(Ln,e=>Zl.getState(e.view.state)?.active===!0),Bn=Ye.length>0&&!$e&&!zn&&!it&&!tt,Vn=et||Ce||we||zn||tt;function mB({intl:e,followUpType:t,composerMode:n,cloudStartingState:r,isBackgroundSubagentsPanelVisible:i}){return e.formatMessage(hB(t,n,r,i))}let composer=(0,$.jsx)(Gc,{placeholder:p??mB({intl:yt,followUpType:R?.type,composerMode:Qn,cloudStartingState:si,isBackgroundSubagentsPanelVisible:Bn})});',
    'let In=Xe.length>0&&!tt&&!Fn&&!st&&!it,Ln=rt||Se||Ce||Fn||it;function vV({intl:e,followUpType:t,composerMode:n,cloudStartingState:r,isBackgroundSubagentsPanelVisible:i}){return e.formatMessage(yV(t,n,r,i))}let composer=(0,$.jsx)(Qc,{placeholder:p??vV({intl:bt,followUpType:R?.type,composerMode:Yn,cloudStartingState:ri,isBackgroundSubagentsPanelVisible:In})});'
  );
const BACKGROUND_SUBAGENTS_PANEL_BUNDLE_INCOMPATIBLE =
  BACKGROUND_SUBAGENTS_PANEL_BUNDLE_CURRENT.replace(
    'Bn=Ye.length>0&&!$e&&!zn&&!it&&!tt',
    'Bn=Ye.length===0&&!$e&&!zn&&!it&&!tt'
  );
const LATEST_AGENT_TURN_EXPANSION_BUNDLE_CURRENT =
  'function Ile({hasFinalAssistantStarted:e,isTurnCancelled:t,hasRenderableAgentItems:n,preventAutoCollapse:r,persistedCollapsed:i}){return e&&!t&&n?{shouldAllowCollapse:!0,isCollapsed:i??!r}:{shouldAllowCollapse:!1,isCollapsed:!1}}function Vle(e){let t=(0,Q.c)(16),{conversationId:n,hostId:r,turnSearchKey:i,turnId:a,turn:o,conversationDetailLevel:s,cwd:c,isCollapsed:l,onSetCollapsed:u,emptyUserMessageOverride:d,parentThreadAttachment:f,resolvedApps:p,shouldAutoExpandMcpApps:m,onEditUserMessage:h,onForkUserMessage:g,startAfterTurnIntro:_,showInProgressFixedContent:v,modelProvider:y}=e,b=i===void 0?`turn`:i,x=p===void 0?zle:p,S=m===void 0?!1:m,C=_===void 0?!1:_,w=v===void 0?!0:v,T=o.status===`in_progress`,O=o.status===`cancelled`,{authMethod:k}=Nf(),A;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(A=`4170020461`,t[0]=A):A=t[0];let j=cf(A),M=Nd(),N=s??M,P=Wd(),F;t[1]===y?F=t[2]:(F=!1,t[1]=y,t[2]=F);let I=F,L;t[3]!==I||t[4]!==o.items?(L=o.items,t[3]=I,t[4]=o.items,t[5]=L):L=t[5];let R=L,z;t[6]!==C||t[7]!==R?(z=C?p5(R):R,t[6]=C,t[7]=R,t[8]=z):z=t[8];let B=z,V;t[9]!==B||t[10]!==o.status?(V=yn(B,o.status),t[9]=B,t[10]=o.status,t[11]=V):V=t[11];let{assistantItem:W,agentItems:q}=V,be=l5(W),{renderableAgentItems:Oe,isAnyNonExploringAgentItemInProgress:ke,isExploring:Ae}=d5({agentItems:q,isTurnInProgress:T,isAnyNonAgentItemInProgress:be}),{data:je}=$d(S&&F1(Oe),r),Me=S&&I1({entries:Oe,mcpServerStatuses:je}),Ne=Oe.at(-1),Pe=_le({isTurnInProgress:T,assistantItem:W,isExploring:Ae,hasActiveWebSearch:T&&Ne?.kind===`item`&&Ne.item.type===`web-search`,isAnyNonExploringAgentItemInProgress:ke,hasBlockingRequest:!1}),{shouldAllowCollapse:Fe,isCollapsed:Ie}=Ile({hasFinalAssistantStarted:zn(W),isTurnCancelled:O,hasRenderableAgentItems:Oe.length>0,preventAutoCollapse:Me,persistedCollapsed:l}),Le=Fe?Xle(Oe):Oe,Re=Fe?Zle(Oe):null,ze=Le.length>0,Ve=!C&&Fe&&ze,He=Ve?Ie:!1,Ue=Le.length,We=gle(Le),Ge=Ve&&Ue>0&&We==null;return ze?(0,$.jsx)(Yle,{collapsedMessageCount:Ue,workedForItem:Re,isCollapsed:Ge&&He,showToggle:Ge,onToggle:()=>{!u||!Ge||u(!He)},content:(0,$.jsx)(fle,{entries:Le,conversationId:n,hostId:r,conversationDetailLevel:N,isTurnInProgress:T,hasAssistantStartedStreaming:!1,hasTrailingAssistantMessage:!0,cwd:c,showPendingMcpThinking:Pe.type===`thinking`,pendingMcpThinkingMessage:void 0,resolvedApps:x,mcpServerStatuses:je,shouldAutoExpandMcpApps:S})}):null}';
const LATEST_AGENT_TURN_EXPANSION_BUNDLE_26_417 = LATEST_AGENT_TURN_EXPANSION_BUNDLE_CURRENT
  .replace('function Ile(', 'function kde(')
  .replace('function Vle(e){let t=(0,Q.c)(16),{conversationId:n,hostId:r,turnSearchKey:i,turnId:a,turn:o,conversationDetailLevel:s,cwd:c,isCollapsed:l,onSetCollapsed:u,emptyUserMessageOverride:d,parentThreadAttachment:f,resolvedApps:p,shouldAutoExpandMcpApps:m,onEditUserMessage:h,onForkUserMessage:g,startAfterTurnIntro:_,showInProgressFixedContent:v,modelProvider:y}=e,b=i===void 0?`turn`:i,x=p===void 0?zle:p,S=m===void 0?!1:m,C=_===void 0?!1:_,w=v===void 0?!0:v,T=o.status===`in_progress`,O=o.status===`cancelled`,{authMethod:k}=Nf(),A;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(A=`4170020461`,t[0]=A):A=t[0];let j=cf(A),M=Nd(),N=s??M,P=Wd(),F;t[1]===y?F=t[2]:(F=!1,t[1]=y,t[2]=F);let I=F,L;t[3]!==I||t[4]!==o.items?(L=o.items,t[3]=I,t[4]=o.items,t[5]=L):L=t[5];let R=L,z;t[6]!==C||t[7]!==R?(z=C?p5(R):R,t[6]=C,t[7]=R,t[8]=z):z=t[8];let B=z,V;t[9]!==B||t[10]!==o.status?(V=yn(B,o.status),t[9]=B,t[10]=o.status,t[11]=V):V=t[11];let{assistantItem:W,agentItems:q}=V,be=l5(W),{renderableAgentItems:Oe,isAnyNonExploringAgentItemInProgress:ke,isExploring:Ae}=d5({agentItems:q,isTurnInProgress:T,isAnyNonAgentItemInProgress:be}),{data:je}=$d(S&&F1(Oe),r),Me=S&&I1({entries:Oe,mcpServerStatuses:je}),Ne=Oe.at(-1),Pe=_le({isTurnInProgress:T,assistantItem:W,isExploring:Ae,hasActiveWebSearch:T&&Ne?.kind===`item`&&Ne.item.type===`web-search`,isAnyNonExploringAgentItemInProgress:ke,hasBlockingRequest:!1}),{shouldAllowCollapse:Fe,isCollapsed:Ie}=Ile({hasFinalAssistantStarted:zn(W),isTurnCancelled:O,hasRenderableAgentItems:Oe.length>0,preventAutoCollapse:Me,persistedCollapsed:l}),Le=Fe?Xle(Oe):Oe,Re=Fe?Zle(Oe):null,ze=Le.length>0,Ve=!C&&Fe&&ze,He=Ve?Ie:!1,Ue=Le.length,We=gle(Le),Ge=Ve&&Ue>0&&We==null;return ze?(0,$.jsx)(Yle,{collapsedMessageCount:Ue,workedForItem:Re,isCollapsed:Ge&&He,showToggle:Ge,onToggle:()=>{!u||!Ge||u(!He)},content:(0,$.jsx)(fle,{entries:Le,conversationId:n,hostId:r,conversationDetailLevel:N,isTurnInProgress:T,hasAssistantStartedStreaming:!1,hasTrailingAssistantMessage:!0,cwd:c,showPendingMcpThinking:Pe.type===`thinking`,pendingMcpThinkingMessage:void 0,resolvedApps:x,mcpServerStatuses:je,shouldAutoExpandMcpApps:S})}):null}',
    'function f5(e){let t=(0,Q.c)(26),{conversationId:n,hostId:r,turnSearchKey:i,turn:a,turnState:o,conversationDetailLevel:s,cwd:c,isMostRecentTurn:l,isCollapsed:u,onSetCollapsed:d,emptyUserMessageOverride:f,parentThreadAttachment:p,onEditLastTurnMessage:m,onForkTurnMessage:h,startAfterTurnIntro:g,showInProgressFixedContent:_,resolvedApps:v,modelProvider:y}=e,b=l===void 0?!1:l,x=g===void 0?!1:g,S=_===void 0?!0:_,C;t[0]!==b||t[1]!==a||t[2]!==m?(C=!b||a.turnId==null||a.status===`inProgress`?void 0:async e=>{await m?.(a,e)},t[0]=b,t[1]=a,t[2]=m,t[3]=C):C=t[3];let w;t[4]!==a||t[5]!==h?(w=a.turnId==null||a.status===`inProgress`?void 0:()=>{h?.(a)},t[4]=a,t[5]=h,t[6]=w):w=t[6];let T;return t[7]!==s||t[8]!==n||t[9]!==c||t[10]!==f||t[11]!==r||t[12]!==u||t[13]!==b||t[14]!==a.turnId||t[15]!==y||t[16]!==d||t[17]!==p||t[18]!==v||t[19]!==S||t[20]!==x||t[21]!==C||t[22]!==w||t[23]!==o||t[24]!==i?(T=(0,$.jsx)(Pde,{conversationId:n,hostId:r,turnSearchKey:i,turnId:a.turnId,turn:o,conversationDetailLevel:s,cwd:c,isCollapsed:u,onSetCollapsed:d,emptyUserMessageOverride:f,parentThreadAttachment:p,resolvedApps:v,shouldAutoExpandMcpApps:b,onEditUserMessage:C,onForkTurn:w,startAfterTurnIntro:x,showInProgressFixedContent:S,modelProvider:y}),t[7]=s,t[8]=n,t[9]=c,t[10]=f,t[11]=r,t[12]=u,t[13]=b,t[14]=a.turnId,t[15]=y,t[16]=d,t[17]=p,t[18]=v,t[19]=S,t[20]=x,t[21]=C,t[22]=w,t[23]=o,t[24]=i,t[25]=T):T=t[25],T}function Pde(e){let t=(0,Q.c)(37),{conversationId:n,hostId:r,turnSearchKey:i,turnId:a,turn:o,conversationDetailLevel:s,cwd:c,isCollapsed:l,onSetCollapsed:u,emptyUserMessageOverride:d,parentThreadAttachment:f,resolvedApps:p,shouldAutoExpandMcpApps:m,onEditUserMessage:h,onForkTurn:g,startAfterTurnIntro:_,showInProgressFixedContent:v,modelProvider:y}=e,b=i===void 0?`turn`:i,x=p===void 0?zle:p,S=m===void 0?!1:m,C=_===void 0?!1:_,w=v===void 0?!0:v,T=o.status===`inProgress`,O=o.status===`cancelled`,{authMethod:k}=Nf(),A;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(A=`4170020461`,t[0]=A):A=t[0];let j=cf(A),M=s??Nd(),N=Wd(),P;t[1]===y?P=t[2]:(P=!1,t[1]=y,t[2]=P);let I=P,L;t[3]!==I||t[4]!==o.items?(L=o.items,t[3]=I,t[4]=o.items,t[5]=L):L=t[5];let R=L,z;t[6]!==C||t[7]!==R?(z=C?p5(R):R,t[6]=C,t[7]=R,t[8]=z):z=t[8];let B=z,V;t[9]!==B||t[10]!==o.status?(V=yn(B,o.status),t[9]=B,t[10]=o.status,t[11]=V):V=t[11];let{assistantItem:U,agentItems:q}=V,be=l5(U),{renderableAgentItems:je,isAnyNonExploringAgentItemInProgress:Me,isExploring:Te}=d5({agentItems:q,isTurnInProgress:T,isAnyNonAgentItemInProgress:be}),{data:Pe}=$d(S&&F1(je),r),Fe=S&&I1({entries:je,mcpServerStatuses:Pe}),Re=je.at(-1),Ae=_le({isTurnInProgress:T,assistantItem:U,isExploring:Te,hasActiveWebSearch:T&&Re?.kind===`item`&&Re.item.type===`web-search`,isAnyNonExploringAgentItemInProgress:Me,hasBlockingRequest:!1,forceThinking:!1}),{shouldAllowCollapse:ze,isCollapsed:Be}=kde({hasFinalAssistantStarted:zn(U),isTurnCancelled:O,hasRenderableAgentItems:je.length>0,preventAutoCollapse:Fe,persistedCollapsed:l}),Ve=ze?Ude(je):je,He=ze?Wde(je):null,Ue=Ve.length>0,We=!1,Ge=!C&&ze&&Ue,Ke=Ge?Be:!1,qe=Ve.length,Je=lde(Ve),Ye=Ge&&qe>0&&Je==null;return Ue?(0,$.jsx)(Hde,{collapsedMessageCount:qe,workedForItem:He,isCollapsed:Ye&&Ke,showToggle:Ye,onToggle:()=>{!u||!Ye||u(!Ke)},content:(0,$.jsx)(ade,{entries:Ve,conversationId:n,hostId:r,conversationDetailLevel:M,isTurnInProgress:T,hasAssistantStartedStreaming:!1,hasTrailingAssistantMessage:!0,cwd:c,showPendingMcpThinking:Ae.type===`thinking`,pendingMcpThinkingMessage:void 0,resolvedApps:x,mcpServerStatuses:Pe,shouldAutoExpandMcpApps:S,modelProvider:y})}):null}'
  );
const LATEST_AGENT_TURN_EXPANSION_BUNDLE_INCOMPATIBLE =
  LATEST_AGENT_TURN_EXPANSION_BUNDLE_CURRENT.replace(
    'persistedCollapsed:l}),Le=Fe?Xle(Oe):Oe',
    'persistedCollapsed:l??Fe}),Le=Fe?Xle(Oe):Oe'
  );
const COMPACT_SLASH_COMMAND_BUNDLE_CURRENT =
  'function RW(e){let t=(0,Q.c)(17),{conversationId:n,isResponseInProgress:r}=e,i=ea(),a=xf(n),o;t[0]===i?o=t[1]:(o=i.formatMessage({id:`composer.compactSlashCommand.title`,defaultMessage:`Compact`,description:`Title for the compact slash command`}),t[0]=i,t[1]=o);let s;t[2]===i?s=t[3]:(s=i.formatMessage({id:`composer.compactSlashCommand.description`,defaultMessage:`Compact this thread\'s context`,description:`Description for the compact slash command`}),t[2]=i,t[3]=s);let c=n!=null&&!r,l;t[4]!==a||t[5]!==n?(l=async()=>{n!=null&&await a.compactThread(n)},t[4]=a,t[5]=n,t[6]=l):l=t[6];let u;return u={id:`compact`,title:o,description:s,requiresEmptyComposer:!0,Icon:LW,enabled:c,onSelect:l},u}';
const COMPACT_SLASH_COMMAND_BUNDLE_26_429 =
  'function rB(e){let t=(0,$.c)(15),{conversationId:n,isResponseInProgress:r}=e,i=Xo(),a;t[0]===i?a=t[1]:(a=i.formatMessage({id:`composer.compactSlashCommand.title`,defaultMessage:`Compact`,description:`Title for the compact slash command`}),t[0]=i,t[1]=a);let o;t[2]===i?o=t[3]:(o=i.formatMessage({id:`composer.compactSlashCommand.description`,defaultMessage:`Compact this thread\\\'s context`,description:`Description for the compact slash command`}),t[2]=i,t[3]=o);let s=n!=null&&!r,c;t[4]===n?c=t[5]:(c=async()=>{n!=null&&await ya(`compact-thread`,{conversationId:n})},t[4]=n,t[5]=c);let l;t[6]!==n||t[7]!==r?(l=[n,r],t[6]=n,t[7]=r,t[8]=l):l=t[8];let u;return t[9]!==a||t[10]!==o||t[11]!==s||t[12]!==c||t[13]!==l?(u={id:`compact`,title:a,description:o,requiresEmptyComposer:!0,Icon:NA,enabled:s,onSelect:c,dependencies:l},t[9]=a,t[10]=o,t[11]=s,t[12]=c,t[13]=l,t[14]=u):u=t[14],rx(u),null}';
const COMPACT_SLASH_COMMAND_BUNDLE_INCOMPATIBLE = COMPACT_SLASH_COMMAND_BUNDLE_CURRENT.replace(
  'requiresEmptyComposer:!0',
  'requiresEmptyComposer:!1'
);
const TODO_PROGRESS_BUNDLE_CURRENT =
  'case`todo-list`:return(0,$.jsx)(H8,{item:e});function H8(e){let t=(0,Q.c)(46),{item:n,isComplete:r}=e,i=r===void 0?!1:r,a=Br(),[o,s]=(0,Z.useState)(!0),{elementHeightPx:c,elementRef:l}=c$(),u=(0,Z.useRef)(null),d;t[0]===n.plan?d=t[1]:(d=(0,km.default)(n.plan,Aze),t[0]=n.plan,t[1]=d);let f=d,p=n.plan.length,m;t[2]===n.plan?m=t[3]:(m=n.plan.findIndex(kze),t[2]=n.plan,t[3]=m);let h=m,O;t[17]!==h||t[18]!==a||t[19]!==i||t[20]!==n.plan?(O=n.plan.map((e,t)=>(0,$.jsx)(`span`,{className:X(`x`,e.status===`completed`&&`line-through`),children:e.step},t)),t[17]=h,t[18]=a,t[19]=i,t[20]=n.plan,t[21]=O):O=t[21];let P;t[36]!==f||t[37]!==p?(P=(0,$.jsx)(Y,{id:`localConversationPage.planItemsCompleted`,defaultMessage:`{completedItems} out of {totalItems, plural, one {# task completed} other {# tasks completed}}`,values:{completedItems:f,totalItems:p}}),t[36]=f,t[37]=p,t[38]=P):P=t[38];return P}function Oze(e){return!e}function Qze(e){let t=(0,Q.c)(37),{item:n}=e,r=n.plan.length,i=n.plan.reduce(eBe,0),[a,o]=(0,Z.useState)(!1),{elementHeightPx:s,elementRef:c}=c$(),l=Br(),u=i===0?l.formatMessage({id:`codex.plan.todoListCreated`,defaultMessage:`To do list created with {total} tasks`},{total:r}):l.formatMessage({id:`codex.plan.tasksCompletedSummary`,defaultMessage:`{completed} out of {total} tasks completed`},{completed:i,total:r}),w;if(t[19]!==l||t[20]!==n.plan){let e;t[22]===l?e=t[23]:(e=(e,t)=>(0,$.jsx)(`span`,{className:X(`x`,e.status===`completed`&&`line-through`),children:e.step},t),t[22]=l,t[23]=e),w=n.plan.map(e),t[19]=l,t[20]=n.plan,t[21]=w}else w=t[21];return u}function $ze(e){return!e}function iBe(e){let t=(0,Q.c)(24),u;if(e.kind===`entry`){let e=e.entry.item;if(e.type===`todo-list`){let n;t[7]===e?n=t[8]:(n=(0,$.jsx)(Qze,{item:e}),t[7]=e,t[8]=n),u=n}}return u}function aBe(e){return e}function lBe(e){let t=(0,Q.c)(16),{conversationId:n,hasBlockingRequest:r,todoListItem:i,unifiedDiffItem:a,conversationDetailLevel:o,cwd:s}=e,[c,l]=(0,Z.useState)(null),f=i!=null,p=a!=null&&o!==`STEPS_PROSE`;if(!(c&&!r&&(f||p)))return null;let m;t[2]!==f||t[3]!==i?(m=f&&i!=null&&(0,$.jsx)(H8,{item:i}),t[2]=f,t[3]=i,t[4]=m):m=t[4];return m}var uBe=320;';
const TODO_PROGRESS_BUNDLE_26_406 = TODO_PROGRESS_BUNDLE_CURRENT
  .replace('{item:n,isComplete:r}=e', '{item:r,isComplete:n}=e')
  .replace('{item:n}=e', '{item:r}=e')
  .replaceAll('n.plan', 'r.plan');
const TODO_PROGRESS_BUNDLE_26_406_RENAMED = TODO_PROGRESS_BUNDLE_26_406
  .replace('function H8(e){', 'function n5(e){')
  .replaceAll('(0,$.jsx)(H8,{item:', '(0,$.jsx)(n5,{item:')
  .replace('function Qze(e){', 'function IAe(e){')
  .replaceAll('(0,$.jsx)(Qze,{item:', '(0,$.jsx)(IAe,{item:');
const TODO_PROGRESS_BUNDLE_26_409_DIRECT_COMPACT =
  'case`todo-list`:return(0,$.jsx)(a5,{item:e});function a5(e){let t=(0,Q.c)(46),{item:n,isComplete:r}=e,i=r===void 0?!1:r,a=Ni(),[o,s]=(0,Z.useState)(!0),{elementHeightPx:c,elementRef:l}=g1(),u=(0,Z.useRef)(null),d;t[0]===n.plan?d=t[1]:(d=(0,xJ.default)(n.plan,lke),t[0]=n.plan,t[1]=d);let f=d,p=n.plan.length,m;t[2]===n.plan?m=t[3]:(m=n.plan.findIndex(cke),t[2]=n.plan,t[3]=m);let h=m,k;t[17]!==h||t[18]!==a||t[19]!==i||t[20]!==n.plan?(k=n.plan.map((e,t)=>(0,$.jsx)(`span`,{className:Y(`x`,e.status===`completed`&&`line-through`),children:e.step},t)),t[17]=h,t[18]=a,t[19]=i,t[20]=n.plan,t[21]=k):k=t[21];let P;t[36]!==f||t[37]!==p?(P=(0,$.jsx)(X,{id:`localConversationPage.planItemsCompleted`,defaultMessage:`{completedItems} out of {totalItems, plural, one {# task completed} other {# tasks completed}}`,values:{completedItems:f,totalItems:p}}),t[36]=f,t[37]=p,t[38]=P):P=t[38];return P}function ske(e){return!e}function cke(e){return e.status===`in_progress`}function lke(e){return e.status===`completed`?1:0}function Fke(e,t){return e+(t.status===`completed`?1:0)}function Pke(e){return!e}function Nke(e){let t=(0,Q.c)(37),{item:n}=e,r=n.plan.length,i=n.plan.reduce(Fke,0),[a,o]=(0,Z.useState)(!1),{elementHeightPx:s,elementRef:c}=g1(),l=Ni(),u=i===0?l.formatMessage({id:`codex.plan.todoListCreated`,defaultMessage:`To do list created with {total} tasks`},{total:r}):l.formatMessage({id:`codex.plan.tasksCompletedSummary`,defaultMessage:`{completed} out of {total} tasks completed`},{completed:i,total:r}),T;if(t[19]!==l||t[20]!==n.plan){let e;t[22]===l?e=t[23]:(e=(e,t)=>(0,$.jsx)(`span`,{className:Y(`x`,e.status===`completed`&&`line-through`),children:e.step},t),t[22]=l,t[23]=e),T=n.plan.map(e),t[19]=l,t[20]=n.plan,t[21]=T}else T=t[21];return u}function h5(e){let a=e.entry.item,u;u=a.type===`todo-list`?(0,$.jsx)(Nke,{item:a}):null;return u}function Yke(e){let t=(0,Q.c)(16),{conversationId:n,hasBlockingRequest:r,todoListItem:i,unifiedDiffItem:a,conversationDetailLevel:o,cwd:s}=e,[c,l]=(0,Z.useState)(null),f=i!=null,p=a!=null&&o!==`STEPS_PROSE`;if(!(c&&!r&&(f||p)))return null;let m;t[2]!==f||t[3]!==i?(m=f&&i!=null&&(0,$.jsx)(a5,{item:i}),t[2]=f,t[3]=i,t[4]=m):m=t[4];return m}function Zke(){return null}var z=1;';
const TODO_PROGRESS_BUNDLE_26_506_EXPANDED_ITEM_CACHE =
  'function PC(e){let t=(0,Z.c)(48),{item:n,isComplete:r}=e,i=r===void 0?!1:r,a=Ci(),d;t[0]===n.plan?d=t[1]:(d=n.plan.reduce(LC,0),t[0]=n.plan,t[1]=d);let f=d,p=n.plan.length,m;t[2]===n.plan?m=t[3]:(m=n.plan.findIndex(IC),t[2]=n.plan,t[3]=m);let h=m,k;t[17]!==h||t[18]!==a||t[19]!==i||t[20]!==n.plan?(k=n.plan.map((e,t)=>(0,$.jsx)(`span`,{className:Y(`text-size-chat`,e.status===`completed`&&`line-through`),children:e.step},t)),t[17]=h,t[18]=a,t[19]=i,t[20]=n.plan,t[21]=k):k=t[21];let L;t[38]!==f||t[39]!==p?(L=(0,$.jsx)(X,{id:`localConversationPage.planItemsCompleted`,defaultMessage:`{completedItems} out of {totalItems, plural, one {# task completed} other {# tasks completed}}`,values:{completedItems:f,totalItems:p}}),t[38]=f,t[39]=p,t[40]=L):L=t[40];return L}function IC(e){return e.status===`in_progress`}function LC(e,t){return e+(t.status===`completed`?1:0)}function hw(e){let t=(0,Z.c)(37),{item:n}=e,r=n.plan.length,i=n.plan.reduce(_w,0),l=Ci(),u=i===0?l.formatMessage({id:`codex.plan.todoListCreated`,defaultMessage:`To do list created with {total} tasks`},{total:r}):l.formatMessage({id:`codex.plan.tasksCompletedSummary`,defaultMessage:`{completed} out of {total} tasks completed`},{completed:i,total:r}),T;if(t[19]!==l||t[20]!==n.plan){let e;t[22]===l?e=t[23]:(e=(e,t)=>(0,$.jsx)(`span`,{className:Y(`text-size-chat`,e.status===`completed`&&`line-through`),children:e.step},t),t[22]=l,t[23]=e),T=n.plan.map(e),t[19]=l,t[20]=n.plan,t[21]=T}else T=t[21];return u}function _w(e,t){return e+(t.status===`completed`?1:0)}function dw(e){let t=(0,Z.c)(205),{item:n}=e;switch(n.type){case`todo-list`:{let e;return t[154]===n?e=t[155]:(e=(0,$.jsx)(PC,{item:n}),t[154]=n,t[155]=e),e}}}function Jw(e){let t=(0,Z.c)(61),{unit:n}=e,F;{let e=n.entry.item;if(e.type===`todo-list`){let n;t[34]===e?n=t[35]:(n=(0,$.jsx)(hw,{item:e}),t[34]=e,t[35]=n),F=n}}return F}';
const TODO_PROGRESS_BUNDLE_26_513_31313 =
  TODO_PROGRESS_BUNDLE_26_506_EXPANDED_ITEM_CACHE.replaceAll('(0,$.jsx)', '(0,Q.jsx)');

test('parseArgs accepts dev, diagnostic, and patch skip flags', () => {
  assert.deepEqual(parseArgs([]), {
    dev: false,
    help: false,
    skipOpenTargetsPatch: false,
    skipTerminalPatch: false,
    skipTodoProgressPatch: false,
    diagnosticManifest: false
  });

  const options = parseArgs([
    '--dev',
    '--skip-open-targets-patch',
    '--skip-terminal-patch',
    '--skip-todo-progress-patch',
    '--diagnostic-manifest'
  ]);

  assert.deepEqual(options, {
    dev: true,
    help: false,
    skipOpenTargetsPatch: true,
    skipTerminalPatch: true,
    skipTodoProgressPatch: true,
    diagnosticManifest: true
  });
});

test('parseArgs rejects removed beta and version flags', () => {
  assert.throws(() => parseArgs(['--beta']), /Unknown argument: --beta/);
  assert.throws(() => parseArgs(['--version', '26.325.21211']), /Unknown argument: --version/);
});

test('readPinnedInstallVersion reads a trimmed version', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-version-'));
  try {
    const versionPath = path.join(rootDir, 'VERSION');
    await fs.promises.writeFile(versionPath, '  26.519.22136\n', 'utf8');

    assert.equal(await readPinnedInstallVersion(versionPath), '26.519.22136');
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('readPinnedInstallVersion rejects missing or blank version files', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-version-'));
  try {
    const versionPath = path.join(rootDir, 'VERSION');

    await assert.rejects(() => readPinnedInstallVersion(versionPath), /does not exist/);
    await fs.promises.writeFile(versionPath, '\n', 'utf8');
    await assert.rejects(() => readPinnedInstallVersion(versionPath), /is empty/);
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('resolveInstallRelease uses pinned version by default and latest version for dev', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-version-'));
  try {
    const versionPath = path.join(rootDir, 'VERSION');
    await fs.promises.writeFile(versionPath, '1.0.0\n', 'utf8');
    const releases = [
      { version: '2.0.0', buildNumber: '20', pubDate: 'b', enclosureUrl: 'https://example.com/2.zip' },
      { version: '1.0.0', buildNumber: '10', pubDate: 'a', enclosureUrl: 'https://example.com/1.zip' }
    ];

    assert.equal(
      (await resolveInstallRelease(releases, parseArgs([]), { versionFilePath: versionPath })).version,
      '1.0.0'
    );
    assert.equal(
      (await resolveInstallRelease(releases, parseArgs(['--dev']), { versionFilePath: versionPath })).version,
      '2.0.0'
    );

    await fs.promises.writeFile(versionPath, '3.0.0\n', 'utf8');
    await assert.rejects(
      () => resolveInstallRelease(releases, parseArgs([]), { versionFilePath: versionPath }),
      /Version 3.0.0 was not found/
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('parseProcCmdline parses Linux proc cmdline buffers', () => {
  assert.deepEqual(parseProcCmdline(Buffer.from('/opt/Codex/codex\0--type=zygote\0')), [
    '/opt/Codex/codex',
    '--type=zygote'
  ]);
});

test('isChannelAppProcessCommandLine matches only installed channel app processes', () => {
  const channelAppDir = '/home/user/.local/share/codex-linux-app/channels/stable/app';
  assert.equal(
    isChannelAppProcessCommandLine(
      [path.join(channelAppDir, 'codex'), '--no-sandbox', '--ozone-platform=x11'],
      {
        channelAppDir,
        executableName: 'codex'
      }
    ),
    true
  );
  assert.equal(
    isChannelAppProcessCommandLine(
      ['/home/user/.local/share/codex-linux-app/channels/stable/bin/codex'],
      {
        channelAppDir,
        executableName: 'codex'
      }
    ),
    false
  );
});

test('isLinuxChromeExtensionHostProcessCommandLine matches only Chrome extension native hosts', () => {
  assert.equal(
    isLinuxChromeExtensionHostProcessCommandLine([
      '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/node',
      '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/chrome-extension-host.mjs',
      'chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/'
    ]),
    true
  );
  assert.equal(
    isLinuxChromeExtensionHostProcessCommandLine([
      '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/node',
      '/tmp/browser-client.mjs'
    ]),
    false
  );
});

test('stopRunningLinuxChromeExtensionHostProcesses terminates only Chrome extension native hosts', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-chrome-host-proc-'));
  try {
    const procRoot = path.join(rootDir, 'proc');
    await fs.promises.mkdir(path.join(procRoot, '100'), { recursive: true });
    await fs.promises.mkdir(path.join(procRoot, '101'), { recursive: true });
    await fs.promises.writeFile(
      path.join(procRoot, '100', 'cmdline'),
      Buffer.from(
        [
          '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/node',
          '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/chrome-extension-host.mjs',
          'chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/',
          ''
        ].join('\0')
      )
    );
    await fs.promises.writeFile(
      path.join(procRoot, '101', 'cmdline'),
      Buffer.from(['/usr/bin/google-chrome-stable', '--type=renderer', ''].join('\0'))
    );
    const killed = [];

    const result = await stopRunningLinuxChromeExtensionHostProcesses({
      procRoot,
      killProcess(pid, signal) {
        killed.push({ pid, signal });
        fs.rmSync(path.join(procRoot, String(pid)), { recursive: true, force: true });
      }
    });

    assert.deepEqual(killed, [{ pid: 100, signal: 'SIGTERM' }]);
    assert.deepEqual(result, {
      status: 'terminated',
      terminatedPids: [100],
      remainingPids: []
    });
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('renderHelp keeps recovery flags out of the normal command surface', () => {
  const helpText = renderHelp();

  assert.match(helpText, /install-desktop --dev/);
  assert.doesNotMatch(helpText, /--version <version>/);
  assert.doesNotMatch(helpText, /--beta/);
  assert.doesNotMatch(helpText, /--skip-open-targets-patch/);
  assert.doesNotMatch(helpText, /--skip-terminal-patch/);
  assert.doesNotMatch(helpText, /--skip-todo-progress-patch/);
  assert.doesNotMatch(helpText, /--diagnostic-manifest/);
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

test('copyUpstreamResources excludes macOS Browser Use runtimes', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-resource-copy-'));
  try {
    const upstreamResourcesDir = path.join(rootDir, 'upstream');
    const resourcesDir = path.join(rootDir, 'resources');
    await fs.promises.mkdir(path.join(upstreamResourcesDir, 'native'), { recursive: true });
    await fs.promises.writeFile(path.join(upstreamResourcesDir, 'node'), 'mach-o node', 'utf8');
    await fs.promises.writeFile(
      path.join(upstreamResourcesDir, 'node_repl'),
      'mach-o node_repl',
      'utf8'
    );
    await fs.promises.writeFile(path.join(upstreamResourcesDir, 'codex'), 'mac codex', 'utf8');
    await fs.promises.writeFile(path.join(upstreamResourcesDir, 'rg'), 'mac rg', 'utf8');
    await fs.promises.writeFile(path.join(upstreamResourcesDir, 'app.asar'), 'asar', 'utf8');
    await fs.promises.writeFile(path.join(upstreamResourcesDir, 'codex-notification.wav'), 'wav', 'utf8');

    await copyUpstreamResources({ upstreamResourcesDir, resourcesDir });

    assert.equal(await pathExists(path.join(resourcesDir, 'node')), false);
    assert.equal(await pathExists(path.join(resourcesDir, 'node_repl')), false);
    assert.equal(await pathExists(path.join(resourcesDir, 'codex')), false);
    assert.equal(await pathExists(path.join(resourcesDir, 'rg')), false);
    assert.equal(await pathExists(path.join(resourcesDir, 'app.asar')), false);
    assert.equal(await pathExists(path.join(resourcesDir, 'native')), false);
    assert.equal(await pathExists(path.join(resourcesDir, 'codex-notification.wav')), true);
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('resolveBrowserUseRuntimeSources chooses env node_repl before primary runtime cache', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-'));
  try {
    const homeDir = path.join(rootDir, 'home');
    const envNodeRepl = path.join(rootDir, 'env', 'node_repl');
    const cacheNodeRepl = path.join(
      homeDir,
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'bin',
      'node_repl'
    );
    const envNode = path.join(rootDir, 'env', 'node');
    await writeTestExecutable(envNodeRepl);
    await writeTestExecutable(cacheNodeRepl);
    await writeTestExecutable(envNode);

    const sources = await resolveBrowserUseRuntimeSources({
      homeDir,
      env: {
        CODEX_BROWSER_USE_NODE_REPL_PATH: envNodeRepl,
        CODEX_BROWSER_USE_NODE_PATH: envNode,
        PATH: ''
      }
    });

    assert.equal(sources.nodeRepl.sourcePath, await fs.promises.realpath(envNodeRepl));
    assert.equal(sources.nodeRepl.sourceKind, 'env');
    assert.equal(sources.node.sourcePath, await fs.promises.realpath(envNode));
    assert.equal(sources.node.sourceKind, 'env');
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('resolveBrowserUseRuntimeSources falls back to primary runtime node_repl and PATH node', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-fallback-'));
  try {
    const homeDir = path.join(rootDir, 'home');
    const cacheNodeRepl = path.join(
      homeDir,
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'bin',
      'node_repl'
    );
    const pathNode = path.join(rootDir, 'bin', 'node');
    await writeTestExecutable(cacheNodeRepl);
    await writeTestExecutable(pathNode);

    const sources = await resolveBrowserUseRuntimeSources({
      homeDir,
      env: {
        PATH: path.dirname(pathNode)
      }
    });

    assert.equal(sources.nodeRepl.sourcePath, await fs.promises.realpath(cacheNodeRepl));
    assert.equal(sources.nodeRepl.sourceKind, 'primary-runtime-cache');
    assert.equal(sources.node.sourcePath, await fs.promises.realpath(pathNode));
    assert.equal(sources.node.sourceKind, 'path');
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('resolveBrowserUseRuntimeSources uses primary runtime node before PATH node', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-primary-node-'));
  try {
    const homeDir = path.join(rootDir, 'home');
    const primaryNode = path.join(
      homeDir,
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'node',
      'bin',
      'node'
    );
    const cacheNodeRepl = path.join(
      homeDir,
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'bin',
      'node_repl'
    );
    const pathNode = path.join(rootDir, 'bin', 'node');
    await writeTestExecutable(primaryNode);
    await writeTestExecutable(cacheNodeRepl);
    await writeTestExecutable(pathNode);

    const sources = await resolveBrowserUseRuntimeSources({
      homeDir,
      env: {
        PATH: path.dirname(pathNode)
      }
    });

    assert.equal(sources.node.sourcePath, await fs.promises.realpath(primaryNode));
    assert.equal(sources.node.sourceKind, 'primary-runtime-node');
    assert.equal(sources.nodeRepl.sourcePath, await fs.promises.realpath(cacheNodeRepl));
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

function runJsonLineProcess(command, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      env: nodeReplTestEnv(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}\n${stderr || stdout}`));
        return;
      }
      resolve(stdout);
    });
    child.stdin.end(input);
  });
}

function parseJsonLines(output) {
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function installGeneratedNodeReplFixture(rootDir) {
  const resourcesDir = path.join(rootDir, 'resources');
  await fs.promises.mkdir(resourcesDir, { recursive: true });
  await installBrowserUseRuntime({
    resourcesDir,
    env: {
      CODEX_BROWSER_USE_NODE_PATH: process.execPath,
      PATH: ''
    }
  });
  return path.join(resourcesDir, 'node_repl');
}

function startJsonLineProcess(command) {
  const child = spawn(command, [], {
    env: nodeReplTestEnv(),
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let stdoutBuffer = '';
  let stderr = '';
  const waiters = [];

  function flushWaiters() {
    while (waiters.length > 0) {
      const newline = stdoutBuffer.indexOf('\n');
      if (newline < 0) {
        return;
      }
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      const waiter = waiters.shift();
      if (!line) {
        waiter.resolve(null);
        continue;
      }
      try {
        waiter.resolve(JSON.parse(line));
      } catch (err) {
        waiter.reject(err);
      }
    }
  }

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    flushWaiters();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const closed = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}\n${stderr}`));
        return;
      }
      resolve();
    });
  });

  return {
    send(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    },
    async read() {
      for (;;) {
        const newline = stdoutBuffer.indexOf('\n');
        if (newline >= 0) {
          const line = stdoutBuffer.slice(0, newline).trim();
          stdoutBuffer = stdoutBuffer.slice(newline + 1);
          if (!line) {
            continue;
          }
          return JSON.parse(line);
        }
        const message = await new Promise((resolve, reject) => {
          waiters.push({ resolve, reject });
        });
        if (message !== null) {
          return message;
        }
      }
    },
    async close() {
      child.stdin.end();
      await closed;
    }
  };
}

test('installBrowserUseRuntime generates node_repl when only Linux node exists', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-generated-'));
  try {
    const resourcesDir = path.join(rootDir, 'resources');
    await fs.promises.mkdir(resourcesDir, { recursive: true });
    const result = await installBrowserUseRuntime({
      resourcesDir,
      env: {
        CODEX_BROWSER_USE_NODE_PATH: process.execPath,
        PATH: ''
      }
    });

    const installedNodeRepl = path.join(resourcesDir, 'node_repl');
    assert.equal(await isExecutable(installedNodeRepl), true);
    assert.equal(await pathExists(`${installedNodeRepl}.mjs`), true);
    assert.equal(result.browserUseNodeRepl.status, 'installed');
    assert.equal(result.browserUseNodeRepl.sourceKind, 'generated');
    assert.equal(result.browserUseNodeRepl.sourcePath, null);

    const output = await runJsonLineProcess(
      installedNodeRepl,
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })}\n`
    );
    const response = JSON.parse(output.trim());
    assert.equal(response.id, 1);
    assert.deepEqual(
      response.result.tools.map((tool) => tool.name),
      ['js', 'js_reset']
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('generated node_repl supports ESM imports, request metadata, and response metadata', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-esm-'));
  try {
    const installedNodeRepl = await installGeneratedNodeReplFixture(rootDir);
    const fixtureDir = path.join(rootDir, 'fixtures');
    await fs.promises.mkdir(fixtureDir, { recursive: true });
    const fileUrlModule = path.join(fixtureDir, 'file-url-module.mjs');
    const absoluteModule = path.join(fixtureDir, 'absolute-module.mjs');
    const nativePipeModule = path.join(fixtureDir, 'native-pipe-module.mjs');
    await fs.promises.writeFile(fileUrlModule, 'export const value = "file-url-ok";\n', 'utf8');
    await fs.promises.writeFile(absoluteModule, 'export const value = "absolute-ok";\n', 'utf8');
    await fs.promises.writeFile(
      nativePipeModule,
      'export const hasNativePipe = typeof import.meta.__codexNativePipe?.createConnection === "function";\n',
      'utf8'
    );

    const input = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'js',
          arguments: {
            code: `
              const fileUrlModule = await import(${JSON.stringify(pathToFileURL(fileUrlModule).href)});
              const absoluteModule = await import(${JSON.stringify(absoluteModule)});
              const nativePipeModule = await import(${JSON.stringify(pathToFileURL(nativePipeModule).href)});
              await new Promise((resolve) => setTimeout(resolve, 1));
              globalThis.persistedGeneratedValue = 41;
              console.log(fileUrlModule.value);
              console.log(absoluteModule.value);
              console.log(nativePipeModule.hasNativePipe);
              console.log(typeof globalThis.nodeRepl.nativePipe?.createConnection);
            `
          },
          _meta: {
            'x-codex-turn-metadata': { session_id: 'session-123', turn_id: 'turn-456' }
          }
        }
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'js',
          arguments: {
            code: `
              console.log(globalThis.persistedGeneratedValue + 1);
              console.log(globalThis.nodeRepl.requestMeta["x-codex-turn-metadata"].session_id);
              globalThis.nodeRepl.setResponseMeta({ "codex/browserUse": true });
            `
          },
          _meta: {
            'x-codex-turn-metadata': { session_id: 'session-123', turn_id: 'turn-789' }
          }
        }
      }
    ]
      .map((message) => JSON.stringify(message))
      .join('\n') + '\n';

    const responses = parseJsonLines(await runJsonLineProcess(installedNodeRepl, input));
    assert.equal(responses[0].result.isError, false);
    assert.equal(responses[0].result.content[0].text, 'file-url-ok\nabsolute-ok\ntrue\nfunction');
    assert.equal(responses[1].result.isError, false);
    assert.equal(responses[1].result.content[0].text, '42\nsession-123');
    assert.deepEqual(responses[1].result._meta, { 'codex/browserUse': true });
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('generated node_repl exposes process env for the Chrome browser client', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-env-'));
  const previousAmbientNetwork = process.env.BROWSER_USE_DISABLE_AMBIENT_NETWORK;
  try {
    process.env.BROWSER_USE_DISABLE_AMBIENT_NETWORK = '1';
    const installedNodeRepl = await installGeneratedNodeReplFixture(rootDir);
    const input = `${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'js',
        arguments: {
          code: `
            const key = "BROWSER_USE_DISABLE_AMBIENT_NETWORK";
            console.log(globalThis.nodeRepl?.env[key]);
            console.log(globalThis.nodeRepl?.env?.CODEX_BROWSER_USE_ENV_PROBE ?? "missing");
          `
        }
      }
    })}\n`;

    const responses = parseJsonLines(await runJsonLineProcess(installedNodeRepl, input));
    assert.equal(responses[0].result.isError, false);
    assert.equal(responses[0].result.content[0].text, '1\nmissing');
  } finally {
    if (previousAmbientNetwork == null) {
      delete process.env.BROWSER_USE_DISABLE_AMBIENT_NETWORK;
    } else {
      process.env.BROWSER_USE_DISABLE_AMBIENT_NETWORK = previousAmbientNetwork;
    }
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('generated node_repl js_reset clears the persistent context', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-reset-'));
  try {
    const installedNodeRepl = await installGeneratedNodeReplFixture(rootDir);
    const input = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'js',
          arguments: { code: 'globalThis.resetProbe = "before"; console.log(globalThis.resetProbe);' }
        }
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'js_reset', arguments: {} }
      },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'js',
          arguments: { code: 'console.log(typeof globalThis.resetProbe);' }
        }
      }
    ]
      .map((message) => JSON.stringify(message))
      .join('\n') + '\n';

    const responses = parseJsonLines(await runJsonLineProcess(installedNodeRepl, input));
    assert.equal(responses[0].result.content[0].text, 'before');
    assert.equal(responses[1].result.content[0].text, 'JavaScript context reset.');
    assert.equal(responses[2].result.content[0].text, 'undefined');
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('generated node_repl forwards Browser Use-shaped elicitations to the MCP client', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-elicitation-'));
  try {
    const installedNodeRepl = await installGeneratedNodeReplFixture(rootDir);
    const client = startJsonLineProcess(installedNodeRepl);
    try {
      client.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { elicitation: {} }
        }
      });
      assert.equal((await client.read()).id, 1);

      const permissionParams = {
        message: 'Browser Use wants to open http://localhost:3000/.',
        requestedSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['accept', 'decline'] }
          },
          required: ['action']
        }
      };
      client.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'js',
          arguments: {
            code: `
              const result = await globalThis.nodeRepl.createElicitation(${JSON.stringify(permissionParams)});
              console.log(result.action);
            `
          }
        }
      });

      const outbound = await client.read();
      assert.equal(outbound.method, 'elicitation/create');
      assert.deepEqual(outbound.params, permissionParams);
      client.send({
        jsonrpc: '2.0',
        id: outbound.id,
        result: { action: 'accept' }
      });

      const toolResponse = await client.read();
      assert.equal(toolResponse.id, 2);
      assert.equal(toolResponse.result.isError, false);
      assert.equal(toolResponse.result.content[0].text, 'accept');
    } finally {
      await client.close();
    }
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('generated node_repl createElicitation fails clearly without client support', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-elicitation-missing-'));
  try {
    const installedNodeRepl = await installGeneratedNodeReplFixture(rootDir);
    const input = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { capabilities: {} }
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'js',
          arguments: {
            code: 'await globalThis.nodeRepl.createElicitation({ message: "allow?" });'
          }
        }
      }
    ]
      .map((message) => JSON.stringify(message))
      .join('\n') + '\n';

    const responses = parseJsonLines(await runJsonLineProcess(installedNodeRepl, input));
    assert.equal(responses[1].result.isError, true);
    assert.match(
      responses[1].result.content[0].text,
      /nodeRepl\.createElicitation requires MCP client elicitation support/
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('generated node_repl accepts localhost Browser Use permission without host prompt', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-localhost-elicit-'));
  try {
    const installedNodeRepl = await installGeneratedNodeReplFixture(rootDir);
    const input = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { capabilities: { elicitation: {} } }
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'js',
          arguments: {
            code: `
              const result = await globalThis.nodeRepl.createElicitation({
                message: "Allow Browser Use to access http://localhost:3000?",
                meta: {
                  codex_approval_kind: "mcp_tool_call",
                  connector_id: "browser-use",
                  connector_name: "Browser Use",
                  persist: "always",
                  tool_params: {},
                  origin: "http://localhost:3000"
                }
              });
              console.log(result.action);
            `
          }
        }
      }
    ]
      .map((message) => JSON.stringify(message))
      .join('\n') + '\n';

    const responses = parseJsonLines(await runJsonLineProcess(installedNodeRepl, input));
    assert.equal(responses[1].id, 2);
    assert.equal(responses[1].result.isError, false);
    assert.equal(responses[1].result.content[0].text, 'accept');
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('generated node_repl auto-accepts non-local Browser Use origins when allow-all preference is enabled', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-allow-all-origins-'));
  try {
    const configRoot = path.join(rootDir, 'config');
    const preferencesPath = path.join(
      configRoot,
      'codex-desktop',
      'browser-use-preferences.json'
    );
    await fs.promises.mkdir(path.dirname(preferencesPath), { recursive: true });
    await fs.promises.writeFile(
      preferencesPath,
      `${JSON.stringify({ allowAllOrigins: true }, null, 2)}\n`,
      'utf8'
    );

    const previousConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = configRoot;
    try {
      const installedNodeRepl = await installGeneratedNodeReplFixture(rootDir);
      const input = [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { capabilities: { elicitation: {} } }
        },
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'js',
            arguments: {
              code: `
                const result = await globalThis.nodeRepl.createElicitation({
                  message: "Allow Browser Use to access https://example.com?",
                  meta: {
                    codex_approval_kind: "mcp_tool_call",
                    connector_id: "browser-use",
                    connector_name: "Browser Use",
                    persist: "always",
                    tool_params: {},
                    origin: "https://example.com"
                  }
                });
                console.log(result.action);
              `
            }
          }
        }
      ]
        .map((message) => JSON.stringify(message))
        .join('\n') + '\n';

      const responses = parseJsonLines(await runJsonLineProcess(installedNodeRepl, input));
      assert.equal(responses.length, 2);
      assert.equal(responses[1].id, 2);
      assert.equal(responses[1].result.isError, false);
      assert.equal(responses[1].result.content[0].text, 'accept');
    } finally {
      if (previousConfigHome == null) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = previousConfigHome;
      }
    }
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('generated node_repl auto-accepts Browser Use origins when browser config never asks', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-never-ask-'));
  try {
    const codexHome = path.join(rootDir, 'codex-home');
    const browserConfigPath = path.join(codexHome, 'browser', 'config.toml');
    await fs.promises.mkdir(path.dirname(browserConfigPath), { recursive: true });
    await fs.promises.writeFile(
      browserConfigPath,
      [
        'approval_mode = "never_ask"',
        'history_approval_mode = "never_ask"',
        '',
        '[origins]',
        'denied = ["https://blocked.example"]',
        ''
      ].join('\n'),
      'utf8'
    );

    const previousCodexHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = codexHome;
    try {
      const installedNodeRepl = await installGeneratedNodeReplFixture(rootDir);
      const input = [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { capabilities: { elicitation: {} } }
        },
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'js',
            arguments: {
              code: `
                const result = await globalThis.nodeRepl.createElicitation({
                  message: "Allow Browser Use to access https://youtube.com?",
                  meta: {
                    codex_approval_kind: "mcp_tool_call",
                    connector_id: "browser-use",
                    connector_name: "Browser Use",
                    persist: "always",
                    tool_params: {},
                    origin: "https://youtube.com"
                  }
                });
                console.log(result.action);
              `
            }
          }
        }
      ]
        .map((message) => JSON.stringify(message))
        .join('\n') + '\n';

      const responses = parseJsonLines(await runJsonLineProcess(installedNodeRepl, input));
      assert.equal(responses.length, 2);
      assert.equal(responses[1].id, 2);
      assert.equal(responses[1].result.isError, false);
      assert.equal(responses[1].result.content[0].text, 'accept');
    } finally {
      if (previousCodexHome == null) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previousCodexHome;
      }
    }
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('generated node_repl does not auto-accept non-local Browser Use permission on unsupported host', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-remote-elicit-'));
  try {
    const installedNodeRepl = await installGeneratedNodeReplFixture(rootDir);
    const client = startJsonLineProcess(installedNodeRepl);
    try {
      client.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { capabilities: { elicitation: {} } }
      });
      assert.equal((await client.read()).id, 1);

      client.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'js',
          arguments: {
            code: `
              await globalThis.nodeRepl.createElicitation({
                message: "Allow Browser Use to access https://example.com?",
                meta: {
                  codex_approval_kind: "mcp_tool_call",
                  connector_id: "browser-use",
                  connector_name: "Browser Use",
                  persist: "always",
                  tool_params: {},
                  origin: "https://example.com"
                }
              });
            `
          }
        }
      });

      const outbound = await client.read();
      assert.equal(outbound.method, 'elicitation/create');
      client.send({
        jsonrpc: '2.0',
        id: outbound.id,
        error: { code: -32601, message: 'elicitation/create' }
      });

      const toolResponse = await client.read();
      assert.equal(toolResponse.id, 2);
      assert.equal(toolResponse.result.isError, true);
      assert.match(
        toolResponse.result.content[0].text,
        /desktop host support for MCP elicitation\/create/
      );
    } finally {
      await client.close();
    }
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('generated node_repl falls back to the IAB native pipe for non-local Browser Use permission', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-iab-elicit-'));
  let server = null;
  try {
    const socketPath = path.join(rootDir, 'iab.sock');
    let nativePipeRequest = null;
    server = await startNativePipeHostFetchServer(socketPath, async (message) => {
      nativePipeRequest = message;
      assert.equal(message.method, 'nodeReplCreateElicitation');
      assert.equal(message.params.session_id, 'session-1');
      assert.equal(message.params.turn_id, 'turn-1');
      assert.equal(message.params.elicitation.message, 'Allow Browser Use to access https://example.com?');
      assert.equal(message.params.elicitation.meta.origin, 'https://example.com');
      return { action: 'accept' };
    });

    const installedNodeRepl = await installGeneratedNodeReplFixture(rootDir);
    const previousPipePath = process.env.CODEX_BROWSER_USE_IAB_PIPE_PATH;
    process.env.CODEX_BROWSER_USE_IAB_PIPE_PATH = socketPath;
    const client = startJsonLineProcess(installedNodeRepl);
    try {
      client.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { capabilities: { elicitation: {} } }
      });
      assert.equal((await client.read()).id, 1);

      client.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'js',
          arguments: {
            code: `
              const result = await globalThis.nodeRepl.createElicitation({
                message: "Allow Browser Use to access https://example.com?",
                meta: {
                  codex_approval_kind: "mcp_tool_call",
                  connector_id: "browser-use",
                  connector_name: "Browser Use",
                  persist: "always",
                  tool_params: {},
                  origin: "https://example.com"
                }
              });
              console.log(result.action);
            `
          },
          _meta: {
            'x-codex-turn-metadata': { session_id: 'session-1', turn_id: 'turn-1' }
          }
        }
      });

      const outbound = await client.read();
      assert.equal(outbound.method, 'elicitation/create');
      client.send({
        jsonrpc: '2.0',
        id: outbound.id,
        error: { code: -32601, message: 'elicitation/create' }
      });

      const toolResponse = await client.read();
      assert.equal(toolResponse.id, 2);
      assert.equal(toolResponse.result.isError, false);
      assert.equal(toolResponse.result.content[0].text, 'accept');
      assert.ok(nativePipeRequest);
    } finally {
      await client.close();
      if (previousPipePath == null) {
        delete process.env.CODEX_BROWSER_USE_IAB_PIPE_PATH;
      } else {
        process.env.CODEX_BROWSER_USE_IAB_PIPE_PATH = previousPipePath;
      }
    }
  } finally {
    await server?.close();
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('generated node_repl fetch uses the host bridge and rebuilds a standard Response', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-host-fetch-'));
  try {
    const installedNodeRepl = await installGeneratedNodeReplFixture(rootDir);
    const client = startJsonLineProcess(installedNodeRepl);
    try {
      client.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'js',
          arguments: {
            code: `
              const response = await globalThis.nodeRepl.fetch("https://example.com/api", {
                method: "POST",
                headers: { "content-type": "application/json", "x-request": "yes" },
                body: JSON.stringify({ ok: true })
              });
              console.log(response.status);
              console.log(response.statusText);
              console.log(response.headers.get("x-test"));
              console.log(await response.clone().text());
              console.log((await response.json()).ok);
            `
          }
        }
      });

      const outbound = await client.read();
      assert.equal(outbound.method, 'nodeRepl/fetch');
      assert.equal(outbound.params.url, 'https://example.com/api');
      assert.equal(outbound.params.method, 'POST');
      assert.equal(outbound.params.headers['content-type'], 'application/json');
      assert.equal(
        Buffer.from(outbound.params.bodyBase64, 'base64').toString('utf8'),
        '{"ok":true}'
      );
      client.send({
        jsonrpc: '2.0',
        id: outbound.id,
        result: {
          status: 202,
          statusText: 'Accepted',
          headers: { 'content-type': 'application/json', 'x-test': 'host' },
          bodyBase64: Buffer.from('{"ok":true}', 'utf8').toString('base64')
        }
      });

      const toolResponse = await client.read();
      assert.equal(toolResponse.result.isError, false);
      assert.equal(toolResponse.result.content[0].text, '202\nAccepted\nhost\n{"ok":true}\ntrue');
    } finally {
      await client.close();
    }
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('generated node_repl policy fetch reports missing authenticated host bridge clearly', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-policy-fetch-'));
  try {
    const installedNodeRepl = await installGeneratedNodeReplFixture(rootDir);
    const previousPipePath = process.env.CODEX_BROWSER_USE_IAB_PIPE_PATH;
    process.env.CODEX_BROWSER_USE_IAB_PIPE_PATH = path.join(rootDir, 'missing.sock');
    const client = startJsonLineProcess(installedNodeRepl);
    try {
      client.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'js',
          arguments: {
            code: `
              try {
                await globalThis.nodeRepl.fetch("https://chatgpt.com/backend-api/aura/site_status?url=http%3A%2F%2Flocalhost%3A3000%2F");
              } catch (err) {
                console.log(err.message);
              }
            `
          }
        }
      });

      const outbound = await client.read();
      assert.equal(outbound.method, 'nodeRepl/fetch');
      assert.equal(
        outbound.params.url,
        'https://chatgpt.com/backend-api/aura/site_status?url=http%3A%2F%2Flocalhost%3A3000%2F'
      );
      client.send({
        jsonrpc: '2.0',
        id: outbound.id,
        error: { code: -32601, message: 'Method not found' }
      });

      const toolResponse = await client.read();
      assert.equal(toolResponse.result.isError, false);
      assert.match(
        toolResponse.result.content[0].text,
        /authenticated desktop host fetch bridge.*nodeRepl\/fetch/
      );
    } finally {
      await client.close();
      if (previousPipePath == null) {
        delete process.env.CODEX_BROWSER_USE_IAB_PIPE_PATH;
      } else {
        process.env.CODEX_BROWSER_USE_IAB_PIPE_PATH = previousPipePath;
      }
    }
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('generated node_repl policy fetch falls back to the IAB native pipe host bridge', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-iab-fetch-'));
  let server = null;
  try {
    const socketPath = path.join(rootDir, 'iab.sock');
    let nativePipeRequest = null;
    server = await startNativePipeHostFetchServer(socketPath, async (message) => {
      nativePipeRequest = message;
      assert.equal(message.method, 'nodeReplFetch');
      assert.equal(message.params.method, 'GET');
      assert.match(message.params.url, /conversation_id=session-1/);
      assert.match(message.params.url, /turn_id=turn-1/);
      return {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json', 'x-policy': 'iab' },
        bodyBase64: Buffer.from('{"feature_status":{"agent":false}}', 'utf8').toString('base64')
      };
    });

    const installedNodeRepl = await installGeneratedNodeReplFixture(rootDir);
    const previousPipePath = process.env.CODEX_BROWSER_USE_IAB_PIPE_PATH;
    process.env.CODEX_BROWSER_USE_IAB_PIPE_PATH = socketPath;
    const client = startJsonLineProcess(installedNodeRepl);
    try {
      client.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'js',
          arguments: {
            code: `
              const response = await globalThis.nodeRepl.fetch("https://chatgpt.com/backend-api/aura/site_status?site_url=https%3A%2F%2Fexample.com%2F&url_request_source=codex_browser_use&conversation_id=session-1&turn_id=turn-1", { method: "GET" });
              console.log(response.status);
              console.log(response.headers.get("x-policy"));
              console.log((await response.json()).feature_status.agent);
            `
          }
        }
      });

      const outbound = await client.read();
      assert.equal(outbound.method, 'nodeRepl/fetch');
      client.send({
        jsonrpc: '2.0',
        id: outbound.id,
        error: { code: -32601, message: 'Method not found' }
      });

      const toolResponse = await client.read();
      assert.equal(toolResponse.result.isError, false);
      assert.equal(toolResponse.result.content[0].text, '200\niab\nfalse');
      assert.ok(nativePipeRequest);
    } finally {
      await client.close();
      if (previousPipePath == null) {
        delete process.env.CODEX_BROWSER_USE_IAB_PIPE_PATH;
      } else {
        process.env.CODEX_BROWSER_USE_IAB_PIPE_PATH = previousPipePath;
      }
    }
  } finally {
    await server?.close();
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('generated node_repl imports the real Browser Use client without VM dynamic import failure', async () => {
  const browserClientPath = '/home/darwin/.codex/plugins/cache/openai-bundled/browser-use/0.1.0-alpha1/scripts/browser-client.mjs';
  if (!(await pathExists(browserClientPath))) {
    return;
  }

  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-browser-client-'));
  try {
    const installedNodeRepl = await installGeneratedNodeReplFixture(rootDir);
    const client = startJsonLineProcess(installedNodeRepl);
    try {
      client.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'js',
          arguments: {
            code: `
              const { setupAtlasRuntime } = await import(${JSON.stringify(pathToFileURL(browserClientPath).href)});
              try {
                await setupAtlasRuntime({ globals: globalThis, backend: "iab" });
                console.log("browser-use setup ok");
              } catch (err) {
                console.log(err?.message ?? String(err));
              }
            `
          }
        }
      });

      let response = null;
      for (let index = 0; index < 5; index += 1) {
        const message = await client.read();
        if (message.id === 1 && message.result) {
          response = message;
          break;
        }
        if (message.method === 'nodeRepl/fetch') {
          client.send({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32601, message: 'Method not found' }
          });
          continue;
        }
        if (message.method === 'elicitation/create') {
          client.send({
            jsonrpc: '2.0',
            id: message.id,
            result: { action: 'accept' }
          });
        }
      }

      assert.ok(response);
      const text = response.result.content[0].text;
      assert.equal(response.result.isError, false);
      assert.doesNotMatch(text, /ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING/);
      assert.doesNotMatch(text, /privileged native pipe bridge is not available/);
      assert.match(text, /Failed to connect to browser-use backend "iab"|browser-use setup ok|authenticated desktop host fetch bridge/);
    } finally {
      await client.close();
    }
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('installBrowserUseRuntime installs executable Linux runtime files', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-install-'));
  try {
    const resourcesDir = path.join(rootDir, 'resources');
    const nodeReplSource = path.join(rootDir, 'linux', 'node_repl');
    const nodeSource = path.join(rootDir, 'linux', 'node');
    await writeTestExecutable(nodeReplSource, '#!/usr/bin/env bash\necho node_repl\n');
    await writeTestExecutable(nodeSource, '#!/usr/bin/env bash\necho node\n');
    await fs.promises.mkdir(resourcesDir, { recursive: true });
    await fs.promises.writeFile(path.join(resourcesDir, 'node_repl'), 'mach-o node_repl', 'utf8');
    await fs.promises.writeFile(path.join(resourcesDir, 'node'), 'mach-o node', 'utf8');

    const result = await installBrowserUseRuntime({
      resourcesDir,
      env: {
        CODEX_BROWSER_USE_NODE_REPL_PATH: nodeReplSource,
        CODEX_BROWSER_USE_NODE_PATH: nodeSource,
        PATH: ''
      }
    });

    const installedNodeRepl = path.join(resourcesDir, 'node_repl');
    const installedNode = path.join(resourcesDir, 'node');
    assert.equal(await isExecutable(installedNodeRepl), true);
    assert.equal(await isExecutable(installedNode), true);
    assert.equal(await fs.promises.readFile(installedNodeRepl, 'utf8'), '#!/usr/bin/env bash\necho node_repl\n');
    assert.match(await fs.promises.readFile(installedNode, 'utf8'), new RegExp(`exec '${escapeRegExp(await fs.promises.realpath(nodeSource))}' "\\$@"`));
    assert.equal(result.browserUseNodeRepl.status, 'installed');
    assert.equal(result.browserUseNode.status, 'installed');
    assert.equal(result.browserUseRuntime.status, 'installed');
    assert.equal(result.browserUseNodeRepl.targetPath, installedNodeRepl);
    assert.equal(result.browserUseNode.targetPath, installedNode);
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('installLinuxChromeExtensionHost installs executable host and Chrome manifest', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-chrome-host-install-'));
  try {
    const resourcesDir = path.join(rootDir, 'resources');
    await fs.promises.mkdir(resourcesDir, { recursive: true });
    await writeTestExecutable(path.join(resourcesDir, 'node'), '#!/usr/bin/env bash\necho node\n');

    const result = await installLinuxChromeExtensionHost({
      resourcesDir,
      homeDir: rootDir,
      extensionId: 'extension-id',
      hostName: 'com.openai.test'
    });

    const hostExecutablePath = path.join(resourcesDir, 'chrome-extension-host');
    const hostModulePath = path.join(resourcesDir, 'chrome-extension-host.mjs');
    const manifestPath = path.join(
      rootDir,
      '.config',
      'google-chrome',
      'NativeMessagingHosts',
      'com.openai.test.json'
    );
    const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));

    assert.equal(await isExecutable(hostExecutablePath), true);
    assert.match(await fs.promises.readFile(hostExecutablePath, 'utf8'), /chrome-extension-host\.mjs/);
    assert.match(await fs.promises.readFile(hostModulePath, 'utf8'), /CODEX_BROWSER_USE_SOCKET_DIR/);
    assert.deepEqual(manifest, {
      name: 'com.openai.test',
      description: 'Codex chrome native messaging host',
      type: 'stdio',
      path: hostExecutablePath,
      allowed_origins: ['chrome-extension://extension-id/']
    });
    assert.equal(result.chromeExtensionHost.targetPath, hostExecutablePath);
    assert.equal(result.chromeNativeMessagingHost.manifestPath, manifestPath);
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('installLinuxChromeBundledPluginHost installs Linux host wrappers for bundled and cached Chrome plugins', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-chrome-plugin-host-'));
  try {
    const resourcesDir = path.join(rootDir, 'resources');
    const homeDir = path.join(rootDir, 'home');
    const hostExecutablePath = path.join(resourcesDir, 'chrome-extension-host');
    const resourcePluginRoot = path.join(
      resourcesDir,
      'plugins',
      'openai-bundled',
      'plugins',
      'chrome'
    );
    const cachePluginRoot = path.join(
      homeDir,
      '.codex',
      'plugins',
      'cache',
      'openai-bundled',
      'chrome',
      '0.1.7'
    );
    await writeTestExecutable(hostExecutablePath, '#!/usr/bin/env bash\necho host\n');
    await fs.promises.mkdir(path.join(resourcePluginRoot, '.codex-plugin'), { recursive: true });
    await fs.promises.mkdir(path.join(cachePluginRoot, '.codex-plugin'), { recursive: true });
    await fs.promises.writeFile(
      path.join(resourcePluginRoot, '.codex-plugin', 'plugin.json'),
      '{}',
      'utf8'
    );
    await fs.promises.writeFile(
      path.join(cachePluginRoot, '.codex-plugin', 'plugin.json'),
      '{}',
      'utf8'
    );
    await fs.promises.symlink(cachePluginRoot, path.join(path.dirname(cachePluginRoot), 'latest'));

    const result = await installLinuxChromeBundledPluginHost({
      resourcesDir,
      homeDir,
      hostExecutablePath
    });

    const expectedTargets = [
      path.join(resourcePluginRoot, 'extension-host', 'linux', os.arch(), 'extension-host'),
      path.join(cachePluginRoot, 'extension-host', 'linux', os.arch(), 'extension-host'),
      path.join(
        homeDir,
        '.codex',
        'plugins',
        'cache',
        'openai-bundled',
        'chrome',
        'latest',
        'extension-host',
        'linux',
        os.arch(),
        'extension-host'
      )
    ];
    assert.equal(result.status, 'installed');
    assert.deepEqual(result.targetPaths.sort(), expectedTargets.sort());
    for (const targetPath of expectedTargets) {
      assert.equal(await isExecutable(targetPath), true);
      assert.match(await fs.promises.readFile(targetPath, 'utf8'), new RegExp(escapeRegExp(hostExecutablePath)));
    }
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('buildLinuxChromeExtensionHostModule includes ping handler and native pipe bridge', () => {
  const source = buildLinuxChromeExtensionHostModule();

  assert.match(source, /method === 'ping'/);
  assert.match(source, /'\/tmp\/codex-browser-use'/);
  assert.match(source, /'chrome-extension-' \+ crypto\.randomUUID\(\) \+ '\.sock'/);
  assert.match(source, /pendingRequests\.set/);
  assert.match(source, /process\.stdout\.write\(encode\(message\)\)/);
});

test('installBrowserUseRuntime rejects macOS Browser Use binaries', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-browser-runtime-macho-'));
  try {
    const resourcesDir = path.join(rootDir, 'resources');
    const nodeReplSource = path.join(rootDir, 'mac', 'node_repl');
    const nodeSource = path.join(rootDir, 'linux', 'node');
    await fs.promises.mkdir(path.dirname(nodeReplSource), { recursive: true });
    await fs.promises.writeFile(nodeReplSource, Buffer.from([0xcf, 0xfa, 0xed, 0xfe]));
    await fs.promises.chmod(nodeReplSource, 0o755);
    await writeTestExecutable(nodeSource, '#!/usr/bin/env bash\necho node\n');
    await fs.promises.mkdir(resourcesDir, { recursive: true });

    await assert.rejects(
      () =>
        installBrowserUseRuntime({
          resourcesDir,
          env: {
            CODEX_BROWSER_USE_NODE_REPL_PATH: nodeReplSource,
            CODEX_BROWSER_USE_NODE_PATH: nodeSource,
            PATH: ''
          }
        }),
      {
        message: /Browser Use node_repl source must be a Linux executable or script.*mach-o/
      }
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

for (const [label, fixture] of [
  ['legacy', OPEN_TARGETS_BLOCK_LEGACY],
  ['current', OPEN_TARGETS_BLOCK_CURRENT],
  ['26.422', OPEN_TARGETS_BLOCK_26_422]
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

test('injectLinuxCloseCancelPatch restores the window when quit confirmation is canceled on Linux', () => {
  const updated = injectLinuxCloseCancelPatch(LINUX_CLOSE_CANCEL_BUNDLE_CURRENT);

  assert.match(updated, /codexLinuxCloseCancel/);
  assert.match(
    updated,
    /process\.platform===`linux`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_CLOSE_CANCEL_PATCH!==`1`/
  );
  assert.match(updated, /let e=i\.showLastActivePrimaryWindow\(\);e\?a\.refresh\(\):/);
  assert.match(updated, /Promise\.resolve\(o\(`local`\)\)\.then/);
  assert.match(updated, /e\.isMinimized\(\)&&e\.restore\(\),e\.show\(\),e\.focus\(\)/);
  assert.match(updated, /s\.preventDefault\(\)/);
  assert.match(updated, /r\.markQuitApproved\(\),m=!0,i\.markAppQuitting\(\)/);
});

test('injectLinuxCloseCancelPatch supports the 26.422 before-quit prompt details', () => {
  const updated = injectLinuxCloseCancelPatch(LINUX_CLOSE_CANCEL_BUNDLE_26_422);

  assert.match(updated, /codexLinuxCloseCancel/);
  assert.match(updated, /detail:Mb\(\{hasInProgressLocalConversation:s,hasEnabledAutomations:c\}\)/);
  assert.match(updated, /let e=a\.showLastActivePrimaryWindow\(\);e\?o\.refresh\(\):/);
  assert.match(updated, /Promise\.resolve\(s\(`local`\)\)\.then/);
  assert.match(updated, /e\.isMinimized\(\)&&e\.restore\(\),e\.show\(\),e\.focus\(\)/);
  assert.match(updated, /o\.preventDefault\(\)/);
  assert.match(updated, /i\.markQuitApproved\(\),g=!0,a\.markAppQuitting\(\)/);
});

test('injectLinuxCloseCancelPatch supports the 26.422 stable before-quit prompt details', () => {
  const updated = injectLinuxCloseCancelPatch(LINUX_CLOSE_CANCEL_BUNDLE_26_422_STABLE);

  assert.match(updated, /codexLinuxCloseCancel/);
  assert.match(updated, /process\.platform===`linux`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_CLOSE_CANCEL_PATCH!==`1`/);
  assert.match(updated, /detail:Nb\(\{hasInProgressLocalConversation:s,hasEnabledAutomations:c\}\)/);
  assert.match(updated, /let e=a\.showLastActivePrimaryWindow\(\);e\?o\.refresh\(\):/);
  assert.match(updated, /Promise\.resolve\(s\(`local`\)\)\.then/);
  assert.match(updated, /e\.isMinimized\(\)&&e\.restore\(\),e\.show\(\),e\.focus\(\)/);
  assert.match(updated, /o\.preventDefault\(\)/);
  assert.match(updated, /i\.markQuitApproved\(\),g=!0,a\.markAppQuitting\(\)/);
});

test('injectLinuxCloseCancelPatch supports the 26.429 before-quit prompt details', () => {
  const updated = injectLinuxCloseCancelPatch(LINUX_CLOSE_CANCEL_BUNDLE_26_429);

  assert.match(updated, /codexLinuxCloseCancel/);
  assert.match(updated, /detail:ED\(\{hasInProgressLocalConversation:s,hasEnabledAutomations:c\}\)/);
  assert.match(updated, /let e=a\.showLastActivePrimaryWindow\(\);e\?\(e\.isMinimized\(\)&&e\.restore\(\),e\.show\(\),e\.focus\(\)\):/);
  assert.match(updated, /Promise\.resolve\(s\(`local`\)\)\.then/);
  assert.match(updated, /e&&!e\.isDestroyed\(\)&&\(e\.isMinimized\(\)&&e\.restore\(\),e\.show\(\),e\.focus\(\)\)/);
  assert.match(updated, /o\.preventDefault\(\)/);
  assert.match(updated, /i\.markQuitApproved\(\),g=!0,a\.markAppQuitting\(\)/);
  assert.match(updated, /child-process-gone/);
});

test('injectLinuxCloseCancelPatch supports the 26.429.30905 before-quit prompt details', () => {
  const updated = injectLinuxCloseCancelPatch(LINUX_CLOSE_CANCEL_BUNDLE_26_429_30905);

  assert.match(updated, /codexLinuxCloseCancel/);
  assert.match(updated, /detail:OD\(\{hasInProgressLocalConversation:s,hasEnabledAutomations:c\}\)/);
  assert.match(updated, /let e=a\.showLastActivePrimaryWindow\(\);e\?\(e\.isMinimized\(\)&&e\.restore\(\),e\.show\(\),e\.focus\(\)\):/);
  assert.match(updated, /Promise\.resolve\(s\(`local`\)\)\.then/);
  assert.match(updated, /e&&!e\.isDestroyed\(\)&&\(e\.isMinimized\(\)&&e\.restore\(\),e\.show\(\),e\.focus\(\)\)/);
  assert.match(updated, /o\.preventDefault\(\)/);
  assert.match(updated, /i\.markQuitApproved\(\),g=!0,a\.markAppQuitting\(\)/);
  assert.match(updated, /kD\(t\)/);
});

test('injectLinuxCloseCancelPatch supports the 26.513 ensureLocalWindow prompt details', () => {
  const updated = injectLinuxCloseCancelPatch(LINUX_CLOSE_CANCEL_BUNDLE_26_513);

  assert.match(updated, /codexLinuxCloseCancel/);
  assert.match(updated, /detail:AH\(\{hasInProgressLocalConversation:s,hasEnabledAutomations:c\}\)/);
  assert.match(updated, /let e=a\.showLastActivePrimaryWindow\(\);e\?\(e\.isMinimized\(\)&&e\.restore\(\),e\.show\(\),e\.focus\(\)\):/);
  assert.match(updated, /Promise\.resolve\(s\(\)\)\.then/);
  assert.match(updated, /e&&!e\.isDestroyed\(\)&&\(e\.isMinimized\(\)&&e\.restore\(\),e\.show\(\),e\.focus\(\)\)/);
  assert.match(updated, /o\.preventDefault\(\)/);
  assert.match(updated, /i\.markQuitApproved\(\),g=!0,a\.markAppQuitting\(\)/);
  assert.match(updated, /jH\(t\)/);
  assert.match(updated, /browser-window-focus/);
  assert.match(updated, /will-quit/);
});

test('injectLinuxCloseCancelPatch is idempotent', () => {
  const once = injectLinuxCloseCancelPatch(LINUX_CLOSE_CANCEL_BUNDLE_CURRENT);
  const twice = injectLinuxCloseCancelPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxCloseCancelPatch skips patching when disabled', () => {
  const result = applyLinuxCloseCancelPatch(LINUX_CLOSE_CANCEL_BUNDLE_CURRENT, { skip: true });

  assert.equal(result.updated, LINUX_CLOSE_CANCEL_BUNDLE_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxCloseCancelPatch reports diagnostics when close-cancel anchors are missing', () => {
  assert.throws(() => injectLinuxCloseCancelPatch('const noop = true;', { sourceName: 'main.js' }), {
    message:
      /Could not patch Linux close-cancel behavior in the Electron main bundle\. Source: main\.js\. Missing anchors: before-quit handler, Quit\/Cancel confirmation dialog, cancel preventDefault branch, showLastActivePrimaryWindow hook, ensure window dependency\. Detected anchors: beforeQuitHandler=no, quitCancelPrompt=no, cancelPreventDefault=no, showLastActivePrimaryWindow=no, ensureWindowDependency=no\./
  });
});

test('injectLinuxNotificationSoundPatch plays the shipped sound after a shown Linux notification', () => {
  const updated = injectLinuxNotificationSoundPatch(LINUX_NOTIFICATION_SOUND_BUNDLE_CURRENT);

  assert.match(updated, /sound:this\.options\.platform===`darwin`\?Fi:void 0/);
  assert.match(updated, /o\.show\(\),this\.codexLinuxPlayNotificationSoundIfNeeded\(\)/);
  assert.match(updated, /codexLinuxPlayNotificationSoundIfNeeded\(\)/);
  assert.match(updated, /this\.options\.platform!==`linux`/);
  assert.match(updated, /process\.resourcesPath/);
  assert.match(updated, /i\.default\.join\(process\.resourcesPath,Ii\)/);
  assert.match(updated, /paplay/);
  assert.match(updated, /pw-play/);
  assert.match(updated, /aplay/);
  assert.match(updated, /ffplay/);
  assert.match(updated, /c\.spawnSync\(`sh`,\[`-c`,`command -v \$\{e\}`\]/);
  assert.match(updated, /c\.spawn\(n,t,\{detached:!0,stdio:`ignore`\}\)/);
  assert.match(updated, /failed to play Linux notification sound/);
  assert.match(updated, /codexLinuxNotificationSound/);
});

test('injectLinuxNotificationSoundPatch is idempotent', () => {
  const once = injectLinuxNotificationSoundPatch(LINUX_NOTIFICATION_SOUND_BUNDLE_CURRENT);
  const twice = injectLinuxNotificationSoundPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxNotificationSoundPatch skips patching when disabled', () => {
  const result = applyLinuxNotificationSoundPatch(LINUX_NOTIFICATION_SOUND_BUNDLE_CURRENT, {
    skip: true
  });

  assert.equal(result.updated, LINUX_NOTIFICATION_SOUND_BUNDLE_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxNotificationSoundPatch reports diagnostics when notification anchors are missing', () => {
  assert.throws(
    () => injectLinuxNotificationSoundPatch('const noop = true;', { sourceName: 'main.js' }),
    {
      message:
        /Could not patch Linux notification sound playback in the Electron main bundle\. Source: main\.js\. Missing anchors: desktop-notifications logger, macOS sound option, notification show call, resource notification sound path, child_process import\. Detected anchors: notificationManager=no, macosSoundOption=no, notificationShowCall=no, resourceSoundPath=no, childProcessImport=no\./
    }
  );
});

test('injectLinuxBrowserUseHostFetchPatch exposes authenticated policy fetch on the IAB pipe', () => {
  const updated = injectLinuxBrowserUseHostFetchPatch(BROWSER_USE_HOST_FETCH_BUNDLE_CURRENT);

  assert.match(updated, /codexLinuxBrowserUseHostFetch/);
  assert.match(updated, /async nodeReplFetch\(e\)/);
  assert.match(updated, /async nodeReplCreateElicitation\(e\)/);
  assert.match(updated, /this\.requireBrowserUseSession\(t\)/);
  assert.match(updated, /codexLinuxBrowserUseCreateElicitation\(e\?\.elicitation\)/);
  assert.match(updated, /hostFetch:e=>codexLinuxBrowserUseHostFetch\(e,this\.options\.appServerConnection\)/);
  assert.match(
    updated,
    /appServerConnection:\(\)=>this\.getAppServerConnection\(this\.hostId\)/
  );
  assert.match(updated, /desktopOriginator:Gi/);
  assert.match(updated, /n\.net\.fetch\(r\.toString\(\),\{method:i,headers:s\}\)/);
  assert.match(updated, /c\.status===401/);
  assert.match(updated, /url_request_source/);
  assert.match(updated, /codex_browser_use/);
  assert.match(updated, /n\.dialog\.showMessageBox\(\{type:`question`/);
  assert.match(updated, /action:a\.response===0\?`accept`:`decline`/);
  assert.match(updated, /Allow Browser Use to access all websites without asking/);
  assert.match(updated, /Reset Browser Use site permissions/);
  assert.match(updated, /codexLinuxBrowserUseShouldAutoAcceptAllOrigins/);
});

test('injectLinuxBrowserUseHostFetchPatch supports renamed browser session registry symbols', () => {
  const renamedRegistryBundle = BROWSER_USE_HOST_FETCH_BUNDLE_CURRENT.replace(
    'var GC=class',
    'var qC=class'
  ).replace('this.browserSessionRegistry=new GC', 'this.browserSessionRegistry=new qC');
  const updated = injectLinuxBrowserUseHostFetchPatch(renamedRegistryBundle);

  assert.match(updated, /codexLinuxBrowserUseHostFetch/);
  assert.match(
    updated,
    /this\.browserSessionRegistry=new qC\(\{appSessionId:e\.t,buildFlavor:T,errorReporter:this\.errorReporter,appServerConnection:\(\)=>this\.getAppServerConnection\(this\.hostId\)\}\)/
  );
});

test('injectLinuxBrowserUseHostFetchPatch supports 26.506 auth and registry drift', () => {
  const updated = injectLinuxBrowserUseHostFetchPatch(BROWSER_USE_HOST_FETCH_BUNDLE_26_506);

  assert.match(updated, /codexLinuxBrowserUseHostFetch/);
  assert.match(updated, /await ju\(\{action:`load Browser Use policy status`/);
  assert.match(updated, /desktopOriginator:Co/);
  assert.match(
    updated,
    /this\.browserSessionRegistry=new GC\(\{appSessionId:e\.t,buildFlavor:w,errorReporter:this\.errorReporter,appServerConnection:\(\)=>this\.getAppServerConnection\(this\.hostId\)\}\)/
  );
});

test('injectLinuxBrowserUseHostFetchPatch supports 26.527 native pipe registry drift', () => {
  const updated = injectLinuxBrowserUseHostFetchPatch(BROWSER_USE_HOST_FETCH_BUNDLE_26_527);

  assert.match(updated, /codexLinuxBrowserUseHostFetch/);
  assert.match(updated, /async nodeReplFetch\(e\)/);
  assert.doesNotThrow(() => new Function(updated));
  assert.doesNotMatch(updated, /,function codexLinuxBrowserUseHostFetchSession/);
  assert.match(updated, /codexLinuxBrowserUseHostFetchSession[\s\S]*var Co=`Codex Desktop`/);
  assert.match(updated, /hostFetch:e=>codexLinuxBrowserUseHostFetch\(e,this\.options\.appServerConnection\)/);
  assert.match(
    updated,
    /this\.browserSessionRegistry=new nU\(\{appSessionId:r\.t,buildFlavor:w,errorReporter:this\.errorReporter,appServerConnection:\(\)=>this\.getAppServerConnection\(this\.hostId\)\}\)/
  );
  assert.match(updated, /var codexLinuxBrowserUseElectron=i/);
  assert.match(updated, /codexLinuxBrowserUseElectron\.net\.fetch\(r\.toString\(\),\{method:i,headers:s\}\)/);
  assert.match(updated, /codexLinuxBrowserUseElectron\.dialog\.showMessageBox\(\{type:`question`/);
  assert.match(updated, /desktopOriginator:Co/);
});

test('injectLinuxBrowserUseHostFetchPatch supports 26.608 app session symbol drift', () => {
  const updated = injectLinuxBrowserUseHostFetchPatch(BROWSER_USE_HOST_FETCH_BUNDLE_26_608);

  assert.match(updated, /codexLinuxBrowserUseHostFetch/);
  assert.match(updated, /async nodeReplFetch\(e\)/);
  assert.match(
    updated,
    /this\.browserSessionRegistry=new nU\(\{appSessionId:n\.N,buildFlavor:C,errorReporter:this\.errorReporter,appServerConnection:\(\)=>this\.getAppServerConnection\(this\.hostId\)\}\)/
  );
});

test('injectLinuxBrowserUseHostFetchPatch is idempotent', () => {
  const once = injectLinuxBrowserUseHostFetchPatch(BROWSER_USE_HOST_FETCH_BUNDLE_CURRENT);
  const twice = injectLinuxBrowserUseHostFetchPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxBrowserUseHostFetchPatch skips patching when disabled', () => {
  const result = applyLinuxBrowserUseHostFetchPatch(BROWSER_USE_HOST_FETCH_BUNDLE_CURRENT, {
    skip: true
  });

  assert.equal(result.updated, BROWSER_USE_HOST_FETCH_BUNDLE_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxBrowserUseHostFetchPatch reports diagnostics when host fetch anchors are missing', () => {
  assert.throws(
    () => injectLinuxBrowserUseHostFetchPatch('const noop = true;', { sourceName: 'main.js' }),
    {
      message:
        /Could not patch Linux Browser Use authenticated host fetch into the Electron main bundle\. Source: main\.js\. Missing anchors: authenticated API header helper, desktop originator value, Browser Use native pipe registry, IAB API class, IAB route backend options, Browser session registry instantiation\. Detected anchors: authHeaderHelper=no, desktopOriginator=no, nativePipeRegistry=no, iabApiClass=no, iabRegistryOptions=no, registryInstantiation=no\./
    }
  );
});

test('injectLinuxChromeExtensionSettingsPatch supports Linux Chrome profile detection and install flow', () => {
  const updated = injectLinuxChromeExtensionSettingsPatch(CHROME_EXTENSION_SETTINGS_BUNDLE_26_519);

  assert.match(updated, /codexLinuxChromeExtensionSettings/);
  assert.match(updated, /n===`linux`\?\(0,i\.join\)\(typeof process\.env\.XDG_CONFIG_HOME===`string`/);
  assert.match(updated, /\(0,i\.join\)\(e,`\.config`\),`google-chrome`\):null/);
  assert.match(updated, /if\(t===`linux`\)\{let codexLinuxChromeUrl=aa\(e\)/);
  assert.match(updated, /google-chrome-stable/);
  assert.match(updated, /chromium/);
  assert.match(updated, /codexLinuxDetectChromeCommand/);
});

test('injectLinuxChromeExtensionSettingsPatch is idempotent', () => {
  const once = injectLinuxChromeExtensionSettingsPatch(CHROME_EXTENSION_SETTINGS_BUNDLE_26_519);
  const twice = injectLinuxChromeExtensionSettingsPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxChromeExtensionSettingsPatch skips patching when disabled', () => {
  const result = applyLinuxChromeExtensionSettingsPatch(CHROME_EXTENSION_SETTINGS_BUNDLE_26_519, {
    skip: true
  });

  assert.equal(result.updated, CHROME_EXTENSION_SETTINGS_BUNDLE_26_519);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxChromeExtensionSettingsPatch reports diagnostics when anchors are missing', () => {
  assert.throws(
    () => injectLinuxChromeExtensionSettingsPatch('const noop = true;', { sourceName: 'main.js' }),
    {
      message:
        /Could not patch Linux Chrome extension settings detection into the Electron main bundle\. Source: main\.js\. Missing anchors: Chrome extension URL helper, Chrome profile directory helper, Chrome extension open helper\. Detected anchors: chromeExtensionUrl=no, profileDirHelper=no, openSettingsHelper=no\./
    }
  );
});

test('injectLinuxRemoteControlPatch enables remote control on Linux feature availability', () => {
  const updated = injectLinuxRemoteControlPatch(REMOTE_CONTROL_FEATURE_AVAILABILITY_BUNDLE_26_513);

  assert.match(updated, /codexLinuxRemoteControlFeatureAvailability/);
  assert.match(updated, /codexLinuxRemoteControlFeatures=n===`linux`&&t\.CODEX_DESKTOP_DISABLE_LINUX_REMOTE_CONTROL_PATCH!==`1`\?\{\.\.\.e,control:!0\}:e/);
  assert.match(
    updated,
    /return n!==`win32`\|\|t\.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE!==`1`\?codexLinuxRemoteControlFeatures:\{\.\.\.codexLinuxRemoteControlFeatures,computerUse:!0,computerUseNodeRepl:!0\}/
  );
});

test('injectLinuxRemoteControlPatch supports 26.513 feature override helper drift', () => {
  const updated = injectLinuxRemoteControlPatch(
    REMOTE_CONTROL_FEATURE_AVAILABILITY_BUNDLE_26_513_20950
  );

  assert.match(updated, /codexLinuxRemoteControlFeatureAvailability/);
  assert.match(updated, /codexLinuxRemoteControlFeatures=i===`linux`&&r\.CODEX_DESKTOP_DISABLE_LINUX_REMOTE_CONTROL_PATCH!==`1`\?\{\.\.\.e,control:!0\}:e/);
  assert.match(
    updated,
    /a=i===`win32`&&r\.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE===`1`\?\{\.\.\.codexLinuxRemoteControlFeatures,computerUse:!0,computerUseNodeRepl:!0\}:codexLinuxRemoteControlFeatures/
  );
  assert.match(updated, /o=n===t\.D\.Dev\?be\(r\):null/);
  assert.match(updated, /return o==null\?a:\{\.\.\.a,\.\.\.o\}/);
});

test('injectLinuxRemoteControlPatch supports 26.601 device attestation helper drift', () => {
  const updated = injectLinuxRemoteControlPatch(
    REMOTE_CONTROL_FEATURE_AVAILABILITY_BUNDLE_26_601
  );

  assert.match(updated, /codexLinuxRemoteControlFeatureAvailability/);
  assert.match(updated, /codexLinuxRemoteControlFeatures=i===`linux`&&r\.CODEX_DESKTOP_DISABLE_LINUX_REMOTE_CONTROL_PATCH!==`1`\?\{\.\.\.e,control:!0\}:e/);
  assert.match(
    updated,
    /return o==null\?\{\.\.\.a,deviceAttestation:xe\(\{platform:i\}\)\}:\{\.\.\.a,\.\.\.o,deviceAttestation:xe\(\{platform:i\}\)\}/
  );
});

test('injectLinuxRemoteControlPatch supports 26.608 Mac node_repl guard drift', () => {
  const updated = injectLinuxRemoteControlPatch(
    REMOTE_CONTROL_FEATURE_AVAILABILITY_BUNDLE_26_608
  );

  assert.match(updated, /codexLinuxRemoteControlFeatureAvailability/);
  assert.match(updated, /codexLinuxRemoteControlFeatures=i===`linux`&&r\.CODEX_DESKTOP_DISABLE_LINUX_REMOTE_CONTROL_PATCH!==`1`\?\{\.\.\.e,control:!0\}:e/);
  assert.match(
    updated,
    /a=i===`darwin`&&!n\.P\.isInternal\(t\)&&codexLinuxRemoteControlFeatures\.computerUseNodeRepl!=null\?\{\.\.\.codexLinuxRemoteControlFeatures,computerUseNodeRepl:!1\}:codexLinuxRemoteControlFeatures/
  );
  assert.match(
    updated,
    /o=i===`win32`&&codexLinuxRemoteControlFeatures\.computerUse===!0\?\{\.\.\.a,computerUseNodeRepl:!0\}:a/
  );
  assert.match(
    updated,
    /return c==null\?\{\.\.\.s,deviceAttestation:ve\(\{platform:i\}\)\}:\{\.\.\.s,\.\.\.c,deviceAttestation:ve\(\{platform:i\}\)\}/
  );
});

test('injectLinuxRemoteControlPatch is idempotent', () => {
  const once = injectLinuxRemoteControlPatch(REMOTE_CONTROL_FEATURE_AVAILABILITY_BUNDLE_26_513);
  const twice = injectLinuxRemoteControlPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxRemoteControlPatch skips patching when disabled', () => {
  const result = applyLinuxRemoteControlPatch(REMOTE_CONTROL_FEATURE_AVAILABILITY_BUNDLE_26_513, {
    skip: true
  });

  assert.equal(result.updated, REMOTE_CONTROL_FEATURE_AVAILABILITY_BUNDLE_26_513);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxRemoteControlPatch reports diagnostics when feature anchors are missing', () => {
  assert.throws(
    () => injectLinuxRemoteControlPatch('const noop = true;', { sourceName: 'main.js' }),
    {
      message:
        /Could not patch Linux remote-control feature availability into the Electron main bundle\. Source: main\.js\. Missing anchors: desktop feature availability control flag, desktop feature availability helper, Windows computer-use availability branch\. Detected anchors: featureAvailabilityDefaults=no, windowsComputerUseHelper=no, availabilityPatchFunction=no\./
    }
  );
});

test('injectLinuxRemoteControlVisibilityPatch shows remote control settings on Linux', () => {
  const updated = injectLinuxRemoteControlVisibilityPatch(REMOTE_CONTROL_VISIBILITY_BUNDLE_26_513);

  assert.match(updated, /codexLinuxRemoteControlSettingsVisibility/);
  assert.match(updated, /document\?\.documentElement\?\.dataset\?\.codexOs===`linux`/);
  assert.match(
    updated,
    /CODEX_DESKTOP_DISABLE_LINUX_REMOTE_CONTROL_VISIBILITY_PATCH!==`1`/
  );
  assert.match(
    updated,
    /return codexLinuxRemoteControlSettingsVisible\(\)\|\|t&&\(e\?\.available\?\?!0\)&&e\?\.accessRequired!==!0/
  );
});

test('injectLinuxRemoteControlVisibilityPatch is idempotent', () => {
  const once = injectLinuxRemoteControlVisibilityPatch(REMOTE_CONTROL_VISIBILITY_BUNDLE_26_513);
  const twice = injectLinuxRemoteControlVisibilityPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxRemoteControlVisibilityPatch skips patching when disabled', () => {
  const result = applyLinuxRemoteControlVisibilityPatch(REMOTE_CONTROL_VISIBILITY_BUNDLE_26_513, {
    skip: true
  });

  assert.equal(result.updated, REMOTE_CONTROL_VISIBILITY_BUNDLE_26_513);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxRemoteControlVisibilityPatch reports diagnostics when visibility anchors are missing', () => {
  assert.throws(
    () => injectLinuxRemoteControlVisibilityPatch('const noop = true;', { sourceName: 'remote.js' }),
    {
      message:
        /Could not patch Linux remote-control settings visibility into the renderer bundle\. Source: remote\.js\. Missing anchors: remote-control connections state atom, slingshot visibility gate, remote-control visibility helper, remote-control access-required gate\. Detected anchors: remoteControlStateAtom=no, slingshotVisibilityGate=no, remoteControlVisibilityHelper=no, accessRequiredGate=no\./
    }
  );
});

test('injectLinuxPowerSaveBlockerPatch adds systemd sleep blocker on Linux', () => {
  const updated = injectLinuxPowerSaveBlockerPatch(POWER_SAVE_BLOCKER_BUNDLE_26_513);

  assert.match(updated, /codexLinuxSystemSleepInhibitor/);
  assert.match(updated, /systemd-inhibit/);
  assert.match(updated, /--what=sleep:idle/);
  assert.match(updated, /--mode=block/);
  assert.match(updated, /Codex remote access keep awake/);
  assert.match(updated, /this\.codexLinuxSyncSystemSleepInhibitor\(e\)/);
  assert.match(updated, /powerSaveBlocker\.start\(`prevent-app-suspension`\)/);
});

test('injectLinuxPowerSaveBlockerPatch is idempotent', () => {
  const once = injectLinuxPowerSaveBlockerPatch(POWER_SAVE_BLOCKER_BUNDLE_26_513);
  const twice = injectLinuxPowerSaveBlockerPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxPowerSaveBlockerPatch skips patching when disabled', () => {
  const result = applyLinuxPowerSaveBlockerPatch(POWER_SAVE_BLOCKER_BUNDLE_26_513, {
    skip: true
  });

  assert.equal(result.updated, POWER_SAVE_BLOCKER_BUNDLE_26_513);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxPowerSaveBlockerPatch reports diagnostics when anchors are missing', () => {
  assert.throws(
    () => injectLinuxPowerSaveBlockerPatch('const noop = true;', { sourceName: 'main.js' }),
    {
      message:
        /Could not patch Linux system sleep inhibition into the Electron main bundle\. Source: main\.js\. Missing anchors: power-save blocker state, remote-control power-save state, battery monitor check, Electron prevent-app-suspension blocker, power-save sync method\. Detected anchors: powerSaveBlockerState=no, remoteControlPowerSaveState=no, batteryMonitor=no, preventAppSuspension=no, syncMethod=no\./
    }
  );
});

test('injectLinuxRemoteControlKeepAwakePatch uses the visible remote keep-awake toggle value', () => {
  const updated = injectLinuxRemoteControlKeepAwakePatch(REMOTE_CONTROL_KEEP_AWAKE_BUNDLE_26_513);

  assert.match(updated, /codexLinuxRemoteControlKeepAwakeSetting/);
  assert.match(updated, /keepRemoteControlAwakeWhilePluggedIn:!!\(r\|\|n\)&&a/);
  assert.match(updated, /PREVENT_SLEEP_WHILE_RUNNING/);
  assert.match(updated, /KEEP_REMOTE_CONTROL_AWAKE_WHILE_PLUGGED_IN/);
});

test('applyLinuxRemoteControlKeepAwakePatch accepts the 26.519 current dispatch shape', () => {
  const result = applyLinuxRemoteControlKeepAwakePatch(REMOTE_CONTROL_KEEP_AWAKE_BUNDLE_26_519);

  assert.equal(result.updated, REMOTE_CONTROL_KEEP_AWAKE_BUNDLE_26_519);
  assert.equal(result.status, 'already-applied');
  assert.match(result.updated, /preventSleepWhileRunning/);
  assert.match(result.updated, /keepRemoteControlAwakeWhilePluggedIn/);
  assert.doesNotMatch(result.updated, /codexLinuxRemoteControlKeepAwakeSetting/);
});

test('injectLinuxRemoteControlKeepAwakePatch is idempotent', () => {
  const once = injectLinuxRemoteControlKeepAwakePatch(REMOTE_CONTROL_KEEP_AWAKE_BUNDLE_26_513);
  const twice = injectLinuxRemoteControlKeepAwakePatch(once);

  assert.equal(twice, once);
});

test('applyLinuxRemoteControlKeepAwakePatch skips patching when disabled', () => {
  const result = applyLinuxRemoteControlKeepAwakePatch(REMOTE_CONTROL_KEEP_AWAKE_BUNDLE_26_513, {
    skip: true
  });

  assert.equal(result.updated, REMOTE_CONTROL_KEEP_AWAKE_BUNDLE_26_513);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxRemoteControlKeepAwakePatch reports diagnostics when anchors are missing', () => {
  assert.throws(
    () => injectLinuxRemoteControlKeepAwakePatch('const noop = true;', { sourceName: 'app.js' }),
    {
      message:
        /Could not patch Linux remote-control keep-awake setting dispatch into the renderer bundle\. Source: app\.js\. Missing anchors: power-save dispatch, prevent-sleep setting read, remote keep-awake setting read, remote-control enabled state, remote keep-awake dispatch field\. Detected anchors: powerSaveDispatch=no, preventSleepSetting=no, remoteKeepAwakeSetting=no, remoteControlEnabled=no, keepAwakeDispatch=no\./
    }
  );
});

test('injectLinuxAvatarOverlayPatch patches the 26.429.30905 avatar overlay main bundle', () => {
  const updated = injectLinuxAvatarOverlayPatch(AVATAR_OVERLAY_BUNDLE_26_429_30905);

  assert.match(updated, /codexLinuxAvatarOverlay/);
  assert.match(updated, /codexLinuxAvatarOverlayScreenPointDrag/);
  assert.match(updated, /codexLinuxAvatarOverlayAutoClose/);
  assert.match(updated, /codexLinuxAvatarOverlayVisibilityRecovery/);
  assert.match(updated, /codexLinuxRegisterAvatarOverlayAutoClose\([A-Za-z_$][\w$]*\)/);
  assert.match(updated, /browser-window-created/);
  assert.match(updated, /before-quit/);
  assert.doesNotMatch(updated, /browser-window-closed/);
  assert.match(updated, /CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH/);
  assert.match(
    updated,
    /codexLinuxKeepAvatarOverlayFrontmost\(e,t=!1\)\{\/\* codexLinuxAvatarOverlay \*\/if\(e\.isDestroyed\(\)\)return;if\(process\.platform===`darwin`\)/
  );
  assert.match(
    updated,
    /e\.setAlwaysOnTop\(!0,process\.platform===`linux`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH!==`1`\?`screen-saver`:`floating`\),t&&e\.moveTop\(\)/
  );
  assert.doesNotMatch(updated, /type:`dock`|focusable:!0/);
  assert.match(
    updated,
    /showWindow\([A-Za-z_$][\w$]*\)\{[\s\S]*?showInactive\(\),this\.codexLinuxRecoverAvatarOverlayVisibility\([A-Za-z_$][\w$]*\),this\.codexLinuxKeepAvatarOverlayFrontmost\([A-Za-z_$][\w$]*,!0\)/
  );
  assert.match(
    updated,
    /async open\([A-Za-z_$][\w$]*\)\{[\s\S]*?this\.rendererReady\?\(this\.showWindow\([A-Za-z_$][\w$]*\),this\.applyPointerInteractivityPolicy\(\)\):this\.codexLinuxScheduleAvatarOverlayVisibilityRecovery\([A-Za-z_$][\w$]*\)\}/
  );
  assert.match(
    updated,
    /codexLinuxRecoverAvatarOverlayVisibility\([A-Za-z_$][\w$]*\)\{\/\* codexLinuxAvatarOverlayVisibilityRecovery \*\/[\s\S]*?setTimeout\([A-Za-z_$][\w$]*,50\),setTimeout\([A-Za-z_$][\w$]*,250\)/
  );
  assert.match(
    updated,
    /codexLinuxScheduleAvatarOverlayVisibilityRecovery\([A-Za-z_$][\w$]*\)\{[\s\S]*?this\.windowManager\.isWebContentsReady\([A-Za-z_$][\w$]*\.webContents\.id\)[\s\S]*?this\.showWindow\([A-Za-z_$][\w$]*\)/
  );
  assert.match(
    updated,
    /setWindowBounds\([A-Za-z_$][\w$]*,[A-Za-z_$][\w$]*\)\{[\s\S]*?setPosition\([A-Za-z_$][\w$]*\.x,[A-Za-z_$][\w$]*\.y,!1\)[\s\S]*?this\.codexLinuxKeepAvatarOverlayFrontmost\([A-Za-z_$][\w$]*\)/
  );
  assert.match(
    updated,
    /process\.platform===`linux`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH!==`1`\)\{this\.mousePassthroughEnabled=!1,[A-Za-z_$][\w$]*\.setIgnoreMouseEvents\(!1\),this\.refreshCursorAtCurrentMousePosition\([A-Za-z_$][\w$]*\);return\}let [A-Za-z_$][\w$]*=!this\.pointerInteractive/
  );
  assert.match(updated, /avatarOverlayManager\.moveDrag\([A-Za-z_$][\w$]*\.id,[A-Za-z_$][\w$]*\)/);
  assert.match(updated, /codexLinuxAvatarOverlayScreenPoint\(e\)\{return e!=null&&Number\.isFinite\(e\.cursorScreenX\)&&Number\.isFinite\(e\.cursorScreenY\)\?\{x:e\.cursorScreenX,y:e\.cursorScreenY\}:null\}/);
  assert.match(updated, /moveDragToCurrentCursor\([A-Za-z_$][\w$]*,codexLinuxAvatarOverlayPoint\)/);
  assert.match(updated, /pointerWindowX:[A-Za-z_$][\w$]*,pointerWindowY:[A-Za-z_$][\w$]*,mascotLeft:[A-Za-z_$][\w$]*\.mascot\.left,mascotTop:[A-Za-z_$][\w$]*\.mascot\.top/);
  assert.match(updated, /codexLinuxAvatarOverlayNext=\{x:Math\.round\([A-Za-z_$][\w$]*\.x-[A-Za-z_$][\w$]*\.pointerWindowX\),y:Math\.round\([A-Za-z_$][\w$]*\.y-[A-Za-z_$][\w$]*\.pointerWindowY\)/);
  assert.match(updated, /[A-Za-z_$][\w$]*\.lastScreenPoint=[A-Za-z_$][\w$]*/);
  assert.match(updated, /getDisplayNearestPoint\(\{x:this\.anchor\.x,y:this\.anchor\.y\}\)/);
  assert.match(updated, /this\.displayId=codexLinuxAvatarOverlayDisplay\.id,this\.displayBounds=codexLinuxAvatarOverlayDisplay\.bounds,[A-Za-z_$][\w$]*\.display=codexLinuxAvatarOverlayDisplay/);
  assert.match(updated, /this\.moveDragToCurrentCursor\([A-Za-z_$][\w$]*,this\.dragState\.lastScreenPoint\)/);
  assert.match(updated, /this\.persistWindowBounds\([A-Za-z_$][\w$]*,codexLinuxAvatarOverlayDisplay\?\?this\.getCurrentDisplay\(\)\);return/);
  assert.match(updated, /process\.platform===`linux`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_AVATAR_OVERLAY_PATCH!==`1`\)\{this\.persistWindowBounds\([A-Za-z_$][\w$]*\);return\}/);
});

test('injectLinuxAvatarOverlayPatch supports avatar overlay content-bounds drift', () => {
  const updated = injectLinuxAvatarOverlayPatch(AVATAR_OVERLAY_CONTENT_BOUNDS_BUNDLE_CURRENT);

  assert.match(
    updated,
    /setWindowBounds\([A-Za-z_$][\w$]*,[A-Za-z_$][\w$]*\)\{[\s\S]*?getContentBounds\(\)[\s\S]*?setContentBounds\([A-Za-z_$][\w$]*,!1\)[\s\S]*?this\.codexLinuxKeepAvatarOverlayFrontmost\([A-Za-z_$][\w$]*\)/
  );
  assert.match(updated, /codexLinuxRegisterAvatarOverlayAutoClose\([A-Za-z_$][\w$]*\)/);
});

test('injectLinuxAvatarOverlayPatch supports 26.519 resolution-key drag drift', () => {
  assert.match(AVATAR_OVERLAY_RESOLUTION_KEY_DRAG_BUNDLE_26_519, /this\.resolutionKey=WG\(i\)/);

  const updated = injectLinuxAvatarOverlayPatch(AVATAR_OVERLAY_RESOLUTION_KEY_DRAG_BUNDLE_26_519);

  assert.match(updated, /codexLinuxAvatarOverlayScreenPointDrag/);
  assert.match(updated, /codexLinuxRegisterAvatarOverlayAutoClose\([A-Za-z_$][\w$]*\)/);
  assert.match(updated, /moveDragToCurrentCursor\([A-Za-z_$][\w$]*,codexLinuxAvatarOverlayPoint\)/);
});

test('injectLinuxAvatarOverlayPatch supports 26.608 native composition staging drift', () => {
  const updated = injectLinuxAvatarOverlayPatch(AVATAR_OVERLAY_NATIVE_COMPOSITION_BUNDLE_26_608);

  assert.match(updated, /codexLinuxAvatarOverlay/);
  assert.doesNotThrow(() => new Function(updated));
  assert.match(updated, /codexLinuxAvatarOverlayVisibilityRecovery/);
  assert.match(
    updated,
    /this\.showWindowIfReady\([A-Za-z_$][\w$]*\),this\.codexLinuxScheduleAvatarOverlayVisibilityRecovery\([A-Za-z_$][\w$]*\)/
  );
  assert.match(
    updated,
    /this\.codexLinuxKeepAvatarOverlayFrontmost\([A-Za-z_$][\w$]*,!0\),this\.windowStagedForNativePresentation&&=\([A-Za-z_$][\w$]*\.setOpacity\(1\),!1\),[A-Za-z_$][\w$]*\.showInactive\(\)/
  );
  assert.match(
    updated,
    /setContentBounds\([A-Za-z_$][\w$]*,[A-Za-z_$][\w$]*\),\([A-Za-z_$][\w$]*\|\|![A-Za-z_$][\w$]*\)&&this\.compositionHost\.moveBackingCanvases\(\),this\.codexLinuxKeepAvatarOverlayFrontmost\([A-Za-z_$][\w$]*\)/
  );
  assert.match(updated, /codexLinuxAvatarOverlayBounds=[A-Za-z_$][\w$]*\.getContentBounds\(\)/);
  assert.match(updated, /lastScreenPoint/);
  assert.match(updated, /getDisplayNearestPoint\(\{x:this\.anchor\.x,y:this\.anchor\.y\}\)/);
  assert.match(updated, /this\.persistWindowBounds\([A-Za-z_$][\w$]*,codexLinuxAvatarOverlayDisplay\?\?this\.getCurrentDisplay\(\)\)/);
  assert.match(
    updated,
    /this\.setWindowBounds\([A-Za-z_$][\w$]*,codexLinuxAvatarOverlayNext,!1,!1\),this\.sendLayoutToRenderer\([A-Za-z_$][\w$]*\)/
  );
});

test('injectLinuxAvatarOverlayRendererPatch sends pointer screen coordinates with drag moves', () => {
  const updated = injectLinuxAvatarOverlayRendererPatch(AVATAR_OVERLAY_RENDERER_BUNDLE_CURRENT);

  assert.match(updated, /codexLinuxAvatarOverlayScreenPointDrag/);
  assert.match(
    updated,
    /f\.dispatchMessage\(`avatar-overlay-drag-move`,\{cursorScreenX:n\.screenX,cursorScreenY:n\.screenY\}\)/
  );
});

test('injectLinuxAvatarOverlayRendererPatch supports renamed pointer sample helper', () => {
  const updated = injectLinuxAvatarOverlayRendererPatch(AVATAR_OVERLAY_RENDERER_BUNDLE_26_506);

  assert.match(updated, /codexLinuxAvatarOverlayScreenPointDrag/);
  assert.match(
    updated,
    /f\.dispatchMessage\(`avatar-overlay-drag-move`,\{cursorScreenX:n\.screenX,cursorScreenY:n\.screenY\}\)/
  );
  assert.match(updated, /let n=W\(e\);/);
});

test('injectLinuxAvatarOverlayRendererPatch is idempotent', () => {
  const once = injectLinuxAvatarOverlayRendererPatch(AVATAR_OVERLAY_RENDERER_BUNDLE_CURRENT);
  const twice = injectLinuxAvatarOverlayRendererPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxAvatarOverlayRendererPatch skips patching when disabled', () => {
  const result = applyLinuxAvatarOverlayRendererPatch(AVATAR_OVERLAY_RENDERER_BUNDLE_CURRENT, {
    skip: true
  });

  assert.equal(result.updated, AVATAR_OVERLAY_RENDERER_BUNDLE_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxAvatarOverlayPatch is idempotent', () => {
  const once = injectLinuxAvatarOverlayPatch(AVATAR_OVERLAY_BUNDLE_26_429_30905);
  const twice = injectLinuxAvatarOverlayPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxAvatarOverlayPatch skips patching when disabled', () => {
  const result = applyLinuxAvatarOverlayPatch(AVATAR_OVERLAY_BUNDLE_26_429_30905, {
    skip: true
  });

  assert.equal(result.updated, AVATAR_OVERLAY_BUNDLE_26_429_30905);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxAvatarOverlayPatch reports diagnostics when avatar overlay anchors are missing', () => {
  assert.throws(
    () => injectLinuxAvatarOverlayPatch('const noop = true;', { sourceName: 'main.js' }),
    {
      message:
        /Could not patch Linux avatar overlay window behavior into the Electron main bundle\. Source: main\.js\. Missing anchors: avatar overlay route, avatar overlay window appearance, avatar overlay creation frontmost policy, avatar overlay createWindow method boundary, avatar overlay showWindow method, avatar overlay setWindowBounds method, avatar overlay pointer passthrough policy, avatar overlay drag move IPC handler, avatar overlay moveDrag method, avatar overlay startDrag method, avatar overlay cursor-based drag movement, avatar overlay endDrag method, avatar overlay drag-release momentum method\. Detected anchors: avatarOverlayRoute=no, avatarOverlayWindow=no, createFrontmostPolicy=no, createWindowEnd=no, showWindow=no, setWindowBounds=no, setWindowBoundsNativeComposition=no, pointerPassthroughPolicy=no, windowOptions=no, dragMoveIpc=no, moveDragMethod=no, startDrag=no, moveDragCursor=no, endDrag=no, throwWithVelocity=no\./
    }
  );
});

test('injectLinuxAvatarOverlayRendererPatch reports diagnostics when drag anchors are missing', () => {
  assert.throws(
    () => injectLinuxAvatarOverlayRendererPatch('const noop = true;', { sourceName: 'avatar.js' }),
    {
      message:
        /Could not patch Linux avatar overlay drag coordinates into the renderer bundle\. Source: avatar\.js\. Missing anchors: avatar overlay pointer sample, avatar overlay drag move message, avatar overlay drag move dispatch\. Detected anchors: dragMoveDispatch=no, pointerSample=no, avatarOverlayMoveMessage=no\./
    }
  );
});

test('injectLinuxPetYappingUsageMainPatch adds session-backed usage provider to main bundle', () => {
  const updated = injectLinuxPetYappingUsageMainPatch(PET_YAPPING_USAGE_MAIN_BUNDLE_26_513);

  assert.match(updated, /codexLinuxPetYappingUsageProvider/);
  assert.match(updated, /"codex-linux-pet-usage":async\(\)=>/);
  assert.match(updated, /\.codex/);
  assert.match(updated, /sessions/);
  assert.match(updated, /rate_limits/);
  assert.match(updated, /primary_window/);
  assert.match(updated, /secondary_window/);
  assert.match(updated, /"fast-mode-rollout-metrics"/);
});

test('injectLinuxPetYappingUsageMainPatch supports 26.527 fast-mode handler drift', () => {
  const updated = injectLinuxPetYappingUsageMainPatch(PET_YAPPING_USAGE_MAIN_BUNDLE_26_527);

  assert.match(updated, /codexLinuxPetYappingUsageProvider/);
  assert.match(updated, /"codex-linux-pet-usage":async\(\)=>/);
  assert.match(updated, /"fast-mode-rollout-metrics":async e=>t\.Tt/);
});

test('injectLinuxPetYappingUsageMainPatch is idempotent', () => {
  const once = injectLinuxPetYappingUsageMainPatch(PET_YAPPING_USAGE_MAIN_BUNDLE_26_513);
  const twice = injectLinuxPetYappingUsageMainPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxPetYappingUsageMainPatch skips patching when disabled', () => {
  const result = applyLinuxPetYappingUsageMainPatch(PET_YAPPING_USAGE_MAIN_BUNDLE_26_513, {
    skip: true
  });

  assert.equal(result.updated, PET_YAPPING_USAGE_MAIN_BUNDLE_26_513);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxPetYappingUsageMainPatch reports diagnostics when handler anchors are missing', () => {
  assert.throws(
    () => injectLinuxPetYappingUsageMainPatch('const noop = true;', { sourceName: 'main.js' }),
    {
      message:
        /Could not patch the main-process pet yapping usage provider into the Electron main bundle\. Source: main\.js\. Missing anchors: VS Code request bridge, VS Code handler map, fast-mode rollout handler anchor\. Detected anchors: vscodeRequestBridge=no, handlerMap=no, fastModeHandler=no\./
    }
  );
});

test('injectLinuxPetYappingUsagePatch adds yapping usage bubble to avatar overlay renderer', () => {
  const updated = injectLinuxPetYappingUsagePatch(PET_YAPPING_USAGE_RENDERER_BUNDLE_CURRENT);

  assert.match(updated, /codexLinuxPetYappingUsage/);
  assert.match(updated, /R\.useState\(null\)/);
  assert.match(updated, /R\.useEffect/);
  assert.match(updated, /codexLinuxWrapRef=R\.useRef\(null\)/);
  assert.match(updated, /codexLinuxWrapRef\.current\?\.parentElement\?\.querySelector\(`\.codex-avatar-root`\)/);
  assert.match(updated, /ResizeObserver/);
  assert.match(updated, /"--codex-usage-avatar-width":`\$\{codexLinuxAvatarBox\.width\}px`/);
  assert.match(updated, /ref:codexLinuxWrapRef/);
  assert.match(updated, /setInterval\(t,1e4\)/);
  assert.match(updated, /await codexLinuxFetchUsage\(`codex-linux-pet-usage`\)/);
  assert.match(updated, /n as codexLinuxFetchUsage/);
  assert.match(updated, /from"\.\/vscode-api-/);
  assert.doesNotMatch(updated, /from"\.\/codex-api-[^"]+\.js";[^;]*codexLinuxFetchUsage/);
  assert.doesNotMatch(updated, /codexLinuxUseQuery/);
  assert.match(
    updated,
    /children:\[x,\(0,G\.jsx\)\(codexLinuxPetYappingUsage,\{\}\),w\]\}/
  );
  assert.match(updated, /ft\(e\.querySelector\(`\.codex-usage-yap-wrap`\)\)\?\?/);
  assert.doesNotMatch(updated, /codex-usage-rings/);
});

test('injectLinuxPetYappingUsagePatch expands 26.429 layout measurement for visible bubble', () => {
  const updated = injectLinuxPetYappingUsagePatch(PET_YAPPING_USAGE_RENDERER_BUNDLE_26_429);

  assert.match(updated, /codexLinuxPetYappingUsage/);
  assert.match(
    updated,
    /let t=ft\(e\.querySelector\(`\.codex-usage-yap-wrap`\)\)\?\?ft\(e\.querySelector\(qe\)\),n=ft\(e\.querySelector\(Je\)\)/
  );
});

test('injectLinuxPetYappingUsagePatch supports 26.506 avatar renderer symbols', () => {
  const updated = injectLinuxPetYappingUsagePatch(PET_YAPPING_USAGE_RENDERER_BUNDLE_26_506);

  assert.match(updated, /codexLinuxPetYappingUsage/);
  assert.match(updated, /B\.useState\(null\)/);
  assert.match(updated, /B\.useEffect/);
  assert.match(
    updated,
    /children:\[S,\(0,K\.jsx\)\(codexLinuxPetYappingUsage,\{\}\),C\]\}/
  );
  assert.match(
    updated,
    /let t=_t\(e\.querySelector\(`\.codex-usage-yap-wrap`\)\)\?\?_t\(e\.querySelector\(\$e\)\),n=vt\(e\.querySelector\(et\)\)/
  );
});

test('injectLinuxPetYappingUsagePatch supports 26.513 combined jsx/react var prelude', () => {
  const updated = injectLinuxPetYappingUsagePatch(PET_YAPPING_USAGE_RENDERER_BUNDLE_26_513);

  assert.match(updated, /codexLinuxPetYappingUsage/);
  assert.match(updated, /L\.useState\(null\)/);
  assert.match(updated, /var Q=_\(\);function codexLinuxPetYappingUsage/);
  assert.match(
    updated,
    /children:\[\(0,Q\.jsx\)\(me,\{ariaLabel:`Pet`,assetRef:t\.assetRef,spritesheetUrl:t\.spritesheetUrl,notificationBadge:n,resizeHandle:void 0,state:t\.mascotState,style:\{\},transientState:null\}\),\(0,Q\.jsx\)\(codexLinuxPetYappingUsage,\{\}\)\]/
  );
  assert.doesNotMatch(updated, /children:\[g,\(0,Q\.jsx\)\(codexLinuxPetYappingUsage,\{\}\),_\]/);
  assert.match(
    updated,
    /let t=_t\(e\.querySelector\(`\.codex-usage-yap-wrap`\)\)\?\?_t\(e\.querySelector\(\$e\)\),n=vt\(e\.querySelector\(et\)\)/
  );
});

test('injectLinuxPetYappingUsagePatch supports 26.519 setting-storage bridge import', () => {
  const updated = injectLinuxPetYappingUsagePatch(PET_YAPPING_USAGE_RENDERER_BUNDLE_26_519);

  assert.match(updated, /codexLinuxPetYappingUsage/);
  assert.match(updated, /R\.useState\(null\)/);
  assert.match(updated, /l as codexLinuxFetchUsage/);
  assert.match(updated, /from"\.\/setting-storage-/);
  assert.match(updated, /await codexLinuxFetchUsage\(`codex-linux-pet-usage`\)/);
  assert.doesNotMatch(updated, /from"\.\/codex-api-[^"]+\.js";[^;]*codexLinuxFetchUsage/);
  assert.match(
    updated,
    /children:\[\(0,Z\.jsx\)\(I,\{ariaLabel:ne\.formatMessage\(Q\.mascotLabel,\{petName:e\.displayName\}\),assetRef:t\.assetRef,spritesheetUrl:t\.spritesheetUrl,notificationBadge:k,resizeHandle:l,state:T\.mascotState,style:s,transientState:b\}\),\(0,Z\.jsx\)\(codexLinuxPetYappingUsage,\{\}\)\]/
  );
  assert.match(
    updated,
    /let t=jn\(e\.querySelector\(`\.codex-usage-yap-wrap`\)\)\?\?jn\(e\.querySelector\(an\)\),n=Mn\(e\.querySelector\(on\)\)/
  );
});

test('injectLinuxPetYappingUsageCssPatch adds pixel yapping styles', () => {
  const updated = injectLinuxPetYappingUsageCssPatch(PET_YAPPING_USAGE_CSS_CURRENT);

  assert.match(updated, /codexLinuxPetYappingUsage/);
  assert.match(updated, /\.codex-usage-yap-wrap/);
  assert.match(updated, /top:-3\.25rem;left:-1\.15rem/);
  assert.match(updated, /width:max\(12\.8rem,calc\(var\(--codex-usage-avatar-width,112px\) \+ 3\.55rem\)\)/);
  assert.match(updated, /height:calc\(var\(--codex-usage-avatar-height,121px\) \+ 3\.8rem\)/);
  assert.doesNotMatch(updated, /\.codex-usage-yap-wrap\{[^}]*inset:/);
  assert.match(updated, /width:11\.2rem/);
  assert.match(updated, /font:600 10px\/1/);
  assert.match(updated, /shape-rendering:crispEdges/);
  assert.match(updated, /Press Start 2P/);
  assert.match(updated, /codex-usage-hover-info/);
  assert.match(updated, /\[data-avatar-overlay-hit-region="mascot"\]:hover \.codex-usage-hover-info/);
  assert.doesNotMatch(updated, /-5\.85rem|-3\.9rem|-2\.95rem|-2\.35rem|-1\.8rem/);
});

test('injectLinuxPetYappingUsagePatch is idempotent', () => {
  const once = injectLinuxPetYappingUsagePatch(PET_YAPPING_USAGE_RENDERER_BUNDLE_CURRENT);
  const twice = injectLinuxPetYappingUsagePatch(once);

  assert.equal(twice, once);
});

test('applyLinuxPetYappingUsagePatch skips patching when disabled', () => {
  const result = applyLinuxPetYappingUsagePatch(PET_YAPPING_USAGE_RENDERER_BUNDLE_CURRENT, {
    skip: true
  });

  assert.equal(result.updated, PET_YAPPING_USAGE_RENDERER_BUNDLE_CURRENT);
  assert.equal(result.status, 'skipped');
});

for (const [label, fixture] of [
  ['current', WORKTREE_ENVIRONMENT_MAIN_BUNDLE_CURRENT],
  ['26.417', WORKTREE_ENVIRONMENT_MAIN_BUNDLE_26_417],
  ['26.422', WORKTREE_ENVIRONMENT_MAIN_BUNDLE_26_422],
  ['26.506', WORKTREE_ENVIRONMENT_MAIN_BUNDLE_26_506],
  ['26.527', WORKTREE_ENVIRONMENT_MAIN_BUNDLE_26_527]
]) {
  test(`injectLinuxWorktreeEnvironmentMainPatch adds environment propagation to the ${label} main bundle`, () => {
    const updated = injectLinuxWorktreeEnvironmentMainPatch(fixture);

    assert.match(updated, /codexLinuxWorktreeEnvironmentMain/);
    assert.match(updated, /function codexLinuxResolveWorktreeLocalEnvironmentPath\(e,t\)/);
    assert.match(
      updated,
      /localEnvironmentConfigPath:codexLinuxResolvedLocalEnvironmentPath,streamId:[A-Za-z_$][\w$]*\.streamId,(?:allowSetupFailure:!0,)?setUpSyncedBranch:[A-Za-z_$][\w$]*\.launchMode===`create-stable-worktree`\?!1:void 0/
    );
    assert.match(
      updated,
      /localEnvironmentConfigPath:codexLinuxResolvedLocalEnvironmentPath,streamId:a/
    );
    assert.match(updated, /auto-selected-single-environment/);
    assert.match(updated, /explicit-no-environment/);
    assert.match(
      updated,
      /hasLocalEnvironment:codexLinuxResolvedLocalEnvironmentPath!=null&&codexLinuxResolvedLocalEnvironmentPath!==`__none__`/
    );
    if (label === '26.506' || label === '26.527') {
      assert.match(updated, /operationSource:`worktree_pending_create`/);
      assert.match(updated, /operationSource:`worktree_managed_create`/);
    }
    if (label === '26.527') {
      assert.match(updated, /allowSetupFailure:!0/);
      assert.doesNotMatch(updated, /hasLocalEnvironment:i\.localEnvironmentConfigPath!=null/);
    }
  });
}

test('injectLinuxWorktreeEnvironmentMainPatch is idempotent', () => {
  const once = injectLinuxWorktreeEnvironmentMainPatch(WORKTREE_ENVIRONMENT_MAIN_BUNDLE_CURRENT);
  const twice = injectLinuxWorktreeEnvironmentMainPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxWorktreeEnvironmentMainPatch skips patching when disabled', () => {
  const result = applyLinuxWorktreeEnvironmentMainPatch(WORKTREE_ENVIRONMENT_MAIN_BUNDLE_CURRENT, {
    skip: true
  });

  assert.equal(result.updated, WORKTREE_ENVIRONMENT_MAIN_BUNDLE_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxWorktreeEnvironmentMainPatch reports diagnostics when worktree anchors are missing', () => {
  assert.throws(
    () =>
      injectLinuxWorktreeEnvironmentMainPatch('const noop = true;', { sourceName: 'main.js' }),
    {
      message:
        /Could not patch the Electron main bundle worktree environment propagation for Linux\. Source: main\.js\. Missing anchors: worktree service class marker, pending worktree create request, pending worktree ready log, managed worktree create request, managed worktree ready log\. Detected anchors: worktreeServiceClass=no, pendingCreateRequest=no, pendingReadyLog=no, managedCreateRequest=no, managedReadyLog=no\./
    }
  );
});

test('injectLinuxWorktreeEnvironmentWorkerPatch adds single-environment fallback to the worker bundle', () => {
  const updated = injectLinuxWorktreeEnvironmentWorkerPatch(WORKTREE_ENVIRONMENT_WORKER_BUNDLE_CURRENT);

  assert.match(updated, /codexLinuxWorktreeEnvironmentWorker/);
  assert.match(updated, /codexLinuxWorktreeEnvironmentWorkerBuiltins/);
  assert.match(updated, /async function codexLinuxResolveWorktreeEnvironmentConfigPath\(e,t,n\)/);
  assert.match(updated, /function codexLinuxResolveWorktreeSourceWorkspaceRoot\(e\)/);
  assert.match(
    updated,
    /async function lX\(e,t,n,r,i,a\)\{return\(await uX\(\{workspaceRoot:e,localEnvironment:t,scriptType:`cleanup`,appServerClient:a,injectedEnvironment:i,onLog:n,signal:r\}\)\)\?\.setupResult\?\?null\}/
  );
  assert.match(updated, /auto-selected-single-environment/);
  assert.match(updated, /explicit-no-environment/);
  assert.match(updated, /failed-to-store-environment-selection/);
  assert.match(updated, /await vZ\(g,codexLinuxLocalEnvironmentConfigPath\?\?`__none__`,a,`worktree`,o\)/);
  assert.match(updated, /let v=await QJ\(codexLinuxLocalEnvironmentConfigPath,a\);/);
  assert.match(updated, /cleanup-source-root-unavailable/);
  assert.match(updated, /cleanup-source-worktree-failed/);
  assert.match(updated, /await RX\(e.sourceWorktreeRoot,codexLinuxWorktreeCleanupId,t,n\)/);
  assert.match(updated, /let codexLinuxWorktreeCleanupId=e\.sourceWorktreeRoot;/);
  assert.match(
    updated,
    /let codexLinuxWorktreeSourceWorkspaceRoot=codexLinuxResolveWorktreeSourceWorkspaceRoot\(e\),codexLinuxInjectedCleanupEnvironment=codexLinuxWorktreeSourceWorkspaceRoot==null\?\(NX\(\)\.info\(`\[worktree-delete\] cleanup-source-root-unavailable`,\{safe:\{worktreeId:t\},sensitive:\{workspaceRoot:e\}\}\),\{\[WL\]:e\}\):\{\[UL\]:codexLinuxWorktreeSourceWorkspaceRoot,\[WL\]:e\};let o=await lX\(e,a,void 0,r,codexLinuxInjectedCleanupEnvironment,n\);/
  );
  assert.match(updated, /cleanup-skipped-no-environment/);
});

test('injectLinuxWorktreeEnvironmentWorkerPatch supports the 26.422 worker symbols', () => {
  const updated = injectLinuxWorktreeEnvironmentWorkerPatch(WORKTREE_ENVIRONMENT_WORKER_BUNDLE_26_422);

  assert.match(updated, /codexLinuxWorktreeEnvironmentWorker/);
  assert.match(updated, /async function jZ\(\{gitManager:e,workspaceRoot:t/);
  assert.match(updated, /async function oX\(e,t,n,r,i,a\)/);
  assert.match(updated, /appServerClient:a,injectedEnvironment:i,onLog:n,signal:r/);
  assert.match(updated, /await gZ\(g,codexLinuxLocalEnvironmentConfigPath\?\?`__none__`,a,`worktree`,o\)/);
  assert.match(updated, /let v=await YJ\(codexLinuxLocalEnvironmentConfigPath,a\);/);
  assert.match(updated, /\{\[JL\]:t,\[YL\]:g\}/);
  assert.match(updated, /AX\(\)\.info\(`\[worktree-create\] auto-selected-single-environment`/);
  assert.match(updated, /let codexLinuxWorktreeCleanupId=e\.sourceWorktreeRoot;/);
  assert.match(updated, /await FX\(e.sourceWorktreeRoot,codexLinuxWorktreeCleanupId,t,n\)/);
  assert.match(updated, /let o=await oX\(e,a,void 0,r,codexLinuxInjectedCleanupEnvironment,n\);/);
  assert.match(updated, /cleanup-skipped-no-environment/);
});

test('injectLinuxWorktreeEnvironmentWorkerPatch supports renamed 26.506 success result helper', () => {
  const updated = injectLinuxWorktreeEnvironmentWorkerPatch(WORKTREE_ENVIRONMENT_WORKER_BUNDLE_26_506);

  assert.match(updated, /codexLinuxWorktreeEnvironmentWorker/);
  assert.match(updated, /return Z\(\{status:`success`,warnings:i\}\)/);
  assert.match(updated, /await RX\(e.sourceWorktreeRoot,codexLinuxWorktreeCleanupId,t,n\)/);
  assert.match(updated, /let codexLinuxWorktreeCleanupId=e\.sourceWorktreeRoot;/);
});

test('injectLinuxWorktreeEnvironmentWorkerPatch supports 26.513 worker aliases', () => {
  const updated = injectLinuxWorktreeEnvironmentWorkerPatch(WORKTREE_ENVIRONMENT_WORKER_BUNDLE_26_513);

  assert.match(updated, /codexLinuxWorktreeEnvironmentWorker/);
  assert.match(updated, /await bq\.readdir\(r,t\)/);
  assert.match(updated, /le\.Buffer\.from\(`Worktree created at \$\{g\}\\n`,`utf8`\)/);
  assert.match(updated, /le\.Buffer\.from\(`No local environment selected\\n`,`utf8`\)/);
  assert.match(updated, /await vZ\(g,codexLinuxLocalEnvironmentConfigPath\?\?`__none__`,a,`worktree`,o\)/);
});

test('injectLinuxWorktreeEnvironmentWorkerPatch preserves 26.527 setup failure handling', () => {
  const updated = injectLinuxWorktreeEnvironmentWorkerPatch(WORKTREE_ENVIRONMENT_WORKER_BUNDLE_26_527);

  assert.match(updated, /codexLinuxWorktreeEnvironmentWorker/);
  assert.match(
    updated,
    /allowSetupFailure:i=!1,setUpSyncedBranch:a=!0,appServerClient:o,signal:s,onLog:c,onWorktreePathAllocated:l/
  );
  assert.match(updated, /await vZ\(g,codexLinuxLocalEnvironmentConfigPath\?\?`__none__`,o,`worktree`,s\)/);
  assert.match(updated, /let v=await QJ\(codexLinuxLocalEnvironmentConfigPath,o\);/);
  assert.match(updated, /setupError:null/);
  assert.match(updated, /setupError:v\.error/);
});

test('injectLinuxWorktreeEnvironmentWorkerPatch is idempotent', () => {
  const once = injectLinuxWorktreeEnvironmentWorkerPatch(WORKTREE_ENVIRONMENT_WORKER_BUNDLE_CURRENT);
  const twice = injectLinuxWorktreeEnvironmentWorkerPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxWorktreeEnvironmentWorkerPatch skips patching when disabled', () => {
  const result = applyLinuxWorktreeEnvironmentWorkerPatch(
    WORKTREE_ENVIRONMENT_WORKER_BUNDLE_CURRENT,
    { skip: true }
  );

  assert.equal(result.updated, WORKTREE_ENVIRONMENT_WORKER_BUNDLE_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxWorktreeEnvironmentWorkerPatch reports diagnostics when worktree anchors are missing', () => {
  assert.throws(
    () =>
      injectLinuxWorktreeEnvironmentWorkerPatch('const noop = true;', { sourceName: 'worker.js' }),
    {
      message:
        /Could not patch the Electron worker bundle worktree environment handling for Linux\. Source: worker\.js\. Missing anchors: create-worktree function marker, cleanup helper function, stored environment selection branch, missing-environment setup skip branch, cleanup invocation, move-thread-to-local success path, cleanup skip branch\. Detected anchors: createWorktreeFunction=no, cleanupHelper=no, storedEnvironmentSelection=no, setupSkipBranch=no, cleanupCall=no, moveToLocalSuccess=no, cleanupSkipBranch=no\./
    }
  );
});

for (const [label, fixture] of [
  ['legacy', TERMINAL_PANEL_BLOCK_LEGACY],
  ['current', TERMINAL_PANEL_BLOCK_CURRENT],
  ['26.406', TERMINAL_PANEL_BLOCK_26_406],
  ['26.415', TERMINAL_PANEL_BLOCK_26_415],
  ['26.513', TERMINAL_PANEL_BLOCK_26_513],
  ['26.602', TERMINAL_PANEL_BLOCK_26_602]
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
      assert.match(
        updated,
        /codexLinuxPreserveSession\|\|[A-Za-z_$][\w$]*\|\|[A-Za-z_$][\w$]*\.close\([A-Za-z_$][\w$]*\)/
      );
      if (label === '26.513') {
        assert.match(updated, /conversationTitle:r/);
        assert.match(updated, /hostId:i\?\?null,cwd:a\?\?null/);
      }
      if (label === '26.602') {
        assert.match(updated, /conversationTitle:r/);
        assert.match(updated, /hostId:o\?\?null,cwd:s\?\?null/);
      }
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
    /(var codexLinuxTerminalMounts[\s\S]*?function codexLinuxReleaseTerminalMount\(e,t\)\{[\s\S]*?\})let t=[A-Za-z_$][\w$]*\?\?/
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
        /Could not patch the renderer terminal lifecycle bundle for Linux\. Source: index\.js\. Missing anchors: data-codex-terminal marker, terminal onInitLog handler, terminal session creation, terminal attach scheduling, terminal attach completion hook, terminal cleanup handoff\. Detected anchors: terminalComponent=no, initLogHandler=no, sessionCreate=no, attach=no, onAttach=no, cleanup=no\./
    }
  );
});

for (const [label, fixture] of [
  ['current', NEW_THREAD_MODEL_BUNDLE_CURRENT],
  ['26.406', NEW_THREAD_MODEL_BUNDLE_26_406]
]) {
  test(`injectLinuxNewThreadModelPatch adds optimistic fresh-thread model state to the ${label} renderer bundle`, () => {
    const updated = injectLinuxNewThreadModelPatch(fixture);

    assert.match(updated, /codexLinuxPendingModelSettings/);
    assert.match(updated, /codexLinuxIsFreshComposer=(?:n|e)==null/);
    assert.match(
      updated,
      /codexLinuxSetPendingModelSettings\(\{model:e,reasoningEffort:(?:t|n),cwd:s\}\)/
    );
    assert.match(updated, /collaborationMode:[A-Za-z_$][\w$]*,config:[A-Za-z_$][\w$]*/);
    assert.match(
      updated,
      /model:[A-Za-z_$][\w$]*\.settings\?\.model\?\?[A-Za-z_$][\w$]*\.model\?\?null/
    );
    assert.match(
      updated,
      /reasoning_effort:[A-Za-z_$][\w$]*\.settings\?\.reasoning_effort\?\?[A-Za-z_$][\w$]*\.model_reasoning_effort\?\?null/
    );
  });
}

test('injectLinuxNewThreadModelPatch is idempotent', () => {
  const once = injectLinuxNewThreadModelPatch(NEW_THREAD_MODEL_BUNDLE_CURRENT);
  const twice = injectLinuxNewThreadModelPatch(once);

  assert.equal(twice, once);
});

test('injectLinuxNewThreadModelPatch supports 26.415 setter helper drift', () => {
  const bundle = `${NEW_THREAD_MODEL_STATE_BUNDLE_26_415_DRIFTED}${NEW_THREAD_MODEL_SUBMIT_BLOCK_26_415}`;
  const updated = injectLinuxNewThreadModelPatch(bundle);

  assert.match(updated, /codexLinuxPendingModelSettings/);
  assert.match(updated, /codexLinuxIsFreshComposer=n==null\|\|!p/);
  assert.match(updated, /codexLinuxSetPendingModelSettings\(\{model:e,reasoningEffort:t,cwd:l\}\)/);
  assert.match(updated, /codexLinuxFreshThreadCollaborationModeSettings/);
});

test('injectLinuxNewThreadModelPatch supports 26.415 state block drift from 26.415.32059', () => {
  const bundle = `${NEW_THREAD_MODEL_STATE_BUNDLE_26_415_32059}${NEW_THREAD_MODEL_SUBMIT_BLOCK_26_415}`;
  const updated = injectLinuxNewThreadModelPatch(bundle);

  assert.match(updated, /let y=_,b=s\?\.authMethod===`copilot`,codexLinuxIsFreshComposer=n==null\|\|!p,/);
  assert.match(updated, /codexLinuxSetPendingModelSettings\(\{model:e,reasoningEffort:t,cwd:l\}\)/);
  assert.match(updated, /codexLinuxFreshThreadCollaborationModeSettings/);
});

test('injectLinuxNewThreadModelPatch supports 26.417 project submit drift', () => {
  const bundle = `${NEW_THREAD_MODEL_STATE_BUNDLE_26_415_DRIFTED}${NEW_THREAD_MODEL_SUBMIT_BLOCK_26_417}`;
  const updated = injectLinuxNewThreadModelPatch(bundle);

  assert.match(updated, /codexLinuxPendingModelSettings/);
  assert.match(updated, /codexLinuxIsFreshComposer=n==null\|\|!p/);
  assert.match(updated, /codexLinuxFreshThreadCollaborationModeSettings/);
  assert.match(
    updated,
    /model:[A-Za-z_$][\w$]*\.settings\?\.model\?\?[A-Za-z_$][\w$]*\.model\?\?null/
  );
  assert.match(
    updated,
    /reasoning_effort:[A-Za-z_$][\w$]*\.settings\?\.reasoning_effort\?\?[A-Za-z_$][\w$]*\.model_reasoning_effort\?\?null/
  );
});

test('injectLinuxNewThreadModelPatch supports 26.422 model hook and project submit drift', () => {
  const bundle = `${NEW_THREAD_MODEL_SELECTOR_BLOCK_26_422}${NEW_THREAD_MODEL_SUBMIT_BLOCK_26_422}`;
  const updated = injectLinuxNewThreadModelPatch(bundle);

  assert.match(updated, /codexLinuxPendingModelSettings/);
  assert.match(updated, /codexLinuxIsFreshComposer=e==null/);
  assert.match(
    updated,
    /codexLinuxSetPendingModelSettings\(\{model:e,reasoningEffort:n,profile:c\.profile,isLoading:!1\}\)/
  );
  assert.match(updated, /codexLinuxFreshThreadCollaborationModeSettings/);
  assert.match(updated, /let o=xve\(t,n,i\),s=zt\(a\)/);
  assert.match(updated, /collaborationMode:codexLinuxFreshThreadCollaborationModeSettings/);
});

test('injectLinuxNewThreadModelPatch supports 26.422.71525 model hook and project submit drift', () => {
  const bundle = `${NEW_THREAD_MODEL_SELECTOR_BLOCK_26_422_71525}${NEW_THREAD_MODEL_SUBMIT_BLOCK_26_422_71525}`;
  const updated = injectLinuxNewThreadModelPatch(bundle);

  assert.match(updated, /codexLinuxPendingModelSettings/);
  assert.match(updated, /codexLinuxIsFreshComposer=e==null/);
  assert.match(
    updated,
    /codexLinuxSetPendingModelSettings\(\{model:e,reasoningEffort:n,profile:c\.profile,isLoading:!1\}\)/
  );
  assert.match(updated, /codexLinuxFreshThreadCollaborationModeSettings/);
  assert.match(updated, /let o=xve\(t,n,i\),s=Bt\(a\)/);
  assert.match(updated, /collaborationMode:codexLinuxFreshThreadCollaborationModeSettings/);
});

test('injectLinuxNewThreadModelPatch supports 26.519 split model hook and start params shape', () => {
  const bundle = `${NEW_THREAD_MODEL_SELECTOR_BLOCK_26_519}${NEW_THREAD_MODEL_SUBMIT_BLOCK_26_519}`;
  const updated = injectLinuxNewThreadModelPatch(bundle);

  assert.match(updated, /codexLinuxPendingModelSettings/);
  assert.match(updated, /codexLinuxIsFreshComposer=e==null/);
  assert.match(
    updated,
    /codexLinuxSetPendingModelSettings\(\{model:e,reasoningEffort:r,profile:g\.profile,isLoading:!1\}\)/
  );
  assert.match(updated, /codexLinuxFreshThreadCollaborationModeSettings/);
  assert.match(updated, /model:u\.settings\?\.model\?\?r\.model\?\?null/);
  assert.match(
    updated,
    /reasoning_effort:u\.settings\?\.reasoning_effort\?\?r\.model_reasoning_effort\?\?null/
  );
});

test('injectLinuxNewThreadModelPatch scopes 26.415 fresh-effect insertion to the selector function', () => {
  const bundle = `${NEW_THREAD_MODEL_STATE_BUNDLE_26_415_DECOY_PREFIX}${NEW_THREAD_MODEL_STATE_BUNDLE_26_415_DRIFTED}${NEW_THREAD_MODEL_SUBMIT_BLOCK_26_415}`;
  const updated = injectLinuxNewThreadModelPatch(bundle);

  assert.match(updated, /function codexLinuxDecoy\(\)\{let C=null,w=C,T;return T\}/);
  assert.equal((updated.match(/let codexLinuxFreshComposerBaseSettings=b\?f:d;\(0,K\.useEffect\)/g) ?? []).length, 1);
  assert.match(
    updated,
    /set-model-and-reasoning-for-next-turn[\s\S]*?let codexLinuxFreshComposerBaseSettings=b\?f:d;\(0,K\.useEffect\)/
  );
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

test('patchRendererNewThreadModelBundle skips when fresh-thread anchors are incompatible', async () => {
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codex-new-thread-anchor-mismatch-')
  );
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const bundlePath = path.join(assetsDir, 'index.js');
    await fs.promises.writeFile(bundlePath, NEW_THREAD_MODEL_BUNDLE_26_406_DRIFTED, 'utf8');

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererNewThreadModelBundle(extractedAppDir, logger);

    assert.deepEqual(result.status, 'skipped');
    assert.deepEqual(result.reason, 'anchor-mismatch');
    assert.equal(result.sourceName, 'index.js');
    assert.match(result.details ?? '', /Could not patch the renderer new-thread model bundle for Linux/);
    assert.match(result.candidates ?? '', /index\.js/);
    assert.equal(await fs.promises.readFile(bundlePath, 'utf8'), NEW_THREAD_MODEL_BUNDLE_26_406_DRIFTED);
    assert.equal(
      warnings.some((message) => message.includes('Skipping Linux new-thread model patch for index.js')),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererNewThreadModelBundle reports anchor mismatch when evidence exists without compatible anchors', async () => {
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codex-new-thread-evidence-anchor-mismatch-')
  );
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const bundlePath = path.join(assetsDir, 'use-model-settings.js');
    const incompatibleBundle = [
      'set-model-and-reasoning-for-next-turn',
      'copilot-default-model',
      'set-default-model-config-for-host',
      'function $9(e=null){return{setModelAndReasoningEffort(){},modelSettings:{}}}',
      'async function bve(){return{input:[],workspaceRoots:[],cwd:`/`,fileAttachments:[],addedFiles:[],agentMode:`auto`,model:null,reasoningEffort:null,collaborationMode:null,config:{},workspaceKind:`project`}}'
    ].join(';');
    await fs.promises.writeFile(bundlePath, incompatibleBundle, 'utf8');

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererNewThreadModelBundle(extractedAppDir, logger);

    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'anchor-mismatch');
    assert.equal(result.sourceName, 'use-model-settings.js');
    assert.match(result.candidates ?? '', /use-model-settings\.js/);
    assert.equal(await fs.promises.readFile(bundlePath, 'utf8'), incompatibleBundle);
    assert.equal(
      warnings.some((message) => message.includes('Candidates: use-model-settings.js')),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererNewThreadModelBundle skips when no new-thread candidate bundle exists', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-new-thread-no-candidate-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    await fs.promises.writeFile(path.join(assetsDir, 'index.js'), 'const noop = true;', 'utf8');

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererNewThreadModelBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'skipped',
      reason: 'bundle-not-found'
    });
    assert.equal(
      warnings.includes(
        'Skipping Linux new-thread model patch because no new-thread renderer candidate bundle was detected.'
      ),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererNewThreadModelBundle patches 26.422.71525 bundle fixture', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-new-thread-26422-71525-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const bundlePath = path.join(assetsDir, 'use-model-settings-D-IrMVLP.js');
    await fs.promises.writeFile(
      bundlePath,
      `${NEW_THREAD_MODEL_SELECTOR_BLOCK_26_422_71525}${NEW_THREAD_MODEL_SUBMIT_BLOCK_26_422_71525}`,
      'utf8'
    );

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererNewThreadModelBundle(extractedAppDir, logger);

    assert.equal(result.status, 'applied');
    assert.equal(result.sourceName, 'use-model-settings-D-IrMVLP.js');

    const patchedBundle = await fs.promises.readFile(bundlePath, 'utf8');
    assert.match(patchedBundle, /codexLinuxPendingModelSettings/);
    assert.match(patchedBundle, /codexLinuxFreshThreadCollaborationModeSettings/);
    assert.match(patchedBundle, /let o=xve\(t,n,i\),s=Bt\(a\)/);
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererNewThreadModelBundle patches split 26.519 use-model-settings and start params bundles', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-new-thread-split-26519-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const stateBundlePath = path.join(assetsDir, 'use-model-settings-DMElur6E.js');
    const submitBundlePath = path.join(assetsDir, 'build-start-conversation-params-DM-1Fk5r.js');
    await fs.promises.writeFile(stateBundlePath, NEW_THREAD_MODEL_SELECTOR_BLOCK_26_519, 'utf8');
    await fs.promises.writeFile(submitBundlePath, NEW_THREAD_MODEL_SUBMIT_BLOCK_26_519, 'utf8');

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererNewThreadModelBundle(extractedAppDir, logger);

    assert.equal(result.status, 'applied');
    assert.equal(result.stateSourceName, 'use-model-settings-DMElur6E.js');
    assert.equal(result.submitSourceName, 'build-start-conversation-params-DM-1Fk5r.js');

    const patchedState = await fs.promises.readFile(stateBundlePath, 'utf8');
    const patchedSubmit = await fs.promises.readFile(submitBundlePath, 'utf8');
    assert.match(patchedState, /codexLinuxPendingModelSettings/);
    assert.match(patchedState, /codexLinuxIsFreshComposer=e==null/);
    assert.match(patchedSubmit, /codexLinuxFreshThreadCollaborationModeSettings/);
    assert.match(patchedSubmit, /collaborationMode:codexLinuxFreshThreadCollaborationModeSettings/);
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererNewThreadModelBundle accepts 26.527 upstream fresh-thread model flow', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-new-thread-upstream-26527-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const collaborationModeBundle = [
      'import{t as p}from"./use-model-settings-DhE-8qP1.js";',
      'function C(o){let{modelSettings:h}=p(o),w={mode:n,settings:{model:h.model,reasoning_effort:h.reasoningEffort,developer_instructions:null}};',
      'let B={...j.settings,model:h.model,reasoning_effort:h.reasoningEffort};',
      'return{modes:k,activeMode:V,selectedMode:O,setSelectedMode:F}}'
    ].join('');
    const startParamsBundle = [
      'function n({agentMode:n,workspaceRoots:r,config:i,configOverrides:a,input:o,collaborationMode:c,cwd:d}){',
      'let x=e(n,r,i),g=`project`;return{input:o,workspaceRoots:r,collaborationMode:c,permissions:x,approvalsReviewer:x.approvalsReviewer,cwd:d,workspaceKind:g}}'
    ].join('');
    const composerBundle = [
      'function Cv({scope:e,activeCollaborationMode:t,setEffectiveCollaborationMode:y,startConversationWithPrimaryRuntimeForFirstTurn:b}){',
      'let v=await n_({context:r,prompt:C,workspaceRoots:s.workspaceRoots,cwd:g,hostId:p,agentMode:n,serviceTier:_,collaborationMode:t,memoryPreferences:h??void 0,workspaceKind:u?`projectless`:`project`});',
      'return a({startConversationParamsInput:v})}'
    ].join('');

    await fs.promises.writeFile(
      path.join(assetsDir, 'use-collaboration-mode-B_YKft0A.js'),
      collaborationModeBundle,
      'utf8'
    );
    await fs.promises.writeFile(
      path.join(assetsDir, 'build-start-conversation-params-NLWgpXGB.js'),
      startParamsBundle,
      'utf8'
    );
    await fs.promises.writeFile(path.join(assetsDir, 'composer-zFOdryLS.js'), composerBundle, 'utf8');

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererNewThreadModelBundle(extractedAppDir, logger);

    assert.equal(result.status, 'already-applied');
    assert.equal(result.upstream, true);
    assert.match(result.sourceName, /use-collaboration-mode-B_YKft0A\.js/);
    assert.match(result.sourceName, /build-start-conversation-params-NLWgpXGB\.js/);
    assert.match(result.sourceName, /composer-zFOdryLS\.js/);
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererNewThreadModelBundle patches split 26.415 bundles with setter helper drift', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-new-thread-split-26415-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const stateBundlePath = path.join(assetsDir, 'use-model-settings.js');
    const submitBundlePath = path.join(assetsDir, 'index.js');
    await fs.promises.writeFile(stateBundlePath, NEW_THREAD_MODEL_STATE_BUNDLE_26_415_DRIFTED, 'utf8');
    await fs.promises.writeFile(submitBundlePath, NEW_THREAD_MODEL_SUBMIT_BLOCK_26_415, 'utf8');

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererNewThreadModelBundle(extractedAppDir, logger);

    assert.equal(result.status, 'applied');
    assert.equal(result.stateSourceName, 'use-model-settings.js');
    assert.equal(result.submitSourceName, 'index.js');

    const patchedState = await fs.promises.readFile(stateBundlePath, 'utf8');
    const patchedSubmit = await fs.promises.readFile(submitBundlePath, 'utf8');
    assert.match(patchedState, /codexLinuxPendingModelSettings/);
    assert.match(patchedState, /codexLinuxIsFreshComposer=n==null\|\|!p/);
    assert.match(patchedSubmit, /codexLinuxFreshThreadCollaborationModeSettings/);
    assert.match(
      patchedSubmit,
      /reasoning_effort:.*\.settings\?\.reasoning_effort\?\?.*\.model_reasoning_effort\?\?null/
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererNewThreadModelBundle patches split 26.415 bundles with 26.415.32059 state drift', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-new-thread-split-26415-32059-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const stateBundlePath = path.join(assetsDir, 'use-model-settings.js');
    const submitBundlePath = path.join(assetsDir, 'index.js');
    await fs.promises.writeFile(stateBundlePath, NEW_THREAD_MODEL_STATE_BUNDLE_26_415_32059, 'utf8');
    await fs.promises.writeFile(submitBundlePath, NEW_THREAD_MODEL_SUBMIT_BLOCK_26_415, 'utf8');

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererNewThreadModelBundle(extractedAppDir, logger);

    assert.equal(result.status, 'applied');
    assert.equal(result.stateSourceName, 'use-model-settings.js');
    assert.equal(result.submitSourceName, 'index.js');

    const patchedState = await fs.promises.readFile(stateBundlePath, 'utf8');
    const patchedSubmit = await fs.promises.readFile(submitBundlePath, 'utf8');
    assert.match(patchedState, /let y=_,b=s\?\.authMethod===`copilot`,codexLinuxIsFreshComposer=n==null\|\|!p,/);
    assert.match(patchedSubmit, /codexLinuxFreshThreadCollaborationModeSettings/);
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererNewThreadModelBundle patches combined 26.417 use-model-settings bundle', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-new-thread-26417-combined-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const bundlePath = path.join(assetsDir, 'use-model-settings.js');
    await fs.promises.writeFile(
      bundlePath,
      `${NEW_THREAD_MODEL_STATE_BUNDLE_26_415_DRIFTED}${NEW_THREAD_MODEL_SUBMIT_BLOCK_26_417}`,
      'utf8'
    );

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererNewThreadModelBundle(extractedAppDir, logger);

    assert.equal(result.status, 'applied');
    assert.equal(result.sourceName, 'use-model-settings.js');

    const patchedBundle = await fs.promises.readFile(bundlePath, 'utf8');
    assert.match(patchedBundle, /codexLinuxPendingModelSettings/);
    assert.match(patchedBundle, /codexLinuxFreshThreadCollaborationModeSettings/);
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererNewThreadModelBundle skips when 26.415 setter anchors are incompatible', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-new-thread-26415-anchor-mismatch-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const stateBundlePath = path.join(assetsDir, 'use-model-settings.js');
    const submitBundlePath = path.join(assetsDir, 'index.js');
    const incompatibleState = NEW_THREAD_MODEL_STATE_BUNDLE_26_415_DRIFTED.replace(
      'set-default-model-config-for-host',
      'set-default-model-config-for-host-v2'
    );
    await fs.promises.writeFile(stateBundlePath, incompatibleState, 'utf8');
    await fs.promises.writeFile(submitBundlePath, NEW_THREAD_MODEL_SUBMIT_BLOCK_26_415, 'utf8');

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererNewThreadModelBundle(extractedAppDir, logger);

    assert.deepEqual(result.status, 'skipped');
    assert.deepEqual(result.reason, 'anchor-mismatch');
    assert.equal(result.sourceName, 'use-model-settings.js');
    assert.match(result.details ?? '', /Could not patch the renderer new-thread model bundle for Linux/);
    assert.equal(await fs.promises.readFile(stateBundlePath, 'utf8'), incompatibleState);
    assert.equal(await fs.promises.readFile(submitBundlePath, 'utf8'), NEW_THREAD_MODEL_SUBMIT_BLOCK_26_415);
    assert.equal(
      warnings.some((message) =>
        message.includes('Skipping Linux new-thread model patch for use-model-settings.js')
      ),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

for (const [label, fixture] of [
  ['current', TODO_PROGRESS_BUNDLE_CURRENT],
  ['26.406', TODO_PROGRESS_BUNDLE_26_406],
  ['26.406-renamed', TODO_PROGRESS_BUNDLE_26_406_RENAMED],
  ['26.409-direct-compact', TODO_PROGRESS_BUNDLE_26_409_DIRECT_COMPACT],
  ['26.513.31313-jsx-runtime', TODO_PROGRESS_BUNDLE_26_513_31313]
]) {
  test(`injectLinuxTodoProgressPatch updates todo render cache keys in the ${label} renderer bundle`, () => {
    const updated = injectLinuxTodoProgressPatch(fixture);

    assert.match(updated, /codexLinuxTodoProgress/);
    assert.match(updated, /CODEX_DESKTOP_DISABLE_LINUX_TODO_PROGRESS_PATCH/);
    assert.match(updated, /map\(\(e,t\)=>String\(t\)\+`:`\+e\.status\+`:`\+e\.step\)\.join\(`\|`\)/);
    assert.doesNotMatch(updated, /t\[0\]===n\.plan|t\[0\]===r\.plan/);
    assert.doesNotMatch(updated, /t\[20\]!==n\.plan|t\[20\]!==r\.plan/);
  });
}

test('injectLinuxTodoProgressPatch rewrites portal todo cache keys for the 26.409 direct-compact renderer bundle', () => {
  const updated = injectLinuxTodoProgressPatch(TODO_PROGRESS_BUNDLE_26_409_DIRECT_COMPACT);

  assert.match(updated, /\(i==null\?i:\(typeof process<`u`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_TODO_PROGRESS_PATCH===`1`\?i:/);
  assert.doesNotMatch(updated, /t\[3\]!==i/);
  assert.doesNotMatch(updated, /t\[3\]=i/);
});

test('injectLinuxTodoProgressPatch rewrites expanded todo item cache keys for the 26.506 renderer bundle', () => {
  const updated = injectLinuxTodoProgressPatch(TODO_PROGRESS_BUNDLE_26_506_EXPANDED_ITEM_CACHE);

  assert.match(updated, /codexLinuxTodoProgress/);
  assert.doesNotMatch(updated, /t\[154\]===n/);
  assert.doesNotMatch(updated, /t\[154\]=n/);
  assert.doesNotMatch(updated, /t\[34\]===e/);
  assert.doesNotMatch(updated, /t\[34\]=e/);
  assert.match(updated, /n\.plan\.map\(\(e,t\)=>String\(t\)\+`:`\+e\.status\+`:`\+e\.step\)\.join\(`\|`\)/);
  assert.match(updated, /e\.plan\.map\(\(e,t\)=>String\(t\)\+`:`\+e\.status\+`:`\+e\.step\)\.join\(`\|`\)/);
});

test('injectLinuxTodoProgressPatch preserves the 26.513.31313 JSX runtime variable', () => {
  const updated = injectLinuxTodoProgressPatch(TODO_PROGRESS_BUNDLE_26_513_31313);

  assert.match(updated, /\(0,Q\.jsx\)\(PC,\{item:n\}\)/);
  assert.match(updated, /\(0,Q\.jsx\)\(hw,\{item:e\}\)/);
  assert.match(updated, /codexLinuxTodoProgress/);
});

test('injectLinuxTodoProgressPatch is idempotent', () => {
  const once = injectLinuxTodoProgressPatch(TODO_PROGRESS_BUNDLE_CURRENT);
  const twice = injectLinuxTodoProgressPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxTodoProgressPatch skips patching when disabled', () => {
  const result = applyLinuxTodoProgressPatch(TODO_PROGRESS_BUNDLE_CURRENT, { skip: true });

  assert.equal(result.updated, TODO_PROGRESS_BUNDLE_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxTodoProgressPatch reports diagnostics when todo anchors are missing', () => {
  assert.throws(
    () => injectLinuxTodoProgressPatch('const noop = true;', { sourceName: 'index.js' }),
    {
      message:
        /Could not patch the renderer todo progress bundle for Linux\. Source: index\.js\. Missing anchors: todo-list conversation item case, expanded todo component, expanded todo summary text, compact todo component, compact todo summary text, compact todo render cache branch, portal todo render cache branch\. Detected anchors: todoListCase=no, expandedTodoComponent=no, expandedTodoSummary=no, compactTodoComponent=no, compactTodoSummary=no, compactTodoRenderCache=no, portalTodoRenderCache=no\./
    }
  );
});

test('patchRendererTodoProgressBundle skips when todo render-cache anchors are incompatible', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-todo-anchor-mismatch-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const incompatibleBundle = TODO_PROGRESS_BUNDLE_26_406_RENAMED.replace(
      '(0,$.jsx)(IAe,{item:e})',
      '(0,$.jsx)(IAe,{item:e,highlight:!0})'
    );
    const bundlePath = path.join(assetsDir, 'index.js');
    await fs.promises.writeFile(bundlePath, incompatibleBundle, 'utf8');

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererTodoProgressBundle(extractedAppDir, logger);

    assert.deepEqual(result.status, 'skipped');
    assert.deepEqual(result.reason, 'anchor-mismatch');
    assert.equal(result.sourceName, 'index.js');
    assert.match(result.details ?? '', /Could not patch the renderer todo progress bundle for Linux/);
    assert.equal(await fs.promises.readFile(bundlePath, 'utf8'), incompatibleBundle);
    assert.equal(
      warnings.some((message) => message.includes('Skipping Linux todo progress patch for index.js')),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererTodoProgressBundle skips when no todo-progress candidate bundle exists', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-todo-no-candidate-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    await fs.promises.writeFile(path.join(assetsDir, 'index.js'), 'const noop = true;', 'utf8');

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererTodoProgressBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'skipped',
      reason: 'bundle-not-found'
    });
    assert.equal(
      warnings.some((message) => message.includes('no todo-progress renderer candidate')),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

for (const [label, fixture] of [
  ['current', LINUX_VISUAL_COMPAT_CSS_CURRENT],
  ['26.406', LINUX_VISUAL_COMPAT_CSS_26_406],
  ['26.519', LINUX_VISUAL_COMPAT_CSS_26_519]
]) {
  test(`injectLinuxVisualCompatCssPatch adds Linux sidebar rendering overrides to the ${label} stylesheet`, () => {
    const updated = injectLinuxVisualCompatCssPatch(fixture);

    assert.match(updated, /codexLinuxVisualCompat/);
    assert.match(updated, /codex-linux-visual-compat/);
    assert.match(updated, /background:var\(--color-token-side-bar-background\)!important/);
    assert.match(updated, /\.app-shell-left-panel/);
    assert.match(updated, /transition:none!important/);
    assert.match(updated, /\.no-underline\\!/);
    assert.match(updated, /\[data-codex-linux-browser-viewport\]/);
    assert.match(updated, /\.codex-linux-browser-viewport-surface/);
    assert.match(updated, /codexLinuxRightPanelTabsVisible/);
    assert.match(updated, /codexLinuxRightPanelHeaderPassthrough/);
    assert.match(updated, /codexLinuxRightPanelHeaderOffset/);
    assert.match(updated, /\[data-app-shell-focus-area=right-panel\] div:has\(>\[data-app-shell-tab-strip-controller\]\)/);
    assert.match(updated, /\[data-app-shell-focus-area=right-panel\] \[data-app-shell-tab-strip-controller\]/);
    assert.match(updated, /\[data-app-shell-tab-strip-controller\] \[role=tablist\]/);
    assert.match(updated, /\[data-app-shell-tab-strip-controller\] \[data-app-shell-tab-controller\]/);
    assert.match(updated, /\[data-app-shell-tab-strip-controller\] \[role=tab\]/);
    assert.match(updated, /\[data-app-shell-tab-strip-controller\] div:has\(>button:not\(\[role=tab\]\)\)/);
    assert.match(
      updated,
      /\[data-app-shell-focus-area=right-panel\] div:has\(>\[data-app-shell-tab-strip-controller\]\)>\[role=presentation\]/
    );
    assert.match(updated, /#browser-device-preset/);
    assert.match(updated, /#browser-device-preset option/);
    assert.match(updated, /min-height:var\(--height-toolbar\)!important/);
    assert.match(updated, /z-index:45!important/);
    assert.match(updated, /z-index:46!important/);
    assert.match(updated, /flex:0 1 auto!important/);
    assert.match(updated, /max-width:calc\(100% - 104px\)!important/);
    assert.match(updated, /flex:0 1 max-content!important/);
    assert.match(updated, /max-width:none!important/);
    assert.match(updated, /overflow:hidden!important/);
    assert.match(updated, /min-width:0!important/);
    assert.match(updated, /pointer-events:none!important/);
    assert.match(updated, /margin-top:var\(--height-toolbar\)!important/);
    assert.match(updated, /background:transparent!important/);
    assert.match(updated, /background-color:transparent!important/);
    assert.match(updated, /background-image:none!important/);
    assert.match(updated, /pointer-events:auto!important/);
    assert.match(updated, /flex:0 0 max-content!important/);
    assert.match(updated, /min-width:max-content!important/);
    assert.match(updated, /width:max-content!important/);
    assert.match(updated, /max-width:14rem!important/);
    assert.match(updated, /width:auto!important/);
    assert.match(updated, /max-width:100%!important/);
    assert.match(updated, /flex:0 0 28px!important/);
    assert.match(updated, /position:relative!important/);
    assert.match(updated, /margin-left:0!important/);
    assert.match(updated, /color-scheme:dark!important/);
    assert.match(
      updated,
      /background:var\(--color-token-main-surface-primary,var\(--color-background-surface-under\)\)!important/
    );
    assert.match(
      updated,
      /color:var\(--color-token-text-primary,var\(--color-token-foreground\)\)!important/
    );
    assert.doesNotMatch(updated, /position:sticky!important/);
    assert.doesNotMatch(updated, /min-width:min\(10rem,calc\(100% - 40px\)\)!important/);
    assert.doesNotMatch(updated, /max-width:min\(14rem,calc\(100% - 40px\)\)!important/);
    assert.match(
      updated,
      /\[data-browser-comment-editor-surface\]:not\(:has\(\[data-browser-comment-design-prompt-shell\]\)\)/
    );
    assert.match(updated, /codexLinuxBrowserAdjustEditorSurface/);
    assert.match(updated, /codexLinuxBrowserCommentComposerLayout/);
    assert.match(updated, /flex-wrap:wrap!important/);
    assert.match(updated, /align-content:flex-start!important/);
    assert.match(updated, /align-items:flex-start!important/);
    assert.match(updated, /min-height:72px!important/);
    assert.match(updated, /max-height:clamp\(72px,28vh,180px\)!important/);
    assert.match(updated, /\:is\(textarea,\[contenteditable=true\],\[role=textbox\]\)/);
    assert.match(updated, /order:1!important/);
    assert.match(updated, /flex:1 1 100%!important/);
    assert.match(updated, /width:100%!important/);
    assert.match(updated, /min-width:0!important/);
    assert.match(updated, /max-width:100%!important/);
    assert.match(updated, /max-height:calc\(180px - 56px\)!important/);
    assert.match(updated, /overflow:auto!important/);
    assert.match(updated, /overflow-wrap:anywhere!important/);
    assert.match(updated, /word-break:break-word!important/);
    assert.match(updated, /white-space:pre-wrap!important/);
    assert.match(updated, /button:not\(:has\(svg\)\)/);
    assert.match(updated, /order:2!important/);
    assert.match(updated, /align-self:flex-end!important/);
    assert.match(updated, /margin-left:auto!important/);
    assert.match(updated, /\.codex-linux-visual-compat:not\(\.compact-window\)\{/);
    assert.match(updated, /\.codex-linux-visual-compat:not\(\.compact-window\) body\{/);
    assert.match(updated, /\.codex-linux-visual-compat\.compact-window,\n\[data-codex-window-type=electron\]\[data-codex-os=linux\]\.codex-linux-visual-compat\.compact-window body\{/);
    assert.match(updated, /background:transparent!important/);
    assert.doesNotMatch(
      updated,
      /\.codex-linux-visual-compat\.compact-window body\{\s*background:var\(--color-background-surface-under\)!important/
    );
    assert.doesNotMatch(updated, /\.window-fx-sidebar-surface \*/);
    assert.doesNotMatch(updated, /animation:none!important/);
  });
}

test('injectLinuxVisualCompatJsPatch supports the 26.519 opaque window effect shape', () => {
  const updated = injectLinuxVisualCompatJsPatch(LINUX_VISUAL_COMPAT_JS_26_519);

  assert.match(updated, /codexLinuxVisualCompat/);
  assert.match(updated, /codexLinuxRightPanelTabMetrics/);
  assert.match(updated, /classList\.toggle\(`codex-linux-visual-compat`,r\)/);
  assert.match(updated, /data-app-shell-focus-area=right-panel/);
  assert.match(updated, /getBoundingClientRect\(\)\.width/);
  assert.match(updated, /style\.setProperty\(`width`/);
  assert.match(updated, /style\.setProperty\(`flex`/);
  assert.match(updated, /\(g\.opaqueWindows\|\|i\|\|r\)&&!pc\(\)/);
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

for (const [label, fixture, opaqueGuard] of [
  ['current', LINUX_VISUAL_COMPAT_JS_CURRENT, 'XZ'],
  ['26.406', LINUX_VISUAL_COMPAT_JS_26_406, 'xY'],
  ['26.409', LINUX_VISUAL_COMPAT_JS_26_409, 'wX']
]) {
  test(`injectLinuxVisualCompatJsPatch enables Linux visual compat class and opaque windows in the ${label} script`, () => {
    const updated = injectLinuxVisualCompatJsPatch(fixture);

    assert.match(updated, /codexLinuxVisualCompat/);
    assert.match(updated, /CODEX_DESKTOP_DISABLE_LINUX_VISUAL_COMPAT/);
    assert.match(updated, /classList\.toggle\(`codex-linux-visual-compat`,r\)/);
    assert.match(updated, new RegExp(String.raw`\(T\.opaqueWindows\|\|r\)&&!${opaqueGuard}\(\)`));
  });
}

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

test('injectLinuxBrowserViewportSurfacePatch makes the Browser native viewport transparent', () => {
  const updated = injectLinuxBrowserViewportSurfacePatch(
    LINUX_BROWSER_VIEWPORT_SURFACE_BUNDLE_26_519
  );

  assert.match(updated, /codexLinuxBrowserViewportSurface/);
  assert.match(updated, /codexLinuxBrowserWebviewPanelHost/);
  assert.match(updated, /codexLinuxBrowserWebviewVisibleWhenUrl/);
  assert.match(updated, /"data-codex-linux-browser-viewport":!0/);
  assert.match(updated, /codex-linux-browser-viewport-surface/);
  assert.match(updated, /hostRef:codexLinuxBrowserWebviewHostRef/);
  assert.match(updated, /sync\(\{bounds:e,isVisible:r,scale:i,windowZoom:s\},o,codexLinuxBrowserWebviewHostRef\)/);
  assert.match(updated, /hostRef:N,windowZoom:T/);
  assert.match(updated, /isVisible:p\|\|ct!=null\/\* codexLinuxBrowserWebviewVisibleWhenUrl \*\//);
  assert.match(updated, /style:\{backgroundColor:Qt\}/);
});

test('injectLinuxBrowserViewportSurfacePatch supports 26.601 imported webview components', () => {
  const updated = injectLinuxBrowserViewportSurfacePatch(
    LINUX_BROWSER_VIEWPORT_SURFACE_BUNDLE_26_601
  );

  assert.match(updated, /codexLinuxBrowserViewportSurface/);
  assert.match(updated, /"data-codex-linux-browser-viewport":!0/);
  assert.match(updated, /codex-linux-browser-viewport-surface/);
  assert.match(updated, /isVisible:d\|\|X\.url\.length>0\/\* codexLinuxBrowserWebviewVisibleWhenUrl \*\//);
  assert.doesNotMatch(updated, /codexLinuxBrowserWebviewPanelHost/);
});

test('injectLinuxBrowserViewportSurfacePatch supports 26.608 retained webview manager', () => {
  const updated = injectLinuxBrowserViewportSurfacePatch(
    LINUX_BROWSER_VIEWPORT_SURFACE_BUNDLE_26_608
  );

  assert.match(updated, /codexLinuxBrowserViewportSurface/);
  assert.match(updated, /"data-codex-linux-browser-viewport":!0/);
  assert.match(updated, /codex-linux-browser-viewport-surface/);
  assert.match(updated, /isVisible:p\|\|X\.url\.length>0\/\* codexLinuxBrowserWebviewVisibleWhenUrl \*\//);
  assert.match(updated, /\.getRetainedWebview\(/);
  assert.doesNotMatch(updated, /codexLinuxBrowserWebviewPanelHost/);
});

test('injectLinuxBrowserViewportSurfacePatch is idempotent', () => {
  const once = injectLinuxBrowserViewportSurfacePatch(LINUX_BROWSER_VIEWPORT_SURFACE_BUNDLE_26_519);
  const twice = injectLinuxBrowserViewportSurfacePatch(once);

  assert.equal(twice, once);
});

test('applyLinuxBrowserViewportSurfacePatch skips patching when disabled', () => {
  const result = applyLinuxBrowserViewportSurfacePatch(LINUX_BROWSER_VIEWPORT_SURFACE_BUNDLE_26_519, {
    skip: true
  });

  assert.equal(result.updated, LINUX_BROWSER_VIEWPORT_SURFACE_BUNDLE_26_519);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxBrowserViewportSurfacePatch reports diagnostics when anchors are missing', () => {
  assert.throws(
    () => injectLinuxBrowserViewportSurfacePatch('const noop = true;', { sourceName: 'browser.js' }),
    {
      message:
        /Could not patch the renderer Browser viewport surface for Linux\. Source: browser\.js\. Missing anchors: browser sidebar sync event marker, browser webview ref prop, browser viewport surface div, browser webview panel host signature, browser webview panel host sync, browser webview panel host call, browser webview visible-when-url prop\. Detected anchors: browserSyncMessage=no, webviewRefProp=no, viewportSurface=no, webviewPanelHostSignature=no, webviewPanelHostSync=no, webviewPanelHostCall=no, webviewVisibleWhenUrl=no\./
    }
  );
});

test('patchRendererLinuxBrowserViewportSurfaceBundle patches the Browser side panel bundle', async () => {
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codex-browser-viewport-surface-ok-')
  );
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    const bundlePath = path.join(assetsDir, 'thread-side-panel-tabs.js');
    await fs.promises.writeFile(bundlePath, LINUX_BROWSER_VIEWPORT_SURFACE_BUNDLE_26_519, 'utf8');

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererLinuxBrowserViewportSurfaceBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'applied',
      sourceName: 'thread-side-panel-tabs.js'
    });
    assert.match(
      await fs.promises.readFile(bundlePath, 'utf8'),
      /data-codex-linux-browser-viewport/
    );
    assert.match(await fs.promises.readFile(bundlePath, 'utf8'), /codexLinuxBrowserWebviewPanelHost/);
    assert.match(await fs.promises.readFile(bundlePath, 'utf8'), /codexLinuxBrowserWebviewVisibleWhenUrl/);
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('injectLinuxBrowserWebviewStackingPatch lifts the Browser native webview above app surfaces', () => {
  const updated = injectLinuxBrowserWebviewStackingPatch(
    LINUX_BROWSER_WEBVIEW_STACKING_BUNDLE_WITH_CAPTURE_26_519
  );

  assert.match(updated, /codexLinuxBrowserWebviewStacking/);
  assert.match(updated, /codexLinuxBrowserWebviewCaptureSurface/);
  assert.match(updated, /codexLinuxBrowserWebviewVisibleCaptureSurface/);
  assert.match(updated, /codexLinuxBrowserWebviewHostAttach/);
  assert.match(updated, /codexLinuxBrowserWebviewHostPosition/);
  assert.match(updated, /codexLinuxBrowserWebviewHostContainer/);
  assert.match(updated, /codexLinuxBrowserWebviewDetachDelay/);
  assert.match(updated, /position:codexLinuxBrowserHost\?`absolute`:`fixed`/);
  assert.match(updated, /zIndex:codexLinuxBrowserHost\?`1`:`2147483646`/);
  assert.match(updated, /zIndex:M/);
  assert.match(updated, /this\.state\.isVisible&&e!=null/);
  assert.match(updated, /B\(this\.container,this\.webview,e/);
  assert.match(updated, /attachToLinuxHost\(codexLinuxBrowserWebviewHostRef\?\.current\)/);
  assert.match(updated, /this\.container\.dataset\.codexLinuxBrowserWebviewHost=`panel`/);
  assert.match(updated, /e\.dataset\.codexLinuxBrowserWebviewHost=`panel`/);
  assert.match(updated, /e\.append\(this\.container\)/);
  assert.doesNotMatch(updated, /document\.body\.append\(this\.container\)/);
});

test('injectLinuxBrowserWebviewStackingPatch is idempotent', () => {
  const once = injectLinuxBrowserWebviewStackingPatch(
    LINUX_BROWSER_WEBVIEW_STACKING_BUNDLE_WITH_CAPTURE_26_519
  );
  const twice = injectLinuxBrowserWebviewStackingPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxBrowserWebviewStackingPatch skips patching when disabled', () => {
  const result = applyLinuxBrowserWebviewStackingPatch(
    LINUX_BROWSER_WEBVIEW_STACKING_BUNDLE_WITH_CAPTURE_26_519,
    {
      skip: true
    }
  );

  assert.equal(result.updated, LINUX_BROWSER_WEBVIEW_STACKING_BUNDLE_WITH_CAPTURE_26_519);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxBrowserWebviewStackingPatch reports diagnostics when anchors are missing', () => {
  assert.throws(
    () =>
      injectLinuxBrowserWebviewStackingPatch('const noop = true;', {
        sourceName: 'browser-sidebar-manager.js'
      }),
    {
      message:
        /Could not patch the renderer Browser webview stacking for Linux\. Source: browser-sidebar-manager\.js\. Missing anchors: browser webview element, browser webview lifecycle log, visible webview style block, browser webview sync method, browser webview detach method, capture-surface visible branch\. Detected anchors: browserWebviewElement=no, browserWebviewLifecycleLog=no, visibleWebviewStyleBlock=no, webviewSyncMethod=no, webviewDetachMethod=no, captureSurfaceVisibleBranch=no\./
    }
  );
});

test('patchRendererLinuxBrowserWebviewStackingBundle patches the Browser manager bundle', async () => {
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codex-browser-webview-stacking-ok-')
  );
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    const bundlePath = path.join(assetsDir, 'browser-sidebar-manager.js');
    await fs.promises.writeFile(
      bundlePath,
      LINUX_BROWSER_WEBVIEW_STACKING_BUNDLE_WITH_CAPTURE_26_519,
      'utf8'
    );

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererLinuxBrowserWebviewStackingBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'applied',
      sourceName: 'browser-sidebar-manager.js'
    });
    assert.match(
      await fs.promises.readFile(bundlePath, 'utf8'),
      /codexLinuxBrowserWebviewStacking/
    );
    assert.match(
      await fs.promises.readFile(bundlePath, 'utf8'),
      /codexLinuxBrowserWebviewCaptureSurface/
    );
    assert.match(
      await fs.promises.readFile(bundlePath, 'utf8'),
      /codexLinuxBrowserWebviewVisibleCaptureSurface/
    );
    assert.match(await fs.promises.readFile(bundlePath, 'utf8'), /codexLinuxBrowserWebviewHostAttach/);
    assert.match(await fs.promises.readFile(bundlePath, 'utf8'), /codexLinuxBrowserWebviewHostPosition/);
    assert.match(await fs.promises.readFile(bundlePath, 'utf8'), /codexLinuxBrowserWebviewHostContainer/);
    assert.match(await fs.promises.readFile(bundlePath, 'utf8'), /codexLinuxBrowserWebviewDetachDelay/);
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('injectLinuxRightPanelPaneTabsPatch renders right panel tabs in the pane strip', () => {
  const updated = injectLinuxRightPanelPaneTabsPatch(LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_519);

  assert.match(updated, /codexLinuxRightPanelPaneTabs/);
  assert.match(updated, /codexLinuxRightPanelTabsFirst/);
  assert.match(updated, /codexLinuxRightPanelTabsFallback/);
  assert.match(updated, /headerHeight:`pane`/);
  assert.match(updated, /beforeList:n/);
  assert.match(updated, /afterList:\(0,Q\.jsxs\)\(Q\.Fragment,\{children:\[e,\(0,Q\.jsx\)\(Qt,\{\}\)\]\}\),controller:Ve/);
  assert.match(updated, /children:\[l,\/\* codexLinuxRightPanelTabsFirst \*\/e\]/);
  assert.match(updated, /l=C\(G\)\?\?\(0,Q\.jsx\)\(\$t,\{\}\)\/\* codexLinuxRightPanelTabsFallback \*\//);
  assert.doesNotMatch(updated, /right-panel-tab-bar-header-spacer/);
  assert.match(updated, /\(0,Q\.jsx\)\(Qt,\{\}\)/);
});

test('injectLinuxRightPanelPaneTabsPatch reorders 26.527 upstream pane tabs before right panel content', () => {
  const updated = injectLinuxRightPanelPaneTabsPatch(LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_527);

  assert.match(updated, /codexLinuxRightPanelTabsFirst/);
  assert.match(
    updated,
    /children:\[s,\/\* codexLinuxRightPanelTabsFirst \*\/e\]/
  );
  assert.doesNotMatch(updated, /children:\[e,s\]/);
  assert.doesNotMatch(updated, /codexLinuxRightPanelTabsFallback/);
  assert.match(updated, /headerHeight:`pane`/);
});

test('injectLinuxRightPanelPaneTabsPatch reorders 26.601 right panel tabs before content', () => {
  const updated = injectLinuxRightPanelPaneTabsPatch(LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_601);

  assert.match(updated, /codexLinuxRightPanelPaneTabs/);
  assert.match(updated, /codexLinuxRightPanelTabsFirst/);
  assert.match(updated, /headerHeight:`pane`/);
  assert.match(updated, /children:\[s,\/\* codexLinuxRightPanelTabsFirst \*\/e\]/);
  assert.doesNotMatch(updated, /children:\[e,s\]/);
});

test('injectLinuxRightPanelPaneTabsPatch reorders 26.602 renamed right panel outlet signal', () => {
  const updated = injectLinuxRightPanelPaneTabsPatch(LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_602);

  assert.match(updated, /codexLinuxRightPanelPaneTabs/);
  assert.match(updated, /codexLinuxRightPanelTabsFirst/);
  assert.match(updated, /children:\[s,\/\* codexLinuxRightPanelTabsFirst \*\/e\]/);
  assert.doesNotMatch(updated, /children:\[e,s\]/);
});

test('injectLinuxRightPanelPaneTabsPatch accepts 26.608 upstream toolbar tab strip', () => {
  const result = applyLinuxRightPanelPaneTabsPatch(LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_608);

  assert.equal(result.status, 'already-applied');
  assert.equal(result.updated, LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_608);
});

test('injectLinuxRightPanelPaneTabsPatch repairs old marked right panel slot order', () => {
  const desired = injectLinuxRightPanelPaneTabsPatch(LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_519);
  const oldInstalled = desired.replace(
    'children:[l,/* codexLinuxRightPanelTabsFirst */e]',
    'children:[e,/* codexLinuxRightPanelTabsFirst */l]'
  );

  const updated = injectLinuxRightPanelPaneTabsPatch(oldInstalled);

  assert.equal(updated, desired);
  assert.doesNotMatch(updated, /children:\[e,\/\* codexLinuxRightPanelTabsFirst \*\/l\]/);
});

test('injectLinuxRightPanelPaneTabsPatch repairs old marked 26.527 right panel slot order', () => {
  const desired = injectLinuxRightPanelPaneTabsPatch(LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_527);
  const oldInstalled = desired.replace(
    'children:[s,/* codexLinuxRightPanelTabsFirst */e]',
    'children:[e,/* codexLinuxRightPanelTabsFirst */s]'
  );

  const updated = injectLinuxRightPanelPaneTabsPatch(oldInstalled);

  assert.equal(updated, desired);
  assert.doesNotMatch(updated, /children:\[e,\/\* codexLinuxRightPanelTabsFirst \*\/s\]/);
});

test('injectLinuxRightPanelPaneTabsPatch is idempotent', () => {
  const once = injectLinuxRightPanelPaneTabsPatch(LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_519);
  const twice = injectLinuxRightPanelPaneTabsPatch(once);

  assert.equal(twice, once);
});

test('injectLinuxRightPanelPaneTabsPatch is idempotent for 26.527 upstream pane tabs', () => {
  const once = injectLinuxRightPanelPaneTabsPatch(LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_527);
  const twice = injectLinuxRightPanelPaneTabsPatch(once);

  assert.equal(twice, once);
});

test('injectLinuxRightPanelPaneTabsPatch is idempotent for 26.601 right panel order', () => {
  const once = injectLinuxRightPanelPaneTabsPatch(LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_601);
  const twice = injectLinuxRightPanelPaneTabsPatch(once);

  assert.equal(twice, once);
});

test('injectLinuxRightPanelPaneTabsPatch is idempotent for 26.602 right panel order', () => {
  const once = injectLinuxRightPanelPaneTabsPatch(LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_602);
  const twice = injectLinuxRightPanelPaneTabsPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxRightPanelPaneTabsPatch skips patching when disabled', () => {
  const result = applyLinuxRightPanelPaneTabsPatch(LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_519, {
    skip: true
  });

  assert.equal(result.updated, LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_519);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxRightPanelPaneTabsPatch reports diagnostics when anchors are missing', () => {
  assert.throws(
    () =>
      injectLinuxRightPanelPaneTabsPatch('const noop = true;', {
        sourceName: 'app-shell.js'
      }),
    {
      message:
        /Could not patch the renderer right panel pane tabs for Linux\. Source: app-shell\.js\. Missing anchors: right panel header spacer, right panel tabs export, right panel expand button, toolbar header height, header before-list spacer, header after-list spacer, right panel outlet order\. Detected anchors: rightPanelHeaderSpacer=no, rightPanelTabsExport=no, rightPanelExpandButton=no, toolbarHeaderHeight=no, headerBeforeList=no, headerAfterList=no, outletAfterSlot=no\./
    }
  );
});

test('patchRendererLinuxRightPanelPaneTabsBundle patches the app shell bundle', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-right-pane-tabs-ok-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    const bundlePath = path.join(assetsDir, 'app-shell.js');
    await fs.promises.writeFile(bundlePath, LINUX_RIGHT_PANEL_PANE_TABS_BUNDLE_26_519, 'utf8');

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererLinuxRightPanelPaneTabsBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'applied',
      sourceName: 'app-shell.js'
    });
    assert.match(await fs.promises.readFile(bundlePath, 'utf8'), /codexLinuxRightPanelPaneTabs/);
    assert.match(await fs.promises.readFile(bundlePath, 'utf8'), /codexLinuxRightPanelTabsFirst/);
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererLinuxVisualCompat skips incompatible JS anchors without aborting install', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-visual-compat-js-skip-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const cssPath = path.join(assetsDir, 'index.css');
    const jsPath = path.join(assetsDir, 'index.js');
    const incompatibleJs = `${LINUX_VISUAL_COMPAT_JS_26_409};document.documentElement.dataset.codexOs`.replace(
      'T.opaqueWindows&&!wX()',
      'T.opaqueWindows&&e.isConnected&&!wX()'
    );
    await fs.promises.writeFile(cssPath, LINUX_VISUAL_COMPAT_CSS_26_406, 'utf8');
    await fs.promises.writeFile(jsPath, incompatibleJs, 'utf8');

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererLinuxVisualCompat(extractedAppDir, logger);

    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'partial-or-unavailable');
    assert.equal(await fs.promises.readFile(jsPath, 'utf8'), incompatibleJs);
    assert.match(await fs.promises.readFile(cssPath, 'utf8'), /codexLinuxVisualCompat/);
    assert.equal(
      warnings.some((message) => message.includes('Skipping Linux visual-compat JS patch for index.js')),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('injectLinuxBrowserCommentPositionPatch adds Linux popup drift correction', () => {
  const updated = injectLinuxBrowserCommentPositionPatch(LINUX_BROWSER_COMMENT_POSITION_BUNDLE_CURRENT);

  assert.match(updated, /codexLinuxBrowserCommentPosition/);
  assert.match(updated, /CODEX_DESKTOP_DISABLE_LINUX_BROWSER_COMMENT_POSITION_PATCH/);
  assert.match(updated, /\.moveTo\(Math\.round\(a\),Math\.round\(o\)\)/);
  assert.match(updated, /\.resizeTo\(Math\.round\(s\),Math\.round\(c\)\)/);
  assert.match(updated, /overlayWindowBounds\.x/);
  assert.match(updated, /overlayWindowBounds\.y/);
  assert.match(updated, /Math\.min\(Math\.max\(N\.editorFrame\.x-a,0\),s\)/);
  assert.match(updated, /Math\.min\(Math\.max\(N\.editorFrame\.y-o,0\),c\)/);
});

test('injectLinuxBrowserCommentPositionPatch is idempotent', () => {
  const once = injectLinuxBrowserCommentPositionPatch(LINUX_BROWSER_COMMENT_POSITION_BUNDLE_CURRENT);
  const twice = injectLinuxBrowserCommentPositionPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxBrowserCommentPositionPatch skips patching when disabled', () => {
  const result = applyLinuxBrowserCommentPositionPatch(LINUX_BROWSER_COMMENT_POSITION_BUNDLE_CURRENT, {
    skip: true
  });

  assert.equal(result.updated, LINUX_BROWSER_COMMENT_POSITION_BUNDLE_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxBrowserCommentPositionPatch reports diagnostics when anchors are missing', () => {
  assert.throws(
    () =>
      injectLinuxBrowserCommentPositionPatch('const noop = true;', {
        sourceName: 'use-model-settings.js'
      }),
    {
      message:
        /Could not patch the renderer browser comment positioning bundle for Linux\. Source: use-model-settings\.js\. Missing anchors: overlay session event marker, overlay window bounds payload, popup window binding, popup window open block, editor frame style assignment\. Detected anchors: overlaySessionMessage=no, overlayBoundsPayload=no, popupWindowBinding=no, popupOpenCall=no, editorFrameAssignment=no\./
    }
  );
});

test('patchRendererLinuxBrowserCommentPositionBundle skips when anchors are incompatible', async () => {
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codex-browser-comment-anchor-mismatch-')
  );
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    const bundlePath = path.join(assetsDir, 'use-model-settings.js');
    const incompatibleBundle = LINUX_BROWSER_COMMENT_POSITION_BUNDLE_CURRENT.replace(
      'popupWindow:F',
      'popup:F'
    );
    await fs.promises.writeFile(bundlePath, incompatibleBundle, 'utf8');

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererLinuxBrowserCommentPositionBundle(extractedAppDir, logger);

    assert.deepEqual(result.status, 'skipped');
    assert.deepEqual(result.reason, 'anchor-mismatch');
    assert.equal(result.sourceName, 'use-model-settings.js');
    assert.match(
      result.details ?? '',
      /Could not patch the renderer browser comment positioning bundle for Linux/
    );
    assert.equal(await fs.promises.readFile(bundlePath, 'utf8'), incompatibleBundle);
    assert.equal(
      warnings.some((message) =>
        message.includes(
          'Skipping Linux browser-comment positioning patch for use-model-settings.js'
        )
      ),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererLinuxBrowserCommentPositionBundle skips when no candidate bundle exists', async () => {
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codex-browser-comment-no-candidate-')
  );
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    await fs.promises.writeFile(path.join(assetsDir, 'index.js'), 'const noop = true;', 'utf8');

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererLinuxBrowserCommentPositionBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'skipped',
      reason: 'bundle-not-found'
    });
    assert.equal(
      warnings.includes(
        'Skipping Linux browser-comment positioning patch because no renderer candidate bundle was detected.'
      ),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('injectLinuxBrowserCommentSubmitModePatch defaults browser annotations to saved notes', () => {
  const updated = injectLinuxBrowserCommentSubmitModePatch(
    LINUX_BROWSER_COMMENT_SUBMIT_MODE_BUNDLE_CURRENT
  );

  assert.match(updated, /codexLinuxBrowserCommentSubmitMode/);
  assert.match(updated, /defaultCreateSubmitMode:`saved`/);
  assert.doesNotMatch(updated, /defaultCreateSubmitMode:`direct`/);
  assert.match(updated, /submitDirectly:!0/);
});

test('injectLinuxBrowserCommentSubmitModePatch supports the 26.519 fallback default shape', () => {
  const updated = injectLinuxBrowserCommentSubmitModePatch(
    LINUX_BROWSER_COMMENT_SUBMIT_MODE_BUNDLE_26_519
  );

  assert.match(updated, /codexLinuxBrowserCommentSubmitMode/);
  assert.match(updated, /s=i===void 0\?`saved`:i/);
  assert.doesNotMatch(updated, /s=i===void 0\?`direct`:i/);
  assert.match(updated, /submitDirectly:!0/);
});

test('injectLinuxBrowserCommentSubmitModePatch patches the 26.519 Browser caller override', () => {
  const updated = injectLinuxBrowserCommentSubmitModePatch(
    LINUX_BROWSER_COMMENT_SUBMIT_MODE_CALLER_BUNDLE_26_519
  );

  assert.match(updated, /codexLinuxBrowserCommentSubmitMode/);
  assert.match(updated, /defaultCreateSubmitMode:`saved`/);
  assert.doesNotMatch(updated, /defaultCreateSubmitMode:vt\?`saved`:`direct`/);
  assert.match(updated, /submitDirectly:!0/);
});

test('injectLinuxBrowserCommentSubmitModePatch is idempotent', () => {
  const once = injectLinuxBrowserCommentSubmitModePatch(
    LINUX_BROWSER_COMMENT_SUBMIT_MODE_BUNDLE_CURRENT
  );
  const twice = injectLinuxBrowserCommentSubmitModePatch(once);

  assert.equal(twice, once);
});

test('applyLinuxBrowserCommentSubmitModePatch skips patching when disabled', () => {
  const result = applyLinuxBrowserCommentSubmitModePatch(
    LINUX_BROWSER_COMMENT_SUBMIT_MODE_BUNDLE_CURRENT,
    { skip: true }
  );

  assert.equal(result.updated, LINUX_BROWSER_COMMENT_SUBMIT_MODE_BUNDLE_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxBrowserCommentSubmitModePatch reports diagnostics when anchors are missing', () => {
  assert.throws(
    () =>
      injectLinuxBrowserCommentSubmitModePatch('const noop = true;', {
        sourceName: 'composer.js'
      }),
    {
      message:
        /Could not patch the renderer browser comment submit mode bundle for Linux\. Source: composer\.js\. Missing anchors: overlay submit event marker, default create submit mode prop, direct create submit mode value\. Detected anchors: overlaySubmitMessage=no, submitModeProp=no, directSubmitMode=no\./
    }
  );
});

test('patchRendererLinuxBrowserCommentSubmitModeBundle patches the composer bundle', async () => {
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codex-browser-comment-submit-mode-ok-')
  );
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    const bundlePath = path.join(assetsDir, 'composer.js');
    await fs.promises.writeFile(bundlePath, LINUX_BROWSER_COMMENT_SUBMIT_MODE_BUNDLE_CURRENT, 'utf8');

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererLinuxBrowserCommentSubmitModeBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'applied',
      sourceName: 'composer.js'
    });
    assert.match(await fs.promises.readFile(bundlePath, 'utf8'), /defaultCreateSubmitMode:`saved`/);
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('injectLinuxBrowserCommentSubmitCleanupPatch clears browser annotation pill immediately', () => {
  const updated = injectLinuxBrowserCommentSubmitCleanupPatch(
    LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_BUNDLE_26_601
  );

  assert.match(updated, /codexLinuxBrowserCommentSubmitCleanup/);
  assert.match(updated, /onCommentsChange:\(\)=>\{\}\}\),va\(rc\(pi\)\)/);
  assert.match(updated, /va\(rc\(pi\)\)\/\* codexLinuxBrowserCommentSubmitCleanup \*\/,vc\(p,u\)/);
  assert.doesNotMatch(updated, /let x=await bc\(v,void 0,U,h\?\?void 0\);vc\(p,u\),xn\(!0\)/);
});

test('injectLinuxBrowserCommentSubmitCleanupPatch is idempotent', () => {
  const once = injectLinuxBrowserCommentSubmitCleanupPatch(
    LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_BUNDLE_26_601
  );
  const twice = injectLinuxBrowserCommentSubmitCleanupPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxBrowserCommentSubmitCleanupPatch skips patching when disabled', () => {
  const result = applyLinuxBrowserCommentSubmitCleanupPatch(
    LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_BUNDLE_26_601,
    { skip: true }
  );

  assert.equal(result.updated, LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_BUNDLE_26_601);
  assert.equal(result.status, 'skipped');
});

test('injectLinuxBrowserCommentSubmitCleanupPatch reports diagnostics when anchors are missing', () => {
  assert.throws(
    () =>
      injectLinuxBrowserCommentSubmitCleanupPatch('const noop = true;', {
        sourceName: 'composer.js'
      }),
    {
      message:
        /Could not patch the renderer browser comment submit mode bundle for Linux\. Source: composer\.js\. Missing anchors: overlay submit event marker, comment attachments field, submit context creation block, browser comment cleanup state, browser comment attachment filter\. Detected anchors: overlaySubmitMessage=no, commentAttachments=no, submitContext=no, cleanupState=no, browserCommentFilter=no\./
    }
  );
});

test('patchRendererLinuxBrowserCommentSubmitCleanupBundle patches the composer bundle', async () => {
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codex-browser-comment-submit-cleanup-ok-')
  );
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    const bundlePath = path.join(assetsDir, 'composer.js');
    await fs.promises.writeFile(
      bundlePath,
      LINUX_BROWSER_COMMENT_SUBMIT_CLEANUP_BUNDLE_26_601,
      'utf8'
    );

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererLinuxBrowserCommentSubmitCleanupBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'applied',
      sourceName: 'composer.js'
    });
    assert.match(
      await fs.promises.readFile(bundlePath, 'utf8'),
      /codexLinuxBrowserCommentSubmitCleanup/
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

for (const [label, fixture, expectedGate] of [
  [
    'current',
    BACKGROUND_SUBAGENTS_PANEL_BUNDLE_CURRENT,
    /Bn=Ye\.length>0&&!\$e&&\(typeof process<`u`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH===`1`\?zn:!1\)&&!it&&!tt/
  ],
  [
    '26.417',
    BACKGROUND_SUBAGENTS_PANEL_BUNDLE_26_417,
    /In=Xe\.length>0&&!tt&&\(typeof process<`u`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH===`1`\?Fn:!1\)&&!st&&!it/
  ],
  [
    '26.513',
    BACKGROUND_SUBAGENTS_PANEL_BUNDLE_26_513,
    /kn=Ge\.length>0&&\(typeof process<`u`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH===`1`\?!mo:!1\)/
  ]
]) {
  test(`injectLinuxBackgroundSubagentsPanelPatch relaxes the inline composer gate for the ${label} subagent rows`, () => {
    const updated = injectLinuxBackgroundSubagentsPanelPatch(fixture);

    assert.match(updated, /codexLinuxBackgroundSubagentsPanel/);
    assert.match(updated, /CODEX_DESKTOP_DISABLE_LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH/);
    assert.match(updated, expectedGate);
  });
}

test('injectLinuxBackgroundSubagentsPanelPatch treats the 26.513 relaxed gate as applied', () => {
  const updated = injectLinuxBackgroundSubagentsPanelPatch(
    BACKGROUND_SUBAGENTS_PANEL_BUNDLE_26_513_ALREADY_RELAXED
  );

  assert.equal(updated, BACKGROUND_SUBAGENTS_PANEL_BUNDLE_26_513_ALREADY_RELAXED);
});

test('injectLinuxBackgroundSubagentsPanelPatch ignores unrelated false gates', () => {
  const updated = injectLinuxBackgroundSubagentsPanelPatch(
    `let aa=bb.length>0&&!1;${BACKGROUND_SUBAGENTS_PANEL_BUNDLE_26_513}`
  );

  assert.match(updated, /codexLinuxBackgroundSubagentsPanel/);
  assert.match(
    updated,
    /kn=Ge\.length>0&&\(typeof process<`u`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH===`1`\?!mo:!1\)/
  );
});

test('injectLinuxBackgroundSubagentsPanelPatch supports distant 26.513 placeholder state', () => {
  const distantFixture = BACKGROUND_SUBAGENTS_PANEL_BUNDLE_26_513.replace(
    ',An=Ye||we||Te||ct!=null||On||Xe,wc=',
    `,An=Ye||we||Te||ct!=null||On||Xe,${'noop;'.repeat(6000)}wc=`
  );
  const updated = injectLinuxBackgroundSubagentsPanelPatch(distantFixture);

  assert.match(updated, /codexLinuxBackgroundSubagentsPanel/);
  assert.match(
    updated,
    /kn=Ge\.length>0&&\(typeof process<`u`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH===`1`\?!mo:!1\)/
  );
});

test('injectLinuxBackgroundSubagentsPanelPatch is idempotent', () => {
  const once = injectLinuxBackgroundSubagentsPanelPatch(BACKGROUND_SUBAGENTS_PANEL_BUNDLE_CURRENT);
  const twice = injectLinuxBackgroundSubagentsPanelPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxBackgroundSubagentsPanelPatch skips patching when disabled', () => {
  const result = applyLinuxBackgroundSubagentsPanelPatch(
    BACKGROUND_SUBAGENTS_PANEL_BUNDLE_CURRENT,
    { skip: true }
  );

  assert.equal(result.updated, BACKGROUND_SUBAGENTS_PANEL_BUNDLE_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('patchRendererBackgroundSubagentsPanelBundle patches the composer gate bundle', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-background-subagents-ok-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    const bundlePath = path.join(assetsDir, 'index.js');
    await fs.promises.writeFile(bundlePath, BACKGROUND_SUBAGENTS_PANEL_BUNDLE_CURRENT, 'utf8');

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererBackgroundSubagentsPanelBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'applied',
      sourceName: 'index.js'
    });
    assert.match(
      await fs.promises.readFile(bundlePath, 'utf8'),
      /CODEX_DESKTOP_DISABLE_LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH/
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererBackgroundSubagentsPanelBundle patches the 26.417 composer gate bundle', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-background-subagents-26417-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    const bundlePath = path.join(assetsDir, 'index.js');
    await fs.promises.writeFile(bundlePath, BACKGROUND_SUBAGENTS_PANEL_BUNDLE_26_417, 'utf8');

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererBackgroundSubagentsPanelBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'applied',
      sourceName: 'index.js'
    });
    assert.match(
      await fs.promises.readFile(bundlePath, 'utf8'),
      /In=Xe\.length>0&&!tt&&\(typeof process<`u`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH===`1`\?Fn:!1\)&&!st&&!it/
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererBackgroundSubagentsPanelBundle skips when anchors are incompatible', async () => {
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codex-background-subagents-mismatch-')
  );
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(assetsDir, 'index.js'),
      BACKGROUND_SUBAGENTS_PANEL_BUNDLE_INCOMPATIBLE,
      'utf8'
    );

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererBackgroundSubagentsPanelBundle(extractedAppDir, logger);

    assert.deepEqual(result.status, 'skipped');
    assert.deepEqual(result.reason, 'anchor-mismatch');
    assert.equal(result.sourceName, 'index.js');
    assert.match(
      result.details ?? '',
      /Could not patch the renderer background subagents panel bundle for Linux/
    );
    assert.equal(
      warnings.some((message) =>
        message.includes('Skipping Linux background subagents panel patch for index.js')
      ),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererBackgroundSubagentsPanelBundle skips when no candidate bundle exists', async () => {
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codex-background-subagents-no-candidate-')
  );
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    await fs.promises.writeFile(path.join(assetsDir, 'index.js'), 'const noop = true;', 'utf8');

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererBackgroundSubagentsPanelBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'skipped',
      reason: 'bundle-not-found'
    });
    assert.equal(
      warnings.includes(
        'Skipping Linux background subagents panel patch because no renderer candidate bundle was detected.'
      ),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('injectLinuxLatestAgentTurnExpansionPatch keeps the newest completed agent turn expanded by default', () => {
  const updated = injectLinuxLatestAgentTurnExpansionPatch(
    LATEST_AGENT_TURN_EXPANSION_BUNDLE_CURRENT
  );

  assert.match(updated, /codexLinuxLatestAgentTurnExpanded/);
  assert.match(
    updated,
    /persistedCollapsed:\/\* codexLinuxLatestAgentTurnExpanded \*\/S\?\(l\?\?!1\):l/
  );
});

test('injectLinuxLatestAgentTurnExpansionPatch supports 26.417 latest-turn drift', () => {
  const updated = injectLinuxLatestAgentTurnExpansionPatch(
    LATEST_AGENT_TURN_EXPANSION_BUNDLE_26_417
  );

  assert.match(updated, /codexLinuxLatestAgentTurnExpanded/);
  assert.match(
    updated,
    /persistedCollapsed:\/\* codexLinuxLatestAgentTurnExpanded \*\/S\?\(l\?\?!1\):l\}\),Ve=ze\?Ude\(je\):je/
  );
});

test('injectLinuxLatestAgentTurnExpansionPatch is idempotent', () => {
  const once = injectLinuxLatestAgentTurnExpansionPatch(
    LATEST_AGENT_TURN_EXPANSION_BUNDLE_CURRENT
  );
  const twice = injectLinuxLatestAgentTurnExpansionPatch(once);

  assert.equal(twice, once);
});

test('applyLinuxLatestAgentTurnExpansionPatch skips patching when disabled', () => {
  const result = applyLinuxLatestAgentTurnExpansionPatch(
    LATEST_AGENT_TURN_EXPANSION_BUNDLE_CURRENT,
    { skip: true }
  );

  assert.equal(result.updated, LATEST_AGENT_TURN_EXPANSION_BUNDLE_CURRENT);
  assert.equal(result.status, 'skipped');
});

test('patchRendererLatestAgentTurnExpansionBundle patches the completed turn bundle', async () => {
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codex-latest-agent-turn-expansion-ok-')
  );
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    const bundlePath = path.join(assetsDir, 'index.js');
    await fs.promises.writeFile(bundlePath, LATEST_AGENT_TURN_EXPANSION_BUNDLE_CURRENT, 'utf8');

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererLatestAgentTurnExpansionBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'applied',
      sourceName: 'index.js'
    });
    assert.match(
      await fs.promises.readFile(bundlePath, 'utf8'),
      /persistedCollapsed:\/\* codexLinuxLatestAgentTurnExpanded \*\/S\?\(l\?\?!1\):l/
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererLatestAgentTurnExpansionBundle patches the 26.417 completed turn bundle', async () => {
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codex-latest-agent-turn-expansion-26417-')
  );
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    const bundlePath = path.join(assetsDir, 'index.js');
    await fs.promises.writeFile(bundlePath, LATEST_AGENT_TURN_EXPANSION_BUNDLE_26_417, 'utf8');

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererLatestAgentTurnExpansionBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'applied',
      sourceName: 'index.js'
    });
    assert.match(
      await fs.promises.readFile(bundlePath, 'utf8'),
      /persistedCollapsed:\/\* codexLinuxLatestAgentTurnExpanded \*\/S\?\(l\?\?!1\):l\}\),Ve=ze\?Ude\(je\):je/
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererLatestAgentTurnExpansionBundle skips when anchors are incompatible', async () => {
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codex-latest-agent-turn-expansion-mismatch-')
  );
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(assetsDir, 'index.js'),
      LATEST_AGENT_TURN_EXPANSION_BUNDLE_INCOMPATIBLE,
      'utf8'
    );

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererLatestAgentTurnExpansionBundle(extractedAppDir, logger);

    assert.deepEqual(result.status, 'skipped');
    assert.deepEqual(result.reason, 'anchor-mismatch');
    assert.equal(result.sourceName, 'index.js');
    assert.match(
      result.details ?? '',
      /Could not patch the renderer latest agent turn expansion bundle for Linux/
    );
    assert.equal(
      warnings.some((message) =>
        message.includes('Skipping Linux latest agent turn expansion patch for index.js')
      ),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererLatestAgentTurnExpansionBundle skips when no candidate bundle exists', async () => {
  const rootDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'codex-latest-agent-turn-expansion-no-candidate-')
  );
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    await fs.promises.writeFile(path.join(assetsDir, 'index.js'), 'const noop = true;', 'utf8');

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererLatestAgentTurnExpansionBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'skipped',
      reason: 'bundle-not-found'
    });
    assert.equal(
      warnings.includes(
        'Skipping Linux latest agent turn expansion patch because no renderer candidate bundle was detected.'
      ),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererCompactSlashCommandBundle verifies compact slash command support', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-compact-command-ok-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    await fs.promises.writeFile(path.join(assetsDir, 'index.js'), COMPACT_SLASH_COMMAND_BUNDLE_CURRENT, 'utf8');

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererCompactSlashCommandBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'already-applied',
      sourceName: 'index.js'
    });
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererCompactSlashCommandBundle verifies 26.429 compact command IPC action', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-compact-command-26429-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    await fs.promises.writeFile(path.join(assetsDir, 'composer.js'), COMPACT_SLASH_COMMAND_BUNDLE_26_429, 'utf8');

    const logger = {
      info() {},
      warn() {}
    };

    const result = await patchRendererCompactSlashCommandBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'already-applied',
      sourceName: 'composer.js'
    });
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererCompactSlashCommandBundle skips when compact command anchors are incompatible', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-compact-command-mismatch-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(assetsDir, 'index.js'),
      COMPACT_SLASH_COMMAND_BUNDLE_INCOMPATIBLE,
      'utf8'
    );

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererCompactSlashCommandBundle(extractedAppDir, logger);

    assert.deepEqual(result.status, 'skipped');
    assert.deepEqual(result.reason, 'anchor-mismatch');
    assert.equal(result.sourceName, 'index.js');
    assert.match(
      result.details ?? '',
      /Could not verify compact slash command support in renderer bundle for Linux/
    );
    assert.equal(
      warnings.some((message) =>
        message.includes('Skipping Linux compact slash command verification for index.js')
      ),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
});

test('patchRendererCompactSlashCommandBundle skips when no candidate bundle exists', async () => {
  const rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-compact-command-no-candidate-'));
  try {
    const extractedAppDir = path.join(rootDir, 'extracted');
    const assetsDir = path.join(extractedAppDir, 'webview', 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });
    await fs.promises.writeFile(path.join(assetsDir, 'index.js'), 'const noop = true;', 'utf8');

    const warnings = [];
    const logger = {
      info() {},
      warn(message) {
        warnings.push(message);
      }
    };

    const result = await patchRendererCompactSlashCommandBundle(extractedAppDir, logger);

    assert.deepEqual(result, {
      status: 'skipped',
      reason: 'bundle-not-found'
    });
    assert.equal(
      warnings.some((message) =>
        message.includes(
          'Skipping Linux compact slash command verification because no renderer candidate bundle was detected.'
        )
      ),
      true
    );
  } finally {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  }
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
  assert.match(script, /ozone_hint="\$\{CODEX_DESKTOP_OZONE_PLATFORM_HINT:-x11\}"/);
  assert.match(script, /--ozone-platform=/);
  assert.doesNotMatch(script, /--ozone-platform-hint=/);
  assert.match(script, /CODEX_DESKTOP_ENABLE_CHROMIUM_LOGGING/);
  assert.match(script, /runtime-launch-stable\.log/);
  assert.match(script, /install-diagnostic-manifest\.json/);
});

test('patchBetterSqlite3V8ExternalPointerTagSource adapts source for Electron 42 headers', async () => {
  const moduleRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'codex-better-sqlite3-'));
  await fs.promises.mkdir(path.join(moduleRoot, 'src', 'util'), { recursive: true });
  await fs.promises.writeFile(
    path.join(moduleRoot, 'package.json'),
    JSON.stringify({ name: 'better-sqlite3', version: '12.9.0' }),
    'utf8'
  );
  await fs.promises.writeFile(
    path.join(moduleRoot, 'src', 'better_sqlite3.cpp'),
    'v8::Local<v8::External> data = v8::External::New(isolate, addon);',
    'utf8'
  );
  await fs.promises.writeFile(
    path.join(moduleRoot, 'src', 'util', 'macros.cpp'),
    '#define OnlyAddon static_cast<Addon*>(info.Data().As<v8::External>()->Value())',
    'utf8'
  );
  await fs.promises.writeFile(
    path.join(moduleRoot, 'src', 'util', 'helpers.cpp'),
    'recv->InstanceTemplate()->SetNativeDataProperty(\n\t\t\tname,\n\t\t\tfunc,\n\t\t\t0,\n\t\t\tdata\n\t\t);',
    'utf8'
  );

  const first = await patchBetterSqlite3V8ExternalPointerTagSource(moduleRoot);
  const second = await patchBetterSqlite3V8ExternalPointerTagSource(moduleRoot);

  assert.equal(first.status, 'applied');
  assert.equal(second.status, 'already-applied');
  assert.match(
    await fs.promises.readFile(path.join(moduleRoot, 'src', 'better_sqlite3.cpp'), 'utf8'),
    /v8::External::New\(isolate, addon, v8::kExternalPointerTypeTagDefault\)/
  );
  assert.match(
    await fs.promises.readFile(path.join(moduleRoot, 'src', 'util', 'macros.cpp'), 'utf8'),
    /Value\(v8::kExternalPointerTypeTagDefault\)/
  );
  assert.match(
    await fs.promises.readFile(path.join(moduleRoot, 'src', 'util', 'helpers.cpp'), 'utf8'),
    /func,\n\t\t\tnullptr,\n\t\t\tdata/
  );
});

test('createInstallDiagnosticManifest includes release, runtime, native module, and patch state', () => {
  const bundledPlugins = {
    status: 'installed',
    marketplacePath:
      '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/plugins/openai-bundled/.agents/plugins/marketplace.json',
    pluginsRoot:
      '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/plugins/openai-bundled/plugins',
    marketplacePlugins: ['browser', 'chrome', 'computer-use', 'latex', 'sites'],
    installedPlugins: [
      {
        name: 'browser',
        version: '26.601.21317',
        path: '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/plugins/openai-bundled/plugins/browser'
      },
      {
        name: 'chrome',
        version: '26.601.21317',
        path: '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/plugins/openai-bundled/plugins/chrome'
      },
      {
        name: 'sites',
        version: '26.601.21317',
        path: '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/plugins/openai-bundled/plugins/sites'
      }
    ]
  };
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
    browserUseRuntime: {
      status: 'installed',
      nodeReplSourceKind: 'primary-runtime-cache',
      nodeReplSourcePath: '/home/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/node_repl',
      nodeSourceKind: 'path',
      nodeSourcePath: '/usr/bin/node'
    },
    browserUseNodeRepl: {
      status: 'installed',
      sourceKind: 'primary-runtime-cache',
      sourcePath: '/home/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/node_repl',
      targetPath: '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/node_repl'
    },
    browserUseNode: {
      status: 'installed',
      sourceKind: 'path',
      sourcePath: '/usr/bin/node',
      targetPath: '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/node'
    },
    chromeExtensionHost: {
      status: 'installed',
      targetPath: '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/chrome-extension-host',
      modulePath: '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/chrome-extension-host.mjs',
      nodePath: '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/node'
    },
    chromeNativeMessagingHost: {
      status: 'installed',
      manifestPath: '/home/user/.config/google-chrome/NativeMessagingHosts/com.openai.codexextension.json',
      hostName: 'com.openai.codexextension',
      extensionId: 'hehggadaopoacecdllhhajmbjkdcmajg'
    },
    chromeBundledPluginHost: {
      status: 'installed',
      targetPaths: [
        '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/plugins/openai-bundled/plugins/chrome/extension-host/linux/x64/extension-host'
      ],
      hostExecutablePath:
        '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/chrome-extension-host'
    },
    bundledPlugins,
    chromeExtensionHostCleanup: {
      status: 'terminated',
      terminatedPids: [1234],
      remainingPids: []
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
      linuxCloseCancel: {
        status: 'applied',
        sourceName: 'main.js'
      },
      linuxNotificationSound: {
        status: 'applied',
        sourceName: 'main.js'
      },
      linuxWorktreeEnvironmentMain: {
        status: 'applied',
        sourceName: 'main.js'
      },
      linuxWorktreeEnvironmentWorker: {
        status: 'applied',
        sourceName: 'worker.js'
      },
      linuxAvatarOverlay: {
        status: 'applied',
        sourceName: 'main.js'
      },
      linuxAvatarOverlayRenderer: {
        status: 'applied',
        sourceName: 'avatar-overlay-page.js'
      },
      terminalLifecycle: {
        status: 'applied',
        sourceName: 'index.js'
      },
      newThreadModel: {
        status: 'applied',
        sourceName: 'index.js'
      },
      todoProgress: {
        status: 'applied',
        sourceName: 'index.js'
      },
      linuxVisualCompat: {
        status: 'applied',
        sourceName: 'index.js'
      },
      linuxBrowserCommentPosition: {
        status: 'applied',
        sourceName: 'index.js'
      },
      linuxBrowserCommentSubmitMode: {
        status: 'applied',
        sourceName: 'index.js'
      },
      backgroundSubagentsPanel: {
        status: 'applied',
        sourceName: 'index.js'
      },
      latestAgentTurnExpansion: {
        status: 'applied',
        sourceName: 'index.js'
      },
      compactSlashCommand: {
        status: 'already-applied',
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
    browserUseRuntime: {
      status: 'installed',
      nodeReplSourceKind: 'primary-runtime-cache',
      nodeReplSourcePath: '/home/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/node_repl',
      nodeSourceKind: 'path',
      nodeSourcePath: '/usr/bin/node'
    },
    browserUseNodeRepl: {
      status: 'installed',
      sourceKind: 'primary-runtime-cache',
      sourcePath: '/home/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/node_repl',
      targetPath: '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/node_repl'
    },
    browserUseNode: {
      status: 'installed',
      sourceKind: 'path',
      sourcePath: '/usr/bin/node',
      targetPath: '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/node'
    },
    chromeExtensionHost: {
      status: 'installed',
      targetPath: '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/chrome-extension-host',
      modulePath: '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/chrome-extension-host.mjs',
      nodePath: '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/node'
    },
    chromeNativeMessagingHost: {
      status: 'installed',
      manifestPath: '/home/user/.config/google-chrome/NativeMessagingHosts/com.openai.codexextension.json',
      hostName: 'com.openai.codexextension',
      extensionId: 'hehggadaopoacecdllhhajmbjkdcmajg'
    },
    chromeBundledPluginHost: {
      status: 'installed',
      targetPaths: [
        '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/plugins/openai-bundled/plugins/chrome/extension-host/linux/x64/extension-host'
      ],
      hostExecutablePath:
        '/home/user/.local/share/codex-linux-app/channels/stable/app/resources/chrome-extension-host'
    },
    bundledPlugins,
    chromeExtensionHostCleanup: {
      status: 'terminated',
      terminatedPids: [1234],
      remainingPids: []
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
      linuxCloseCancel: {
        status: 'applied',
        sourceName: 'main.js'
      },
      linuxNotificationSound: {
        status: 'applied',
        sourceName: 'main.js'
      },
      linuxWorktreeEnvironmentMain: {
        status: 'applied',
        sourceName: 'main.js'
      },
      linuxWorktreeEnvironmentWorker: {
        status: 'applied',
        sourceName: 'worker.js'
      },
      linuxAvatarOverlay: {
        status: 'applied',
        sourceName: 'main.js'
      },
      linuxAvatarOverlayRenderer: {
        status: 'applied',
        sourceName: 'avatar-overlay-page.js'
      },
      terminalLifecycle: {
        status: 'applied',
        sourceName: 'index.js'
      },
      newThreadModel: {
        status: 'applied',
        sourceName: 'index.js'
      },
      todoProgress: {
        status: 'applied',
        sourceName: 'index.js'
      },
      linuxVisualCompat: {
        status: 'applied',
        sourceName: 'index.js'
      },
      linuxBrowserCommentPosition: {
        status: 'applied',
        sourceName: 'index.js'
      },
      linuxBrowserCommentSubmitMode: {
        status: 'applied',
        sourceName: 'index.js'
      },
      backgroundSubagentsPanel: {
        status: 'applied',
        sourceName: 'index.js'
      },
      latestAgentTurnExpansion: {
        status: 'applied',
        sourceName: 'index.js'
      },
      compactSlashCommand: {
        status: 'already-applied',
        sourceName: 'index.js'
      }
    }
  });
});
