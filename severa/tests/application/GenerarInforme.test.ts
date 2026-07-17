import { GenerarInforme } from '../../src/application/usecases/GenerarInforme';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { AuditoriaRepository } from '../../src/application/ports/out/AuditoriaRepository';
import { GeneradorDeInformes, DatosInforme } from '../../src/application/ports/out/GeneradorDeInformes';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';
import { calcularMedia, calcularMediana } from '../../src/domain/services/EstadisticaDescriptiva';

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

function auditoriaRepositoryFalso(): AuditoriaRepository {
  return {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };
}

function generadorDeInformesFalso(): GeneradorDeInformes & { datosRecibidos: DatosInforme[] } {
  const datosRecibidos: DatosInforme[] = [];
  return {
    datosRecibidos,
    generarInformeCompleto: jest.fn(async (datos: DatosInforme) => { datosRecibidos.push(datos); return Buffer.from('pdf-falso'); }),
    generarInformeWord: jest.fn(async (datos: DatosInforme) => { datosRecibidos.push(datos); return Buffer.from('docx-falso'); }),
    generarResumenEjecutivo: jest.fn(async (datos: DatosInforme) => { datosRecibidos.push(datos); return Buffer.from('resumen-falso'); }),
    generarInformeDataset: jest.fn().mockResolvedValue(Buffer.from('')),
    generarInformeDatasetWord: jest.fn().mockResolvedValue(Buffer.from(''))
  };
}

const dataset = [
  new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí')),
  new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No')),
  new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí')),
  new Vulnerabilidad('4', new IdentificadorCVE('CVE-2021-20021'), new CvssScore(5.5), 'Nginx', new TipoAccesoValue('No'))
];
const scores = [10.0, 9.8, 7.8, 5.5];

describe('GenerarInforme', () => {
  test('formato pdf: arma los datos correctos y llama a generarInformeCompleto', async () => {
    const geradorDeInformes = generadorDeInformesFalso();
    const usecase = new GenerarInforme(repoFalso(dataset), geradorDeInformes, auditoriaRepositoryFalso());

    const resultado = await usecase.ejecutar('pdf');

    expect(resultado.toString()).toBe('pdf-falso');
    expect(geradorDeInformes.generarInformeCompleto).toHaveBeenCalledTimes(1);
    expect(geradorDeInformes.generarInformeWord).not.toHaveBeenCalled();

    const datos = geradorDeInformes.datosRecibidos[0];
    expect(datos.totalVulnerabilidades).toBe(4);
    expect(datos.resumenEstadistico.media).toBeCloseTo(calcularMedia(scores), 10);
    expect(datos.resumenEstadistico.mediana).toBeCloseTo(calcularMediana(scores), 10);
    expect(datos.comparacionAccesoRemotoLocal).toEqual({
      mediaA: 8.9,
      mediaB: 7.65,
      diferenciaMedias: 1.25,
      sdA: 1.5556349186104046,
      sdB: 3.040559159102155
    });
    expect(datos.rankingUrgencia).toHaveLength(4);
    expect(datos.rankingUrgencia[0].vulnerabilidad.cve.valor).toBe('CVE-2021-44228');
    expect(datos.interpretacion).toHaveLength(4);
    expect(datos.generadoEn).toBeInstanceOf(Date);
  });

  test('formato docx: llama a generarInformeWord en vez de generarInformeCompleto', async () => {
    const geradorDeInformes = generadorDeInformesFalso();
    const usecase = new GenerarInforme(repoFalso(dataset), geradorDeInformes, auditoriaRepositoryFalso());

    const resultado = await usecase.ejecutar('docx');

    expect(resultado.toString()).toBe('docx-falso');
    expect(geradorDeInformes.generarInformeWord).toHaveBeenCalledTimes(1);
    expect(geradorDeInformes.generarInformeCompleto).not.toHaveBeenCalled();
  });
});
