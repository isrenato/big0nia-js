import { repeatedSortInLoopRule } from '@big0nia/core';
import { createBig0niaRule } from '../create-rule.js';

export const repeatedSortInLoop = createBig0niaRule(repeatedSortInLoopRule, {
  description: 'Disallow re-sorting an array that is never modified inside the loop.',
  crossFile: false,
});
