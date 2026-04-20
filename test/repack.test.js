import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyLinuxBrowserCommentPositionPatch,
  applyLinuxBackgroundSubagentsPanelPatch,
  applyLinuxCloseCancelPatch,
  applyLinuxLatestAgentTurnExpansionPatch,
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
  injectLinuxBrowserCommentPositionPatch,
  injectLinuxBackgroundSubagentsPanelPatch,
  injectLinuxCloseCancelPatch,
  injectLinuxLatestAgentTurnExpansionPatch,
  injectLinuxOpenTargetsPatch,
  injectLinuxMenuBarPatch,
  injectLinuxNewThreadModelPatch,
  injectLinuxTerminalLifecyclePatch,
  injectLinuxTodoProgressPatch,
  injectLinuxVisualCompatCssPatch,
  injectLinuxVisualCompatJsPatch,
  patchRendererCompactSlashCommandBundle,
  patchRendererBackgroundSubagentsPanelBundle,
  patchRendererLatestAgentTurnExpansionBundle,
  patchRendererLinuxBrowserCommentPositionBundle,
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
const TERMINAL_PANEL_BLOCK_26_415 =
  'let ee,te;t[33]!==n||t[34]!==i||t[35]!==r||t[36]!==o||t[37]!==a||t[38]!==d?(ee=()=>{let e=w.current,t=C.current;if(!e||!t)return;let s=a??Ye.create({conversationId:n,hostId:r??null,cwd:i??null});D.current=s,O.current=!1;let c=!1,l=new Jve.Terminal({allowTransparency:!0}),u=null,f=()=>{u??=requestAnimationFrame(()=>{u=null,l.scrollToBottom()})};T.current=l;let m=new Kve.FitAddon;E.current=m;l.open(e);let g=t=>{c||e.isConnected&&requestAnimationFrame(()=>{c||e.isConnected&&(O.current?k8(l,m,s):m.fit(),t?.())})};g();let _=Ye.register(s,{onInitLog:e=>{l.write(e),f()},onData:e=>{l.write(e),f()},onAttach:()=>{c||(O.current=!0,g())}}),v=l.onData(e=>{Ye.write(s,e)}),y=l.onTitleChange(e=>{Ye.setTitle(s,e)}),b=l.onKey(eye);a&&requestAnimationFrame(()=>{c||Ye.create({sessionId:a,conversationId:n,hostId:r??null,cwd:i??null,cols:l.cols,rows:l.rows})});let x=new ResizeObserver(()=>{g()});return x.observe(e),()=>{c=!0,u!=null&&(cancelAnimationFrame(u),u=null),x.disconnect(),v.dispose(),y.dispose(),b.dispose(),_(),E.current=null,D.current=null,O.current=!1,a||Ye.close(s),l.dispose(),T.current=null}},te=[n,i,r,o,a,d],t[33]=n,t[34]=i,t[35]=r,t[36]=o,t[37]=a,t[38]=d,t[39]=ee,t[40]=te):(ee=t[39],te=t[40]),(0,K.useEffect)(ee,te);return(0,q.jsx)(`div`,{"data-codex-terminal":!0})}';
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
const LINUX_VISUAL_COMPAT_JS_CURRENT =
  'let H,U;t[46]!==T||t[47]!==a?(H=()=>{if(a!==`electron`)return;let e=document.querySelector(`[data-codex-window-type="electron"]`);if(e){if(T.opaqueWindows&&!XZ()){e.classList.add(`electron-opaque`);return}e.classList.remove(`electron-opaque`)}}},U=[T,a],t[46]=T,t[47]=a,t[48]=H,t[49]=U):(H=t[48],U=t[49]),(0,Z.useLayoutEffect)(H,U);';
const LINUX_VISUAL_COMPAT_JS_26_406 =
  'let H,U;t[46]!==T||t[47]!==a?(H=()=>{if(a!==`electron`)return;let e=document.querySelector(`[data-codex-window-type="electron"]`);if(e){if(T.opaqueWindows&&!xY()){e.classList.add(`electron-opaque`);return}e.classList.remove(`electron-opaque`)}}},U=[T,a],t[46]=T,t[47]=a,t[48]=H,t[49]=U):(H=t[48],U=t[49]),(0,Z.useLayoutEffect)(H,U);';
const LINUX_VISUAL_COMPAT_JS_26_409 =
  'let H,U;t[46]!==T||t[47]!==a?(H=()=>{if(a!==`electron`)return;let e=document.querySelector(`[data-codex-window-type="electron"]`);if(e){if(T.opaqueWindows&&!wX()){e.classList.add(`electron-opaque`);return}e.classList.remove(`electron-opaque`)}}},U=[T,a],t[46]=T,t[47]=a,t[48]=H,t[49]=U):(H=t[48],U=t[49]),(0,Z.useLayoutEffect)(H,U);';
const LINUX_BROWSER_COMMENT_POSITION_BUNDLE_CURRENT =
  'function wP(e){let x;let{message:N,root:P,popupWindow:F}=x,I=N.session.sessionId;let U;t[31]!==N.editorFrame.height||t[32]!==N.editorFrame.width||t[33]!==N.editorFrame.x||t[34]!==N.editorFrame.y?(U={left:N.editorFrame.x,top:N.editorFrame.y,width:N.editorFrame.width,height:N.editorFrame.height},t[31]=N.editorFrame.height,t[32]=N.editorFrame.width,t[33]=N.editorFrame.x,t[34]=N.editorFrame.y,t[35]=U):U=t[35];return U}function TP({conversationId:e,openerWindow:t,existingPopup:n,message:r}){let i=ze({windowId:ve.BROWSER_COMMENT_POPUP,conversationId:e});if(n!=null&&!n.window.closed&&n.frameName===i)return n;let{x:a,y:o,width:s,height:c}=r.overlayWindowBounds,l=t.open(`about:blank`,i,[`popup=yes`,`left=${Math.round(a)}`,`top=${Math.round(o)}`,`width=${Math.round(s)}`,`height=${Math.round(c)}`].join(`,`));return l==null?null:{frameName:i,window:l}}d(`browser-sidebar-comment-overlay-session`,k,A);';
const BACKGROUND_SUBAGENTS_PANEL_BUNDLE_CURRENT =
  'function YR(e){let t=(0,Q.c)(39),{canStopAll:n,onOpenThread:r,onStopAll:i,rows:a}=e,o=ea();if(a.length===0)return null;let s;t[0]===a?s=t[1]:(s=a.reduce(XR,{linesAdded:0,linesRemoved:0}),t[0]=a,t[1]=s);let u,d;if(t[2]!==o||t[3]!==a.length){u=o.formatMessage({id:`composer.backgroundSubagents.summary`,defaultMessage:`{count, plural, one {# background agent} other {# background agents}}`,description:`Summary label for the background subagents panel header.`},{count:a.length});let e=o.formatMessage({id:`composer.backgroundSubagents.invokeAgents`,defaultMessage:`(@ to tag agents)`,description:`Hint shown after the background agent summary when the panel is expanded.`});d=o.formatMessage({id:`composer.backgroundSubagents.summary.expanded`,defaultMessage:`{summary} {hint}`,description:`Background agent summary label when the panel is expanded.`},{summary:u,hint:e}),t[2]=o,t[3]=a.length,t[4]=u,t[5]=d}else u=t[4],d=t[5];return d}let zn=Po(Ln,e=>Zl.getState(e.view.state)?.active===!0),Bn=Ye.length>0&&!$e&&!zn&&!it&&!tt,Vn=et||Ce||we||zn||tt;function mB({intl:e,followUpType:t,composerMode:n,cloudStartingState:r,isBackgroundSubagentsPanelVisible:i}){return e.formatMessage(hB(t,n,r,i))}let composer=(0,$.jsx)(Gc,{placeholder:p??mB({intl:yt,followUpType:R?.type,composerMode:Qn,cloudStartingState:si,isBackgroundSubagentsPanelVisible:Bn})});';
const BACKGROUND_SUBAGENTS_PANEL_BUNDLE_INCOMPATIBLE =
  BACKGROUND_SUBAGENTS_PANEL_BUNDLE_CURRENT.replace(
    'Bn=Ye.length>0&&!$e&&!zn&&!it&&!tt',
    'Bn=Ye.length===0&&!$e&&!zn&&!it&&!tt'
  );
const LATEST_AGENT_TURN_EXPANSION_BUNDLE_CURRENT =
  'function Ile({hasFinalAssistantStarted:e,isTurnCancelled:t,hasRenderableAgentItems:n,preventAutoCollapse:r,persistedCollapsed:i}){return e&&!t&&n?{shouldAllowCollapse:!0,isCollapsed:i??!r}:{shouldAllowCollapse:!1,isCollapsed:!1}}function Vle(e){let t=(0,Q.c)(16),{conversationId:n,hostId:r,turnSearchKey:i,turnId:a,turn:o,conversationDetailLevel:s,cwd:c,isCollapsed:l,onSetCollapsed:u,emptyUserMessageOverride:d,parentThreadAttachment:f,resolvedApps:p,shouldAutoExpandMcpApps:m,onEditUserMessage:h,onForkUserMessage:g,startAfterTurnIntro:_,showInProgressFixedContent:v,modelProvider:y}=e,b=i===void 0?`turn`:i,x=p===void 0?zle:p,S=m===void 0?!1:m,C=_===void 0?!1:_,w=v===void 0?!0:v,T=o.status===`in_progress`,O=o.status===`cancelled`,{authMethod:k}=Nf(),A;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(A=`4170020461`,t[0]=A):A=t[0];let j=cf(A),M=Nd(),N=s??M,P=Wd(),F;t[1]===y?F=t[2]:(F=!1,t[1]=y,t[2]=F);let I=F,L;t[3]!==I||t[4]!==o.items?(L=o.items,t[3]=I,t[4]=o.items,t[5]=L):L=t[5];let R=L,z;t[6]!==C||t[7]!==R?(z=C?p5(R):R,t[6]=C,t[7]=R,t[8]=z):z=t[8];let B=z,V;t[9]!==B||t[10]!==o.status?(V=yn(B,o.status),t[9]=B,t[10]=o.status,t[11]=V):V=t[11];let{assistantItem:W,agentItems:q}=V,be=l5(W),{renderableAgentItems:Oe,isAnyNonExploringAgentItemInProgress:ke,isExploring:Ae}=d5({agentItems:q,isTurnInProgress:T,isAnyNonAgentItemInProgress:be}),{data:je}=$d(S&&F1(Oe),r),Me=S&&I1({entries:Oe,mcpServerStatuses:je}),Ne=Oe.at(-1),Pe=_le({isTurnInProgress:T,assistantItem:W,isExploring:Ae,hasActiveWebSearch:T&&Ne?.kind===`item`&&Ne.item.type===`web-search`,isAnyNonExploringAgentItemInProgress:ke,hasBlockingRequest:!1}),{shouldAllowCollapse:Fe,isCollapsed:Ie}=Ile({hasFinalAssistantStarted:zn(W),isTurnCancelled:O,hasRenderableAgentItems:Oe.length>0,preventAutoCollapse:Me,persistedCollapsed:l}),Le=Fe?Xle(Oe):Oe,Re=Fe?Zle(Oe):null,ze=Le.length>0,Ve=!C&&Fe&&ze,He=Ve?Ie:!1,Ue=Le.length,We=gle(Le),Ge=Ve&&Ue>0&&We==null;return ze?(0,$.jsx)(Yle,{collapsedMessageCount:Ue,workedForItem:Re,isCollapsed:Ge&&He,showToggle:Ge,onToggle:()=>{!u||!Ge||u(!He)},content:(0,$.jsx)(fle,{entries:Le,conversationId:n,hostId:r,conversationDetailLevel:N,isTurnInProgress:T,hasAssistantStartedStreaming:!1,hasTrailingAssistantMessage:!0,cwd:c,showPendingMcpThinking:Pe.type===`thinking`,pendingMcpThinkingMessage:void 0,resolvedApps:x,mcpServerStatuses:je,shouldAutoExpandMcpApps:S})}):null}';
const LATEST_AGENT_TURN_EXPANSION_BUNDLE_INCOMPATIBLE =
  LATEST_AGENT_TURN_EXPANSION_BUNDLE_CURRENT.replace(
    '}),Le=Fe?Xle(Oe):Oe',
    '}),Le=Fe?Xle(q):q'
  );
const COMPACT_SLASH_COMMAND_BUNDLE_CURRENT =
  'function RW(e){let t=(0,Q.c)(17),{conversationId:n,isResponseInProgress:r}=e,i=ea(),a=xf(n),o;t[0]===i?o=t[1]:(o=i.formatMessage({id:`composer.compactSlashCommand.title`,defaultMessage:`Compact`,description:`Title for the compact slash command`}),t[0]=i,t[1]=o);let s;t[2]===i?s=t[3]:(s=i.formatMessage({id:`composer.compactSlashCommand.description`,defaultMessage:`Compact this thread\'s context`,description:`Description for the compact slash command`}),t[2]=i,t[3]=s);let c=n!=null&&!r,l;t[4]!==a||t[5]!==n?(l=async()=>{n!=null&&await a.compactThread(n)},t[4]=a,t[5]=n,t[6]=l):l=t[6];let u;return u={id:`compact`,title:o,description:s,requiresEmptyComposer:!0,Icon:LW,enabled:c,onSelect:l},u}';
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
  ['26.406', TERMINAL_PANEL_BLOCK_26_406],
  ['26.415', TERMINAL_PANEL_BLOCK_26_415]
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
    assert.match(updated, /\.no-underline\\!/);
    assert.match(updated, /\[data-browser-comment-editor-surface\]/);
    assert.match(updated, /max-height:clamp\(44px,18vh,88px\)!important/);
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

test('injectLinuxBackgroundSubagentsPanelPatch relaxes the inline composer gate for subagent rows', () => {
  const updated = injectLinuxBackgroundSubagentsPanelPatch(
    BACKGROUND_SUBAGENTS_PANEL_BUNDLE_CURRENT
  );

  assert.match(updated, /codexLinuxBackgroundSubagentsPanel/);
  assert.match(updated, /CODEX_DESKTOP_DISABLE_LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH/);
  assert.match(updated, /Bn=Ye\.length>0&&!\$e&&\(typeof process<`u`&&process\?\.env\?\.CODEX_DESKTOP_DISABLE_LINUX_BACKGROUND_SUBAGENTS_PANEL_PATCH===`1`\?zn:!1\)&&!it&&!tt/);
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
      },
      linuxBrowserCommentPosition: {
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
      },
      linuxBrowserCommentPosition: {
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
