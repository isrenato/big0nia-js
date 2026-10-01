// packages/core/src/project/project-index-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildProjectIndex } from './project-index-builder.js';
import { parseSource } from '../test-support/parse-source.js';

describe('buildProjectIndex', () => {
  it('indexes classes across files by file path and name', () => {
    const userService = parseSource('class UserService { process() {} }', '/virtual/user-service.ts');
    const orderMatcher = parseSource('class OrderMatcher { matchAll() {} }', '/virtual/order-matcher.ts');

    const index = buildProjectIndex(new Map([
      [userService.fileName, userService],
      [orderMatcher.fileName, orderMatcher],
    ]));

    expect(index.classesByFile.get('/virtual/user-service.ts')?.get('UserService')?.filePath).toBe('/virtual/user-service.ts');
    expect(index.classesByFile.get('/virtual/order-matcher.ts')?.get('OrderMatcher')).toBeDefined();
    expect(index.classesByFile.get('/virtual/user-service.ts')?.get('DoesNotExist')).toBeUndefined();
  });

  it('indexes top-level functions by file path and name', () => {
    const file = parseSource('function helper() {} function declaredOnly(): void;', '/virtual/helpers.ts');
    const index = buildProjectIndex(new Map([[file.fileName, file]]));

    expect(index.functionsByFile.get('/virtual/helpers.ts')?.get('helper')).toBeDefined();
  });

  it('does not index functions or classes nested inside another function', () => {
    const file = parseSource('function outer() { function inner() {} class Local {} }', '/virtual/nested.ts');
    const index = buildProjectIndex(new Map([[file.fileName, file]]));

    expect(index.functionsByFile.get('/virtual/nested.ts')?.get('outer')).toBeDefined();
    expect(index.functionsByFile.get('/virtual/nested.ts')?.get('inner')).toBeUndefined();
    expect(index.classesByFile.get('/virtual/nested.ts')?.get('Local')).toBeUndefined();
  });

  it('does not index a function declaration with no body (an overload signature)', () => {
    const file = parseSource('function overload(x: number): void; function overload(x: string): void { console.log(x); }', '/virtual/overloads.ts');
    const index = buildProjectIndex(new Map([[file.fileName, file]]));

    expect(index.functionsByFile.get('/virtual/overloads.ts')?.get('overload')).toBeDefined();
  });

  it('indexes direct interface implementors only, not implementors reached via extends', () => {
    const file = parseSource(
      `
      interface RepositoryInterface {}
      class BaseRepository implements RepositoryInterface {}
      class ExtendingRepository extends BaseRepository {}
      `,
      '/virtual/repos.ts'
    );

    const index = buildProjectIndex(new Map([[file.fileName, file]]));
    const implementors = index.interfaceImplementors.get('RepositoryInterface') ?? [];

    expect(implementors.map((c) => c.name)).toEqual(['BaseRepository']);
  });

  it('retains every source file for later import resolution', () => {
    const file = parseSource('export {};', '/virtual/empty.ts');
    const index = buildProjectIndex(new Map([[file.fileName, file]]));

    expect(index.sourceFilesByPath.get('/virtual/empty.ts')).toBe(file);
  });
});
