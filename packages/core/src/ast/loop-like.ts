import type * as ts from 'typescript';

export type LoopKind = 'for' | 'forOf' | 'forEach';

export interface LoopLike {
  kind: LoopKind;
  node: ts.Node;
  bodyStatements: ts.Statement[];
  /** The callback's concise (non-block) body expression, for a `forEach`-kind loop only; `null` otherwise. */
  bodyExpression: ts.Expression | null;
  itemName: string | null;
  indexName: string | null;
  collectionExpr: ts.Expression | null;
}
