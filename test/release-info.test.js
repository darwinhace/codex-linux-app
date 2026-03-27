import test from 'node:test';
import assert from 'node:assert/strict';
import { collectReleaseInfo, formatReleaseInfo, readInstalledRelease } from '../src/release-info.js';

test('readInstalledRelease returns installed package metadata', async () => {
  const release = await readInstalledRelease('stable', {
    paths: { dataHome: '/tmp/codex-linux-app' },
    extractFileImpl(asarPath, filePath) {
      assert.equal(asarPath, '/tmp/codex-linux-app/channels/stable/app/resources/app.asar');
      assert.equal(filePath, 'package.json');
      return Buffer.from(
        JSON.stringify({
          version: '26.325.21211',
          codexBuildNumber: '1255',
          codexBuildFlavor: 'prod'
        })
      );
    }
  });

  assert.deepEqual(release, {
    channelId: 'stable',
    label: 'prod',
    version: '26.325.21211',
    buildNumber: '1255',
    flavor: 'prod'
  });
});

test('readInstalledRelease returns null when the channel is not installed', async () => {
  const release = await readInstalledRelease('beta', {
    paths: { dataHome: '/tmp/codex-linux-app' },
    extractFileImpl() {
      const error = new Error('missing');
      error.code = 'ENOENT';
      throw error;
    }
  });

  assert.equal(release, null);
});

test('collectReleaseInfo gathers current installs and trims appcasts to three items', async () => {
  const feedXml = `<?xml version="1.0"?>
  <rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
    <channel>
      <item>
        <title>4.0.0</title>
        <pubDate>d</pubDate>
        <sparkle:version>40</sparkle:version>
        <enclosure url="https://example.com/4.zip" />
      </item>
      <item>
        <title>3.0.0</title>
        <pubDate>c</pubDate>
        <sparkle:version>30</sparkle:version>
        <enclosure url="https://example.com/3.zip" />
      </item>
      <item>
        <title>2.0.0</title>
        <pubDate>b</pubDate>
        <sparkle:version>20</sparkle:version>
        <enclosure url="https://example.com/2.zip" />
      </item>
      <item>
        <title>1.0.0</title>
        <pubDate>a</pubDate>
        <sparkle:version>10</sparkle:version>
        <enclosure url="https://example.com/1.zip" />
      </item>
    </channel>
  </rss>`;

  const report = await collectReleaseInfo({
    paths: { dataHome: '/tmp/codex-linux-app' },
    extractFileImpl(asarPath) {
      if (asarPath.includes('/stable/')) {
        return Buffer.from(
          JSON.stringify({
            version: '4.0.0',
            codexBuildNumber: '40',
            codexBuildFlavor: 'prod'
          })
        );
      }

      const error = new Error('missing');
      error.code = 'ENOENT';
      throw error;
    },
    async fetchImpl() {
      return {
        ok: true,
        async text() {
          return feedXml;
        }
      };
    }
  });

  assert.equal(report.hasErrors, false);
  assert.deepEqual(report.current, [
    {
      channelId: 'stable',
      label: 'prod',
      release: {
        channelId: 'stable',
        label: 'prod',
        version: '4.0.0',
        buildNumber: '40',
        flavor: 'prod'
      }
    },
    {
      channelId: 'beta',
      label: 'beta',
      release: null
    }
  ]);
  assert.deepEqual(
    report.appcasts.map((appcast) => appcast.releases.map((release) => release.version)),
    [
      ['4.0.0', '3.0.0', '2.0.0'],
      ['4.0.0', '3.0.0', '2.0.0']
    ]
  );
});

test('formatReleaseInfo renders installed and appcast sections', () => {
  const text = formatReleaseInfo({
    current: [
      {
        channelId: 'stable',
        label: 'prod',
        release: {
          version: '26.325.21211',
          buildNumber: '1255',
          flavor: 'prod'
        }
      },
      {
        channelId: 'beta',
        label: 'beta',
        release: null
      }
    ],
    appcasts: [
      {
        channelId: 'stable',
        label: 'prod',
        releases: [
          { version: '26.325.21211', buildNumber: '1255', pubDate: 'Thu, 26 Mar 2026 21:54:52 +0000' }
        ],
        error: null
      },
      {
        channelId: 'beta',
        label: 'beta',
        releases: [],
        error: 'Failed to fetch beta'
      }
    ],
    hasErrors: true
  });

  assert.equal(
    text,
    [
      'Current installs',
      'prod: 26.325.21211 build 1255 flavor prod',
      'beta: not installed',
      '',
      'Appcast prod',
      '26.325.21211 build 1255 Thu, 26 Mar 2026 21:54:52 +0000',
      '',
      'Appcast beta',
      'error: Failed to fetch beta',
      ''
    ].join('\n')
  );
});
