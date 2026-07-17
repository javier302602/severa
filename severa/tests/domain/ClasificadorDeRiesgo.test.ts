import { clasificar } from '../../src/domain/services/ClasificadorDeRiesgo';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';

describe('ClasificadorDeRiesgo', () => {
  test.each([
    [0.0, 'Bajo'],
    [0.1, 'Bajo'],
    [3.9, 'Bajo'],
    [4.0, 'Moderado'],
    [6.9, 'Moderado'],
    [7.0, 'Alto'],
    [8.9, 'Alto'],
    [9.0, 'Crítico'],
    [10.0, 'Crítico']
  ])('clasifica CVSS %f como %s', (cvss, nivelEsperado) => {
    const resultado = clasificar(new CvssScore(cvss));
    expect(resultado.valor).toBe(nivelEsperado);
  });
});
