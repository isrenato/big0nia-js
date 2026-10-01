import { nestedLoopJoinRule } from '@big0nia/core';
import { createBig0niaRule } from '../create-rule.js';

export const nestedLoopJoin = createBig0niaRule(nestedLoopJoinRule, {
  description: 'Disallow nested loops that join two collections by comparing items, an O(n × m) scan.',
  crossFile: false,
});
