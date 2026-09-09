export function complexityForJoin(outerName: string, innerName: string, sameCollection: boolean): string {
  return sameCollection ? `O(${outerName}²)` : `O(${outerName} × ${innerName})`;
}

export function complexityIndexedForm(outerName: string, innerName: string, sameCollection: boolean): string {
  return sameCollection ? `O(${outerName})` : `O(${outerName} + ${innerName})`;
}
