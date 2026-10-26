// api/q — resolução da rota /q/{ID} (spec-pagina-de-questao.md).
//
// Burra por desenho: forma + mapa gerado no build. ZERO Axon em runtime —
// quem valida conteúdo é o build (gera-questoes.mjs); aqui é só redirecionar
// ou responder 404. Os rewrites do vercel.json só disparam em MISS do
// filesystem — a página canônica é sempre o arquivo estático.
//
//   /{pt|en}/q/{alias}      → 301 → /{lang}/q/{canônica}/   (alias eterna, constitution §3)
//   /q/{ID}                 → 308 → /pt/q/{ID}/             (sem idioma → PT; alias resolvida antes: salto único)
//   /{pt|en}/q/{desconhecida} → 404 com o corpo do 404.html (nunca 404 em ID publicada —
//                              se a página deveria existir, é o build que fala primeiro)

import { aliasMap, canonicalIds, notFoundBody } from './q-data.mjs';

const CANONICAL = new Set(canonicalIds);

export default function handler(req, res) {
  const url = new URL(req.url, 'https://noos.study');
  const original = url.searchParams.get('p') || url.pathname;
  const path = original.replace(/\/+$/, '');
  const m = path.match(/^(?:\/(pt|en))?\/q\/(.+)$/i);

  const notFound = () => {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.end(notFoundBody);
  };

  if (!m) return notFound();

  const lang = m[1] ? m[1].toLowerCase() : '';
  const raw = m[2];
  const alias = Object.prototype.hasOwnProperty.call(aliasMap, raw) ? aliasMap[raw] : null;

  if (!lang) {
    const target = alias || (CANONICAL.has(raw) ? raw : null);
    if (!target) return notFound();
    res.writeHead(308, { Location: `/pt/q/${target}/` });
    return res.end();
  }

  if (alias) {
    res.writeHead(301, { Location: `/${lang}/q/${alias}/` });
    return res.end();
  }

  // ID canônica sem página estática = nunca publicada (ou rejeitada neste build)
  return notFound();
}
