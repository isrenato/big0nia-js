export type { LoopLike, LoopKind } from './ast/loop-like.js';
export { collectLoops, matchLoopLike, matchLoopLikeStatement, statementsOf } from './ast/loop-collector.js';
export { findDirectNestedLoop, findLoopInStatements } from './ast/nested-loop-finder.js';
export { findPrecedingStatements } from './ast/preceding-statements.js';
export { boundsToOnePass } from './ast/loop-early-exit-analyzer.js';
export { findPropertyDefaultArray, findPropertyTypeName, findEnclosingClass, ASSIGNMENT_OPERATORS } from './ast/class-member-resolver.js';
export type { CollectionSize } from './ast/collection-size-classifier.js';
export { classifyCollectionSize } from './ast/collection-size-classifier.js';
export type { JoinSignature, IndexedBinding } from './ast/join-signature-matcher.js';
export {
  findJoinSignature,
  findIndexedJoinSignature,
  findIndexedAgainstVariableJoinSignature,
  findVariableAgainstIndexedJoinSignature,
  isRootedIn,
  isRootedInIndexedAccess,
} from './ast/join-signature-matcher.js';
export { exprLabel } from './ast/expr-label.js';
export { complexityForJoin, complexityIndexedForm } from './complexity/complexity-label.js';
export type { CallSite } from './ast/call-site-finder.js';
export { findAllCallSites } from './ast/call-site-finder.js';

export type { ClassEntry, FunctionEntry, ProjectIndex } from './project/project-index.js';
export { buildProjectIndex } from './project/project-index-builder.js';
export type { CallTarget } from './project/call-target-resolver.js';
export { relativeImportCandidates, resolveCallTarget, resolveCallableReference } from './project/call-target-resolver.js';

export type { Finding, AnalysisContext, LoopRule } from './rules/loop-rule.js';
export { lineOf } from './rules/loop-rule.js';
export { nestedLoopJoinRule } from './rules/nested-loop-join-rule.js';
export { interproceduralLoopJoinRule } from './rules/interprocedural-loop-join-rule.js';
export { arrayRebuildInLoopRule } from './rules/array-rebuild-in-loop-rule.js';
export { linearScanInLoopRule } from './rules/linear-scan-in-loop-rule.js';
export { repeatedSortInLoopRule } from './rules/repeated-sort-in-loop-rule.js';

export type { Diagnostic } from './analysis/diagnostic.js';
export { analyseFile } from './analysis/file-analyser.js';

export type { AnalyzerConfig } from './config/analyzer-config.js';
export { ConfigError } from './config/config-error.js';
export { loadConfig } from './config/config-loader.js';
