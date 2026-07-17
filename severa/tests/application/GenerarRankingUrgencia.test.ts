import { GenerarRankingUrgencia } from '../../src/application/usecases/GenerarRankingUrgencia';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { ServicioDeNotificaciones } from '../../src/application/ports/out/ServicioDeNotificaciones';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';
import { EstadoRemediacionValue } from '../../src/domain/value-objects/EstadoRemediacion';

function repoFalso(vulnerabilidades: Vulnerabilidad[]): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue(vulnerabilidades),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
    listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn().mockResolvedValue([]),
    actualizarEstado: jest.fn().mockResolvedValue(undefined),
    buscarConFiltros: jest.fn().mockResolvedValue([])
  };
}

describe('GenerarRankingUrgencia', () => {
  test('genera el ranking ordenado por nivel de riesgo y CVSS con datos reales del dataset', async () => {
    const dataset = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-20021'), new CvssScore(5.5), 'Nginx', new TipoAccesoValue('No'), 45),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), 5),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí'), 12)
    ];

    const repo = repoFalso(dataset);
    const servicioDeNotificaciones: ServicioDeNotificaciones = {
      notificarPlazoExcedido: jest.fn().mockResolvedValue(undefined),
      notificarVulnerabilidadCritica: jest.fn().mockResolvedValue(undefined),
      notificarInformeListo: jest.fn().mockResolvedValue(undefined),
      notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined)
    };
    const usecase = new GenerarRankingUrgencia(repo, servicioDeNotificaciones);

    const ranking = await usecase.ejecutar();

    expect(ranking.map((entrada) => entrada.vulnerabilidad.cve.valor)).toEqual([
      'CVE-2021-44228',
      'CVE-2021-34527',
      'CVE-2021-20021'
    ]);
    expect(ranking.map((entrada) => entrada.nivelDeRiesgo)).toEqual(['Crítico', 'Alto', 'Moderado']);
  });

  test('dispara la alerta de plazo excedido (RF-76) solo para vulnerabilidades pendientes que superaron su plazo', async () => {
    const excedida = new Vulnerabilidad(
      '1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.5), 'Apache Log4j',
      new TipoAccesoValue('Sí'), 5, undefined, undefined, undefined, new Date('2000-01-01T00:00:00Z')
    ); // Crítico, plazo 7 días, cargada hace décadas -> excedida

    const dentroDePlazo = new Vulnerabilidad(
      '2', new IdentificadorCVE('CVE-2021-45046'), new CvssScore(9.0), 'Apache Log4j',
      new TipoAccesoValue('Sí'), 1, undefined, undefined, undefined, new Date()
    ); // Crítico, cargada hoy -> dentro de plazo

    const remediadaAunqueVieja = new Vulnerabilidad(
      '3', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(9.8), 'OpenSSL',
      new TipoAccesoValue('No'), 3, undefined, undefined,
      new EstadoRemediacionValue('Pendiente').transicionarA('EnProceso').transicionarA('Remediada'),
      new Date('2000-01-01T00:00:00Z')
    ); // Crítico, cargada hace décadas, pero ya remediada -> no debe alertar

    const repo = repoFalso([excedida, dentroDePlazo, remediadaAunqueVieja]);
    const servicioDeNotificaciones: ServicioDeNotificaciones = {
      notificarPlazoExcedido: jest.fn().mockResolvedValue(undefined),
      notificarVulnerabilidadCritica: jest.fn().mockResolvedValue(undefined),
      notificarInformeListo: jest.fn().mockResolvedValue(undefined),
      notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined)
    };
    const usecase = new GenerarRankingUrgencia(repo, servicioDeNotificaciones);

    await usecase.ejecutar();

    expect(servicioDeNotificaciones.notificarPlazoExcedido).toHaveBeenCalledTimes(1);
    expect(servicioDeNotificaciones.notificarPlazoExcedido).toHaveBeenCalledWith(
      expect.objectContaining({ cve: expect.objectContaining({ valor: 'CVE-2021-44228' }) }),
      undefined
    );
  });

  test('RF-76 (Sprint 14): cuando se pasa analistaId, la alerta de plazo excedido queda asociada a ese analista', async () => {
    const excedida = new Vulnerabilidad(
      '1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.5), 'Apache Log4j',
      new TipoAccesoValue('Sí'), 5, undefined, undefined, undefined, new Date('2000-01-01T00:00:00Z')
    );

    const repo = repoFalso([excedida]);
    const servicioDeNotificaciones: ServicioDeNotificaciones = {
      notificarPlazoExcedido: jest.fn().mockResolvedValue(undefined),
      notificarVulnerabilidadCritica: jest.fn().mockResolvedValue(undefined),
      notificarInformeListo: jest.fn().mockResolvedValue(undefined),
      notificarActualizacionDisponible: jest.fn().mockResolvedValue(undefined)
    };
    const usecase = new GenerarRankingUrgencia(repo, servicioDeNotificaciones);

    await usecase.ejecutar(undefined, 'analista-7');

    expect(servicioDeNotificaciones.notificarPlazoExcedido).toHaveBeenCalledWith(
      expect.objectContaining({ cve: expect.objectContaining({ valor: 'CVE-2021-44228' }) }),
      'analista-7'
    );
  });
});
