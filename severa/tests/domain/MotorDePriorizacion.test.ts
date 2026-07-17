import { generarRanking, estimarPlazoRecomendado, estaPlazoExcedido } from '../../src/domain/services/MotorDePriorizacion';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';
import { EstadoRemediacionValue } from '../../src/domain/value-objects/EstadoRemediacion';

describe('MotorDePriorizacion', () => {
  test('genera el ranking combinando nivel de riesgo y CVSS, con datos reales del dataset', () => {
    // Nivel de riesgo esperado entre paréntesis, verificado a mano contra
    // ClasificadorDeRiesgo antes de escribir el assert:
    const logShell = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), 5); // Crítico
    const openSsl = new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No'), 3); // Crítico
    const log4jSegundo = new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-45046'), new CvssScore(9.0), 'Apache Log4j', new TipoAccesoValue('Sí'), 2); // Crítico
    const printNightmare = new Vulnerabilidad('4', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí'), 12); // Alto
    const heartbleed = new Vulnerabilidad('5', new IdentificadorCVE('CVE-2014-0160'), new CvssScore(7.5), 'OpenSSL', new TipoAccesoValue('Remoto'), 20); // Alto
    const nginx = new Vulnerabilidad('6', new IdentificadorCVE('CVE-2021-20021'), new CvssScore(5.5), 'Nginx', new TipoAccesoValue('No'), 45); // Moderado

    // Orden de entrada deliberadamente mezclado para probar que el sort ordena.
    const ranking = generarRanking([nginx, printNightmare, log4jSegundo, logShell, heartbleed, openSsl]);

    expect(ranking.map((entrada) => entrada.vulnerabilidad.cve.valor)).toEqual([
      'CVE-2021-44228', // Crítico, CVSS 10.0
      'CVE-2021-35587', // Crítico, CVSS 9.8
      'CVE-2021-45046', // Crítico, CVSS 9.0
      'CVE-2021-34527', // Alto, CVSS 7.8
      'CVE-2014-0160',  // Alto, CVSS 7.5
      'CVE-2021-20021'  // Moderado, CVSS 5.5
    ]);
    expect(ranking.map((entrada) => entrada.posicion)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ranking.map((entrada) => entrada.nivelDeRiesgo)).toEqual([
      'Crítico', 'Crítico', 'Crítico', 'Alto', 'Alto', 'Moderado'
    ]);
  });

  test('a igual nivel de riesgo y CVSS, desempata por días para parche (más días = más urgente)', () => {
    const menosDias = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2023-00001'), new CvssScore(8.0), 'Software A', undefined, 4);
    const masDias = new Vulnerabilidad('2', new IdentificadorCVE('CVE-2023-00002'), new CvssScore(8.0), 'Software B', undefined, 40);

    const ranking = generarRanking([menosDias, masDias]);

    expect(ranking.map((entrada) => entrada.vulnerabilidad.cve.valor)).toEqual([
      'CVE-2023-00002',
      'CVE-2023-00001'
    ]);
  });

  test('estima el plazo recomendado según el nivel de riesgo', () => {
    expect(estimarPlazoRecomendado('Crítico')).toBe(7);
    expect(estimarPlazoRecomendado('Alto')).toBe(30);
    expect(estimarPlazoRecomendado('Moderado')).toBe(90);
    expect(estimarPlazoRecomendado('Bajo')).toBe(180);
  });

  test('detecta plazo excedido cuando ya pasaron más días que el plazo recomendado y no está remediada', () => {
    const fechaCarga = new Date('2026-01-01T00:00:00Z');
    const critica = new Vulnerabilidad(
      '1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j',
      new TipoAccesoValue('Sí'), 5, undefined, undefined, undefined, fechaCarga
    );

    // Plazo de Crítico = 7 días. A los 8 días, excedido.
    expect(estaPlazoExcedido(critica, new Date('2026-01-09T00:00:00Z'))).toBe(true);
    // A los 6 días, todavía dentro del plazo.
    expect(estaPlazoExcedido(critica, new Date('2026-01-07T00:00:00Z'))).toBe(false);
  });

  test('no dispara alerta si la vulnerabilidad ya fue remediada, aunque haya pasado el plazo', () => {
    const fechaCarga = new Date('2026-01-01T00:00:00Z');
    const remediada = new Vulnerabilidad(
      '1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j',
      new TipoAccesoValue('Sí'), 5, undefined, undefined,
      new EstadoRemediacionValue('Pendiente').transicionarA('EnProceso').transicionarA('Remediada'),
      fechaCarga
    );

    expect(estaPlazoExcedido(remediada, new Date('2026-06-01T00:00:00Z'))).toBe(false);
  });
});
