/**
 * Criptografia e PKCE da Camada de Mielina — apenas `node:crypto`.
 * Usada para cifrar a sessão/estado OAuth em cookie AES-256-GCM e para o
 * fluxo OAuth da GitHub App com PKCE (S256).
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const SEAL_VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export function sha256Hex(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

export function sha256Base64url(text) {
  return createHash("sha256")
    .update(String(text), "utf8")
    .digest("base64url");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** Par PKCE (RFC 7636, S256): verifier de 43 caracteres e challenge base64url. */
export function createPkcePair() {
  const verifier = randomToken(32);
  return { verifier, challenge: sha256Base64url(verifier) };
}

export function createOAuthStateValue() {
  return randomToken(24);
}

/** Chave AES-256 derivada de um segredo arbitrário (>= 16 caracteres). */
export function deriveKey(secret) {
  if (typeof secret !== "string" || secret.length < 16) {
    throw new Error("MIELINA_SESSION_SECRET ausente ou curto demais (mínimo 16 caracteres).");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

/** Cifra um objeto JSON com AES-256-GCM. Retorno: `v1.iv.tag.ciphertext`. */
export function seal(secret, payload) {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    SEAL_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/** Decifra um token de `seal`; qualquer adulteração lança erro genérico. */
export function unseal(secret, token) {
  const key = deriveKey(secret);
  const parts = String(token || "").split(".");
  if (parts.length !== 4 || parts[0] !== SEAL_VERSION) {
    throw new Error("token de sessão inválido");
  }
  let iv;
  let tag;
  let ciphertext;
  try {
    iv = Buffer.from(parts[1], "base64url");
    tag = Buffer.from(parts[2], "base64url");
    ciphertext = Buffer.from(parts[3], "base64url");
  } catch {
    throw new Error("token de sessão inválido");
  }
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("token de sessão inválido");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("token de sessão inválido");
  }
  try {
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new Error("token de sessão inválido");
  }
}

/** Comparação em tempo constante de strings arbitrárias. */
export function safeEqual(left, right) {
  const a = createHash("sha256").update(String(left || ""), "utf8").digest();
  const b = createHash("sha256").update(String(right || ""), "utf8").digest();
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export { KEY_BYTES };
