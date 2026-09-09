import * as ts from 'typescript';

export function findPrecedingStatements(node: ts.Node): ts.Statement[] {
  const parent = node.parent;
  if (!parent) return [];

  let siblings: readonly ts.Statement[] | undefined;
  if (ts.isSourceFile(parent) || ts.isBlock(parent) || ts.isModuleBlock(parent)) {
    siblings = parent.statements;
  } else if (ts.isCaseClause(parent) || ts.isDefaultClause(parent)) {
    siblings = parent.statements;
  }

  if (!siblings) return [];

  const index = siblings.indexOf(node as ts.Statement);
  if (index === -1) return [];

  return siblings.slice(0, index);
}
