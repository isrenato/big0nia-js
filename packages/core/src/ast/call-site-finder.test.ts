// packages/core/src/ast/call-site-finder.test.ts
import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { findAllCallSites } from './call-site-finder.js';
import { parseSource } from '../test-support/parse-source.js';

function bodyOf(source: string): ts.Statement[] {
  const file = parseSource(`function wrapper() { ${source} }`);
  const fn = file.statements[0] as ts.FunctionDeclaration;
  return Array.from(fn.body!.statements);
}

describe('findAllCallSites', () => {
  it('finds a bare call statement', () => {
    const sites = findAllCallSites(bodyOf('helper();'));
    expect(sites).toHaveLength(1);
    expect(sites[0].call.getText()).toBe('helper()');
    expect(sites[0].precedingStmts).toEqual([]);
  });

  it('finds a call assigned to a const declaration', () => {
    const sites = findAllCallSites(bodyOf('const a = 1; const x = helper(a);'));
    expect(sites).toHaveLength(1);
    expect(sites[0].call.getText()).toBe('helper(a)');
    expect(sites[0].precedingStmts).toHaveLength(1);
  });

  it('finds a call assigned via a plain assignment', () => {
    const sites = findAllCallSites(bodyOf('let x; x = helper();'));
    expect(sites).toHaveLength(1);
  });

  it('finds a returned call', () => {
    const sites = findAllCallSites(bodyOf('return helper();'));
    expect(sites).toHaveLength(1);
  });

  it('finds a call nested inside an if guard, with preceding statements from both scopes', () => {
    const sites = findAllCallSites(bodyOf('const a = 1; if (a) { const b = 2; helper(b); }'));
    expect(sites).toHaveLength(1);
    expect(sites[0].precedingStmts).toHaveLength(2);
  });

  it('does not find a call only reachable through an else branch', () => {
    const sites = findAllCallSites(bodyOf('if (x) { doThing(); } else { helper(); }'));
    expect(sites.map((s) => s.call.getText())).toEqual(['doThing()']);
  });

  it('does not descend into a nested loop', () => {
    const sites = findAllCallSites(bodyOf('for (const x of xs) { helper(x); }'));
    expect(sites).toHaveLength(0);
  });

  it('finds no call sites in an empty body', () => {
    expect(findAllCallSites([])).toEqual([]);
  });
});
