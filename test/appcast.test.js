import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppcastXml, resolveRelease } from '../src/appcast.js';

test('parseAppcastXml extracts ordered releases', () => {
  const xml = `<?xml version="1.0"?>
  <rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
    <channel>
      <item>
        <title>26.324.21641</title>
        <pubDate>Thu, 26 Mar 2026 01:21:43 +0000</pubDate>
        <sparkle:version>1228</sparkle:version>
        <enclosure url="https://example.com/Codex-darwin-arm64-26.324.21641.zip" />
      </item>
      <item>
        <title>26.324.21329</title>
        <pubDate>Wed, 25 Mar 2026 21:51:23 +0000</pubDate>
        <sparkle:version>1214</sparkle:version>
        <enclosure url="https://example.com/Codex-darwin-arm64-26.324.21329.zip" />
      </item>
    </channel>
  </rss>`;

  const releases = parseAppcastXml(xml);
  assert.equal(releases.length, 2);
  assert.deepEqual(releases[0], {
    version: '26.324.21641',
    buildNumber: '1228',
    pubDate: 'Thu, 26 Mar 2026 01:21:43 +0000',
    enclosureUrl: 'https://example.com/Codex-darwin-arm64-26.324.21641.zip'
  });
});

test('resolveRelease returns latest by default and exact match when requested', () => {
  const releases = [
    { version: '2.0.0', buildNumber: '20', pubDate: 'b', enclosureUrl: 'https://example.com/2.zip' },
    { version: '1.0.0', buildNumber: '10', pubDate: 'a', enclosureUrl: 'https://example.com/1.zip' }
  ];

  assert.equal(resolveRelease(releases).version, '2.0.0');
  assert.equal(resolveRelease(releases, '1.0.0').buildNumber, '10');
  assert.throws(() => resolveRelease(releases, '3.0.0'), /Version 3.0.0 was not found/);
});
