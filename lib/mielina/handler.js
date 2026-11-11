/**
 * Wrapper de Function da Vercel: injeta dependências reais, traduz erros do
 * GitHub/HTTP e responde JSON sem detalhe interno. Cada rota também exporta
 * `handle` (com deps injetáveis) para testes offline.
 */

import { defaultDeps } from "./deps.js";
import { GitHubError } from "./github.js";
import { fail, HttpError } from "./http.js";

/** Converte GitHubError em HttpError com status semanticamente próximo. */
export function translateError(error) {
  if (!(error instanceof GitHubError)) return error;
  let status = error.status;
  if (!status || status < 400 || status >= 600) status = 502;
  if (status === 401) {
    return new HttpError(401, "SESSION_EXPIRED", "Sessão do GitHub expirada. Entre novamente.");
  }
  if (status === 403) {
    return new HttpError(403, "GITHUB_FORBIDDEN", "O GitHub negou a operação para esta conta.");
  }
  if (status === 404) {
    return new HttpError(404, "GITHUB_NOT_FOUND", "Recurso não encontrado no GitHub.");
  }
  if (status === 422 || status === 400) {
    return new HttpError(400, "GITHUB_REJECTED", "O GitHub rejeitou a operação.");
  }
  return new HttpError(502, "GITHUB_UNAVAILABLE", "Falha temporária ao falar com o GitHub.");
}

export function route(handler) {
  return async function vercelHandler(req, res) {
    try {
      await handler(req, res, defaultDeps());
    } catch (error) {
      fail(res, translateError(error));
    }
  };
}
