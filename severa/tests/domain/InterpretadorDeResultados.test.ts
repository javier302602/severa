import {
  generarInterpretacion,
  interpretarDispersion,
  interpretarComparacionAcceso,
  interpretarRanking
} from '../../src/domain/services/InterpretadorDeResultados';
import { EntradaRanking } from '../../src/domain/services/MotorDePriorizacion';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';

function entradaRanking(posicion: number, cvss: number, nivelDeRiesgo: EntradaRanking['nivelDeRiesgo']): EntradaRanking {
  return {
    posicion,
    nivelDeRiesgo,
    vulnerabilidad: new Vulnerabilidad(String(posicion), new IdentificadorCVE(`CVE-2024-0000${posicion}`), new CvssScore(cvss), 'Software X')
  };
}

describe('InterpretadorDeResultados', () => {
  test('genera los 4 párrafos con datos fijos verificados a mano', () => {
    const resumen = { media: 7.5, mediana: 7.8, coeficienteVariacion: 28 };
    const comparacion = { mediaA: 8.9, mediaB: 7.65, diferenciaMedias: 1.25, sdA: 1.5556349186104046, sdB: 3.040559159102155 };
    const ranking = [
      entradaRanking(1, 9.8, 'Crítico'),
      entradaRanking(2, 9.0, 'Crítico'),
      entradaRanking(3, 7.8, 'Alto')
    ];

    const parrafos = generarInterpretacion(6, resumen, comparacion, ranking);

    expect(parrafos).toEqual([
      'La severidad promedio (CVSS) de las 6 vulnerabilidades analizadas es de 7.50, lo cual corresponde a un nivel de riesgo Alto. La mediana es de 7.80.',
      'El coeficiente de variación es de 28.00%, lo que indica dispersión moderada en la severidad de las vulnerabilidades.',
      'Las vulnerabilidades de acceso remoto presentan, en promedio, una severidad 1.25 puntos mayor (remoto: 8.90, local: 7.65), lo que sugiere priorizar la remediación de accesos remotos.',
      'Se identificaron 2 vulnerabilidad(es) de riesgo Crítico, que según el plazo recomendado deben remediarse en un máximo de 7 días.'
    ]);
  });

  test.each([
    [0, 'baja'],
    [14.9, 'baja'],
    [15, 'moderada'],
    [28, 'moderada'],
    [30, 'moderada'],
    [30.1, 'alta'],
    [50, 'alta']
  ])('interpretarDispersion(%f) clasifica como %s', (cv, esperado) => {
    expect(interpretarDispersion(cv)).toContain(esperado === 'baja' ? 'baja dispersión' : esperado === 'moderada' ? 'dispersión moderada' : 'alta dispersión');
  });

  test('interpretarComparacionAcceso indica "local" cuando la diferencia es negativa', () => {
    const comparacion = { mediaA: 5.0, mediaB: 8.0, diferenciaMedias: -3.0, sdA: 0, sdB: 0 };
    expect(interpretarComparacionAcceso(comparacion)).toBe(
      'Las vulnerabilidades de acceso local presentan, en promedio, una severidad 3.00 puntos mayor (remoto: 5.00, local: 8.00), lo que sugiere priorizar la remediación de accesos locales.'
    );
  });

  test('interpretarComparacionAcceso indica igualdad cuando la diferencia es despreciable', () => {
    const comparacion = { mediaA: 7.0, mediaB: 7.02, diferenciaMedias: -0.02, sdA: 0, sdB: 0 };
    expect(interpretarComparacionAcceso(comparacion)).toBe(
      'La severidad promedio entre vulnerabilidades de acceso remoto (7.00) y local (7.02) es prácticamente igual.'
    );
  });

  test('interpretarRanking indica que no hay críticas cuando no las hay', () => {
    const ranking = [entradaRanking(1, 5.5, 'Moderado')];
    expect(interpretarRanking(ranking)).toBe('No se identificaron vulnerabilidades de riesgo Crítico en el conjunto analizado.');
  });
});
