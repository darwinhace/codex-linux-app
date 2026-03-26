import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseUninstallArgs,
  renderUninstallHelp
} from '../src/uninstall.js';

test('parseUninstallArgs accepts help only', () => {
  assert.deepEqual(parseUninstallArgs([]), { help: false });
  assert.deepEqual(parseUninstallArgs(['--help']), { help: true });
  assert.throws(() => parseUninstallArgs(['--beta']), /Unknown argument/);
});

test('renderUninstallHelp renders the uninstall command', () => {
  assert.match(renderUninstallHelp(), /uninstall-desktop/);
});
