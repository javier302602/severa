export type TipoAcceso = 'Remoto' | 'Local';

// 'network'/'adjacent_network'/'local'/'physical' (2026-07-18): vocabulario
// real del campo "Attack Vector" de CVSS (NVD, datasets enriquecidos como el
// de Kaggle CVE+CISA+EPSS) — un dataset público real mapea su columna de
// vector de ataque a "Acceso Remoto" por nombre, pero sus VALORES no son
// Sí/No. NETWORK y ADJACENT_NETWORK implican explotación a través de la red
// (mismo criterio que "Remoto" ya usa para el resto del sistema); LOCAL y
// PHYSICAL requieren acceso al equipo mismo (mismo criterio que "Local").
export class TipoAccesoValue {
  public readonly valor: TipoAcceso;

  constructor(valor: string) {
    const normalizado = valor.trim().toLowerCase();
    if (
      normalizado === 'remoto' ||
      normalizado === 'sí' ||
      normalizado === 'si' ||
      normalizado === 'yes' ||
      normalizado === 'true' ||
      normalizado === 'network' ||
      normalizado === 'adjacent_network'
    ) {
      this.valor = 'Remoto';
      return;
    }
    if (
      normalizado === 'local' ||
      normalizado === 'no' ||
      normalizado === 'false' ||
      normalizado === 'physical'
    ) {
      this.valor = 'Local';
      return;
    }
    throw new Error(`Tipo de acceso inválido: ${valor}`);
  }
}
