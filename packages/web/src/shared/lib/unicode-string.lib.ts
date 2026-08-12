export function countUnicodeCodePoints(value: string): number {
  let count = 0;
  for (const _character of value) count += 1;
  return count;
}
