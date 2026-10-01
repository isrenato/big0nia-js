import type { Rule } from 'eslint';
import { analyseFile, buildProjectIndex, type LoopRule, type ProjectIndex } from '@big0nia/core';
import type * as ts from 'typescript';
import { buildImportGraphIndex } from './import-graph-index.js';
import { toSourceFile } from './source-file.js';

export interface Big0niaRuleOptions {
  description: string;
  /** Resolve calls into files reachable through relative imports (only the interprocedural rule needs this). */
  crossFile: boolean;
}

function singleFileIndex(sourceFile: ts.SourceFile): ProjectIndex {
  return buildProjectIndex(new Map([[sourceFile.fileName, sourceFile]]));
}

/** Wraps a core `LoopRule` as an ESLint rule that reports each finding on its line as `<message> Tip: <tip>`. */
export function createBig0niaRule(coreRule: LoopRule, options: Big0niaRuleOptions): Rule.RuleModule {
  return {
    meta: {
      type: 'suggestion',
      docs: {
        description: options.description,
        url: `https://github.com/isrenato/big0nia-js#${coreRule.id}`,
      },
      schema: [],
      messages: { finding: '{{message}} Tip: {{tip}}' },
    },

    create(context) {
      return {
        'Program:exit'() {
          const sourceFile = toSourceFile(context.sourceCode, context.filename);
          const projectIndex = options.crossFile ? buildImportGraphIndex(sourceFile) : singleFileIndex(sourceFile);

          for (const diagnostic of analyseFile(sourceFile, [coreRule], projectIndex)) {
            context.report({
              loc: { line: diagnostic.line, column: 0 },
              messageId: 'finding',
              data: { message: diagnostic.message, tip: diagnostic.tip },
            });
          }
        },
      };
    },
  };
}
