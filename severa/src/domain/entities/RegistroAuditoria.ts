// RF-94/RF-95: modela la clase RegistroAuditoria del SDS (M-12). El campo
// `usuario` guarda el id del analista (no una referencia FK forzada — ver
// PostgresAuditoriaRepository: el historial debe sobrevivir aunque la cuenta
// se elimine después, RF-98). `detalle` es una extensión sobre el modelo
// mínimo del SDS (usuario/accion/fechaHora) para que el registro sea útil
// (qué CVE cambió, qué formato de informe se generó, etc.).
//
// RF-08: `ip` es opcional (default null) — solo el flujo de login la
// completa hoy (RF-08 exige IP específicamente "de cada inicio de sesión",
// no de toda operación del sistema); el resto de los decoradores de
// auditoría (RF-03, RF-04, y los de otros módulos) siguen sin pasarla.
export class RegistroAuditoria {
  constructor(
    public readonly id: string,
    public readonly usuario: string,
    public readonly accion: string,
    public readonly detalle: string,
    public readonly fechaHora: Date = new Date(),
    public readonly ip: string | null = null
  ) {}
}
