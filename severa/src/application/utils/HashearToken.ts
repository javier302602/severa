import { createHash } from 'crypto';

// SHA-256, no bcrypt: a diferencia de una contraseña, este hash se busca por
// igualdad exacta en la base de datos en cada intento de restablecimiento —
// necesita ser determinístico y rápido, no lento a propósito como
// HasherDeContrasenas. El secreto real es la entropía del token
// (randomBytes(32) en RecuperarContrasena), no el costo del hash.
export function hashearToken(tokenPlano: string): string {
  return createHash('sha256').update(tokenPlano).digest('hex');
}
