#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SERVER_NAME = 'codex-computer-use-linux';
const SERVER_VERSION = '0.1.0-linux-repack';
const MAX_COMMAND_MS = 8000;
const WINDOW_HELPER_COMMAND_MS = 6000;
const DESKTOP_ENV_KEYS = [
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'XDG_CURRENT_DESKTOP',
  'XDG_SESSION_TYPE',
  'XDG_RUNTIME_DIR',
  'DBUS_SESSION_BUS_ADDRESS',
  'DESKTOP_SESSION'
];
const DESKTOP_PROCESS_NAME_HINTS = [
  'plasmashell',
  'kwin_wayland',
  'gnome-shell',
  'cinnamon',
  'xfce4-session',
  'mate-session',
  'sway',
  'hyprland',
  'weston',
  'xdg-desktop-portal-kde',
  'xdg-desktop-portal-gnome',
  'xdg-desktop-portal',
  'dbus-daemon',
  'systemd'
];
const KWIN_BACKEND = 'kwin';
const GNOME_INTROSPECT_BACKEND = 'gnome-shell-introspect';
const X11_WMCTRL_BACKEND = 'wmctrl';
const X11_XDOTOOL_BACKEND = 'xdotool';
const KWIN_SCRIPTING_SERVICE = 'org.kde.KWin';
const KWIN_SCRIPTING_OBJECT_PATH = '/Scripting';
const KWIN_SCRIPTING_INTERFACE = 'org.kde.kwin.Scripting';
const GNOME_SHELL_SERVICE = 'org.gnome.Shell';
const GNOME_INTROSPECT_OBJECT_PATH = '/org/gnome/Shell/Introspect';
const GNOME_INTROSPECT_INTERFACE = 'org.gnome.Shell.Introspect';
const GNOME_SHELL_OBJECT_PATH = '/org/gnome/Shell';
const GNOME_SHELL_INTERFACE = 'org.gnome.Shell';
let pythonDbusProbeCache = null;

hydrateDesktopSessionEnv();

const args = process.argv.slice(2).filter((arg) => arg !== '--json');
const command = args[0] ?? '--help';

if (command === 'mcp') {
  serveMcp().catch((error) => {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  });
} else {
  runCli(command, args.slice(1)).catch((error) => {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  });
}

async function runCli(commandName, commandArgs) {
  if (commandName === 'doctor') {
    printJson(doctorReport());
    return;
  }
  if (commandName === 'setup') {
    printJson(setupReport());
    return;
  }
  if (commandName === 'setup-accessibility') {
    printJson(setupAccessibility());
    return;
  }
  if (commandName === 'setup-window-targeting') {
    printJson(setupWindowTargetingReport());
    return;
  }
  if (commandName === 'apps') {
    printJson(listApps());
    return;
  }
  if (commandName === 'windows') {
    printJson(listWindows());
    return;
  }
  if (commandName === 'focused-window') {
    printJson(focusedWindow());
    return;
  }
  if (commandName === 'activate-window') {
    const target = commandArgs.join(' ').trim();
    printJson(activateWindow(/^\d+$/.test(target) ? { window_id: target } : { title: target }));
    return;
  }
  if (commandName === 'state') {
    printJson(getAppState({ app_name_or_bundle_identifier: commandArgs[0] ?? null }));
    return;
  }
  if (commandName === 'screenshot') {
    printJson(captureScreenshot({ output_path: commandArgs[0] ?? null }));
    return;
  }
  if (commandName === '--help' || commandName === '-h') {
    printHelp();
    return;
  }
  throw new Error(
    `unknown command '${commandName}'. Expected one of: mcp, doctor, setup, setup-accessibility, setup-window-targeting, apps, windows, focused-window, activate-window, state, screenshot`
  );
}

function printHelp() {
  process.stdout.write(
    [
      'codex-computer-use-linux',
      '',
      'Usage:',
      '  codex-computer-use-linux mcp',
      '  codex-computer-use-linux doctor',
      '  codex-computer-use-linux setup',
      '  codex-computer-use-linux setup-accessibility',
      '  codex-computer-use-linux setup-window-targeting',
      '  codex-computer-use-linux apps',
      '  codex-computer-use-linux windows',
      '  codex-computer-use-linux focused-window',
      '  codex-computer-use-linux activate-window WINDOW_ID_OR_TITLE',
      '  codex-computer-use-linux state [APP_NAME]',
      '  codex-computer-use-linux screenshot [OUTPUT_PATH]'
    ].join('\n') + '\n'
  );
}

async function serveMcp() {
  process.stdin.setEncoding('utf8');
  let buffer = '';
  for await (const chunk of process.stdin) {
    buffer += chunk;
    for (;;) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex < 0) {
        break;
      }
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length === 0) {
        continue;
      }
      await handleMcpLine(line);
    }
  }
  const trailing = buffer.trim();
  if (trailing.length > 0) {
    await handleMcpLine(trailing);
  }
}

async function handleMcpLine(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    writeMcp({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: `Parse error: ${formatError(error)}` }
    });
    return;
  }

  if (request.method === 'notifications/initialized') {
    return;
  }

  if (request.id == null) {
    return;
  }

  try {
    if (request.method === 'initialize') {
      writeMcp({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: request.params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
        }
      });
      return;
    }

    if (request.method === 'tools/list') {
      writeMcp({ jsonrpc: '2.0', id: request.id, result: { tools: listTools() } });
      return;
    }

    if (request.method === 'tools/call') {
      const result = await callTool(request.params?.name, request.params?.arguments ?? {});
      writeMcp({ jsonrpc: '2.0', id: request.id, result });
      return;
    }

    writeMcp({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32601, message: `Method not found: ${request.method}` }
    });
  } catch (error) {
    writeMcp({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32603, message: formatError(error) }
    });
  }
}

async function callTool(name, params) {
  if (name === 'doctor') {
    return textToolResult(doctorReport());
  }
  if (name === 'setup_accessibility') {
    return textToolResult(setupAccessibility());
  }
  if (name === 'setup_window_targeting') {
    return textToolResult(setupWindowTargetingReport());
  }
  if (name === 'list_apps') {
    return textToolResult(listApps());
  }
  if (name === 'list_windows') {
    return textToolResult(listWindows());
  }
  if (name === 'focused_window') {
    return textToolResult(focusedWindow());
  }
  if (name === 'activate_window') {
    return textToolResult(activateWindow(params));
  }
  if (name === 'get_app_state') {
    return textToolResult(getAppState(params));
  }
  if (name === 'screenshot') {
    return screenshotToolResult(captureScreenshot(params));
  }
  if (name === 'click') {
    return textToolResult(click(params), { isError: false });
  }
  if (name === 'perform_action') {
    return textToolResult(unimplementedAction('perform_action', params));
  }
  if (name === 'set_value') {
    return textToolResult(unimplementedAction('set_value', params));
  }
  if (name === 'scroll') {
    return textToolResult(scroll(params));
  }
  if (name === 'drag') {
    return textToolResult(drag(params));
  }
  if (name === 'press_key') {
    return textToolResult(pressKey(params));
  }
  if (name === 'type_text') {
    return textToolResult(typeText(params));
  }
  throw new Error(`Unknown tool: ${name}`);
}

function listTools() {
  return [
    tool('doctor', 'Report Linux Computer Use desktop integration readiness.', {}, true),
    tool('setup_accessibility', 'Enable safe local accessibility settings where supported.', {}, false),
    tool('setup_window_targeting', 'Report optional compositor window targeting setup steps.', {}, false),
    tool('list_apps', 'List running Linux desktop app candidates.', {}, true),
    tool('list_windows', 'List visible desktop windows when the compositor exposes them.', {}, true),
    tool('focused_window', 'Return the focused window when the window system exposes it.', {}, true),
    tool('activate_window', 'Focus a Linux desktop window by id or title where supported.', {
      window_id: { type: 'string' },
      title: { type: 'string' }
    }),
    tool('get_app_state', 'Return a screenshot plus window and process context for an app.', {
      app_name_or_bundle_identifier: { type: 'string' },
      include_screenshot: { type: 'boolean' }
    }, true),
    tool('screenshot', 'Capture a desktop screenshot and return image content when possible.', {
      output_path: { type: 'string' }
    }, false),
    tool('click', 'Click desktop coordinates using xdotool or ydotool when available.', {
      x: { type: 'integer' },
      y: { type: 'integer' },
      button: { type: 'string' },
      click_count: { type: 'integer' }
    }),
    tool('perform_action', 'Invoke an accessibility action if AT-SPI action support is available.', {
      element_index: { type: 'integer' },
      action: { type: 'string' }
    }),
    tool('set_value', 'Set an accessibility element value if AT-SPI value support is available.', {
      element_index: { type: 'integer' },
      value: { type: 'string' }
    }),
    tool('scroll', 'Scroll at optional desktop coordinates.', {
      direction: { type: 'string' },
      x: { type: 'integer' },
      y: { type: 'integer' },
      pages: { type: 'number' }
    }),
    tool('drag', 'Drag between desktop coordinates.', {
      start_x: { type: 'integer' },
      start_y: { type: 'integer' },
      end_x: { type: 'integer' },
      end_y: { type: 'integer' }
    }),
    tool('press_key', 'Press a keyboard key or key combination.', {
      key: { type: 'string' }
    }),
    tool('type_text', 'Type literal text through the available input backend.', {
      text: { type: 'string' }
    })
  ];
}

function tool(name, description, properties = {}, readOnly = false) {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties,
      additionalProperties: true
    },
    annotations: {
      readOnlyHint: readOnly,
      destructiveHint: !readOnly,
      idempotentHint: readOnly,
      openWorldHint: true
    }
  };
}

function doctorReport() {
  const commands = detectCommands([
    'gsettings',
    'gdbus',
    'busctl',
    'gnome-screenshot',
    'grim',
    'spectacle',
    'import',
    'wmctrl',
    'xdotool',
    'ydotool',
    'python3',
    'systemctl',
    'apt-get',
    'dnf',
    'pacman',
    'zypper'
  ]);
  const atSpi = detectAtSpi(commands);
  const screenshot = detectScreenshotBackend(commands);
  const screenshotProbe = probeScreenshotCapture(screenshot);
  const input = detectInputBackend(commands);
  const windows = detectWindowBackend(commands);
  const packageManager = detectPackageManager(commands);
  const setup = buildSetupPlan({ commands, atSpi, screenshot, input, packageManager });
  const readiness = {
    can_list_apps: true,
    can_list_windows: windows.can_list_windows,
    can_focus_windows: windows.can_focus_windows,
    can_capture_screenshot: screenshotProbe.ok,
    can_send_input: input.available,
    can_build_accessibility_tree: atSpi.available
  };
  const ready =
    readiness.can_capture_screenshot &&
    readiness.can_send_input &&
    readiness.can_build_accessibility_tree &&
    readiness.can_list_windows;
  return {
    ok: true,
    name: SERVER_NAME,
    version: SERVER_VERSION,
    status: ready ? 'ready' : 'needs-setup',
    platform: process.platform,
    arch: process.arch,
    session: desktopSessionReport(),
    readiness,
    dependencies: {
      commands,
      at_spi: atSpi,
      screenshot,
      screenshot_probe: screenshotProbe,
      input,
      windows,
      package_manager: packageManager
    },
    setup,
    message: ready
      ? 'Linux Computer Use backend is ready.'
      : 'Linux Computer Use backend is installed, but one or more OS permissions or dependencies need setup.'
  };
}

function setupReport() {
  const accessibility = setupAccessibility();
  const ydotool = setupYdotoolUserService();
  const doctor = doctorReport();
  return {
    ok: accessibility.ok || ydotool.ok,
    accessibility,
    ydotool,
    setup: doctor.setup,
    message: [
      accessibility.message,
      ydotool.message,
      'Package installs, system services, and group membership changes are reported as manual commands so no sudo change is made silently.'
    ].join(' ')
  };
}

function setupAccessibility() {
  if (process.env.CODEX_LINUX_COMPUTER_USE_DISABLE_SETUP === '1') {
    return {
      ok: false,
      changed: false,
      message: 'Linux Computer Use setup actions were disabled by CODEX_LINUX_COMPUTER_USE_DISABLE_SETUP=1.',
      manual_commands: []
    };
  }
  const gsettings = findCommand('gsettings');
  if (!gsettings) {
    return {
      ok: false,
      changed: false,
      message: 'gsettings was not found; enable desktop accessibility manually if your desktop requires it.',
      manual_commands: []
    };
  }
  const result = run(gsettings, ['set', 'org.gnome.desktop.interface', 'toolkit-accessibility', 'true']);
  return {
    ok: result.ok,
    changed: result.ok,
    command: `${gsettings} set org.gnome.desktop.interface toolkit-accessibility true`,
    stdout: result.stdout,
    stderr: result.stderr,
    message: result.ok
      ? 'GNOME accessibility was enabled through gsettings.'
      : 'Failed to enable GNOME accessibility through gsettings.'
  };
}

function setupWindowTargetingReport() {
  const windows = detectWindowBackend(
    detectCommands(['gdbus', 'python3', 'wmctrl', 'xdotool'])
  );
  return {
    ok: windows.can_list_windows,
    changed: false,
    windows,
    message:
      windows.can_list_windows
        ? `Window targeting is available through ${windows.preferred_backend}.`
        : 'No supported compositor window backend is currently available.',
    manual_commands: [
      'KDE/Plasma: ensure KWin scripting is available on the session bus.',
      'Ubuntu GNOME: allow org.gnome.Shell.Introspect.GetWindows when GNOME prompts or policy permits it.',
      'X11 fallback: install wmctrl or xdotool if compositor-native backends are unavailable.'
    ]
  };
}

function setupYdotoolUserService() {
  if (process.env.CODEX_LINUX_COMPUTER_USE_DISABLE_SETUP === '1') {
    return {
      ok: false,
      changed: false,
      message: 'ydotool setup actions were disabled by CODEX_LINUX_COMPUTER_USE_DISABLE_SETUP=1.',
      manual_commands: []
    };
  }
  if (!findCommand('ydotool')) {
    return {
      ok: false,
      changed: false,
      message: 'ydotool is not installed; package installation requires an explicit sudo command.',
      manual_commands: []
    };
  }
  const socketPath = ydotoolSocketPath();
  if (socketPath) {
    return {
      ok: true,
      changed: false,
      socket: socketPath,
      message: `ydotool socket is already available at ${socketPath}.`,
      manual_commands: []
    };
  }
  const systemctl = findCommand('systemctl');
  if (!systemctl) {
    return {
      ok: false,
      changed: false,
      message: 'systemctl was not found; start ydotoold manually if your distro provides it.',
      manual_commands: []
    };
  }
  const packageManager = detectPackageManager(detectCommands(['apt-get', 'dnf', 'pacman', 'zypper']));
  const attempts = ydotoolUserServiceUnits(packageManager).map((unit) => {
    const result = run(systemctl, ['--user', 'start', unit]);
    return { unit, ...result };
  });
  const successful = attempts.find((attempt) => attempt.ok);
  const refreshedSocketPath = ydotoolSocketPath();
  if (successful && refreshedSocketPath) {
    return {
      ok: true,
      changed: true,
      socket: refreshedSocketPath,
      attempts,
      message: `Started ${successful.unit} with systemctl --user and detected ${refreshedSocketPath}.`,
      manual_commands: []
    };
  }
  return {
    ok: false,
    changed: false,
    attempts,
    message:
      'Tried non-sudo user ydotool services, but no ydotool socket became available. Use the reported manual service command for your distro.',
    manual_commands: []
  };
}

function buildSetupPlan({ commands, atSpi, input, packageManager }) {
  const manualCommands = [];
  const notes = [];
  if (!atSpi.available) {
    if (commands.gsettings) {
      notes.push('Run setup_accessibility or codex-computer-use-linux setup to enable GNOME accessibility through gsettings.');
    } else {
      notes.push('Install desktop settings tools or enable AT-SPI/accessibility from your desktop settings.');
    }
  }
  if (!commands.ydotool) {
    const install = ydotoolInstallCommand(packageManager);
    if (install) {
      manualCommands.push(install);
    }
  }
  if (!input.uinput_writable) {
    manualCommands.push('sudo usermod -a -G input "$USER"');
    notes.push('Log out and back in after changing input group membership.');
  }
  if (commands.ydotool) {
    manualCommands.push(...ydotoolServiceManualCommands(packageManager));
  }
  return {
    manual_commands: [...new Set(manualCommands)],
    notes: [...new Set(notes)],
    sudo_required: manualCommands.some((entry) => entry.startsWith('sudo '))
  };
}

function ydotoolUserServiceUnits(packageManager) {
  if (packageManager === 'pacman') {
    return ['ydotool.service', 'ydotoold.service'];
  }
  return ['ydotoold.service', 'ydotool.service'];
}

function ydotoolServiceManualCommands(packageManager) {
  if (packageManager === 'pacman') {
    return ['systemctl --user enable --now ydotool.service'];
  }
  return ['sudo systemctl enable --now ydotoold || sudo systemctl enable --now ydotool'];
}

function ydotoolInstallCommand(packageManager) {
  if (packageManager === 'apt') {
    return 'sudo apt install ydotool';
  }
  if (packageManager === 'dnf') {
    return 'sudo dnf install ydotool';
  }
  if (packageManager === 'pacman') {
    return 'sudo pacman -S ydotool';
  }
  if (packageManager === 'zypper') {
    return 'sudo zypper install ydotool';
  }
  return null;
}

function listApps() {
  return {
    ok: true,
    apps: listProcessApps(),
    accessible_apps: [],
    accessibility_error:
      'AT-SPI tree extraction is not implemented in this JavaScript fallback backend; doctor reports whether AT-SPI appears ready.',
    note: 'Linux Computer Use lists process candidates in this repack backend.'
  };
}

function listProcessApps() {
  const result = run('ps', ['-eo', 'pid=,comm=,args='], { timeout: MAX_COMMAND_MS });
  if (!result.ok) {
    return [];
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 250)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\S+)\s*(.*)$/);
      if (!match) {
        return null;
      }
      return {
        pid: Number(match[1]),
        name: match[2],
        command: match[3] || match[2],
        is_running: true
      };
    })
    .filter(Boolean);
}

function listWindows() {
  const attempts = [];
  for (const backend of [
    listKwinWindows,
    listGnomeIntrospectWindows,
    listWmctrlWindows,
    listXdotoolWindows
  ]) {
    const result = backend();
    if (result.ok && result.windows.length > 0) {
      return result;
    }
    attempts.push({
      backend: result.backend,
      ok: result.ok,
      windows: result.windows?.length ?? 0,
      error: result.error ?? (result.ok ? 'backend returned no windows' : 'backend unavailable')
    });
  }
  return {
    ok: false,
    backend: 'unavailable',
    windows: [],
    attempts,
    error: 'No supported window listing backend returned windows.',
    permissions_hint: windowPermissionHint()
  };
}

function listKwinWindows() {
  const probe = probeKwinWindowBackend();
  if (!probe.can_list_windows) {
    return {
      ok: false,
      backend: KWIN_BACKEND,
      windows: [],
      error: probe.detail,
      permissions_hint: 'On KDE/Plasma, KWin scripting must be available on the session bus.'
    };
  }
  const result = runDesktopDbusHelper('kwin-list');
  if (!result.ok) {
    return {
      ok: false,
      backend: KWIN_BACKEND,
      windows: [],
      error: result.stderr || result.stdout || result.error || 'KWin helper failed.',
      helper: helperResultSummary(result),
      permissions_hint: 'On KDE/Plasma, verify DBUS_SESSION_BUS_ADDRESS reaches the active KWin session.'
    };
  }
  try {
    return {
      ok: true,
      backend: KWIN_BACKEND,
      windows: parseKwinWindows(result.stdout),
      error: null,
      permissions_hint: null,
      note: 'Window list came from KWin/Plasma DBus scripting.'
    };
  } catch (error) {
    return {
      ok: false,
      backend: KWIN_BACKEND,
      windows: [],
      error: `KWin returned invalid window JSON: ${formatError(error)}`,
      stdout: truncateText(result.stdout),
      permissions_hint: 'KWin scripting returned data, but the backend could not parse it.'
    };
  }
}

function listGnomeIntrospectWindows() {
  const probe = probeGnomeIntrospectBackend();
  if (!probe.can_list_windows) {
    return {
      ok: false,
      backend: GNOME_INTROSPECT_BACKEND,
      windows: [],
      error: probe.detail,
      permissions_hint:
        'On Ubuntu GNOME, org.gnome.Shell.Introspect.GetWindows must be allowed on the session bus.'
    };
  }
  const result = runDesktopDbusHelper('gnome-list');
  if (!result.ok) {
    return {
      ok: false,
      backend: GNOME_INTROSPECT_BACKEND,
      windows: [],
      error: result.stderr || result.stdout || result.error || 'GNOME Introspect helper failed.',
      helper: helperResultSummary(result),
      permissions_hint:
        'GNOME may deny org.gnome.Shell.Introspect.GetWindows; check Shell introspection permissions.'
    };
  }
  try {
    return {
      ok: true,
      backend: GNOME_INTROSPECT_BACKEND,
      windows: parseGnomeIntrospectWindows(result.stdout),
      error: null,
      permissions_hint: null,
      note:
        'Window list came from GNOME Shell Introspect. Exact per-window activation may be unavailable.'
    };
  } catch (error) {
    return {
      ok: false,
      backend: GNOME_INTROSPECT_BACKEND,
      windows: [],
      error: `GNOME Shell Introspect returned invalid window JSON: ${formatError(error)}`,
      stdout: truncateText(result.stdout),
      permissions_hint: 'GNOME returned data, but the backend could not parse it.'
    };
  }
}

function listWmctrlWindows() {
  const wmctrl = findCommand('wmctrl');
  if (!wmctrl) {
    return {
      ok: false,
      backend: X11_WMCTRL_BACKEND,
      windows: [],
      error: 'wmctrl was not found.'
    };
  }
  const result = run(wmctrl, ['-lx']);
  if (!result.ok) {
    return {
      ok: false,
      backend: X11_WMCTRL_BACKEND,
      windows: [],
      error: result.stderr || result.stdout || result.error || 'wmctrl -lx failed.'
    };
  }
  return {
    ok: true,
    backend: X11_WMCTRL_BACKEND,
    windows: parseWmctrlWindows(result.stdout),
    error: null,
    permissions_hint: null,
    note: 'Window list came from wmctrl X11 fallback.'
  };
}

function listXdotoolWindows() {
  const xdotool = findCommand('xdotool');
  if (!xdotool || !process.env.DISPLAY) {
    return {
      ok: false,
      backend: X11_XDOTOOL_BACKEND,
      windows: [],
      error: xdotool ? 'DISPLAY is not set for xdotool.' : 'xdotool was not found.'
    };
  }
  const ids = run(xdotool, ['search', '--onlyvisible', '--name', '.']);
  if (!ids.ok) {
    return {
      ok: false,
      backend: X11_XDOTOOL_BACKEND,
      windows: [],
      error: ids.stderr || ids.stdout || ids.error || 'xdotool search failed.'
    };
  }
  const windows = ids.stdout
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 100)
    .map((id) => {
      const title = run(xdotool, ['getwindowname', id]);
      return {
        window_id: id,
        title: title.ok ? title.stdout.trim() : null,
        backend: X11_XDOTOOL_BACKEND,
        focused: false
      };
    });
  return {
    ok: true,
    backend: X11_XDOTOOL_BACKEND,
    windows,
    error: null,
    permissions_hint: null,
    note: 'Window list came from xdotool X11 fallback.'
  };
}

function parseWmctrlWindows(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const windowId = parts[0];
      const desktop = parts[1];
      const pidMaybe = Number(parts[2]);
      const wmClass = parts[3] ?? null;
      const host = parts[4] ?? null;
      const title = parts.slice(5).join(' ') || null;
      return {
        window_id: windowId,
        desktop,
        pid: Number.isFinite(pidMaybe) ? pidMaybe : null,
        wm_class: wmClass,
        host,
        title,
        backend: 'wmctrl',
        focused: false
      };
    });
}

function parseKwinWindows(stdout) {
  const payload = JSON.parse(stdout);
  if (payload && typeof payload.error === 'string' && payload.error.length > 0) {
    throw new Error(payload.error);
  }
  const rawWindows = Array.isArray(payload) ? payload : payload.windows;
  if (!Array.isArray(rawWindows)) {
    throw new Error('KWin payload did not include a windows array.');
  }
  return rawWindows
    .filter((window) => !jsonValueAsBool(window.desktopWindow))
    .filter((window) => !jsonValueAsBool(window.dock))
    .filter((window) => !jsonValueAsBool(window.skipTaskbar))
    .filter((window) => jsonValueAsBool(window.normalWindow) !== false)
    .map((window) => {
      const uuid = normalizeKwinUuid(window.uuid ?? window.internalId);
      if (!uuid) {
        return null;
      }
      const width = jsonValueAsInteger(window.width);
      const height = jsonValueAsInteger(window.height);
      const bounds =
        width != null && height != null
          ? {
              x: jsonValueAsInteger(window.x),
              y: jsonValueAsInteger(window.y),
              width,
              height
            }
          : null;
      const appId = cleanString(window.desktopFile) ?? cleanString(window.resourceClass);
      const wmClass =
        cleanString(window.resourceClass) ??
        cleanString(window.windowClass) ??
        cleanString(window.resourceName);
      return {
        window_id: kwinWindowIdFromUuid(uuid),
        native_id: uuid,
        title: cleanString(window.caption),
        app_id: appId,
        wm_class: wmClass,
        pid: jsonValueAsInteger(window.pid),
        bounds,
        workspace: jsonValueAsInteger(window.workspace),
        focused: jsonValueAsBool(window.active) === true,
        hidden: jsonValueAsBool(window.minimized) === true,
        client_type: cleanString(window.clientType),
        backend: KWIN_BACKEND
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.window_id.localeCompare(b.window_id));
}

function parseGnomeIntrospectWindows(stdout) {
  const payload = JSON.parse(stdout);
  const entries = Array.isArray(payload)
    ? payload
    : Object.entries(payload.windows ?? payload).map(([windowId, properties]) => ({
        window_id: windowId,
        properties
      }));
  return entries
    .map((entry) => {
      const props = entry.properties ?? entry;
      const width = jsonValueAsInteger(props.width);
      const height = jsonValueAsInteger(props.height);
      const bounds =
        width != null && height != null
          ? {
              x: jsonValueAsInteger(props.x),
              y: jsonValueAsInteger(props.y),
              width,
              height
            }
          : null;
      return {
        window_id: String(entry.window_id ?? props.window_id ?? props.id),
        title: cleanString(props.title),
        app_id: cleanString(props['app-id'] ?? props.app_id),
        wm_class: cleanString(props['wm-class'] ?? props.wm_class),
        pid: jsonValueAsInteger(props.pid),
        bounds,
        workspace: jsonValueAsInteger(props.workspace),
        focused: jsonValueAsBool(props['has-focus'] ?? props.has_focus) === true,
        hidden: jsonValueAsBool(props['is-hidden'] ?? props.is_hidden) === true,
        client_type: gnomeClientTypeName(props['client-type'] ?? props.client_type),
        backend: GNOME_INTROSPECT_BACKEND
      };
    })
    .filter((window) => window.window_id && window.window_id !== 'undefined')
    .sort((a, b) => Number(a.window_id) - Number(b.window_id));
}

function activateKwinWindow(params = {}) {
  const target = windowTargetFromParams(params);
  if (!target) {
    return { attempted: false, output: null };
  }
  const probe = probeKwinWindowBackend();
  if (!probe.can_focus_windows) {
    return { attempted: false, output: null };
  }
  const windows = listKwinWindows();
  if (!windows.ok) {
    return {
      attempted: true,
      output: actionFailure('activate_window', windows.error, params, KWIN_BACKEND)
    };
  }
  const window = matchWindowTarget(windows.windows, target);
  if (!window?.native_id) {
    return {
      attempted: true,
      output: actionFailure('activate_window', 'No KWin window matched the requested target.', params, KWIN_BACKEND)
    };
  }
  const result = runDesktopDbusHelper('kwin-activate', [window.native_id]);
  if (!result.ok) {
    return {
      attempted: true,
      output: actionFailure(
        'activate_window',
        result.stderr || result.stdout || result.error || 'KWin activation helper failed.',
        params,
        KWIN_BACKEND
      )
    };
  }
  let payload = null;
  try {
    payload = JSON.parse(result.stdout);
  } catch {}
  const ok = payload?.ok !== false;
  return {
    attempted: true,
    output: {
      ok,
      implemented: true,
      action: 'activate_window',
      backend: KWIN_BACKEND,
      exact_window_focus: ok,
      focus: ok ? { requested_window: window, exact_window_focused: true } : null,
      message: ok
        ? `Focused KWin window ${window.window_id}.`
        : `KWin activation failed: ${payload?.error ?? result.stdout}`,
      received: params
    }
  };
}

function activateGnomeWindow(params = {}) {
  const target = windowTargetFromParams(params);
  if (!target) {
    return { attempted: false, output: null };
  }
  const probe = probeGnomeIntrospectBackend();
  if (!probe.can_list_windows) {
    return { attempted: false, output: null };
  }
  const windows = listGnomeIntrospectWindows();
  if (!windows.ok) {
    return {
      attempted: true,
      output: actionFailure('activate_window', windows.error, params, GNOME_INTROSPECT_BACKEND)
    };
  }
  const window = matchWindowTarget(windows.windows, target);
  if (!window?.app_id) {
    return {
      attempted: true,
      output: actionFailure(
        'activate_window',
        'No GNOME window with an app_id matched the requested target.',
        params,
        GNOME_INTROSPECT_BACKEND
      )
    };
  }
  const result = runDesktopDbusHelper('gnome-focus-app', [window.app_id]);
  return {
    attempted: true,
    output: {
      ok: result.ok,
      implemented: true,
      action: 'activate_window',
      backend: GNOME_INTROSPECT_BACKEND,
      exact_window_focus: false,
      focus: result.ok ? { requested_window: window, exact_window_focused: false, app_focused: true } : null,
      message: result.ok
        ? `Asked GNOME Shell to focus app_id ${window.app_id}. Exact window focus is unavailable through GNOME Introspect.`
        : result.stderr || result.stdout || result.error || 'GNOME app-level focus failed.',
      received: params
    }
  };
}

function windowTargetFromParams(params = {}) {
  const windowId = cleanString(params.window_id ?? params.windowId);
  const title = cleanString(params.title);
  const appId = cleanString(params.app_id ?? params.appId);
  const wmClass = cleanString(params.wm_class ?? params.wmClass);
  if (!windowId && !title && !appId && !wmClass) {
    return null;
  }
  return { window_id: windowId, title, app_id: appId, wm_class: wmClass };
}

function matchWindowTarget(windows, target) {
  if (target.window_id) {
    return windows.find((window) => String(window.window_id) === target.window_id);
  }
  if (target.app_id) {
    return windows.find((window) => stringEqual(window.app_id, target.app_id));
  }
  if (target.wm_class) {
    return windows.find((window) => stringEqual(window.wm_class, target.wm_class));
  }
  if (target.title) {
    return (
      windows.find((window) => stringEqual(window.title, target.title)) ??
      windows.find((window) => stringIncludes(window.title, target.title))
    );
  }
  return null;
}

function stringEqual(left, right) {
  return cleanString(left)?.toLowerCase() === cleanString(right)?.toLowerCase();
}

function stringIncludes(left, right) {
  const haystack = cleanString(left)?.toLowerCase();
  const needle = cleanString(right)?.toLowerCase();
  return Boolean(haystack && needle && haystack.includes(needle));
}

function normalizeKwinUuid(value) {
  const text = cleanString(value)?.replace(/^\{/, '').replace(/\}$/, '').trim().toLowerCase();
  return text || null;
}

function kwinWindowIdFromUuid(uuid) {
  const normalized = normalizeKwinUuid(uuid) ?? String(uuid ?? '').trim().toLowerCase();
  let hash = 0xcbf29ce484222325n;
  for (const byte of Buffer.from(normalized, 'utf8')) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString();
}

function gnomeClientTypeName(value) {
  const text = cleanString(value);
  if (text && !/^\d+$/.test(text)) {
    return text;
  }
  const number = jsonValueAsInteger(value);
  if (number === 0) {
    return 'wayland';
  }
  if (number === 1) {
    return 'x11';
  }
  return number == null ? null : 'unknown';
}

function jsonValueAsBool(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (/^true$/i.test(value.trim())) {
      return true;
    }
    if (/^false$/i.test(value.trim())) {
      return false;
    }
  }
  return null;
}

function jsonValueAsInteger(value) {
  if (value == null || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function cleanString(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text && text !== 'null' ? text : null;
}

function focusedWindow() {
  for (const backend of [listKwinWindows, listGnomeIntrospectWindows]) {
    const result = backend();
    if (!result.ok || result.windows.length === 0) {
      continue;
    }
    const focused = result.windows.find((window) => window.focused);
    if (focused) {
      return {
        ok: true,
        backend: result.backend,
        focused_window: focused,
        error: null,
        permissions_hint: null
      };
    }
    return {
      ok: false,
      backend: result.backend,
      focused_window: null,
      error: `${result.backend} listed windows but did not mark an active focused window.`,
      permissions_hint: result.permissions_hint ?? null
    };
  }
  const xdotool = findCommand('xdotool');
  if (!xdotool || !process.env.DISPLAY) {
    return {
      ok: false,
      backend: 'unavailable',
      focused_window: null,
      error: 'Focused window lookup requires xdotool on an X11 session.',
      permissions_hint: null
    };
  }
  const id = run(xdotool, ['getactivewindow']);
  if (!id.ok) {
    return { ok: false, backend: 'xdotool', focused_window: null, error: id.stderr || id.stdout };
  }
  const title = run(xdotool, ['getwindowname', id.stdout.trim()]);
  return {
    ok: true,
    backend: X11_XDOTOOL_BACKEND,
    focused_window: {
      window_id: id.stdout.trim(),
      title: title.ok ? title.stdout.trim() : null
    },
    error: null
  };
}

function activateWindow(params) {
  const kwin = activateKwinWindow(params);
  if (kwin.attempted) {
    return kwin.output;
  }
  const gnome = activateGnomeWindow(params);
  if (gnome.attempted) {
    return gnome.output;
  }
  const xdotool = findCommand('xdotool');
  const wmctrl = findCommand('wmctrl');
  if (params.window_id && xdotool) {
    const result = run(xdotool, ['windowactivate', String(params.window_id)]);
    return actionOutput('activate_window', result, params, X11_XDOTOOL_BACKEND);
  }
  if (params.title && wmctrl) {
    const result = run(wmctrl, ['-a', String(params.title)]);
    return actionOutput('activate_window', result, params, X11_WMCTRL_BACKEND);
  }
  return {
    ok: false,
    implemented: true,
    action: 'activate_window',
    message: 'No supported window activation backend is available for the provided target.',
    received: params
  };
}

function getAppState(params = {}) {
  const includeScreenshot = params.include_screenshot !== false;
  const screenshot = includeScreenshot ? captureScreenshot({ keep_file: false }) : null;
  const windows = listWindows();
  return {
    ok: true,
    app_name_or_bundle_identifier: params.app_name_or_bundle_identifier ?? null,
    backend: 'linux-desktop-fallback',
    screenshot: screenshot?.ok ? screenshot : null,
    screenshot_error: screenshot && !screenshot.ok ? screenshot.message : null,
    windows: windows.windows ?? [],
    accessibility_tree: [],
    accessibility_error:
      'AT-SPI tree extraction is not implemented in this JavaScript fallback backend; use doctor for readiness checks.',
    diagnostics: doctorReport(),
    message: includeScreenshot
      ? 'Returned process/window context and attempted a screenshot.'
      : 'Returned process/window context without a screenshot.'
  };
}

function captureScreenshot(params = {}) {
  const explicitPath = normalizeOutputPath(params.output_path ?? params.outputPath);
  const outputPath =
    explicitPath ?? path.join(desktopTempDir(), `codex-computer-use-${process.pid}-${Date.now()}.png`);
  const includeData = params.include_data !== false && params.includeData !== false;
  const attempts = screenshotAttempts(outputPath);
  const attemptResults = [];
  for (const attempt of attempts) {
    const result = run(attempt.command, attempt.args, { timeout: 15000 });
    const bytes = waitForStableNonEmptyFile(outputPath, 5000);
    const readable = bytes > 0;
    attemptResults.push(screenshotAttemptResult(attempt, result, readable, bytes));
    if (result.ok && readable && bytes > 0) {
      const bytes = fs.readFileSync(outputPath);
      const keepFile = explicitPath != null || params.keep_file === true || params.keepFile === true;
      if (!keepFile) {
        try {
          fs.unlinkSync(outputPath);
        } catch {}
      }
      return {
        ok: true,
        source: attempt.name,
        path: keepFile ? outputPath : null,
        mime_type: 'image/png',
        bytes: bytes.length,
        data: includeData ? bytes.toString('base64') : null,
        attempts: attemptResults,
        message: `Screenshot captured through ${attempt.name}.`
      };
    }
  }
  return {
    ok: false,
    source: null,
    path: explicitPath ?? null,
    mime_type: null,
    bytes: 0,
    data: null,
    attempts: attemptResults,
    env: desktopEnvPresence(),
    message:
      screenshotFailureMessage(attemptResults)
  };
}

function desktopTempDir() {
  const candidates = [
    process.env.XDG_RUNTIME_DIR ? path.join(process.env.XDG_RUNTIME_DIR, 'codex-computer-use') : null,
    process.env.TMPDIR,
    process.env.TEMP,
    process.env.TMP,
    os.tmpdir(),
    '/dev/shm'
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      if (directoryWritable(candidate)) {
        return candidate;
      }
    } catch {}
  }
  return os.tmpdir();
}

function screenshotAttempts(outputPath) {
  const attempts = [];
  const gnomeScreenshot = findCommand('gnome-screenshot');
  if (gnomeScreenshot) {
    attempts.push({ name: 'gnome-screenshot', command: gnomeScreenshot, args: ['-f', outputPath] });
  }
  const grim = findCommand('grim');
  if (grim) {
    attempts.push({ name: 'grim', command: grim, args: [outputPath] });
  }
  const spectacle = findCommand('spectacle');
  if (spectacle) {
    attempts.push({ name: 'spectacle', command: spectacle, args: ['-b', '-n', '-o', outputPath] });
  }
  const imageMagickImport = findCommand('import');
  if (imageMagickImport && process.env.DISPLAY) {
    attempts.push({ name: 'imagemagick-import', command: imageMagickImport, args: ['-window', 'root', outputPath] });
  }
  return attempts;
}

function probeScreenshotCapture(screenshot) {
  if (!screenshot.available) {
    return {
      ok: false,
      skipped: true,
      reason: screenshot.reason ?? 'No screenshot backend was detected.'
    };
  }
  if (process.env.CODEX_LINUX_COMPUTER_USE_DISABLE_SCREENSHOT_PROBE === '1') {
    return {
      ok: false,
      skipped: true,
      reason: 'Screenshot live probe was disabled by CODEX_LINUX_COMPUTER_USE_DISABLE_SCREENSHOT_PROBE=1.'
    };
  }
  const result = captureScreenshot({ include_data: false, keep_file: false });
  return {
    ok: result.ok,
    source: result.source,
    bytes: result.bytes,
    attempts: result.attempts ?? [],
    env: desktopEnvPresence(),
    message: result.message
  };
}

function screenshotAttemptResult(attempt, result, fileReadableAfterRun, bytes) {
  return {
    name: attempt.name,
    command: attempt.command,
    args: attempt.args,
    ok: result.ok && fileReadableAfterRun && bytes > 0,
    exit_code: result.status,
    signal: result.signal,
    stdout: truncateText(result.stdout),
    stderr: truncateText(result.stderr),
    error: result.error,
    file_readable: fileReadableAfterRun,
    bytes,
    env: desktopEnvPresence()
  };
}

function screenshotFailureMessage(attemptResults) {
  if (attemptResults.length === 0) {
    return 'No supported screenshot backend was detected. Install or enable gnome-screenshot, grim, spectacle, ImageMagick import, GNOME Shell DBus, or XDG Desktop Portal screenshot support.';
  }
  const attempted = attemptResults
    .map((attempt) => {
      const detail = attempt.stderr || attempt.stdout || attempt.error || 'no stderr';
      return `${attempt.name}(exit=${attempt.exit_code ?? 'null'}, bytes=${attempt.bytes}, stderr=${JSON.stringify(detail)})`;
    })
    .join('; ');
  return `No supported screenshot backend succeeded. Attempts: ${attempted}`;
}

function click(params = {}) {
  const x = Number(params.x);
  const y = Number(params.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return actionFailure('click', 'click requires numeric x and y coordinates.', params);
  }
  const count = Math.max(1, Math.min(10, Number(params.click_count ?? params.clickCount ?? 1)));
  const button = mouseButton(params.button);
  const xdotool = findCommand('xdotool');
  if (xdotool && process.env.DISPLAY) {
    const result = run(xdotool, ['mousemove', String(Math.round(x)), String(Math.round(y)), 'click', '--repeat', String(count), button.xdotool]);
    return actionOutput('click', result, params, 'xdotool');
  }
  const ydotool = findCommand('ydotool');
  if (ydotool) {
    const move = run(ydotool, ['mousemove', '--absolute', String(Math.round(x)), String(Math.round(y))]);
    if (!move.ok) {
      return actionOutput('click', move, params, 'ydotool');
    }
    const result = run(ydotool, ['click', button.ydotool]);
    return actionOutput('click', result, params, 'ydotool');
  }
  return actionFailure('click', 'No input backend is available. Install ydotool or xdotool, or enable a portal input backend.', params);
}

function scroll(params = {}) {
  const direction = String(params.direction ?? 'down').toLowerCase();
  const clicks = String(Math.max(1, Math.round(Math.abs(Number(params.pages ?? 1)) * 5)));
  const button = direction === 'up' ? '4' : direction === 'left' ? '6' : direction === 'right' ? '7' : '5';
  const xdotool = findCommand('xdotool');
  if (xdotool && process.env.DISPLAY) {
    const prefix =
      Number.isFinite(Number(params.x)) && Number.isFinite(Number(params.y))
        ? ['mousemove', String(Math.round(Number(params.x))), String(Math.round(Number(params.y)))]
        : [];
    const result = run(xdotool, [...prefix, 'click', '--repeat', clicks, button]);
    return actionOutput('scroll', result, params, 'xdotool');
  }
  return actionFailure('scroll', 'No scroll backend is available. Install xdotool for X11 or ydotool for input fallback.', params);
}

function drag(params = {}) {
  const required = ['start_x', 'start_y', 'end_x', 'end_y'];
  for (const key of required) {
    if (!Number.isFinite(Number(params[key]))) {
      return actionFailure('drag', `drag requires numeric ${key}.`, params);
    }
  }
  const xdotool = findCommand('xdotool');
  if (xdotool && process.env.DISPLAY) {
    const result = run(xdotool, [
      'mousemove',
      String(Math.round(Number(params.start_x))),
      String(Math.round(Number(params.start_y))),
      'mousedown',
      '1',
      'mousemove',
      String(Math.round(Number(params.end_x))),
      String(Math.round(Number(params.end_y))),
      'mouseup',
      '1'
    ]);
    return actionOutput('drag', result, params, 'xdotool');
  }
  return actionFailure('drag', 'No drag backend is available. Install xdotool for X11 or use ydotool with direct pointer support.', params);
}

function pressKey(params = {}) {
  const key = String(params.key ?? '').trim();
  if (!key) {
    return actionFailure('press_key', 'press_key requires a key.', params);
  }
  const xdotool = findCommand('xdotool');
  if (xdotool && process.env.DISPLAY) {
    const result = run(xdotool, ['key', key.replaceAll('+', '+')]);
    return actionOutput('press_key', result, params, 'xdotool');
  }
  return actionFailure('press_key', 'No keyboard backend is available. Install xdotool for X11 or configure ydotool/portal input.', params);
}

function typeText(params = {}) {
  const text = String(params.text ?? '');
  if (!text) {
    return actionFailure('type_text', 'type_text requires non-empty text.', params);
  }
  const xdotool = findCommand('xdotool');
  if (xdotool && process.env.DISPLAY) {
    const result = run(xdotool, ['type', '--', text]);
    return actionOutput('type_text', result, params, 'xdotool');
  }
  const ydotool = findCommand('ydotool');
  if (ydotool) {
    const result = run(ydotool, ['type', text]);
    return actionOutput('type_text', result, params, 'ydotool');
  }
  return actionFailure('type_text', 'No text input backend is available. Install ydotool or xdotool.', params);
}

function unimplementedAction(action, params) {
  return {
    ok: false,
    implemented: false,
    action,
    message:
      'This JavaScript fallback backend does not expose AT-SPI element mutation yet. Use coordinate input or install a native Linux Computer Use backend with AT-SPI action support.',
    received: params
  };
}

function actionOutput(action, result, received, backend = null) {
  return {
    ok: result.ok,
    implemented: true,
    action,
    backend,
    message: result.ok ? `Action sent${backend ? ` through ${backend}` : ''}.` : result.stderr || result.stdout || 'Action failed.',
    stdout: result.stdout,
    stderr: result.stderr,
    received
  };
}

function actionFailure(action, message, received, backend = null) {
  return {
    ok: false,
    implemented: true,
    action,
    backend,
    message,
    received
  };
}

function mouseButton(value) {
  const name = String(value ?? 'left').toLowerCase();
  if (name === 'right') {
    return { xdotool: '3', ydotool: '0xC1' };
  }
  if (name === 'middle') {
    return { xdotool: '2', ydotool: '0xC2' };
  }
  return { xdotool: '1', ydotool: '0xC0' };
}

function detectCommands(names) {
  return Object.fromEntries(names.map((name) => [name, findCommand(name)]));
}

function detectAtSpi(commands) {
  if (process.env.NO_AT_BRIDGE === '1') {
    return { available: false, backend: 'at-spi', reason: 'NO_AT_BRIDGE=1 disables AT-SPI.' };
  }
  if (commands.gsettings) {
    const result = run(commands.gsettings, ['get', 'org.gnome.desktop.interface', 'toolkit-accessibility']);
    if (result.ok) {
      return {
        available: /\btrue\b/i.test(result.stdout),
        backend: 'gsettings',
        value: result.stdout.trim(),
        reason: /\btrue\b/i.test(result.stdout) ? null : 'GNOME toolkit accessibility is disabled.'
      };
    }
  }
  return {
    available: Boolean(process.env.DBUS_SESSION_BUS_ADDRESS),
    backend: 'session-bus',
    reason: process.env.DBUS_SESSION_BUS_ADDRESS ? null : 'DBUS_SESSION_BUS_ADDRESS is not set.'
  };
}

function detectScreenshotBackend(commands) {
  const available = [
    commands['gnome-screenshot'] && 'gnome-screenshot',
    commands.grim && 'grim',
    commands.spectacle && 'spectacle',
    commands.import && process.env.DISPLAY && 'imagemagick-import',
    commands.gdbus && 'gnome-shell-dbus-or-portal',
    commands.busctl && 'dbus-or-portal'
  ].filter(Boolean);
  return {
    available: available.length > 0,
    backends: available,
    reason: available.length > 0 ? null : 'No screenshot command, GNOME DBus helper, or portal DBus tool was found.'
  };
}

function detectInputBackend(commands) {
  const uinputWritable = canWrite('/dev/uinput');
  const ydotoolSocket = ydotoolSocketPath();
  const backends = [
    uinputWritable && '/dev/uinput',
    commands.ydotool && 'ydotool',
    commands.xdotool && process.env.DISPLAY && 'xdotool',
    process.env.XDG_SESSION_TYPE === 'wayland' && 'xdg-remote-desktop-portal'
  ].filter(Boolean);
  return {
    available: backends.length > 0,
    backends,
    uinput_writable: uinputWritable,
    ydotool_socket: ydotoolSocket,
    reason:
      backends.length > 0
        ? null
        : 'No writable /dev/uinput, ydotool, xdotool, or portal input path was detected.'
  };
}

function detectWindowBackend(commands) {
  const staticProbes = {
    [KWIN_BACKEND]: probeKwinWindowBackend(commands),
    [GNOME_INTROSPECT_BACKEND]: probeGnomeIntrospectBackend(commands),
    [X11_WMCTRL_BACKEND]: probeWmctrlWindowBackend(commands),
    [X11_XDOTOOL_BACKEND]: probeXdotoolWindowBackend(commands)
  };
  const probes = {
    [KWIN_BACKEND]: liveWindowListProbe(staticProbes[KWIN_BACKEND], listKwinWindows),
    [GNOME_INTROSPECT_BACKEND]: liveWindowListProbe(
      staticProbes[GNOME_INTROSPECT_BACKEND],
      listGnomeIntrospectWindows
    ),
    [X11_WMCTRL_BACKEND]: liveWindowListProbe(staticProbes[X11_WMCTRL_BACKEND], listWmctrlWindows),
    [X11_XDOTOOL_BACKEND]: liveWindowListProbe(staticProbes[X11_XDOTOOL_BACKEND], listXdotoolWindows)
  };
  const backends = [
    probes[KWIN_BACKEND].can_list_windows && KWIN_BACKEND,
    probes[GNOME_INTROSPECT_BACKEND].can_list_windows && GNOME_INTROSPECT_BACKEND,
    probes[X11_WMCTRL_BACKEND].can_list_windows && X11_WMCTRL_BACKEND,
    probes[X11_XDOTOOL_BACKEND].can_list_windows && X11_XDOTOOL_BACKEND
  ].filter(Boolean);
  const focusBackends = Object.values(probes)
    .filter((probe) => probe.can_focus_windows)
    .map((probe) => probe.backend);
  return {
    available: backends.length > 0,
    can_list_windows: backends.length > 0,
    can_focus_windows: focusBackends.length > 0,
    can_focus_apps: Object.values(probes).some((probe) => probe.can_focus_apps),
    backends,
    focus_backends: focusBackends,
    preferred_backend: backends[0] ?? null,
    probes,
    reason:
      backends.length > 0
        ? null
        : windowPermissionHint()
  };
}

function liveWindowListProbe(staticProbe, listBackend) {
  if (!staticProbe.can_list_windows) {
    return staticProbe;
  }
  const result = listBackend();
  const canListWindows = Boolean(result.ok && Array.isArray(result.windows));
  const liveProbe = {
    ok: canListWindows,
    backend: result.backend,
    windows: result.windows?.length ?? 0,
    error: result.error ?? null,
    helper: result.helper ?? null
  };
  const detail = canListWindows
    ? `${staticProbe.detail} Live ${staticProbe.backend} window listing returned ${liveProbe.windows} window(s).`
    : `${staticProbe.detail} Live ${staticProbe.backend} window listing failed: ${
        result.error ?? 'backend did not return a window list'
      }`;
  const { backend, command, helper, exact_focus: exactFocus } = staticProbe;
  return windowProbe(
    backend,
    canListWindows,
    canListWindows && staticProbe.can_focus_apps,
    canListWindows && staticProbe.can_focus_windows,
    detail,
    {
      command,
      helper,
      ...(exactFocus == null ? {} : { exact_focus: exactFocus }),
      static_probe: {
        ok: staticProbe.ok,
        can_list_windows: staticProbe.can_list_windows,
        can_focus_apps: staticProbe.can_focus_apps,
        can_focus_windows: staticProbe.can_focus_windows,
        detail: staticProbe.detail
      },
      live_probe: liveProbe
    }
  );
}

function probeKwinWindowBackend(commands = detectCommands(['gdbus', 'python3'])) {
  const helper = pythonDbusHelperProbe(commands);
  if (!commands.gdbus) {
    return windowProbe(KWIN_BACKEND, false, false, false, 'gdbus was not found for KWin DBus probing.', { helper });
  }
  const result = run(commands.gdbus, [
    'introspect',
    '--session',
    '--dest',
    KWIN_SCRIPTING_SERVICE,
    '--object-path',
    KWIN_SCRIPTING_OBJECT_PATH
  ]);
  const hasLoadScript =
    result.ok &&
    result.stdout.includes(KWIN_SCRIPTING_INTERFACE) &&
    result.stdout.includes('loadScript');
  const ok = hasLoadScript && helper.ok;
  const detail = ok
    ? 'KWin scripting loadScript is available on the session bus.'
    : [
        hasLoadScript
          ? null
          : `KWin scripting unavailable: ${result.stderr || result.stdout || result.error || 'loadScript not found'}`,
        helper.ok ? null : `Python DBus helper unavailable: ${helper.detail}`
      ]
        .filter(Boolean)
        .join(' ');
  return windowProbe(KWIN_BACKEND, ok, ok, ok, detail, {
    command: commands.gdbus,
    helper
  });
}

function probeGnomeIntrospectBackend(commands = detectCommands(['gdbus', 'python3'])) {
  const helper = pythonDbusHelperProbe(commands);
  if (!commands.gdbus) {
    return windowProbe(
      GNOME_INTROSPECT_BACKEND,
      false,
      false,
      false,
      'gdbus was not found for GNOME Shell Introspect probing.',
      { helper }
    );
  }
  const getWindows = run(
    commands.gdbus,
    [
      'call',
      '--session',
      '--dest',
      GNOME_SHELL_SERVICE,
      '--object-path',
      GNOME_INTROSPECT_OBJECT_PATH,
      '--method',
      `${GNOME_INTROSPECT_INTERFACE}.GetWindows`
    ],
    { timeout: 3500, maxBuffer: 256 * 1024 }
  );
  const focusProbe = run(commands.gdbus, [
    'introspect',
    '--session',
    '--dest',
    GNOME_SHELL_SERVICE,
    '--object-path',
    GNOME_SHELL_OBJECT_PATH
  ]);
  const canFocusApps = focusProbe.ok && focusProbe.stdout.includes('FocusApp');
  const ok = getWindows.ok && helper.ok;
  const detail = ok
    ? 'GNOME Shell Introspect GetWindows is available on the session bus.'
    : [
        getWindows.ok
          ? null
          : `GNOME Shell Introspect unavailable: ${getWindows.stderr || getWindows.stdout || getWindows.error || 'GetWindows failed'}`,
        helper.ok ? null : `Python DBus helper unavailable: ${helper.detail}`
      ]
        .filter(Boolean)
        .join(' ');
  return windowProbe(GNOME_INTROSPECT_BACKEND, ok, canFocusApps && ok, false, detail, {
    command: commands.gdbus,
    helper,
    exact_focus: false
  });
}

function probeWmctrlWindowBackend(commands = detectCommands(['wmctrl'])) {
  if (!commands.wmctrl) {
    return windowProbe(X11_WMCTRL_BACKEND, false, false, false, 'wmctrl was not found.');
  }
  const result = run(commands.wmctrl, ['-lx']);
  return windowProbe(
    X11_WMCTRL_BACKEND,
    result.ok,
    result.ok,
    false,
    result.ok ? 'wmctrl -lx succeeded.' : result.stderr || result.stdout || result.error || 'wmctrl -lx failed.',
    { command: commands.wmctrl }
  );
}

function probeXdotoolWindowBackend(commands = detectCommands(['xdotool'])) {
  if (!commands.xdotool) {
    return windowProbe(X11_XDOTOOL_BACKEND, false, false, false, 'xdotool was not found.');
  }
  if (!process.env.DISPLAY) {
    return windowProbe(X11_XDOTOOL_BACKEND, false, false, false, 'DISPLAY is not set for xdotool.');
  }
  const result = run(commands.xdotool, ['search', '--onlyvisible', '--name', '.']);
  return windowProbe(
    X11_XDOTOOL_BACKEND,
    result.ok,
    result.ok,
    result.ok,
    result.ok
      ? 'xdotool visible-window search succeeded.'
      : result.stderr || result.stdout || result.error || 'xdotool visible-window search failed.',
    { command: commands.xdotool }
  );
}

function windowProbe(backend, canListWindows, canFocusApps, canFocusWindows, detail, extra = {}) {
  return {
    backend,
    ok: canListWindows,
    can_list_windows: canListWindows,
    can_focus_apps: canFocusApps,
    can_focus_windows: canFocusWindows,
    detail,
    ...extra
  };
}

function pythonDbusHelperProbe(commands = detectCommands(['python3'])) {
  if (pythonDbusProbeCache) {
    return pythonDbusProbeCache;
  }
  if (!commands.python3) {
    pythonDbusProbeCache = { ok: false, command: null, detail: 'python3 was not found.' };
    return pythonDbusProbeCache;
  }
  const result = run(commands.python3, [
    '-c',
    'import dbus, dbus.service, dbus.mainloop.glib; from gi.repository import GLib'
  ]);
  pythonDbusProbeCache = {
    ok: result.ok,
    command: commands.python3,
    detail: result.ok ? 'python3 dbus and gi modules are available.' : result.stderr || result.error || result.stdout
  };
  return pythonDbusProbeCache;
}

function windowPermissionHint() {
  return [
    'On KDE/Plasma, ensure KWin exposes org.kde.KWin /Scripting on the session bus.',
    'On Ubuntu GNOME, ensure org.gnome.Shell.Introspect.GetWindows is permitted.',
    'For X11 fallback, wmctrl or xdotool must run successfully against DISPLAY.'
  ].join(' ');
}

function detectPackageManager(commands) {
  if (commands['apt-get']) {
    return 'apt';
  }
  if (commands.dnf) {
    return 'dnf';
  }
  if (commands.pacman) {
    return 'pacman';
  }
  if (commands.zypper) {
    return 'zypper';
  }
  return null;
}

function ydotoolSocketPath() {
  const candidates = [
    process.env.YDOTOOL_SOCKET,
    process.env.XDG_RUNTIME_DIR ? path.join(process.env.XDG_RUNTIME_DIR, '.ydotool_socket') : null,
    '/tmp/.ydotool_socket'
  ].filter(Boolean);
  return candidates.find((candidate) => fileReadable(candidate)) ?? null;
}

function runDesktopDbusHelper(mode, args = []) {
  const python = findCommand('python3');
  if (!python) {
    return {
      ok: false,
      status: 127,
      signal: null,
      stdout: '',
      stderr: 'python3 was not found.',
      error: null
    };
  }
  const helperPath = path.join(
    desktopTempDir(),
    `codex-computer-use-dbus-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.py`
  );
  try {
    fs.writeFileSync(helperPath, buildDesktopDbusHelper(), 'utf8');
    return run(python, [helperPath, mode, ...args.map(String)], {
      timeout: WINDOW_HELPER_COMMAND_MS,
      maxBuffer: 2 * 1024 * 1024
    });
  } finally {
    try {
      fs.unlinkSync(helperPath);
    } catch {}
  }
}

function helperResultSummary(result) {
  return {
    status: result.status,
    signal: result.signal,
    stdout: truncateText(result.stdout),
    stderr: truncateText(result.stderr),
    error: result.error
  };
}

function buildDesktopDbusHelper() {
  return String.raw`#!/usr/bin/env python3
# KWin JavaScript snippets are adapted from ilysenko/codex-desktop-linux,
# MIT License, Copyright (c) 2025 ilysenko.
import json
import os
import sys
import tempfile
import time
import traceback

import dbus
import dbus.service
import dbus.mainloop.glib
from gi.repository import GLib

KWIN_SERVICE = 'org.kde.KWin'
KWIN_SCRIPTING_PATH = '/Scripting'
KWIN_SCRIPTING_IFACE = 'org.kde.kwin.Scripting'
KWIN_SCRIPT_IFACE = 'org.kde.kwin.Script'
KWIN_CALLBACK_IFACE = 'com.openai.Codex.KWinWindowQuery'
GNOME_SERVICE = 'org.gnome.Shell'
GNOME_INTROSPECT_PATH = '/org/gnome/Shell/Introspect'
GNOME_INTROSPECT_IFACE = 'org.gnome.Shell.Introspect'
GNOME_SHELL_PATH = '/org/gnome/Shell'
GNOME_SHELL_IFACE = 'org.gnome.Shell'


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    if mode == 'kwin-list':
        print(call_kwin_script(kwin_list_script), flush=True)
        return
    if mode == 'kwin-activate':
        if len(sys.argv) < 3:
            raise RuntimeError('kwin-activate requires a target uuid')
        print(call_kwin_script(lambda service, path, iface, plugin: kwin_activate_script(
            service, path, iface, plugin, sys.argv[2]
        )), flush=True)
        return
    if mode == 'gnome-list':
        print(json.dumps({'windows': gnome_windows()}), flush=True)
        return
    if mode == 'gnome-focus-app':
        if len(sys.argv) < 3:
            raise RuntimeError('gnome-focus-app requires an app_id')
        gnome_focus_app(sys.argv[2])
        print(json.dumps({'ok': True, 'app_id': sys.argv[2]}), flush=True)
        return
    raise RuntimeError('unknown helper mode: %s' % mode)


def session_bus():
    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    return dbus.SessionBus()


class KWinCallback(dbus.service.Object):
    def __init__(self, bus, object_path, loop):
        super().__init__(bus, object_path)
        self.loop = loop
        self.payload = None

    @dbus.service.method(KWIN_CALLBACK_IFACE, in_signature='s', out_signature='')
    def ReceiveWindows(self, payload):
        self.payload = str(payload)
        self.loop.quit()

    @dbus.service.method(KWIN_CALLBACK_IFACE, in_signature='s', out_signature='')
    def ReceiveResult(self, payload):
        self.payload = str(payload)
        self.loop.quit()


def call_kwin_script(script_builder):
    bus = session_bus()
    unique_name = bus.get_unique_name()
    plugin_name = 'codex_kwin_window_query_%s_%d' % (os.getpid(), int(time.time() * 1000000))
    object_path = '/com/openai/Codex/KWinWindowQuery/%s' % plugin_name
    loop = GLib.MainLoop()
    callback = KWinCallback(bus, object_path, loop)
    script_path = None
    loaded = False
    start_method = None
    start_errors = []

    def timeout():
        loop.quit()
        return False

    GLib.timeout_add(2500, timeout)
    try:
        script = script_builder(unique_name, object_path, KWIN_CALLBACK_IFACE, plugin_name)
        fd, script_path = tempfile.mkstemp(
            prefix=plugin_name + '_',
            suffix='.js',
            dir=kwin_script_dir(),
        )
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            handle.write(script)
        os.chmod(script_path, 0o644)
        script_id = bus.call_blocking(
            KWIN_SERVICE,
            KWIN_SCRIPTING_PATH,
            KWIN_SCRIPTING_IFACE,
            'loadScript',
            'ss',
            (script_path, plugin_name),
        )
        loaded = True
        try:
            script_object_path = '%s/Script%d' % (KWIN_SCRIPTING_PATH, int(script_id))
            bus.call_blocking(
                KWIN_SERVICE,
                script_object_path,
                KWIN_SCRIPT_IFACE,
                'run',
                '',
                (),
            )
            start_method = 'script-run'
        except Exception:
            start_errors.append(traceback.format_exc().strip())
            try:
                bus.call_blocking(
                    KWIN_SERVICE,
                    KWIN_SCRIPTING_PATH,
                    KWIN_SCRIPTING_IFACE,
                    'start',
                    '',
                    (),
                )
                start_method = 'scripting-start'
            except Exception:
                start_errors.append(traceback.format_exc().strip())
                raise
        loop.run()
        if callback.payload is None:
            detail = 'timed out waiting for KWin script callback'
            if start_method:
                detail += ' after %s' % start_method
            if start_errors:
                detail += '; start errors: %s' % ' | '.join(start_errors)
            raise RuntimeError(detail)
        return callback.payload
    finally:
        try:
            if loaded:
                bus.call_blocking(
                    KWIN_SERVICE,
                    KWIN_SCRIPTING_PATH,
                    KWIN_SCRIPTING_IFACE,
                    'unloadScript',
                    's',
                    (plugin_name,),
                )
        except Exception:
            pass
        try:
            callback.remove_from_connection()
        except Exception:
            pass
        if script_path:
            try:
                os.unlink(script_path)
            except OSError:
                pass


def kwin_script_dir():
    candidates = []
    explicit = os.environ.get('CODEX_LINUX_COMPUTER_USE_KWIN_SCRIPT_DIR')
    if explicit:
        candidates.append(explicit)
    xdg_cache = os.environ.get('XDG_CACHE_HOME')
    if xdg_cache:
        candidates.append(os.path.join(xdg_cache, 'codex-computer-use', 'kwin-scripts'))
    home = os.environ.get('HOME')
    if home:
        candidates.append(os.path.join(home, '.cache', 'codex-computer-use', 'kwin-scripts'))
    candidates.append(os.path.join(os.getcwd(), '.tmp', 'codex-computer-use-kwin-scripts'))
    candidates.append(tempfile.gettempdir())
    for candidate in candidates:
        if not candidate:
            continue
        try:
            os.makedirs(candidate, mode=0o700, exist_ok=True)
            fd, probe_path = tempfile.mkstemp(prefix='probe_', suffix='.tmp', dir=candidate)
            os.close(fd)
            os.unlink(probe_path)
            return candidate
        except Exception:
            continue
    return None


def kwin_list_script(service_name, object_path, iface, plugin_name):
    return r'''(function() {
    var serviceName = %s;
    var objectPath = %s;
    var iface = %s;
    var pluginName = %s;

    function sendWindows(payload) {
        payload.backend = "kwin";
        payload.pluginName = pluginName;
        callDBus(serviceName, objectPath, iface, "ReceiveWindows", JSON.stringify(payload), function() {});
    }

    try {

    function read(obj, key) {
        try {
            if (obj === null || obj === undefined) {
                return null;
            }
            var value = obj[key];
            if (typeof value === "function") {
                return null;
            }
            return serialize(value);
        } catch (error) {
            return null;
        }
    }

    function serialize(value) {
        if (value === null || value === undefined) {
            return null;
        }
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            return value;
        }
        if (Array.isArray(value)) {
            return value.map(serialize);
        }
        try {
            if (typeof value.toString === "function") {
                return value.toString();
            }
        } catch (error) {}
        return null;
    }

    function geometry(window) {
        var frame = null;
        try {
            frame = window.frameGeometry;
        } catch (error) {}
        var x = read(window, "x");
        var y = read(window, "y");
        var width = read(window, "width");
        var height = read(window, "height");
        return {
            x: x !== null ? x : read(frame, "x"),
            y: y !== null ? y : read(frame, "y"),
            width: width !== null ? width : read(frame, "width"),
            height: height !== null ? height : read(frame, "height")
        };
    }

    function firstDesktop(window) {
        var desktops = read(window, "desktops");
        if (!Array.isArray(desktops) || desktops.length === 0) {
            return null;
        }
        var first = desktops[0];
        var parsed = parseInt(first, 10);
        return isFinite(parsed) ? parsed : null;
    }

    function clientType(window) {
        if (read(window, "waylandClient")) {
            return "wayland";
        }
        if (read(window, "x11Client")) {
            return "x11";
        }
        return null;
    }

    function listWindows() {
        try {
            if (typeof workspace.windowList === "function") {
                return workspace.windowList();
            }
        } catch (error) {}
        try {
            if (workspace.stackingOrder && typeof workspace.stackingOrder.length === "number") {
                return workspace.stackingOrder;
            }
        } catch (error) {}
        return [];
    }

    var activeWindow = null;
    try {
        activeWindow = workspace.activeWindow;
    } catch (error) {}
    var windows = listWindows().map(function(window) {
        var geo = geometry(window);
        return {
            uuid: read(window, "uuid"),
            internalId: read(window, "internalId"),
            caption: read(window, "caption"),
            desktopFile: read(window, "desktopFile"),
            resourceClass: read(window, "resourceClass"),
            resourceName: read(window, "resourceName"),
            windowClass: read(window, "windowClass"),
            pid: read(window, "pid"),
            x: geo.x,
            y: geo.y,
            width: geo.width,
            height: geo.height,
            workspace: firstDesktop(window),
            minimized: read(window, "minimized"),
            active: read(window, "active") || window === activeWindow,
            clientType: clientType(window),
            normalWindow: read(window, "normalWindow"),
            desktopWindow: read(window, "desktopWindow"),
            skipTaskbar: read(window, "skipTaskbar"),
            dock: read(window, "dock")
        };
    });

    sendWindows({
        windows: windows
    });
    } catch (error) {
        sendWindows({
            windows: [],
            error: String(error && (error.stack || error.message) || error)
        });
    }
})();''' % (json.dumps(service_name), json.dumps(object_path), json.dumps(iface), json.dumps(plugin_name))


def kwin_activate_script(service_name, object_path, iface, plugin_name, target_uuid):
    return r'''(function() {
    var serviceName = %s;
    var objectPath = %s;
    var iface = %s;
    var pluginName = %s;
    var targetUuid = %s;

    function send(payload) {
        payload.backend = "kwin";
        payload.pluginName = pluginName;
        callDBus(serviceName, objectPath, iface, "ReceiveResult", JSON.stringify(payload), function() {});
    }

    function serialize(value) {
        if (value === null || value === undefined) {
            return null;
        }
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            return value;
        }
        try {
            if (typeof value.toString === "function") {
                return value.toString();
            }
        } catch (error) {}
        return null;
    }

    function read(obj, key) {
        try {
            if (obj === null || obj === undefined) {
                return null;
            }
            var value = obj[key];
            if (typeof value === "function") {
                return null;
            }
            return serialize(value);
        } catch (error) {
            return null;
        }
    }

    function normalizeUuid(value) {
        var text = serialize(value);
        if (text === null || text === undefined) {
            return null;
        }
        text = String(text).trim().toLowerCase();
        if (text.charAt(0) === "{" && text.charAt(text.length - 1) === "}") {
            text = text.substring(1, text.length - 1);
        }
        return text.length > 0 ? text : null;
    }

    function windowUuid(window) {
        return normalizeUuid(read(window, "uuid")) || normalizeUuid(read(window, "internalId"));
    }

    function listWindows() {
        try {
            if (typeof workspace.windowList === "function") {
                return workspace.windowList();
            }
        } catch (error) {}
        try {
            if (workspace.stackingOrder && typeof workspace.stackingOrder.length === "number") {
                return workspace.stackingOrder;
            }
        } catch (error) {}
        return [];
    }

    function activateDesktop(window) {
        var desktops = null;
        try {
            desktops = window.desktops;
        } catch (error) {}
        if (desktops && desktops.length > 0) {
            try {
                workspace.currentDesktop = desktops[0];
            } catch (error) {}
        }
    }

    try {
        var targetWindow = null;
        var windows = listWindows();
        for (var i = 0; i < windows.length; i++) {
            if (windowUuid(windows[i]) === targetUuid) {
                targetWindow = windows[i];
                break;
            }
        }

        if (!targetWindow) {
            throw new Error("window not found: " + targetUuid);
        }

        try {
            targetWindow.minimized = false;
        } catch (error) {}
        activateDesktop(targetWindow);

        var activated = false;
        var activationError = null;
        try {
            workspace.activeWindow = targetWindow;
            activated = true;
        } catch (error) {
            activationError = error;
        }
        if (!activated) {
            try {
                workspace.activeClient = targetWindow;
                activated = true;
            } catch (error) {
                activationError = error;
            }
        }
        if (!activated) {
            try {
                if (typeof targetWindow.activate === "function") {
                    targetWindow.activate();
                    activated = true;
                }
            } catch (error) {
                activationError = error;
            }
        }
        if (!activated) {
            throw activationError || new Error("workspace refused activeWindow assignment");
        }

        try {
            if (typeof workspace.raiseWindow === "function") {
                workspace.raiseWindow(targetWindow);
            }
        } catch (error) {}

        send({
            ok: true,
            uuid: windowUuid(targetWindow)
        });
    } catch (error) {
        send({
            ok: false,
            error: String(error && error.message ? error.message : error)
        });
    }
})();''' % (
        json.dumps(service_name),
        json.dumps(object_path),
        json.dumps(iface),
        json.dumps(plugin_name),
        json.dumps(str(target_uuid).strip().lower().strip('{}')),
    )


def gnome_windows():
    bus = session_bus()
    proxy = dbus.Interface(
        bus.get_object(GNOME_SERVICE, GNOME_INTROSPECT_PATH),
        dbus_interface=GNOME_INTROSPECT_IFACE,
    )
    return to_plain(proxy.GetWindows())


def gnome_focus_app(app_id):
    bus = session_bus()
    proxy = dbus.Interface(
        bus.get_object(GNOME_SERVICE, GNOME_SHELL_PATH),
        dbus_interface=GNOME_SHELL_IFACE,
    )
    proxy.FocusApp(app_id)


def to_plain(value):
    if isinstance(value, dbus.Boolean):
        return bool(value)
    if isinstance(value, (dbus.Byte, dbus.Int16, dbus.Int32, dbus.Int64, dbus.UInt16, dbus.UInt32, dbus.UInt64)):
        return int(value)
    if isinstance(value, dbus.Double):
        return float(value)
    if isinstance(value, (dbus.String, dbus.ObjectPath, dbus.Signature)):
        return str(value)
    if isinstance(value, (dbus.Array, list, tuple)):
        return [to_plain(item) for item in value]
    if isinstance(value, (dbus.Dictionary, dict)):
        return {str(key): to_plain(item) for key, item in value.items()}
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        if os.environ.get('CODEX_LINUX_COMPUTER_USE_HELPER_TRACE') == '1':
            traceback.print_exc(file=sys.stderr)
        sys.exit(1)
`;
}

function hydrateDesktopSessionEnv() {
  const recovered = recoverDesktopSessionEnv();
  for (const key of DESKTOP_ENV_KEYS) {
    if (!process.env[key] && recovered[key]) {
      process.env[key] = recovered[key];
    }
  }
  if (!process.env.XDG_RUNTIME_DIR) {
    const runtimeDir = defaultRuntimeDir();
    if (runtimeDir && fileReadable(runtimeDir)) {
      process.env.XDG_RUNTIME_DIR = runtimeDir;
    }
  }
  if (!process.env.DBUS_SESSION_BUS_ADDRESS && process.env.XDG_RUNTIME_DIR) {
    const busPath = path.join(process.env.XDG_RUNTIME_DIR, 'bus');
    if (fileReadable(busPath)) {
      process.env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${busPath}`;
    }
  }
  if (!process.env.WAYLAND_DISPLAY && process.env.XDG_RUNTIME_DIR) {
    const waylandDisplay = findWaylandDisplay(process.env.XDG_RUNTIME_DIR);
    if (waylandDisplay) {
      process.env.WAYLAND_DISPLAY = waylandDisplay;
    }
  }
  if (!process.env.XDG_SESSION_TYPE && process.env.WAYLAND_DISPLAY) {
    process.env.XDG_SESSION_TYPE = 'wayland';
  }
  if (!process.env.XDG_CURRENT_DESKTOP && process.env.DESKTOP_SESSION) {
    const desktop = inferDesktopFromSession(process.env.DESKTOP_SESSION);
    if (desktop) {
      process.env.XDG_CURRENT_DESKTOP = desktop;
    }
  }
}

function recoverDesktopSessionEnv() {
  const candidates = [];
  const explicitEnvFile = process.env.CODEX_LINUX_COMPUTER_USE_DESKTOP_ENV_FILE;
  if (explicitEnvFile) {
    const env = readEnvFile(explicitEnvFile);
    if (env) {
      return env;
    }
  }
  candidates.push(...readDesktopEnvFromProc());
  candidates.sort((a, b) => scoreDesktopEnv(b.env, b.source) - scoreDesktopEnv(a.env, a.source));
  return candidates[0]?.env ?? {};
}

function readDesktopEnvFromProc() {
  let entries;
  try {
    entries = fs.readdirSync('/proc', { withFileTypes: true });
  } catch {
    return [];
  }
  const currentUid = currentUserId();
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
      continue;
    }
    const pid = entry.name;
    if (currentUid != null && procUid(pid) !== currentUid) {
      continue;
    }
    const comm = readProcText(pid, 'comm').trim();
    const cmdline = readProcText(pid, 'cmdline').replaceAll('\0', ' ');
    const source = comm || cmdline || pid;
    if (!isDesktopEnvSource(source) && !isDesktopEnvSource(cmdline)) {
      continue;
    }
    const env = readProcEnv(pid);
    if (env && DESKTOP_ENV_KEYS.some((key) => env[key])) {
      candidates.push({ source: `/proc/${pid}/environ:${source}`, env });
    }
  }
  return candidates;
}

function isDesktopEnvSource(value) {
  const lower = String(value ?? '').toLowerCase();
  return DESKTOP_PROCESS_NAME_HINTS.some((hint) => lower.includes(hint));
}

function readProcEnv(pid) {
  return readEnvFile(path.join('/proc', String(pid), 'environ'));
}

function readEnvFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  const text = raw.toString('utf8');
  const separator = text.includes('\0') ? '\0' : '\n';
  const env = {};
  for (const entry of text.split(separator)) {
    const index = entry.indexOf('=');
    if (index <= 0) {
      continue;
    }
    const key = entry.slice(0, index);
    if (!DESKTOP_ENV_KEYS.includes(key)) {
      continue;
    }
    env[key] = entry.slice(index + 1);
  }
  return env;
}

function readProcText(pid, name) {
  try {
    return fs.readFileSync(path.join('/proc', String(pid), name), 'utf8');
  } catch {
    return '';
  }
}

function procUid(pid) {
  const status = readProcText(pid, 'status');
  const uidLine = status.split('\n').find((line) => line.startsWith('Uid:'));
  const uid = Number(uidLine?.split(/\s+/)[1]);
  return Number.isFinite(uid) ? uid : null;
}

function scoreDesktopEnv(env, source) {
  let score = 0;
  for (const key of DESKTOP_ENV_KEYS) {
    if (env[key]) {
      score += 10;
    }
  }
  if (env.WAYLAND_DISPLAY) {
    score += 20;
  }
  if (env.DBUS_SESSION_BUS_ADDRESS) {
    score += 20;
  }
  if (isDesktopEnvSource(source)) {
    score += 5;
  }
  return score;
}

function defaultRuntimeDir() {
  const uid = currentUserId();
  return uid == null ? null : `/run/user/${uid}`;
}

function currentUserId() {
  if (typeof process.getuid === 'function') {
    return process.getuid();
  }
  try {
    return os.userInfo().uid;
  } catch {
    return null;
  }
}

function findWaylandDisplay(runtimeDir) {
  let entries;
  try {
    entries = fs.readdirSync(runtimeDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const socket = entries
    .filter((entry) => entry.name.startsWith('wayland-') && !entry.name.endsWith('.lock'))
    .map((entry) => entry.name)
    .sort()[0];
  return socket ?? null;
}

function inferDesktopFromSession(value) {
  const lower = String(value ?? '').toLowerCase();
  if (lower.includes('plasma') || lower.includes('kde')) {
    return 'KDE';
  }
  if (lower.includes('gnome')) {
    return 'GNOME';
  }
  if (lower.includes('xfce')) {
    return 'XFCE';
  }
  if (lower.includes('sway')) {
    return 'sway';
  }
  return null;
}

function desktopSessionReport() {
  hydrateDesktopSessionEnv();
  return {
    desktop: process.env.XDG_CURRENT_DESKTOP || null,
    session_type: process.env.XDG_SESSION_TYPE || null,
    wayland_display: process.env.WAYLAND_DISPLAY || null,
    display: process.env.DISPLAY || null,
    runtime_dir: process.env.XDG_RUNTIME_DIR || null,
    dbus_session_bus_address: process.env.DBUS_SESSION_BUS_ADDRESS || null,
    env: desktopEnvPresence()
  };
}

function desktopEnvPresence(env = process.env) {
  return {
    present: DESKTOP_ENV_KEYS.filter((key) => Boolean(env[key])),
    missing: DESKTOP_ENV_KEYS.filter((key) => !env[key])
  };
}

function childProcessEnv(extraEnv = null) {
  hydrateDesktopSessionEnv();
  return extraEnv == null ? { ...process.env } : { ...process.env, ...extraEnv };
}

function findCommand(name) {
  if (name.includes(path.sep) && canExecute(name)) {
    return name;
  }
  const pathEntries = String(process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, name);
    if (canExecute(candidate)) {
      return candidate;
    }
  }
  return null;
}

function run(commandName, commandArgs = [], options = {}) {
  const result = spawnSync(commandName, commandArgs, {
    encoding: 'utf8',
    timeout: options.timeout ?? MAX_COMMAND_MS,
    maxBuffer: options.maxBuffer ?? 2 * 1024 * 1024,
    env: childProcessEnv(options.env)
  });
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ? formatError(result.error) : null
  };
}

function normalizeOutputPath(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return path.resolve(value);
}

function canExecute(candidate) {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function canWrite(candidate) {
  try {
    fs.accessSync(candidate, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function directoryWritable(candidate) {
  try {
    return fs.statSync(candidate).isDirectory() && canWrite(candidate);
  } catch {
    return false;
  }
}

function fileReadable(candidate) {
  try {
    fs.accessSync(candidate, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function fileSize(candidate) {
  try {
    return fs.statSync(candidate).size;
  } catch {
    return 0;
  }
}

function waitForStableNonEmptyFile(candidate, timeoutMs) {
  const start = Date.now();
  let lastSize = 0;
  let stableSince = 0;
  for (;;) {
    const size = fileReadable(candidate) ? fileSize(candidate) : 0;
    if (size > 0) {
      if (size !== lastSize) {
        lastSize = size;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= 300) {
        return size;
      }
    }
    if (Date.now() - start >= timeoutMs) {
      return lastSize > 0 ? lastSize : 0;
    }
    sleepSync(100);
  }
}

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function truncateText(value, limit = 1200) {
  const text = String(value ?? '');
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function screenshotToolResult(result) {
  if (!result.ok || !result.data) {
    return textToolResult(result, { isError: true });
  }
  const text = {
    ok: true,
    source: result.source,
    path: result.path,
    mime_type: result.mime_type,
    bytes: result.bytes,
    message: result.message
  };
  return {
    content: [
      { type: 'text', text: JSON.stringify(text, null, 2) },
      { type: 'image', data: result.data, mimeType: result.mime_type }
    ],
    isError: false
  };
}

function textToolResult(value, options = {}) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    isError: options.isError ?? value?.ok === false
  };
}

function writeMcp(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
