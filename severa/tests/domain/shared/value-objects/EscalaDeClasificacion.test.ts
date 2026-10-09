import {
  EscalaDeClasificacion,
  NIVELES_DE_RIESGO,
  nivelDeRiesgoDesdeTexto
} from '../../../../src/domain/shared/value-objects/EscalaDeClasificacion';
import { EscalaDeClasificacionInvalidaError } from '../../../../src/domain/errors/EscalaDeClasificacionInvalidaError';
import { NivelDeRiesgoValue } from '../../../../src/domain/shared/value-objects/NivelDeRiesgo';
import { CvssScore } from '../../../../src/domain/shared/value-objects/CvssScore';

describe('EscalaDeClasificacion — RF-28 / RF-69 (Modo B)', () => {
  describe('escala CVSS (por defecto)', () => {
    const cvss = EscalaDeClasificacion.CVSS;

    test.each([
      [0.0, 'Bajo'],
      [3.9, 'Bajo'],
      [3.95, 'Bajo'],
      [4.0, 'Moderado'],
      [6.9, 'Moderado'],
      [7.0, 'Alto'],
      [8.9, 'Alto'],
      [9.0, 'Crítico'],
      [10.0, 'Crítico']
    ])('%s es %s', (valor, nivel) => {
      expect(cvss.clasificar(valor)).toBe(nivel);
    });

    test('se nombra como escala por defecto y sus cortes son 4.0 / 7.0 / 9.0', () => {
      expect(cvss.esCvss).toBe(true);
      expect(cvss.cortes).toEqual({ moderado: 4.0, alto: 7.0, critico: 9.0 });
      expect(cvss.describir()).toBe('Escala CVSS (por defecto)');
    });

    test('NivelDeRiesgoValue sin escala sigue clasificando con CVSS (compatibilidad)', () => {
      expect(NivelDeRiesgoValue.desde(new CvssScore(8.5)).valor).toBe('Alto');
      expect(NivelDeRiesgoValue.desde(new CvssScore(8.5), EscalaDeClasificacion.personalizada({ moderado: 4, alto: 7, critico: 8.5 })).valor).toBe(
        'Crítico'
      );
    });
  });

  describe('escala personalizada', () => {
    const propia = EscalaDeClasificacion.personalizada({ moderado: 3.5, alto: 6.0, critico: 8.5 });

    test.each([
      [3.4, 'Bajo'],
      [3.5, 'Moderado'],
      [5.9, 'Moderado'],
      [6.0, 'Alto'],
      [8.4, 'Alto'],
      [8.5, 'Crítico']
    ])('%s es %s', (valor, nivel) => {
      expect(propia.clasificar(valor)).toBe(nivel);
    });

    test('los cuatro rangos son contiguos y cubren de 0 a 10, sin huecos ni solapamientos', () => {
      expect(propia.rangos).toEqual([
        { nivel: 'Bajo', minimo: 0, menorQue: 3.5 },
        { nivel: 'Moderado', minimo: 3.5, menorQue: 6.0 },
        { nivel: 'Alto', minimo: 6.0, menorQue: 8.5 },
        { nivel: 'Crítico', minimo: 8.5, menorQue: null }
      ]);
    });

    test('clasificar y rango(nivel) dicen lo mismo para cada décima de 0 a 10', () => {
      for (let decimas = 0; decimas <= 100; decimas++) {
        const valor = decimas / 10;
        const nivel = propia.clasificar(valor);
        const { minimo, menorQue } = propia.rango(nivel);
        expect(valor >= minimo && (menorQue === null || valor < menorQue)).toBe(true);
        const enOtros = NIVELES_DE_RIESGO.filter((otro) => {
          const r = propia.rango(otro);
          return valor >= r.minimo && (r.menorQue === null || valor < r.menorQue);
        });
        expect(enOtros).toEqual([nivel]);
      }
    });

    test('se describe con sus cortes', () => {
      expect(propia.esCvss).toBe(false);
      expect(propia.describir()).toBe('Escala personalizada: Moderado desde 3.5, Alto desde 6.0, Crítico desde 8.5');
    });

    test('con los mismos cortes que CVSS es la escala CVSS', () => {
      expect(EscalaDeClasificacion.personalizada({ moderado: 4, alto: 7, critico: 9 }).esCvss).toBe(true);
    });
  });

  describe('validación', () => {
    test.each([
      [{ moderado: 7, alto: 4, critico: 9 }, 'en orden'],
      [{ moderado: 4, alto: 4, critico: 9 }, 'en orden'],
      [{ moderado: 4, alto: 9, critico: 9 }, 'en orden'],
      [{ moderado: 0, alto: 7, critico: 9 }, 'entre 0.1 y 10.0'],
      [{ moderado: -1, alto: 7, critico: 9 }, 'entre 0.1 y 10.0'],
      [{ moderado: 4, alto: 7, critico: 10.5 }, 'entre 0.1 y 10.0'],
      [{ moderado: 4.25, alto: 7, critico: 9 }, 'un decimal'],
      [{ moderado: Number.NaN, alto: 7, critico: 9 }, 'Indicá desde qué valor empieza el nivel Moderado']
    ])('%j se rechaza (%s)', (cortes, motivo) => {
      expect(() => EscalaDeClasificacion.personalizada(cortes)).toThrow(EscalaDeClasificacionInvalidaError);
      expect(() => EscalaDeClasificacion.personalizada(cortes)).toThrow(motivo);
    });

    test('Crítico puede empezar en 10.0 justo (solo el 10 es Crítico)', () => {
      const escala = EscalaDeClasificacion.personalizada({ moderado: 4, alto: 7, critico: 10 });
      expect(escala.clasificar(9.9)).toBe('Alto');
      expect(escala.clasificar(10)).toBe('Crítico');
    });

    test('0.1 + 0.2 y valores con un decimal escritos de cualquier forma se aceptan', () => {
      expect(() => EscalaDeClasificacion.personalizada({ moderado: 0.1 + 0.2, alto: 7.0, critico: 9.0 })).not.toThrow();
    });
  });

  describe('nivelDeRiesgoDesdeTexto — nombres nuevos y los de antes', () => {
    test.each([
      ['Bajo', 'Bajo'],
      ['Baja', 'Bajo'],
      ['Moderado', 'Moderado'],
      ['Media', 'Moderado'],
      ['media', 'Moderado'],
      ['Alto', 'Alto'],
      ['Alta', 'Alto'],
      ['Crítico', 'Crítico'],
      ['Crítica', 'Crítico'],
      ['CRITICA', 'Crítico'],
      [' alto ', 'Alto']
    ])('"%s" → %s', (texto, nivel) => {
      expect(nivelDeRiesgoDesdeTexto(texto)).toBe(nivel);
    });

    test('un texto que no nombra un nivel devuelve null', () => {
      expect(nivelDeRiesgoDesdeTexto('Urgente')).toBeNull();
      expect(nivelDeRiesgoDesdeTexto('')).toBeNull();
    });
  });
});
