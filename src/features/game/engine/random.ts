/** Mulberry32: explicit uint32 state, including a valid zero seed. */
export function randomSource(seed: number) {
  let state = seed;
  return {
    get state() {
      return state;
    },
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    },
  };
}

export function shuffle<T>(
  items: T[],
  random: ReturnType<typeof randomSource>,
): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
