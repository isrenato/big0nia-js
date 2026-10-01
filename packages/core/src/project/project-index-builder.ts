// packages/core/src/project/project-index-builder.ts
import * as ts from 'typescript';
import type { ClassEntry, FunctionEntry, ProjectIndex } from './project-index.js';

export function buildProjectIndex(sourceFiles: ReadonlyMap<string, ts.SourceFile>): ProjectIndex {
  const classesByFile = new Map<string, Map<string, ClassEntry>>();
  const functionsByFile = new Map<string, Map<string, FunctionEntry>>();
  const interfaceImplementors = new Map<string, ClassEntry[]>();

  for (const [filePath, sourceFile] of sourceFiles) {
    const classes = new Map<string, ClassEntry>();
    const functions = new Map<string, FunctionEntry>();

    for (const stmt of sourceFile.statements) {
      if (ts.isClassDeclaration(stmt) && stmt.name) {
        const entry: ClassEntry = { name: stmt.name.text, node: stmt, filePath };
        classes.set(stmt.name.text, entry);
        indexImplementedInterfaces(stmt, entry, interfaceImplementors);
      }

      if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
        functions.set(stmt.name.text, { node: stmt, filePath });
      }
    }

    classesByFile.set(filePath, classes);
    functionsByFile.set(filePath, functions);
  }

  return { classesByFile, functionsByFile, interfaceImplementors, sourceFilesByPath: new Map(sourceFiles) };
}

function indexImplementedInterfaces(
  classNode: ts.ClassDeclaration,
  entry: ClassEntry,
  interfaceImplementors: Map<string, ClassEntry[]>
): void {
  for (const clause of classNode.heritageClauses ?? []) {
    if (clause.token !== ts.SyntaxKind.ImplementsKeyword) continue;

    for (const type of clause.types) {
      if (!ts.isIdentifier(type.expression)) continue;

      const interfaceName = type.expression.text;
      const implementors = interfaceImplementors.get(interfaceName) ?? [];
      implementors.push(entry);
      interfaceImplementors.set(interfaceName, implementors);
    }
  }
}
