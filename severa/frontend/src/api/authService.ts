import { httpClient } from './httpClient';
import type { Analista, RolAnalista } from '../types/Analista';

export interface CredencialesLogin {
  correo: string;
  contrasena: string;
}

export interface RespuestaLogin {
  token: string;
  analista: Analista;
}

export interface DatosRegistro {
  id: string;
  nombre: string;
  correo: string;
  contrasena: string;
  rol: RolAnalista;
}

// Contratos verificados contra AuthController.ts: POST /auth/login y
// POST /auth/register son las únicas rutas públicas (montadas antes del
// middleware de autenticación en app.ts).
export const authService = {
  login: (credenciales: CredencialesLogin): Promise<RespuestaLogin> => httpClient.post('/auth/login', credenciales),
  registrar: (datos: DatosRegistro): Promise<Analista> => httpClient.post('/auth/register', datos)
};
