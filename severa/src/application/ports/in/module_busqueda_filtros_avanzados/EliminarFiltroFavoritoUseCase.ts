export interface EliminarFiltroFavoritoUseCase {
  // true si el filtro existía y era del analista (se eliminó); false si no
  // existe o es de otro analista — el controller traduce ambos casos al
  // mismo 404, sin distinguir el motivo (mismo criterio IDOR que el resto
  // del módulo: nunca revelar si un id de otro analista existe).
  ejecutar(id: string, analistaId: string): Promise<boolean>;
}
