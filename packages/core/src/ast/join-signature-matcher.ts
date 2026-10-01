import * as ts from 'typescript';

export interface JoinSignature {
  outerDisplay: string;
  innerDisplay: string;
  innerKey: string;
}

const EQUALITY_OPERATORS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

export function isRootedIn(expr: ts.Expression, name: string): boolean {
  if (ts.isIdentifier(expr)) return expr.text === name;
  if (ts.isPropertyAccessExpression(expr)) return isRootedIn(expr.expression, name);
  if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
    return isRootedIn(expr.expression.expression, name);
  }
  return false;
}

function normalizeFieldName(methodName: string): string {
  if (methodName.startsWith('get') && methodName.length > 3) {
    return methodName[3].toLowerCase() + methodName.slice(4);
  }
  return methodName;
}

function describe(expr: ts.Expression): [display: string, key: string] | null {
  if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
    const name = expr.expression.name.text;
    return [`${name}()`, normalizeFieldName(name)];
  }
  if (ts.isPropertyAccessExpression(expr)) {
    const name = expr.name.text;
    return [name, name];
  }
  return null;
}

function collectComparisons(expr: ts.Expression, out: ts.BinaryExpression[]): void {
  if (!ts.isBinaryExpression(expr)) return;
  if (EQUALITY_OPERATORS.has(expr.operatorToken.kind)) {
    out.push(expr);
    return;
  }
  if (expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    collectComparisons(expr.left, out);
    collectComparisons(expr.right, out);
  }
}

function match(outerSide: ts.Expression, outerName: string, innerSide: ts.Expression, innerName: string): JoinSignature | null {
  if (!isRootedIn(outerSide, outerName) || !isRootedIn(innerSide, innerName)) return null;

  const outer = describe(outerSide);
  const inner = describe(innerSide);
  if (!outer || !inner) return null;

  return { outerDisplay: outer[0], innerDisplay: inner[0], innerKey: inner[1] };
}

function findWithMatcher(
  stmts: ts.Statement[],
  matcher: (a: ts.Expression, b: ts.Expression) => JoinSignature | null
): JoinSignature | null {
  for (const stmt of stmts) {
    if (!ts.isIfStatement(stmt)) continue;

    const comparisons: ts.BinaryExpression[] = [];
    collectComparisons(stmt.expression, comparisons);

    for (const comparison of comparisons) {
      const signature = matcher(comparison.left, comparison.right) ?? matcher(comparison.right, comparison.left);
      if (signature) return signature;
    }
  }

  return null;
}

export function findJoinSignature(stmts: ts.Statement[], outerName: string, innerName: string): JoinSignature | null {
  return findWithMatcher(stmts, (a, b) => match(a, outerName, b, innerName));
}

export interface IndexedBinding {
  collectionExpr: ts.Expression;
  indexName: string;
}

function exprEquals(a: ts.Expression, b: ts.Expression): boolean {
  if (ts.isIdentifier(a) && ts.isIdentifier(b)) return a.text === b.text;
  if (a.kind === ts.SyntaxKind.ThisKeyword && b.kind === ts.SyntaxKind.ThisKeyword) return true;
  if (ts.isPropertyAccessExpression(a) && ts.isPropertyAccessExpression(b)) {
    return a.name.text === b.name.text && exprEquals(a.expression, b.expression);
  }
  return false;
}

export function isRootedInIndexedAccess(expr: ts.Expression, collectionExpr: ts.Expression, indexName: string): boolean {
  if (
    ts.isElementAccessExpression(expr) &&
    exprEquals(expr.expression, collectionExpr) &&
    expr.argumentExpression !== undefined &&
    ts.isIdentifier(expr.argumentExpression) &&
    expr.argumentExpression.text === indexName
  ) {
    return true;
  }

  if (ts.isPropertyAccessExpression(expr)) return isRootedInIndexedAccess(expr.expression, collectionExpr, indexName);
  if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
    return isRootedInIndexedAccess(expr.expression.expression, collectionExpr, indexName);
  }

  return false;
}

function describeSides(outerSide: ts.Expression, innerSide: ts.Expression): JoinSignature | null {
  const outerDesc = describe(outerSide);
  const innerDesc = describe(innerSide);
  if (!outerDesc || !innerDesc) return null;

  return { outerDisplay: outerDesc[0], innerDisplay: innerDesc[0], innerKey: innerDesc[1] };
}

function matchIndexed(outerSide: ts.Expression, outer: IndexedBinding, innerSide: ts.Expression, inner: IndexedBinding): JoinSignature | null {
  if (!isRootedInIndexedAccess(outerSide, outer.collectionExpr, outer.indexName)) return null;
  if (!isRootedInIndexedAccess(innerSide, inner.collectionExpr, inner.indexName)) return null;

  return describeSides(outerSide, innerSide);
}

function matchVariableAgainstIndexed(
  outerSide: ts.Expression,
  outerVarName: string,
  innerSide: ts.Expression,
  inner: IndexedBinding
): JoinSignature | null {
  if (!isRootedIn(outerSide, outerVarName)) return null;
  if (!isRootedInIndexedAccess(innerSide, inner.collectionExpr, inner.indexName)) return null;

  return describeSides(outerSide, innerSide);
}

function matchIndexedAgainstVariable(
  outerSide: ts.Expression,
  outer: IndexedBinding,
  innerSide: ts.Expression,
  innerVarName: string
): JoinSignature | null {
  if (!isRootedInIndexedAccess(outerSide, outer.collectionExpr, outer.indexName)) return null;
  if (!isRootedIn(innerSide, innerVarName)) return null;

  return describeSides(outerSide, innerSide);
}

export function findIndexedJoinSignature(stmts: ts.Statement[], outer: IndexedBinding, inner: IndexedBinding): JoinSignature | null {
  return findWithMatcher(stmts, (a, b) => matchIndexed(a, outer, b, inner) ?? matchIndexed(b, outer, a, inner));
}

export function findVariableAgainstIndexedJoinSignature(
  stmts: ts.Statement[],
  outerVarName: string,
  inner: IndexedBinding
): JoinSignature | null {
  return findWithMatcher(stmts, (a, b) => matchVariableAgainstIndexed(a, outerVarName, b, inner) ?? matchVariableAgainstIndexed(b, outerVarName, a, inner));
}

export function findIndexedAgainstVariableJoinSignature(
  stmts: ts.Statement[],
  outer: IndexedBinding,
  innerVarName: string
): JoinSignature | null {
  return findWithMatcher(stmts, (a, b) => matchIndexedAgainstVariable(a, outer, b, innerVarName));
}
