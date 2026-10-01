import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { run } from './run.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'big0nia-cli-')));
  tempDirs.push(dir);
  for (const [name, contents] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), contents);
  }
  return dir;
}

async function runIn(cwd: string, ...argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const code = await run(argv, { cwd, stdout: (s) => (stdout += s), stderr: (s) => (stderr += s) });
  return { code, stdout, stderr };
}

const JOIN = `for (const user of users) {
  for (const order of orders) {
    if (user.id === order.userId) {
      console.log(order);
    }
  }
}
`;

const CLEAN = 'for (const user of users) { console.log(user); }\n';

describe('big0nia analyse', () => {
  it('prints usage and exits 1 when no path is given', async () => {
    const result = await runIn(project({}), 'analyse');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Usage: big0nia analyse');
  });

  it('prints usage and exits 1 for an unknown command', async () => {
    const result = await runIn(project({}), 'scan', 'src');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Usage: big0nia analyse');
  });

  it('prints usage and exits 1 for an unknown option', async () => {
    const result = await runIn(project({ 'src/a.ts': CLEAN }), 'analyse', '--bogus', 'src');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Usage: big0nia analyse');
  });

  it('reports a finding in text format with a cwd-relative path and exits 1', async () => {
    const result = await runIn(project({ 'src/a.ts': JOIN }), 'analyse', 'src');
    expect(result.code).toBe(1);
    expect(result.stdout).toBe(
      'src/a.ts:1\n' +
        '  Potential O(n × m) algorithm: every user is compared against every order using id vs userId. Estimated complexity: O(users × orders).\n' +
        '  Tip: Index orders by userId before the loop, then look up matches instead of scanning. Possible complexity after optimization: O(users + orders).\n' +
        '\n' +
        '1 issue(s) found.\n'
    );
  });

  it('prints "No issues found." and exits 0 on a clean run', async () => {
    const result = await runIn(project({ 'src/a.ts': CLEAN }), 'analyse', 'src');
    expect(result).toEqual({ code: 0, stdout: 'No issues found.\n', stderr: '' });
  });

  it('prints only JSON with --json', async () => {
    const result = await runIn(project({ 'src/a.ts': JOIN }), 'analyse', '--json', 'src');
    expect(result.code).toBe(1);
    const rows = JSON.parse(result.stdout);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ file: 'src/a.ts', line: 1, ruleId: 'nested-loop-join' });
  });

  it('prints [] with --json on a clean run', async () => {
    const result = await runIn(project({ 'src/a.ts': CLEAN }), 'analyse', 'src', '--json');
    expect(result).toEqual({ code: 0, stdout: '[]\n', stderr: '' });
  });

  it('reports a missing path, still analyses the rest, and exits 1', async () => {
    const result = await runIn(project({ 'src/a.ts': CLEAN }), 'analyse', 'nope', 'src');
    expect(result.code).toBe(1);
    expect(result.stderr).toBe('Path not found: nope\n');
    expect(result.stdout).toBe('No issues found.\n');
  });

  it('skips an unparsable file, still analyses the rest, and exits 1', async () => {
    const result = await runIn(project({ 'src/bad.ts': 'for (const x of {', 'src/good.ts': JOIN }), 'analyse', 'src');
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("Skipping src/bad.ts: '}' expected.\n");
    expect(result.stdout).toContain('src/good.ts:1');
  });

  it('reports a malformed config on stderr, analyses nothing, and exits 1', async () => {
    const result = await runIn(project({ 'big0nia.config.json': '{ignorePaths:', 'src/a.ts': JOIN }), 'analyse', 'src');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Malformed config file');
    expect(result.stdout).toBe('');
  });

  it('silently skips an excluded file even when it has a syntax error', async () => {
    const dir = project({
      'big0nia.config.json': JSON.stringify({ ignorePaths: ['**/*.generated.ts'] }),
      'src/api.generated.ts': 'for (const x of {',
      'src/a.ts': CLEAN,
    });
    expect(await runIn(dir, 'analyse', 'src')).toEqual({ code: 0, stdout: 'No issues found.\n', stderr: '' });
  });

  it('reports a cross-file interprocedural join through a relative import', async () => {
    const dir = project({
      'src/helper.ts': `export function matchOrders(user) {
  for (const order of orders) {
    if (user.id === order.userId) {
      console.log(order);
    }
  }
}
`,
      'src/run.ts': `import { matchOrders } from './helper.js';
for (const user of users) {
  matchOrders(user);
}
`,
    });
    const result = await runIn(dir, 'analyse', '--json', 'src');
    const rows = JSON.parse(result.stdout);
    expect(rows).toContainEqual(
      expect.objectContaining({ file: 'src/run.ts', line: 2, ruleId: 'interprocedural-loop-join' })
    );
    expect(rows.find((r: { ruleId: string }) => r.ruleId === 'interprocedural-loop-join').tip).toContain(
      `inner loop at ${path.join(dir, 'src/helper.ts')}:2`
    );
  });

  it('sorts findings by file and then by line', async () => {
    const result = await runIn(project({ 'src/b.ts': JOIN, 'src/a.ts': `${CLEAN}${JOIN}` }), 'analyse', '--json', 'src');
    const rows = JSON.parse(result.stdout) as { file: string; line: number }[];
    expect(rows.map((r) => `${r.file}:${r.line}`)).toEqual(['src/a.ts:2', 'src/b.ts:1']);
  });
});
