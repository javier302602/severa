import { calcularMedia, calcularDesviacionEstandarMuestral } from './EstadisticaDescriptiva';

export interface ComparacionGrupos {
  mediaA: number | null;
  mediaB: number | null;
  diferenciaMedias: number | null;
  sdA: number | null;
  sdB: number | null;
}

// Bug real reproducido en vivo (2026-07-19): antes calcularMedia/
// calcularDesviacionEstandarMuestral tiraban ValorEstadisticoError apenas
// UNO de los dos grupos estaba vacío (ej. comparar "Apache Log4j" vs un
// software sin ninguna vulnerabilidad registrada) o tenía un solo valor (la
// desviación estándar muestral necesita al menos 2) — esto rompía TODA la
// comparación con un 400 genérico, y de paso el informe/resumen ejecutivo
// (que comparan Remoto vs. Local vía RecopilarDatosDeInforme), aunque el
// grupo con datos sí tuviera información real para mostrar. Ahora cada lado
// se calcula de forma independiente: si un grupo está vacío o es
// insuficiente, su estadístico queda en null en vez de tirar todo abajo —
// "mostrar lo que hay" en vez de "todo o nada" (ver formatearMedia/
// formatearDesviacion, usados por PDF/Word/interpretación para renderizar
// ese null como "sin datos").
function mediaSegura(grupo: number[]): number | null {
  return grupo.length > 0 ? calcularMedia(grupo) : null;
}

function desviacionSegura(grupo: number[]): number | null {
  return grupo.length >= 2 ? calcularDesviacionEstandarMuestral(grupo) : null;
}

export function compararGrupos(grupoA: number[], grupoB: number[]): ComparacionGrupos {
  const mediaA = mediaSegura(grupoA);
  const mediaB = mediaSegura(grupoB);

  return {
    mediaA,
    mediaB,
    diferenciaMedias: mediaA !== null && mediaB !== null ? mediaA - mediaB : null,
    sdA: desviacionSegura(grupoA),
    sdB: desviacionSegura(grupoB)
  };
}

export function formatearEstadistico(valor: number | null, decimales = 2): string {
  return valor === null ? 'sin datos' : valor.toFixed(decimales);
}
