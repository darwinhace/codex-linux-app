import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyLinuxCloseCancelPatch,
  applyLinuxOpenTargetsPatch,
  applyLinuxMenuBarPatch,
  applyLinuxNewThreadModelPatch,
  applyLinuxTerminalLifecyclePatch,
  applyLinuxTodoProgressPatch,
  applyLinuxVisualCompatCssPatch,
  applyLinuxVisualCompatJsPatch,
  buildWrapperScript,
  createInstallDiagnosticManifest,
  findExecutableInPath,
  injectLinuxCloseCancelPatch,
  injectLinuxOpenTargetsPatch,
  injectLinuxMenuBarPatch,
  injectLinuxNewThreadModelPatch,
  injectLinuxTerminalLifecyclePatch,
  injectLinuxTodoProgressPatch,
  injectLinuxVisualCompatCssPatch,
  injectLinuxVisualCompatJsPatch,
  patchRendererNewThreadModelBundle,
  patchRendererLinuxVisualCompat,
  patchRendererTodoProgressBundle,
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
const LINUX_CLOSE_CANCEL_BUNDLE_CURRENT =
  'function dp({isWindows:e,disableQuitConfirmationPrompt:n,quitState:r,windows:i,applicationMenuManager:a,ensureHostWindow:o,appEvent:d,errorReporter:f}){let p=!1,m=!1;t.app.on(`window-all-closed`,()=>{(process.platform===`darwin`&&!t.app.isPackaged||process.platform!==`darwin`&&!e)&&t.app.quit()}),t.app.on(`before-quit`,a=>{if(e||r.canQuitWithoutPrompt()||n){m=!0,i.markAppQuitting();return}let o=t.app.getName();if(t.dialog.showMessageBoxSync({type:`warning`,buttons:[`Quit`,`Cancel`],defaultId:0,cancelId:1,noLink:!0,title:`Quit ${o}?`,message:`Quit ${o}?`,detail:`Any local threads running on this machine will be interrupted and scheduled automations won\'t run`})!==0){a.preventDefault();return}r.markQuitApproved(),m=!0,i.markAppQuitting()}),t.app.on(`activate`,()=>{m||(i.showLastActivePrimaryWindow()||o(`local`),a.refresh())})}';
const TERMINAL_PANEL_BLOCK_LEGACY =
  'function vDe(e){let ee,te;t[29]!==n||t[30]!==i||t[31]!==r||t[32]!==o||t[33]!==m?(ee=()=>{let e=T.current;if(!e)return;let t=o??St.create({conversationId:n,hostId:r??null,cwd:i??null});O.current=t,k.current=!1;let a=!1,s=new nDe.Terminal({allowTransparency:!0,cursorStyle:`bar`,fontSize:j.current,allowProposedApi:!0,cursorBlink:!0,fontFamily:A.current,letterSpacing:0,lineHeight:1.2,theme:RQ()}),c=null,l=()=>{c??=requestAnimationFrame(()=>{c=null,s.scrollToBottom()})};E.current=s;let u=new aDe.ClipboardAddon,d=new iDe.FitAddon;D.current=d;let f=new rDe.WebLinksAddon(bDe);s.loadAddon(u),s.loadAddon(d),s.loadAddon(f),s.attachCustomKeyEventHandler(e=>lDe({clipboard:typeof navigator<`u`&&navigator.clipboard!=null&&m?navigator.clipboard:void 0,event:e,sendText:e=>{St.write(t,e)},term:s})),s.open(e);let p=n=>{a||e.isConnected&&requestAnimationFrame(()=>{a||e.isConnected&&(k.current?IQ(s,d,t):LQ(d),n?.())})};p(),M.current=!1;let h=St.register(t,{onInitLog:e=>{s.write(e),l()},onData:e=>{M.current||(M.current=!0,P(`Running`),I(null)),s.write(e),l()},onExit:()=>{a||P(`Exited`)},onError:e=>{a||(P(`Error`),I(e))},onAttach:(e,t)=>{a||(k.current=!0,P(`Running`),I(null),R(t??null),p())}}),g=s.onData(e=>{St.write(t,e)}),_=s.onKey(yDe);o&&requestAnimationFrame(()=>{a||St.attach({sessionId:o,conversationId:n,hostId:r??null,cwd:i??null,cols:s.cols,rows:s.rows})});let v=new ResizeObserver(()=>{p()});return v.observe(e),()=>{a=!0,c!=null&&(cancelAnimationFrame(c),c=null),v.disconnect(),g.dispose(),_.dispose(),h(),D.current=null,O.current=null,k.current=!1,o||St.close(t),s.dispose(),E.current=null}},te=[n,i,r,o,m],t[29]=n,t[30]=i,t[31]=r,t[32]=o,t[33]=m,t[34]=ee,t[35]=te):(ee=t[34],te=t[35]),(0,Z.useEffect)(ee,te);return(0,$.jsx)(`div`,{"data-codex-terminal":!0})}';
const TERMINAL_PANEL_BLOCK_CURRENT =
  'let ee,te;t[29]!==n||t[30]!==i||t[31]!==r||t[32]!==o||t[33]!==m?(ee=()=>{let e=T.current;if(!e)return;let t=o??ln.create({conversationId:n,hostId:r??null,cwd:i??null});O.current=t,k.current=!1;let a=!1,s=new jke.Terminal({allowTransparency:!0});let c=null,l=()=>{c??=requestAnimationFrame(()=>{c=null,s.scrollToBottom()})};E.current=s;let p=n=>{a||e.isConnected&&requestAnimationFrame(()=>{a||e.isConnected&&(k.current?V0(s,D.current,t):H0(D.current),n?.())})};p(),M.current=!1;let h=ln.register(t,{onInitLog:e=>{s.write(e),l()},onData:e=>{M.current||(M.current=!0,P(`Running`),I(null)),s.write(e),l()},onExit:()=>{a||P(`Exited`)},onError:e=>{a||(P(`Error`),I(e))},onAttach:(e,t)=>{a||(k.current=!0,P(`Running`),I(null),R(t??null),p())}}),g=s.onData(e=>{ln.write(t,e)}),_=s.onKey(Jke);o&&requestAnimationFrame(()=>{a||ln.attach({sessionId:o,conversationId:n,hostId:r??null,cwd:i??null,cols:s.cols,rows:s.rows})});let v=new ResizeObserver(()=>{p()});return v.observe(e),()=>{a=!0,c!=null&&(cancelAnimationFrame(c),c=null),v.disconnect(),g.dispose(),_.dispose(),h(),D.current=null,O.current=null,k.current=!1,o||ln.close(t),s.dispose(),E.current=null}},te=[n,i,r,o,m],t[29]=n,t[30]=i,t[31]=r,t[32]=o,t[33]=m,t[34]=ee,t[35]=te):(ee=t[34],te=t[35]),(0,Z.useEffect)(ee,te);return(0,$.jsx)(`div`,{"data-codex-terminal":!0})}';
const TERMINAL_PANEL_BLOCK_26_406 =
  'let G,K;t[26]!==n||t[27]!==i||t[28]!==r||t[29]!==a||t[30]!==f?(G=()=>{let e=C.current;if(!e)return;let t=a??Ir.create({conversationId:n,hostId:r??null,cwd:i??null});E.current=t,D.current=!1;let o=!1,s=new aye.Terminal({allowTransparency:!0,cursorStyle:`bar`,fontSize:k.current,allowProposedApi:!0,cursorBlink:!0,fontFamily:O.current,letterSpacing:0,lineHeight:1.2,theme:b0()}),c=null,l=()=>{c??=requestAnimationFrame(()=>{c=null,s.scrollToBottom()})};w.current=s;let u=new cye.ClipboardAddon,d=new sye.FitAddon;T.current=d;let p=new oye.WebLinksAddon(Cye);s.loadAddon(u),s.loadAddon(d),s.loadAddon(p),s.attachCustomKeyEventHandler(e=>fye({clipboard:typeof navigator<`u`&&navigator.clipboard!=null&&f?navigator.clipboard:void 0,event:e,sendText:e=>{Ir.write(t,e)},term:s})),s.open(e);let m=n=>{o||e.isConnected&&requestAnimationFrame(()=>{o||e.isConnected&&(D.current?v0(s,d,t):y0(d),n?.())})};m(),A.current=!1;let h=Ir.register(t,{onInitLog:e=>{s.write(e),l()},onData:e=>{A.current||(A.current=!0,M(`Running`),P(null)),s.write(e),l()},onExit:()=>{o||M(`Exited`)},onError:e=>{o||(M(`Error`),P(e))},onAttach:(e,t)=>{o||(D.current=!0,M(`Running`),P(null),I(t??null),m())}}),g=s.onData(e=>{Ir.write(t,e)}),_=s.onKey(Sye);a&&requestAnimationFrame(()=>{o||Ir.attach({sessionId:a,conversationId:n,hostId:r??null,cwd:i??null,cols:s.cols,rows:s.rows})});let v=new ResizeObserver(()=>{m()});return v.observe(e),()=>{o=!0,c!=null&&(cancelAnimationFrame(c),c=null),v.disconnect(),g.dispose(),_.dispose(),h(),T.current=null,E.current=null,D.current=!1,a||Ir.close(t),s.dispose(),w.current=null}},K=[n,i,r,a,f],t[26]=n,t[27]=i,t[28]=r,t[29]=a,t[30]=f,t[31]=G,t[32]=K):(G=t[31],K=t[32]),(0,Z.useEffect)(G,K);return(0,$.jsx)(`div`,{"data-codex-terminal":!0})}';
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
const LINUX_VISUAL_COMPAT_CSS_CURRENT =
  '.window-fx-sidebar-surface{transition:background-color var(--transition-duration-relaxed) var(--transition-ease-basic)}.app-header-tint{transition:background-color var(--transition-duration-relaxed) var(--transition-ease-basic)}.sidebar-resize-handle-line{transition:background-color var(--transition-duration-relaxed) var(--transition-ease-basic)}[data-codex-window-type=electron]:not([data-codex-os=win32]) body{background:0 0;background:var(--color-token-editor-background)}[data-codex-window-type=electron].electron-opaque body{background-color:var(--color-background-surface-under);--color-background-elevated-primary:var(--color-background-elevated-primary-opaque);background-image:none}';
const LINUX_VISUAL_COMPAT_CSS_26_406 =
  '[data-codex-window-type=electron] body{--padding-row-y:calc(var(--spacing)*1.25)}[data-codex-window-type=electron]:not([data-codex-os=win32]) body{background:0 0;background:var(--color-token-editor-background)}[data-codex-window-type=electron].electron-opaque{background-color:var(--color-background-surface-under);background-image:none}[data-codex-window-type=electron].electron-opaque body{background-color:var(--color-background-surface-under);--color-background-elevated-primary:var(--color-background-elevated-primary-opaque);background-image:none}.app-header-tint{background-color:var(--codex-titlebar-tint,transparent)}.main-surface:where([data-codex-window-type=electron] .main-surface){background-color:var(--color-token-main-surface-primary)}';
const LINUX_VISUAL_COMPAT_JS_CURRENT =
  'let H,U;t[46]!==T||t[47]!==a?(H=()=>{if(a!==`electron`)return;let e=document.querySelector(`[data-codex-window-type="electron"]`);if(e){if(T.opaqueWindows&&!XZ()){e.classList.add(`electron-opaque`);return}e.classList.remove(`electron-opaque`)}}},U=[T,a],t[46]=T,t[47]=a,t[48]=H,t[49]=U):(H=t[48],U=t[49]),(0,Z.useLayoutEffect)(H,U);';
const LINUX_VISUAL_COMPAT_JS_26_406 =
  'let H,U;t[46]!==T||t[47]!==a?(H=()=>{if(a!==`electron`)return;let e=document.querySelector(`[data-codex-window-type="electron"]`);if(e){if(T.opaqueWindows&&!xY()){e.classList.add(`electron-opaque`);return}e.classList.remove(`electron-opaque`)}}},U=[T,a],t[46]=T,t[47]=a,t[48]=H,t[49]=U):(H=t[48],U=t[49]),(0,Z.useLayoutEffect)(H,U);';
const LINUX_VISUAL_COMPAT_JS_26_409 =
  'let H,U;t[46]!==T||t[47]!==a?(H=()=>{if(a!==`electron`)return;let e=document.querySelector(`[data-codex-window-type="electron"]`);if(e){if(T.opaqueWindows&&!wX()){e.classList.add(`electron-opaque`);return}e.classList.remove(`electron-opaque`)}}},U=[T,a],t[46]=T,t[47]=a,t[48]=H,t[49]=U):(H=t[48],U=t[49]),(0,Z.useLayoutEffect)(H,U);';
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

test('parseArgs accepts diagnostic and patch skip flags', () => {
  const options = parseArgs([
    '--beta',
    '--version',
    '26.325.21211',
    '--skip-open-targets-patch',
    '--skip-terminal-patch',
    '--skip-todo-progress-patch',
    '--diagnostic-manifest'
  ]);

  assert.deepEqual(options, {
    beta: true,
    version: '26.325.21211',
    help: false,
    skipOpenTargetsPatch: true,
    skipTerminalPatch: true,
    skipTodoProgressPatch: true,
    diagnosticManifest: true
  });
});

test('renderHelp lists the diagnostic and patch skip flags', () => {
  const helpText = renderHelp();

  assert.match(helpText, /--skip-open-targets-patch/);
  assert.match(helpText, /--skip-terminal-patch/);
  assert.match(helpText, /--skip-todo-progress-patch/);
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
      /Could not patch Linux close-cancel behavior in the Electron main bundle\. Source: main\.js\. Missing anchors: before-quit handler, Quit\/Cancel confirmation dialog, cancel preventDefault branch, showLastActivePrimaryWindow hook, ensureHostWindow dependency\. Detected anchors: beforeQuitHandler=no, quitCancelPrompt=no, cancelPreventDefault=no, showLastActivePrimaryWindow=no, ensureHostWindowDependency=no\./
  });
});

for (const [label, fixture] of [
  ['legacy', TERMINAL_PANEL_BLOCK_LEGACY],
  ['current', TERMINAL_PANEL_BLOCK_CURRENT],
  ['26.406', TERMINAL_PANEL_BLOCK_26_406]
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
        /codexLinuxPreserveSession\|\|[A-Za-z_$][\w$]*\|\|[A-Za-z_$][\w$]*\.close\(t\)/
      );
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
        /Could not patch the renderer terminal lifecycle bundle for Linux\. Source: index\.js\. Missing anchors: data-codex-terminal marker, terminal onInitLog handler, terminal session creation, terminal post-init state reset, terminal attach scheduling, terminal attach completion hook, terminal cleanup handoff\. Detected anchors: terminalComponent=no, initLogHandler=no, sessionCreate=no, postInit=no, attach=no, onAttach=no, cleanup=no\./
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
    assert.equal(await fs.promises.readFile(bundlePath, 'utf8'), NEW_THREAD_MODEL_BUNDLE_26_406_DRIFTED);
    assert.equal(
      warnings.some((message) => message.includes('Skipping Linux new-thread model patch for index.js')),
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

for (const [label, fixture] of [
  ['current', TODO_PROGRESS_BUNDLE_CURRENT],
  ['26.406', TODO_PROGRESS_BUNDLE_26_406],
  ['26.406-renamed', TODO_PROGRESS_BUNDLE_26_406_RENAMED],
  ['26.409-direct-compact', TODO_PROGRESS_BUNDLE_26_409_DIRECT_COMPACT]
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
  ['26.406', LINUX_VISUAL_COMPAT_CSS_26_406]
]) {
  test(`injectLinuxVisualCompatCssPatch adds Linux sidebar rendering overrides to the ${label} stylesheet`, () => {
    const updated = injectLinuxVisualCompatCssPatch(fixture);

    assert.match(updated, /codexLinuxVisualCompat/);
    assert.match(updated, /codex-linux-visual-compat/);
    assert.match(updated, /background:var\(--color-token-side-bar-background\)!important/);
    assert.match(updated, /transition:none!important/);
    assert.doesNotMatch(updated, /\.window-fx-sidebar-surface \*/);
    assert.doesNotMatch(updated, /animation:none!important/);
  });
}

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
      linuxCloseCancel: {
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
      todoProgress: {
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
      linuxCloseCancel: {
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
      todoProgress: {
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
