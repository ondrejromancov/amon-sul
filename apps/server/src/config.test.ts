import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findConfig, loadConfig } from './config.js';

function writeTmp(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'amon-sul-test-'));
  const path = join(dir, 'amon-sul.config.yaml');
  writeFileSync(path, content);
  return path;
}

describe('findConfig', () => {
  it('walks up parent directories to find the config', () => {
    const path = writeTmp('projects:\n  - id: p\n');
    const dir = join(path, '..');
    const nested = join(dir, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    expect(findConfig(nested)).toBe(path);
  });

  it('returns null when nothing is found up the tree', () => {
    const empty = mkdtempSync(join(tmpdir(), 'amon-sul-empty-'));
    expect(findConfig(empty)).toBeNull();
  });
});

describe('loadConfig', () => {
  it('returns null when the file does not exist', () => {
    expect(loadConfig('/nonexistent/amon-sul.config.yaml')).toBeNull();
  });

  it('applies defaults for poll and events', () => {
    const cfg = loadConfig(writeTmp('projects:\n  - id: my-proj\n'));
    expect(cfg).not.toBeNull();
    expect(cfg!.poll).toEqual({ resourcesSeconds: 60, eventsSeconds: 30 });
    expect(cfg!.events).toEqual({ lookbackHours: 24, maxEntries: 100 });
    expect(cfg!.projects[0]).toMatchObject({ id: 'my-proj', edges: [], layout: {} });
  });

  it('parses edges and layout with type/name shorthand', () => {
    const cfg = loadConfig(
      writeTmp(
        [
          'projects:',
          '  - id: rankforge-prod',
          '    name: Rankforge',
          '    edges:',
          '      - [run/api, pubsub/crawl-jobs]',
          '    layout:',
          '      run/api: [0, 0]',
          '      pubsub/crawl-jobs: [1, 0]',
        ].join('\n'),
      ),
    );
    expect(cfg!.projects[0]!.edges).toEqual([['run/api', 'pubsub/crawl-jobs']]);
    expect(cfg!.projects[0]!.layout['run/api']).toEqual([0, 0]);
  });

  it('rejects bad resource keys with a readable error', () => {
    const path = writeTmp('projects:\n  - id: p\n    edges:\n      - [nope/api, run/api]\n');
    expect(() => loadConfig(path)).toThrow(/nope\/api|<type>\/<name>|edges/);
  });

  it('rejects invalid YAML with a readable error', () => {
    const path = writeTmp('projects: [\n');
    expect(() => loadConfig(path)).toThrow(/YAML/);
  });

  it('rejects an empty project list', () => {
    const path = writeTmp('projects: []\n');
    expect(() => loadConfig(path)).toThrow(/projects/);
  });
});
