import type * as ts from 'typescript';

export type LoopKind = 'for' | 'forOf' | 'forEach';

export interface LoopLike {
  kind: LoopKind;
  node: ts.Node;
  bodyStatements: ts.Statement[];
  itemName: string | null;
  indexName: string | null;
  collectionExpr: ts.Expression | null;
}
