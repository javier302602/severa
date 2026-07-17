// RF-94/RF-95: modela la clase RegistroAuditoria del SDS (M-12). El campo
// `usuario` guarda el id del analista (no una referencia FK forzada — ver
// PostgresAuditoriaRepository: el historial debe sobrevivir aunque la cuenta
// se elimine después, RF-98). `detalle` es una extensión sobre el modelo
// mínimo del SDS (usuario/accion/fechaHora) para que el registro sea útil
// (qué CVE cambió, qué formato de informe se generó, etc.).
export class RegistroAuditoria {
  constructor(
    public readonly id: string,
    public readonly usuario: string,
    public readonly accion: string,
    public readonly detalle: string,
    public readonly fechaHora: Date = new Date()
  ) {}
}
