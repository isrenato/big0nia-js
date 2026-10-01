import { interproceduralLoopJoinRule } from '@big0nia/core';
import { createBig0niaRule } from '../create-rule.js';

export const interproceduralLoopJoin = createBig0niaRule(interproceduralLoopJoinRule, {
  description: 'Disallow loops whose body calls into a function that loops over another collection to join against the item.',
  crossFile: true,
});
