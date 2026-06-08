/**
 * 시뮬레이터 공용 엔트리. 외부 모듈은 이 파일만 import한다.
 */

export * from "./types";
export * as rng from "./rng";
export { optcgEngine } from "./engines/optcg";
export { chooseAction, runMatch } from "./ai/agent";
export { evaluate, extractFeatures, DEFAULT_WEIGHTS, type ValueWeights } from "./ai/value-fn";
export {
  CardEffectSchema,
  CardEffectsSchema,
  ActionSchema as EffectActionSchema,
  type CardEffect,
  type EffectAction,
  type CardFilter,
} from "./dsl/schema";
export { applyEffect, registerActionHandler, type EffectContext } from "./dsl/interpreter";
