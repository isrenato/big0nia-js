// packages/core/src/project/call-target-resolver.test.ts
import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { resolveCallTarget, resolveCallableReference } from './call-target-resolver.js';
import { buildProjectIndex } from './project-index-builder.js';
import { parseSource } from '../test-support/parse-source.js';
import type { ProjectIndex } from './project-index.js';

function callExprIn(source: string, fileName = 'test.ts'): { call: ts.CallExpression; file: ts.SourceFile; precedingStmts: ts.Statement[] } {
  const file = parseSource(source, fileName);
  const fn = file.statements.filter(ts.isFunctionDeclaration).at(-1)!;
  const stmts = Array.from(fn.body!.statements);
  const last = stmts[stmts.length - 1] as ts.ExpressionStatement;
  return { call: last.expression as ts.CallExpression, file, precedingStmts: stmts.slice(0, -1) };
}

function indexOf(...files: ts.SourceFile[]): ProjectIndex {
  return buildProjectIndex(new Map(files.map((f) => [f.fileName, f])));
}

describe('resolveCallTarget', () => {
  it('resolves a same-file function call', () => {
    const { call, file, precedingStmts } = callExprIn(`
      function helper() {}
      function run() { helper(); }
    `);
    const target = resolveCallTarget(call, precedingStmts, indexOf(file));
    expect(target?.name).toBe('helper');
    expect(target?.ownerClassName).toBeNull();
  });

  it('does not resolve a function declared in a different file', () => {
    const a = parseSource('function run() { helper(); }', '/virtual/a.ts');
    const b = parseSource('function helper() {}', '/virtual/b.ts');
    const fn = a.statements[0] as ts.FunctionDeclaration;
    const call = (fn.body!.statements[0] as ts.ExpressionStatement).expression as ts.CallExpression;
    expect(resolveCallTarget(call, [], indexOf(a, b))).toBeNull();
  });

  it('resolves this.method() within the same class', () => {
    const file = parseSource(`
      class Service {
        run() { this.process(); }
        process() {}
      }
    `);
    const classNode = file.statements[0] as ts.ClassDeclaration;
    const runMethod = classNode.members.find(
      (m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === 'run'
    )!;
    const call = (runMethod.body!.statements[0] as ts.ExpressionStatement).expression as ts.CallExpression;

    const target = resolveCallTarget(call, [], indexOf(file));
    expect(target?.name).toBe('process');
    expect(target?.ownerClassName).toBe('Service');
  });

  it('resolves this.prop.method() via a same-file class field type', () => {
    const file = parseSource(`
      class OrderMatcher { matchAll() {} }
      class UserService {
        orderMatcher: OrderMatcher;
        run() { this.orderMatcher.matchAll(); }
      }
    `);
    const userService = file.statements[1] as ts.ClassDeclaration;
    const runMethod = userService.members.find(
      (m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === 'run'
    )!;
    const call = (runMethod.body!.statements[0] as ts.ExpressionStatement).expression as ts.CallExpression;

    const target = resolveCallTarget(call, [], indexOf(file));
    expect(target?.name).toBe('matchAll');
    expect(target?.ownerClassName).toBe('OrderMatcher');
  });

  it('resolves this.prop.method() via a relative-import class field type', () => {
    const orderMatcher = parseSource('export class OrderMatcher { matchAll() {} }', '/virtual/order-matcher.ts');
    const userService = parseSource(
      `
      import { OrderMatcher } from './order-matcher.js';
      class UserService {
        orderMatcher: OrderMatcher;
        run() { this.orderMatcher.matchAll(); }
      }
      `,
      '/virtual/user-service.ts'
    );
    const classNode = userService.statements[1] as ts.ClassDeclaration;
    const runMethod = classNode.members.find(
      (m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === 'run'
    )!;
    const call = (runMethod.body!.statements[0] as ts.ExpressionStatement).expression as ts.CallExpression;

    const target = resolveCallTarget(call, [], indexOf(userService, orderMatcher));
    expect(target?.name).toBe('matchAll');
    expect(target?.filePath).toBe('/virtual/order-matcher.ts');
  });

  it('resolves via single-implementor interface dispatch when the type is not a class', () => {
    const file = parseSource(`
      interface Matcher { matchAll(): void; }
      class OrderMatcher implements Matcher { matchAll() {} }
      class UserService {
        matcher: Matcher;
        run() { this.matcher.matchAll(); }
      }
    `);
    const userService = file.statements[2] as ts.ClassDeclaration;
    const runMethod = userService.members.find(
      (m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === 'run'
    )!;
    const call = (runMethod.body!.statements[0] as ts.ExpressionStatement).expression as ts.CallExpression;

    const target = resolveCallTarget(call, [], indexOf(file));
    expect(target?.ownerClassName).toBe('OrderMatcher');
  });

  it('resolves a local variable last assigned new ClassName()', () => {
    const { call, file, precedingStmts } = callExprIn(`
      class Service { process() {} }
      function run() { const svc = new Service(); svc.process(); }
    `);
    const target = resolveCallTarget(call, precedingStmts, indexOf(file));
    expect(target?.name).toBe('process');
    expect(target?.ownerClassName).toBe('Service');
  });

  it('does not resolve a local variable reassigned after its new-assignment', () => {
    const source = `
      class Service { process() {} }
      function run(flag) {
        let svc = new Service();
        if (flag) { svc = getOther(); }
        svc.process();
      }
    `;
    const file = parseSource(source);
    const fn = file.statements[1] as ts.FunctionDeclaration;
    const stmts = Array.from(fn.body!.statements);
    const call = (stmts[2] as ts.ExpressionStatement).expression as ts.CallExpression;

    expect(resolveCallTarget(call, stmts.slice(0, 2), indexOf(file))).toBeNull();
  });

  it('resolves a function imported through a relative specifier', () => {
    const helper = parseSource('export function matchOrders() {}', '/virtual/helper.ts');
    const { call, file, precedingStmts } = callExprIn(
      `
      import { matchOrders } from './helper.js';
      function run() { matchOrders(); }
      `,
      '/virtual/run.ts'
    );
    const target = resolveCallTarget(call, precedingStmts, indexOf(file, helper));
    expect(target?.name).toBe('matchOrders');
    expect(target?.filePath).toBe('/virtual/helper.ts');
  });

  it('resolves an aliased relative function import to the exported name', () => {
    const helper = parseSource('export function matchOrders() {}', '/virtual/helper.ts');
    const { call, file, precedingStmts } = callExprIn(
      `
      import { matchOrders as match } from './helper';
      function run() { match(); }
      `,
      '/virtual/run.ts'
    );
    const target = resolveCallTarget(call, precedingStmts, indexOf(file, helper));
    expect(target?.name).toBe('matchOrders');
  });

  it('does not resolve a function imported from a bare package specifier', () => {
    const { call, file, precedingStmts } = callExprIn(
      `
      import { matchOrders } from 'some-package';
      function run() { matchOrders(); }
      `,
      '/virtual/run.ts'
    );
    expect(resolveCallTarget(call, precedingStmts, indexOf(file))).toBeNull();
  });

  it('resolves a call on an interface-annotated parameter with exactly one implementor', () => {
    const { call, file, precedingStmts } = callExprIn(`
      interface Repo { find(): void; }
      class SqlRepo implements Repo { find() {} }
      function run(repo: Repo) { repo.find(); }
    `);
    const target = resolveCallTarget(call, precedingStmts, indexOf(file));
    expect(target?.name).toBe('find');
    expect(target?.ownerClassName).toBe('SqlRepo');
  });

  it('resolves a call on an interface-annotated local variable with exactly one implementor', () => {
    const { call, file, precedingStmts } = callExprIn(`
      interface Repo { find(): void; }
      class SqlRepo implements Repo { find() {} }
      function run() { const repo: Repo = makeRepo(); repo.find(); }
    `);
    const target = resolveCallTarget(call, precedingStmts, indexOf(file));
    expect(target?.ownerClassName).toBe('SqlRepo');
  });

  it('does not resolve an interface-annotated parameter with two implementors', () => {
    const { call, file, precedingStmts } = callExprIn(`
      interface Repo { find(): void; }
      class SqlRepo implements Repo { find() {} }
      class MemoryRepo implements Repo { find() {} }
      function run(repo: Repo) { repo.find(); }
    `);
    expect(resolveCallTarget(call, precedingStmts, indexOf(file))).toBeNull();
  });

  it('does not resolve a dynamically-dispatched call', () => {
    const { call, file, precedingStmts } = callExprIn(`
      function run(handlers) { handlers[key](); }
    `);
    expect(resolveCallTarget(call, precedingStmts, indexOf(file))).toBeNull();
  });
});

describe('resolveCallableReference', () => {
  it('resolves a bare function name reference', () => {
    const file = parseSource('function handler() {} handler;');
    const stmt = file.statements[1] as ts.ExpressionStatement;
    const target = resolveCallableReference(stmt.expression, indexOf(file));
    expect(target?.name).toBe('handler');
  });

  it('resolves a this.method reference', () => {
    const file = parseSource(`
      class Service {
        run() { this.handleItem; }
        handleItem() {}
      }
    `);
    const classNode = file.statements[0] as ts.ClassDeclaration;
    const runMethod = classNode.members.find(
      (m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === 'run'
    )!;
    const stmt = runMethod.body!.statements[0] as ts.ExpressionStatement;

    const target = resolveCallableReference(stmt.expression, indexOf(file));
    expect(target?.name).toBe('handleItem');
    expect(target?.ownerClassName).toBe('Service');
  });
});
