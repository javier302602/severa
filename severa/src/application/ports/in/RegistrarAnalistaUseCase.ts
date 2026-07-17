import { Analista } from '../../../domain/entities/Analista';

// RF-04 (Asignación de Rol, Módulo M-01, "Must", estado "Propuesto" en el SDS
// — nunca implementado en ningún sprint): el rol de un analista solo debería
// poder asignarse/modificarse por un administrador, no por el propio usuario
// al registrarse. Hueco de seguridad real cerrado en Sprint 15: este puerto
// ya NO acepta `rol` como entrada — el registro público SIEMPRE crea
// 'analista' (ver RegistrarAnalista.ts). No existe hoy ningún flujo para
// crear administradores salvo manualmente en la base de datos; implementar
// RF-04 como endpoint admin-only (`requiereRol('administrador')`) queda fuera
// de este fix, a la espera de que se pida explícitamente.
export interface RegistrarAnalistaUseCase {
  ejecutar(input: {
    id: string;
    nombre: string;
    correo: string;
    contrasena: string;
  }): Promise<Analista>;
}
