import { calcularMedia, calcularDesviacionEstandarMuestral } from './EstadisticaDescriptiva';

export interface ComparacionGrupos {
  mediaA: number;
  mediaB: number;
  diferenciaMedias: number;
  sdA: number;
  sdB: number;
}

export function compararGrupos(grupoA: number[], grupoB: number[]): ComparacionGrupos {
  const mediaA = calcularMedia(grupoA);
  const mediaB = calcularMedia(grupoB);

  return {
    mediaA,
    mediaB,
    diferenciaMedias: mediaA - mediaB,
    sdA: calcularDesviacionEstandarMuestral(grupoA),
    sdB: calcularDesviacionEstandarMuestral(grupoB)
  };
}
