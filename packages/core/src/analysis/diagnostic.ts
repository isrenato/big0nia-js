// packages/core/src/analysis/diagnostic.ts
import type { Finding } from '../rules/loop-rule.js';

export interface Diagnostic extends Finding {
  file: string;
}
