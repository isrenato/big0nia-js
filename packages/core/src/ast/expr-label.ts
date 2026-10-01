// packages/core/src/ast/expr-label.ts
import * as ts from 'typescript';

export function exprLabel(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (expr.kind === ts.SyntaxKind.ThisKeyword) return 'this';

  if (ts.isPropertyAccessExpression(expr)) {
    const base = exprLabel(expr.expression);
    return base ? `${base}.${expr.name.text}` : null;
  }

  return null;
}
