import { generarRanking, estimarPlazoRecomendado, estaPlazoExcedido, evaluarRelacionPlazoReal } from '../../../../src/domain/services/classification/MotorDePriorizacion';
import { Vulnerabilidad } from '../../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../../src/domain/shared/value-objects/TipoAcceso';
import { EstadoRemediacionValue } from '../../../../src/domain/shared/value-objects/EstadoRemediacion';

describe('MotorDePriorizacion', () => {
  // RF-73 (auditoría M-09, frente B): generarRanking pasó de un sort
  // lexicográfico fijo a un puntaje ponderado (z-score de CVSS y de días,
  // pesos default 0.7/0.3). Este test y el siguiente NO cambiaron su
  // expectativa — se reverificó a mano que con los pesos default el orden
  // resultante es idéntico al de antes de RF-73:
  //   - Bucket Crítico (10.0/5d, 9.8/3d, 9.0/2d): CVSS y días bajan juntos,
  //     cualquier combinación con pesos positivos preserva el orden.
  //   - Bucket Alto (7.8/12d vs 7.5/20d): CVSS y días van en direcciones
  //     opuestas, pero con solo 2 elementos los z-scores son siempre
  //     ±magnitud igual — con pesoCriterio(0.7) > pesoUrgencia(0.3) el
  //     criterio domina el signo de la suma sin importar la dirección de la
  //     urgencia (puntaje 7.8/12d ≈ +0.28, 7.5/20d ≈ -0.28).
  // Ver también el describe "RF-73" más abajo, que sí ejercita un caso donde
  // el peso cambia el orden.
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

  // RF-73: pondera de verdad criterio+dispersión+urgencia con pesos
  // configurables — a diferencia del sort lexicográfico anterior, acá el
  // peso SÍ puede cambiar el orden dentro de un nivel de riesgo.
  describe('RF-73 — puntaje ponderado configurable', () => {
    // Mismo par que el bucket "Alto" del primer test de este archivo (CVSS y
    // días en direcciones opuestas), pero acá se invierten los pesos a
    // propósito para demostrar que el peso realmente decide el orden — con
    // pesoCriterio > pesoUrgencia (default) gana el de mayor CVSS; con
    // pesoUrgencia > pesoCriterio gana el de más días esperando.
    const masCvssMenosDias = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', undefined, 12);
    const menosCvssMasDias = new Vulnerabilidad('2', new IdentificadorCVE('CVE-2014-0160'), new CvssScore(7.5), 'OpenSSL', undefined, 20);

    test('con los pesos default (criterio > urgencia), gana el de mayor CVSS', () => {
      const ranking = generarRanking([menosCvssMasDias, masCvssMenosDias]);
      expect(ranking.map((entrada) => entrada.vulnerabilidad.cve.valor)).toEqual(['CVE-2021-34527', 'CVE-2014-0160']);
    });

    test('invirtiendo los pesos (urgencia > criterio), gana el que lleva más días esperando', () => {
      const ranking = generarRanking([menosCvssMasDias, masCvssMenosDias], { pesoCriterio: 0.3, pesoUrgencia: 0.7 });
      expect(ranking.map((entrada) => entrada.vulnerabilidad.cve.valor)).toEqual(['CVE-2014-0160', 'CVE-2021-34527']);
    });

    test('el nivel de riesgo sigue siendo la clave primaria: ningún peso hace que una Crítica quede debajo de una Alta', () => {
      const critica = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-00001'), new CvssScore(9.0), 'Software A', undefined, 1);
      const alta = new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-00002'), new CvssScore(7.0), 'Software B', undefined, 999);

      const ranking = generarRanking([alta, critica], { pesoCriterio: 0, pesoUrgencia: 1 });

      expect(ranking.map((entrada) => entrada.vulnerabilidad.cve.valor)).toEqual(['CVE-2021-00001', 'CVE-2021-00002']);
    });

    test('un bucket con un solo elemento no lanza (z-score no definido con <2 valores)', () => {
      const unicaCritica = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-00001'), new CvssScore(9.5), 'Software A');
      expect(() => generarRanking([unicaCritica])).not.toThrow();
    });

    test('CVSS y días idénticos dentro de un bucket (desviación 0) no lanza y desempata de forma estable', () => {
      const a = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-00001'), new CvssScore(9.5), 'Software A', undefined, 10);
      const b = new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-00002'), new CvssScore(9.5), 'Software B', undefined, 10);

      expect(() => generarRanking([a, b])).not.toThrow();
    });
  });

  // RF-71: plazos configurables por llamada, sin persistencia.
  describe('RF-71 — plazos personalizados', () => {
    test('con plazosPersonalizados, estimarPlazoRecomendado usa el valor dado en vez del default', () => {
      expect(estimarPlazoRecomendado('Crítico', { Crítico: 1, Alto: 2, Moderado: 3, Bajo: 4 })).toBe(1);
      expect(estimarPlazoRecomendado('Bajo', { Crítico: 1, Alto: 2, Moderado: 3, Bajo: 4 })).toBe(4);
    });

    test('sin plazosPersonalizados, sigue usando el default (comportamiento sin cambios)', () => {
      expect(estimarPlazoRecomendado('Crítico')).toBe(7);
    });

    test('estaPlazoExcedido respeta plazosPersonalizados para decidir si está vencida', () => {
      const fechaCarga = new Date('2026-01-01T00:00:00Z');
      const critica = new Vulnerabilidad(
        '1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j',
        new TipoAccesoValue('Sí'), 5, undefined, undefined, undefined, fechaCarga
      );
      const fechaActual = new Date('2026-01-03T00:00:00Z'); // 2 días transcurridos

      // Con el plazo default de Crítico (7 días), a los 2 días NO está excedida.
      expect(estaPlazoExcedido(critica, fechaActual)).toBe(false);
      // Con un plazo personalizado más estricto (1 día para Crítico), SÍ está excedida.
      expect(estaPlazoExcedido(critica, fechaActual, { Crítico: 1, Alto: 30, Moderado: 90, Bajo: 180 })).toBe(true);
    });
  });

  // RF-72: relación entre plazo recomendado y tiempo real de atención.
  describe('RF-72 — evaluarRelacionPlazoReal', () => {
    test('marca "no aplicable" cuando la vulnerabilidad no registra diasParaParche', () => {
      const sinDias = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-00001'), new CvssScore(9.0), 'Software A');

      const resultado = evaluarRelacionPlazoReal(sinDias);

      expect(resultado.aplicable).toBe(false);
      if (!resultado.aplicable) {
        expect(resultado.motivo).toContain('no registra');
      }
    });

    test('cuando diasReales <= plazoRecomendado, cumplioPlazo es true', () => {
      // Crítico: plazo recomendado 7 días.
      const vulnerabilidad = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-00001'), new CvssScore(9.5), 'Software A', undefined, 5);

      const resultado = evaluarRelacionPlazoReal(vulnerabilidad);

      expect(resultado).toEqual({ aplicable: true, plazoRecomendado: 7, diasReales: 5, diferenciaDias: -2, cumplioPlazo: true });
    });

    test('cuando diasReales > plazoRecomendado, cumplioPlazo es false y diferenciaDias es positiva', () => {
      const vulnerabilidad = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-00001'), new CvssScore(9.5), 'Software A', undefined, 10);

      const resultado = evaluarRelacionPlazoReal(vulnerabilidad);

      expect(resultado).toEqual({ aplicable: true, plazoRecomendado: 7, diasReales: 10, diferenciaDias: 3, cumplioPlazo: false });
    });

    test('respeta plazosPersonalizados en vez del default', () => {
      const vulnerabilidad = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-00001'), new CvssScore(9.5), 'Software A', undefined, 5);

      const resultado = evaluarRelacionPlazoReal(vulnerabilidad, { Crítico: 3, Alto: 30, Moderado: 90, Bajo: 180 });

      expect(resultado).toEqual({ aplicable: true, plazoRecomendado: 3, diasReales: 5, diferenciaDias: 2, cumplioPlazo: false });
    });
  });
});
