import type { NivelDeRiesgo } from './NivelDeRiesgo';
import { EscalaDeClasificacionInvalidaError } from '../../errors/EscalaDeClasificacionInvalidaError';

// RF-28 / RF-69 (M-04, M-09), "Modo B": los rangos de clasificación del
// catálogo son configurables por el analista; por defecto, la escala oficial
// de CVSS v3.1. Solo se configuran los CORTES —dónde empieza cada nivel—,
// nunca los nombres: los niveles son siempre Bajo, Moderado, Alto y Crítico.
//
// Representarla como tres puntos de corte (y no como cuatro rangos con
// mínimo y máximo) hace imposibles por construcción los huecos y los
// solapamientos: cada nivel va desde su corte hasta el corte siguiente.
//   Bajo      [0, moderado)
//   Moderado  [moderado, alto)
//   Alto      [alto, critico)
//   Crítico   [critico, 10]
// Bajo empieza siempre en 0.0, incluido: decisión ya confirmada para la
// escala CVSS, que define un nivel "None" para 0.0 que el SDS no tiene.
//
// La regla vale para TODO el sistema: la función de dominio (clasificar) y la
// condición SQL del repositorio (rango) salen de los mismos cortes.
export interface CortesDeClasificacion {
  moderado: number;
  alto: number;
  critico: number;
}

export const NIVELES_DE_RIESGO: readonly NivelDeRiesgo[] = ['Bajo', 'Moderado', 'Alto', 'Crítico'];

export const VALOR_MAXIMO_CVSS = 10;

// Un nivel como intervalo de cvssScore: desde `minimo` (incluido) hasta
// `menorQue` (excluido), o hasta el máximo de la escala (incluido) si
// `menorQue` es null.
export interface RangoDeNivel {
  nivel: NivelDeRiesgo;
  minimo: number;
  menorQue: number | null;
}

const CORTES_CVSS: CortesDeClasificacion = { moderado: 4.0, alto: 7.0, critico: 9.0 };

function tieneUnDecimalComoMaximo(valor: number): boolean {
  return Math.abs(valor * 10 - Math.round(valor * 10)) < 1e-9;
}

export class EscalaDeClasificacion {
  private constructor(public readonly cortes: Readonly<CortesDeClasificacion>) {}

  // La escala oficial de CVSS v3.1: la que rige mientras el analista no
  // configure otra, y a la que vuelve con "Volver a la escala CVSS".
  static readonly CVSS = new EscalaDeClasificacion(CORTES_CVSS);

  // Valida y arma una escala personalizada. Lanza
  // EscalaDeClasificacionInvalidaError con un mensaje para el analista.
  static personalizada(cortes: CortesDeClasificacion): EscalaDeClasificacion {
    const etiquetas: Array<[keyof CortesDeClasificacion, string]> = [
      ['moderado', 'Moderado'],
      ['alto', 'Alto'],
      ['critico', 'Crítico']
    ];
    for (const [clave, nombre] of etiquetas) {
      const valor = cortes[clave];
      if (typeof valor !== 'number' || !Number.isFinite(valor)) {
        throw new EscalaDeClasificacionInvalidaError(`Indicá desde qué valor empieza el nivel ${nombre}.`);
      }
      if (!tieneUnDecimalComoMaximo(valor)) {
        throw new EscalaDeClasificacionInvalidaError(`El corte de ${nombre} puede tener como máximo un decimal (como el CVSS).`);
      }
      if (valor <= 0 || valor > VALOR_MAXIMO_CVSS) {
        throw new EscalaDeClasificacionInvalidaError(`El corte de ${nombre} tiene que estar entre 0.1 y ${VALOR_MAXIMO_CVSS.toFixed(1)}.`);
      }
    }
    if (!(cortes.moderado < cortes.alto && cortes.alto < cortes.critico)) {
      throw new EscalaDeClasificacionInvalidaError(
        'Los cortes tienen que ir en orden: Moderado empieza antes que Alto, y Alto antes que Crítico, sin repetirse.'
      );
    }
    return new EscalaDeClasificacion({ moderado: cortes.moderado, alto: cortes.alto, critico: cortes.critico });
  }

  get esCvss(): boolean {
    return this.esIgualA(EscalaDeClasificacion.CVSS);
  }

  esIgualA(otra: EscalaDeClasificacion): boolean {
    return this.cortes.moderado === otra.cortes.moderado && this.cortes.alto === otra.cortes.alto && this.cortes.critico === otra.cortes.critico;
  }

  // El nivel de un cvssScore. Mismo resultado que `rango(nivel)` aplicado en
  // SQL: es la misma regla de corte.
  clasificar(cvssScore: number): NivelDeRiesgo {
    if (cvssScore >= this.cortes.critico) return 'Crítico';
    if (cvssScore >= this.cortes.alto) return 'Alto';
    if (cvssScore >= this.cortes.moderado) return 'Moderado';
    return 'Bajo';
  }

  rango(nivel: NivelDeRiesgo): RangoDeNivel {
    switch (nivel) {
      case 'Bajo':
        return { nivel, minimo: 0, menorQue: this.cortes.moderado };
      case 'Moderado':
        return { nivel, minimo: this.cortes.moderado, menorQue: this.cortes.alto };
      case 'Alto':
        return { nivel, minimo: this.cortes.alto, menorQue: this.cortes.critico };
      case 'Crítico':
        return { nivel, minimo: this.cortes.critico, menorQue: null };
    }
  }

  get rangos(): RangoDeNivel[] {
    return NIVELES_DE_RIESGO.map((nivel) => this.rango(nivel));
  }

  // Cómo se nombra la escala en pantallas, informes y exportaciones.
  describir(): string {
    if (this.esCvss) return 'Escala CVSS (por defecto)';
    const { moderado, alto, critico } = this.cortes;
    return `Escala personalizada: Moderado desde ${moderado.toFixed(1)}, Alto desde ${alto.toFixed(1)}, Crítico desde ${critico.toFixed(1)}`;
  }
}

// Los niveles con los nombres que se usaron antes de unificar el vocabulario
// (la columna `severidad` y las pantallas de filtro decían Baja, Media, Alta,
// Crítica). Se siguen aceptando en URLs y en filtros favoritos ya guardados.
const SINONIMOS_DE_NIVEL: Record<string, NivelDeRiesgo> = {
  bajo: 'Bajo',
  baja: 'Bajo',
  moderado: 'Moderado',
  moderada: 'Moderado',
  media: 'Moderado',
  medio: 'Moderado',
  alto: 'Alto',
  alta: 'Alto',
  critico: 'Crítico',
  critica: 'Crítico'
};

// El nivel que nombra un texto ("Crítica", "media", "ALTO"), o null si no
// nombra ninguno.
export function nivelDeRiesgoDesdeTexto(texto: string): NivelDeRiesgo | null {
  const clave = texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return SINONIMOS_DE_NIVEL[clave] ?? null;
}
