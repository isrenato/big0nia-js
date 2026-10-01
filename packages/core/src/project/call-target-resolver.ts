// packages/core/src/project/call-target-resolver.ts
import * as ts from 'typescript';
import * as path from 'node:path';
import { ASSIGNMENT_OPERATORS, findEnclosingClass, findPropertyTypeName } from '../ast/class-member-resolver.js';
import type { ClassEntry, ProjectIndex } from './project-index.js';

export interface CallTarget {
  node: ts.FunctionDeclaration | ts.MethodDeclaration;
  name: string;
  ownerClassName: string | null;
  filePath: string;
}

export function resolveCallTarget(call: ts.CallExpression, precedingStmts: ts.Statement[], projectIndex: ProjectIndex): CallTarget | null {
  const callee = call.expression;

  if (ts.isIdentifier(callee)) return resolveFunctionCall(callee, projectIndex);
  if (ts.isPropertyAccessExpression(callee)) return resolveMethodCall(callee, precedingStmts, projectIndex);

  return null;
}

export function resolveCallableReference(ref: ts.Expression, projectIndex: ProjectIndex): CallTarget | null {
  if (ts.isIdentifier(ref)) return resolveFunctionCall(ref, projectIndex);

  if (ts.isPropertyAccessExpression(ref) && ref.expression.kind === ts.SyntaxKind.ThisKeyword) {
    const classNode = findEnclosingClass(ref);
    if (!classNode || !classNode.name) return null;
    return methodTarget(classNode, classNode.name.text, ref.getSourceFile().fileName, ref.name.text);
  }

  return null;
}

function resolveFunctionCall(callee: ts.Identifier, projectIndex: ProjectIndex): CallTarget | null {
  const filePath = callee.getSourceFile().fileName;
  const entry = projectIndex.functionsByFile.get(filePath)?.get(callee.text);
  if (entry) return { node: entry.node, name: callee.text, ownerClassName: null, filePath };

  const imported = findRelativeImport(callee.text, filePath, projectIndex);
  if (!imported) return null;

  const importedEntry = projectIndex.functionsByFile.get(imported.filePath)?.get(imported.importedName);
  return importedEntry
    ? { node: importedEntry.node, name: imported.importedName, ownerClassName: null, filePath: importedEntry.filePath }
    : null;
}

function resolveMethodCall(callee: ts.PropertyAccessExpression, precedingStmts: ts.Statement[], projectIndex: ProjectIndex): CallTarget | null {
  const classEntry = resolveReceiverClass(callee.expression, precedingStmts, projectIndex);
  return classEntry ? methodTarget(classEntry.node, classEntry.name, classEntry.filePath, callee.name.text) : null;
}

function methodTarget(classNode: ts.ClassDeclaration, className: string, filePath: string, methodName: string): CallTarget | null {
  const method = classNode.members.find(
    (m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === methodName
  );
  return method?.body ? { node: method, name: methodName, ownerClassName: className, filePath } : null;
}

function resolveReceiverClass(receiver: ts.Expression, precedingStmts: ts.Statement[], projectIndex: ProjectIndex): ClassEntry | null {
  if (receiver.kind === ts.SyntaxKind.ThisKeyword) {
    const classNode = findEnclosingClass(receiver);
    return classNode?.name ? { name: classNode.name.text, node: classNode, filePath: receiver.getSourceFile().fileName } : null;
  }

  if (ts.isPropertyAccessExpression(receiver) && receiver.expression.kind === ts.SyntaxKind.ThisKeyword) {
    const typeName = findPropertyTypeName(receiver, receiver.name.text);
    return typeName ? resolveClassByTypeName(typeName, receiver.getSourceFile().fileName, projectIndex) : null;
  }

  if (ts.isIdentifier(receiver)) {
    const typeName = findLastNewAssignmentClassName(receiver.text, precedingStmts);
    if (typeName) return resolveClassByTypeName(typeName, receiver.getSourceFile().fileName, projectIndex);

    const annotatedType = findAnnotatedTypeName(receiver, precedingStmts);
    return annotatedType ? singleImplementor(annotatedType, projectIndex) : null;
  }

  return null;
}

function resolveClassByTypeName(typeName: string, currentFilePath: string, projectIndex: ProjectIndex): ClassEntry | null {
  const sameFile = projectIndex.classesByFile.get(currentFilePath)?.get(typeName);
  if (sameFile) return sameFile;

  const imported = findRelativeImport(typeName, currentFilePath, projectIndex);
  const importedClass = imported ? projectIndex.classesByFile.get(imported.filePath)?.get(imported.importedName) : undefined;
  if (importedClass) return importedClass;

  return singleImplementor(typeName, projectIndex);
}

function singleImplementor(interfaceName: string, projectIndex: ProjectIndex): ClassEntry | null {
  const implementors = projectIndex.interfaceImplementors.get(interfaceName) ?? [];
  return implementors.length === 1 ? implementors[0] : null;
}

function simpleTypeName(type: ts.TypeNode | undefined): string | null {
  return type && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) ? type.typeName.text : null;
}

function findAnnotatedTypeName(receiver: ts.Identifier, precedingStmts: ts.Statement[]): string | null {
  for (let i = precedingStmts.length - 1; i >= 0; i--) {
    const stmt = precedingStmts[i];
    if (!ts.isVariableStatement(stmt)) continue;
    const decl = stmt.declarationList.declarations.find((d) => ts.isIdentifier(d.name) && d.name.text === receiver.text);
    if (decl) return simpleTypeName(decl.type);
  }

  for (let node: ts.Node | undefined = receiver.parent; node; node = node.parent) {
    if (!ts.isFunctionLike(node)) continue;
    const param = node.parameters.find((p) => ts.isIdentifier(p.name) && p.name.text === receiver.text);
    if (param) return simpleTypeName(param.type);
  }

  return null;
}

function findRelativeImport(
  localName: string,
  currentFilePath: string,
  projectIndex: ProjectIndex
): { filePath: string; importedName: string } | null {
  const sourceFile = projectIndex.sourceFilesByPath.get(currentFilePath);
  if (!sourceFile) return null;

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause?.namedBindings) continue;
    if (!ts.isNamedImports(stmt.importClause.namedBindings)) continue;

    const element = stmt.importClause.namedBindings.elements.find((el) => el.name.text === localName);
    if (!element) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier) || !stmt.moduleSpecifier.text.startsWith('.')) continue;

    const filePath = resolveModulePath(currentFilePath, stmt.moduleSpecifier.text, projectIndex);
    if (filePath) return { filePath, importedName: (element.propertyName ?? element.name).text };
  }

  return null;
}

function resolveModulePath(fromFile: string, specifier: string, projectIndex: ProjectIndex): string | null {
  const base = path.join(path.dirname(fromFile), specifier.replace(/\.jsx?$/, ''));
  const candidates = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  return candidates.find((candidate) => projectIndex.sourceFilesByPath.has(candidate)) ?? null;
}

function findLastNewAssignmentClassName(varName: string, stmts: ts.Statement[]): string | null {
  let found: string | null = null;
  let foundAt = -1;

  stmts.forEach((stmt, index) => {
    let matchedTarget = false;
    let initializer: ts.Expression | undefined;

    if (ts.isVariableStatement(stmt) && stmt.declarationList.declarations.length === 1) {
      const decl = stmt.declarationList.declarations[0];
      if (ts.isIdentifier(decl.name) && decl.name.text === varName) {
        matchedTarget = true;
        initializer = decl.initializer;
      }
    } else if (
      ts.isExpressionStatement(stmt) &&
      ts.isBinaryExpression(stmt.expression) &&
      stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(stmt.expression.left) &&
      stmt.expression.left.text === varName
    ) {
      matchedTarget = true;
      initializer = stmt.expression.right;
    }

    if (!matchedTarget) return;
    found = initializer && ts.isNewExpression(initializer) && ts.isIdentifier(initializer.expression) ? initializer.expression.text : null;
    foundAt = index;
  });

  if (found === null) return null;

  const tail = stmts.slice(foundAt + 1);
  const isTarget = (node: ts.Node): boolean => ts.isIdentifier(node) && node.text === varName;
  return anyAssignmentTo(tail, isTarget) ? null : found;
}

function anyAssignmentTo(nodes: readonly ts.Node[], isTarget: (node: ts.Node) => boolean): boolean {
  for (const node of nodes) {
    if (ts.isBinaryExpression(node) && ASSIGNMENT_OPERATORS.has(node.operatorToken.kind) && isTarget(node.left)) {
      return true;
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) continue;
    if (ts.forEachChild(node, (child) => anyAssignmentTo([child], isTarget))) return true;
  }
  return false;
}
