// Refleja exactamente lo que devuelven POST /auth/login, POST /auth/register
// y PUT /perfil (AuthController.ts, PerfilController.ts) — no incluye
// contrasenaHash ni otros campos internos porque el backend tampoco los
// serializa hacia afuera.
export type RolAnalista = 'analista' | 'administrador';

export interface Analista {
  id: string;
  nombre: string;
  correo: string;
  rol: RolAnalista;
}
