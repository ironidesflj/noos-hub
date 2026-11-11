/**
 * Reexporta a policy única da Mielina (`build/lib/mielina-policy.mjs`).
 *
 * A API não reimplementa regra de reputação/apoio/fonte: importa exatamente as
 * funções definidas na Fase 1 (handoff §4). Se o arquivo não existir no build
 * da Vercel, a Function falha ao carregar (fail-closed) em vez de inventar
 * regras divergentes.
 */

export {
  computeUniqueSupporters,
  isOfficialSourceCited,
  computeAuthorTier,
  defaultOfficialSources,
  normalizeHost,
  SUPPORT_REACTIONS,
  TIER_GATES,
} from "../../build/lib/mielina-policy.mjs";
