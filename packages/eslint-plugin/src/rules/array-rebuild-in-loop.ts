import { arrayRebuildInLoopRule } from '@big0nia/core';
import { createBig0niaRule } from '../create-rule.js';

export const arrayRebuildInLoop = createBig0niaRule(arrayRebuildInLoopRule, {
  description: 'Disallow rebuilding an array from itself with concat() or spread on every loop iteration.',
  crossFile: false,
});
