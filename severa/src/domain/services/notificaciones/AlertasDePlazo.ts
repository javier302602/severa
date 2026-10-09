import { Vulnerabilidad } from '../../entities/Vulnerabilidad';

// Las dos alertas de plazo de remediación: RF-76 (ya venció) y RF-100 (vence
// dentro de 48 horas). Los valores coinciden con los de TipoNotificacion.
export type TipoDeAlertaDePlazo = 'PlazoVencido' | 'PlazoProximoAVencer';

// Hasta esta cantidad de vulnerabilidades nuevas se avisa de cada una por
// separado (cada notificación nombra su CVE). Por encima se emite UNA sola
// notificación de resumen: 300 notificaciones iguales no informan más que una
// que diga "300", y dejan el centro de notificaciones inservible para todo lo
// demás. Mismo criterio que ya se tomó para las importaciones (RF-99: un
// resumen por importación, no una alerta por cada registro crítico).
export const MAXIMO_DE_ALERTAS_INDIVIDUALES = 5;

// Cuántos CVE se nombran en el resumen antes de "y N más".
const CVE_NOMBRADOS_EN_EL_RESUMEN = 3;

const ENCABEZADO_DEL_RESUMEN: Record<TipoDeAlertaDePlazo, string> = {
  PlazoVencido: 'Plazo de remediación excedido',
  PlazoProximoAVencer: 'Plazo de remediación próximo a vencer (dentro de 48hs)'
};

export function convieneResumirAlertas(cantidad: number): boolean {
  return cantidad > MAXIMO_DE_ALERTAS_INDIVIDUALES;
}

// El texto de la notificación de resumen. Nombra primero las de mayor CVSS
// (a igual CVSS, por CVE, para que el texto no dependa del orden de llegada).
export function redactarResumenDeAlertasDePlazo(tipo: TipoDeAlertaDePlazo, vulnerabilidades: Vulnerabilidad[]): string {
  const ordenadas = [...vulnerabilidades].sort(
    (a, b) => b.cvssScore.valor - a.cvssScore.valor || a.cve.valor.localeCompare(b.cve.valor)
  );
  const nombradas = ordenadas.slice(0, CVE_NOMBRADOS_EN_EL_RESUMEN).map((vulnerabilidad) => `${vulnerabilidad.cve.valor} (CVSS ${vulnerabilidad.cvssScore.valor})`);
  const restantes = ordenadas.length - nombradas.length;

  return (
    `${ENCABEZADO_DEL_RESUMEN[tipo]} en ${ordenadas.length} vulnerabilidades: ${nombradas.join(', ')}` +
    (restantes > 0 ? ` y ${restantes} más` : '') +
    '. El detalle está en Priorización.'
  );
}
