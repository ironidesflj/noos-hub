/**
 * Deterministic Identicon + "Abraço da Esfera Noos" orbit tiers.
 * Pure function (no DOM, no deps): works in the build and in the browser.
 * Contains NO user image, NO personal data — only a handle hash.
 * Source of truth: spec-discussao-questao.md §4 / kit v2 (03-COMPONENTES).
 */
export function renderNoosAvatarSvg(handle, tier = 1) {
  let h = 2166136261;
  const clean = String(handle || "anon").toLowerCase().trim();
  for (let i = 0; i < clean.length; i++) {
    h ^= clean.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bits = Math.abs(h);

  let cells = "";
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const bitIndex = row * 3 + col;
      if (((bits >> bitIndex) & 1) !== 1) continue;
      const color =
        (row + col) % 3 === 0 ? "var(--accent)" : tier >= 3 && row === 2 && col === 2 ? "var(--signal)" : "var(--fg)";
      const xLeft = 19 + col * 5.2;
      const y = 19 + row * 5.2;
      cells += `<rect x="${xLeft}" y="${y}" width="4.6" height="4.6" fill="${color}" />`;
      if (col < 2) {
        const xRight = 19 + (4 - col) * 5.2;
        cells += `<rect x="${xRight}" y="${y}" width="4.6" height="4.6" fill="${color}" />`;
      }
    }
  }

  let orbits = "";
  let badgeNodes = "";
  let boxStroke = "var(--border-strong)";
  if (tier === 2) {
    boxStroke = "var(--accent)";
    orbits = `<circle cx="32" cy="32" r="25" fill="none" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.7"/>`;
    badgeNodes = `<circle cx="50" cy="14" r="4" fill="var(--accent-bright)" stroke="var(--bg)" stroke-width="1.5"/>`;
  } else if (tier === 3) {
    boxStroke = "var(--accent)";
    orbits = `
      <g class="noos-avatar-orbits">
        <ellipse cx="32" cy="32" rx="29" ry="12.5" transform="rotate(-35 32 32)" fill="none" stroke="var(--accent)" stroke-width="1.25" opacity="0.75"/>
        <ellipse cx="32" cy="32" rx="29" ry="12.5" transform="rotate(35 32 32)" fill="none" stroke="var(--accent)" stroke-width="1.25" opacity="0.75"/>
      </g>`;
    badgeNodes = `
      <circle cx="11" cy="24" r="3.5" fill="var(--accent-bright)" stroke="var(--bg)" stroke-width="1.3"/>
      <circle cx="53" cy="24" r="3.5" fill="var(--accent-bright)" stroke="var(--bg)" stroke-width="1.3"/>`;
  } else if (tier >= 4) {
    boxStroke = "var(--fg)";
    orbits = `
      <g class="noos-avatar-orbits">
        <ellipse cx="32" cy="32" rx="29" ry="11.5" transform="rotate(-28 32 32)" fill="none" stroke="var(--accent)" stroke-width="1.2" opacity="0.65"/>
        <ellipse cx="32" cy="32" rx="29" ry="11.5" transform="rotate(28 32 32)" fill="none" stroke="var(--signal)" stroke-width="1.2" opacity="0.65"/>
        <path d="M 10 38 A 23 23 0 1 1 54 38" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
      </g>`;
    badgeNodes = `
      <circle cx="14" cy="25" r="4.6" fill="var(--accent-bright)" stroke="var(--bg)" stroke-width="1.6"/>
      <circle cx="50" cy="25" r="4.6" fill="var(--signal)" stroke="var(--bg)" stroke-width="1.6"/>
      <circle cx="32" cy="8" r="2.8" fill="var(--fg)"/>`;
  }

  return `<svg class="noos-identicon tier-${tier}" width="46" height="46" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    ${orbits}
    <rect x="16" y="16" width="32" height="32" rx="2" fill="var(--surface-2)" stroke="${boxStroke}" stroke-width="1.4"/>
    ${cells}
    ${badgeNodes}
  </svg>`;
}
