// Deterministic, seedable PRNG (Mulberry32). Used by acceptance and
// property tests so failing seeds are reproducible. Returns a function
// compatible with the rng callback shape used throughout the engine.
export function makePRNG(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
