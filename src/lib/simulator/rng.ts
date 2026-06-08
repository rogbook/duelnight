/**
 * 결정론적 RNG. 동일 시드 → 동일 결과 (리플레이/테스트 보장).
 * 외부 의존 없이 mulberry32 + 문자열→정수 해시 조합.
 *
 * 사용: GameState.rngSeed를 소비 → 새 시드로 갱신해 다음 호출에 사용.
 */

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function nextRng(seed: string): { value: number; nextSeed: string } {
  const rng = mulberry32(hashSeed(seed));
  const value = rng();
  // 새 시드: 원 시드 + 소비된 값 → 다음 호출이 다른 스트림
  const nextSeed = `${seed}|${Math.floor(value * 0xffffffff).toString(36)}`;
  return { value, nextSeed };
}

export function nextInt(seed: string, maxExclusive: number): { value: number; nextSeed: string } {
  const { value, nextSeed } = nextRng(seed);
  return { value: Math.floor(value * maxExclusive), nextSeed };
}

/** Fisher–Yates 셔플. 원본 배열 불변. */
export function shuffle<T>(arr: T[], seed: string): { result: T[]; nextSeed: string } {
  const result = arr.slice();
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    const { value, nextSeed } = nextInt(s, i + 1);
    s = nextSeed;
    const tmp = result[i];
    result[i] = result[value];
    result[value] = tmp;
  }
  return { result, nextSeed: s };
}
