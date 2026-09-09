import { describe, it, expect } from 'vitest';
import { complexityForJoin, complexityIndexedForm } from './complexity-label.js';

describe('complexityForJoin', () => {
  it('formats a same-collection join as a square', () => {
    expect(complexityForJoin('users', 'users', true)).toBe('O(users²)');
  });

  it('formats a cross-collection join as a product', () => {
    expect(complexityForJoin('users', 'orders', false)).toBe('O(users × orders)');
  });
});

describe('complexityIndexedForm', () => {
  it('formats a same-collection indexed form as linear', () => {
    expect(complexityIndexedForm('users', 'users', true)).toBe('O(users)');
  });

  it('formats a cross-collection indexed form as a sum', () => {
    expect(complexityIndexedForm('users', 'orders', false)).toBe('O(users + orders)');
  });
});
