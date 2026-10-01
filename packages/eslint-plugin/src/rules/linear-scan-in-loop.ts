import { linearScanInLoopRule } from '@big0nia/core';
import { createBig0niaRule } from '../create-rule.js';

export const linearScanInLoop = createBig0niaRule(linearScanInLoopRule, {
  description: 'Disallow includes()/indexOf()/find() scans of another collection for every loop item.',
  crossFile: false,
});
