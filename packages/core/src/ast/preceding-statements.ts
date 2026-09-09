import * as ts from 'typescript';

function isStatementListContainer(
  node: ts.Node
): node is ts.SourceFile | ts.Block | ts.ModuleBlock | ts.CaseClause | ts.DefaultClause {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isModuleBlock(node) ||
    ts.isCaseClause(node) ||
    ts.isDefaultClause(node)
  );
}

/** Requires the `ts.SourceFile` to have been parsed with `setParentNodes: true` since it relies on `.parent`. */
export function findPrecedingStatements(node: ts.Node): ts.Statement[] {
  let current: ts.Node = node;
  while (true) {
    const parent = current.parent;
    if (!parent) return [];
    if (isStatementListContainer(parent)) break;
    current = parent;
  }

  const parent = current.parent;
  if (!parent || !isStatementListContainer(parent)) return [];

  const siblings = parent.statements;
  const index = siblings.indexOf(current as ts.Statement);
  if (index === -1) return [];

  return siblings.slice(0, index);
}
