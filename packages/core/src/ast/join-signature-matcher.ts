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

export function findJoinSignature(stmts: ts.Statement[], outerName: string, innerName: string): JoinSignature | null {
  for (const stmt of stmts) {
    if (!ts.isIfStatement(stmt)) continue;

    const comparisons: ts.BinaryExpression[] = [];
    collectComparisons(stmt.expression, comparisons);

    for (const comparison of comparisons) {
      const signature =
        match(comparison.left, outerName, comparison.right, innerName) ??
        match(comparison.right, outerName, comparison.left, innerName);
      if (signature) return signature;
    }
  }

  return null;
}
