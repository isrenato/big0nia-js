import * as ts from 'typescript';
import type { LoopLike } from './loop-like.js';

export function statementsOf(stmt: ts.Statement): ts.Statement[] {
  return ts.isBlock(stmt) ? Array.from(stmt.statements) : [stmt];
}

const FOREACH_LIKE_METHODS = new Set(['forEach', 'map']);

interface CanonicalForMatch {
  indexName: string;
  collectionExpr: ts.Expression;
}

function matchCanonicalFor(node: ts.ForStatement): CanonicalForMatch | null {
  const init = node.initializer;
  if (!init || !ts.isVariableDeclarationList(init) || init.declarations.length !== 1) return null;

  const decl = init.declarations[0];
  if (!ts.isIdentifier(decl.name)) return null;
  if (!decl.initializer || !ts.isNumericLiteral(decl.initializer) || decl.initializer.text !== '0') return null;
  const indexName = decl.name.text;

  const cond = node.condition;
  if (!cond || !ts.isBinaryExpression(cond) || cond.operatorToken.kind !== ts.SyntaxKind.LessThanToken) return null;
  if (!ts.isIdentifier(cond.left) || cond.left.text !== indexName) return null;

  const rhs = cond.right;
  if (!ts.isPropertyAccessExpression(rhs) || (rhs.name.text !== 'length' && rhs.name.text !== 'size')) return null;
  const collectionExpr = rhs.expression;

  const incrementor = node.incrementor;
  if (!incrementor) return null;
  const isPostInc =
    ts.isPostfixUnaryExpression(incrementor) &&
    incrementor.operator === ts.SyntaxKind.PlusPlusToken &&
    ts.isIdentifier(incrementor.operand) &&
    incrementor.operand.text === indexName;
  const isPreInc =
    ts.isPrefixUnaryExpression(incrementor) &&
    incrementor.operator === ts.SyntaxKind.PlusPlusToken &&
    ts.isIdentifier(incrementor.operand) &&
    incrementor.operand.text === indexName;
  if (!isPostInc && !isPreInc) return null;

  return { indexName, collectionExpr };
}

function forToLoopLike(node: ts.ForStatement, match: CanonicalForMatch): LoopLike {
  return {
    kind: 'for',
    node,
    bodyStatements: node.statement ? statementsOf(node.statement) : [],
    itemName: null,
    indexName: match.indexName,
    collectionExpr: match.collectionExpr,
  };
}

function forOfToLoopLike(node: ts.ForOfStatement): LoopLike {
  let itemName: string | null = null;
  if (ts.isVariableDeclarationList(node.initializer) && node.initializer.declarations.length === 1) {
    const name = node.initializer.declarations[0].name;
    if (ts.isIdentifier(name)) itemName = name.text;
  }

  return {
    kind: 'forOf',
    node,
    bodyStatements: statementsOf(node.statement),
    itemName,
    indexName: null,
    collectionExpr: node.expression,
  };
}

function matchForEachCall(node: ts.CallExpression): LoopLike | null {
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  if (!FOREACH_LIKE_METHODS.has(node.expression.name.text)) return null;
  if (node.arguments.length === 0) return null;

  const callback = node.arguments[node.arguments.length - 1];
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return null;

  const [itemParam, indexParam] = callback.parameters;
  const itemName = itemParam && ts.isIdentifier(itemParam.name) ? itemParam.name.text : null;
  const indexName = indexParam && ts.isIdentifier(indexParam.name) ? indexParam.name.text : null;

  const body = callback.body;
  const bodyStatements = ts.isBlock(body) ? Array.from(body.statements) : [];

  return {
    kind: 'forEach',
    node,
    bodyStatements,
    itemName,
    indexName,
    collectionExpr: node.expression.expression,
  };
}

/** Matches a loop-like construct rooted at `node` itself (not through an ExpressionStatement wrapper). */
export function matchLoopLike(node: ts.Node): LoopLike | null {
  if (ts.isForStatement(node)) {
    const match = matchCanonicalFor(node);
    return match ? forToLoopLike(node, match) : null;
  }
  if (ts.isForOfStatement(node)) return forOfToLoopLike(node);
  if (ts.isCallExpression(node)) return matchForEachCall(node);
  return null;
}

/** Matches a loop-like construct that may be a bare statement or a `.forEach()` call wrapped in an ExpressionStatement. */
export function matchLoopLikeStatement(stmt: ts.Statement): LoopLike | null {
  if (ts.isExpressionStatement(stmt)) return matchLoopLike(stmt.expression);
  return matchLoopLike(stmt);
}

export function collectLoops(sourceFile: ts.SourceFile): LoopLike[] {
  const loops: LoopLike[] = [];

  function visit(node: ts.Node): void {
    const loop = matchLoopLike(node);
    if (loop) loops.push(loop);
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return loops;
}
