// RF-11 (M-02): infraestructura mínima y genérica para el historial de
// análisis del analista. `tipoEvento` es texto libre (no un union cerrado
// como TipoNotificacion) y `payload` es JSON sin esquema fijo, a propósito:
// todavía no sabemos con certeza todos los tipos de eventos de análisis que
// M-05 a M-09 van a generar, y esta entidad no debe atarse a uno solo de
// ellos.
export class AnalisisRealizado {
  constructor(
    public readonly id: string,
    public readonly analistaId: string,
    public readonly tipoEvento: string,
    public readonly payload: Record<string, unknown>,
    public readonly fechaHora: Date = new Date()
  ) {}
}
