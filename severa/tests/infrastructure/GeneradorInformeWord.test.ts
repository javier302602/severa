import JSZip from 'jszip';
import { GeneradorInformeWord } from '../../src/infrastructure/adapters/out/reportes/GeneradorInformeWord';
import { recopilarDatosDeInforme } from '../../src/application/usecases/RecopilarDatosDeInforme';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { AuditoriaRepository } from '../../src/application/ports/out/AuditoriaRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

function repositorioFalso(vulnerabilidades: Vulnerabilidad[]): VulnerabilidadRepository {
  return {
    guardar: jest.fn(),
    guardarLote: jest.fn(),
    contar: jest.fn(),
    listar: jest.fn().mockResolvedValue(vulnerabilidades),
    buscarPorCve: jest.fn(),
    filtrarPorRangoCvss: jest.fn(),
    filtrarPorSeveridad: jest.fn(),
    listarPorTipoAcceso: jest.fn(),
    listarPorTipoVulnerabilidad: jest.fn(),
    listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn(),
    actualizarEstado: jest.fn(),
    buscarConFiltros: jest.fn(),
    eliminarTodas: jest.fn()
  } as unknown as VulnerabilidadRepository;
}

function auditoriaFalsa(): AuditoriaRepository {
  return { registrar: jest.fn(), listar: jest.fn().mockResolvedValue([]) };
}

// Bug real reportado: el .docx generado solo tenía encabezados y tablas de
// datos para los gráficos, sin la imagen real (a diferencia del PDF). Este
// test genera un .docx REAL (con datos reales pasados por
// recopilarDatosDeInforme, el mismo camino que usa la app) y lo abre como
// zip (un .docx ES un .zip) para confirmar que las imágenes PNG quedaron
// adentro de verdad, no solo que el código no tira.
describe('GeneradorInformeWord — gráficos incrustados como imagen (bug real)', () => {
  test('el .docx generado contiene 10 imágenes PNG reales en word/media/', async () => {
    const dataset = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), 5, 'Apache Log4j', 'RCE'),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-45046'), new CvssScore(9.0), 'Apache Log4j', new TipoAccesoValue('Sí'), 3, 'Apache Log4j', 'RCE'),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('No'), 12, 'Microsoft Windows', 'EoP'),
      new Vulnerabilidad('4', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(5.5), 'OpenSSL', new TipoAccesoValue('No'), 20, 'OpenSSL', 'DoS')
    ];
    const datos = await recopilarDatosDeInforme(repositorioFalso(dataset), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');

    const buffer = await new GeneradorInformeWord().generar(datos);

    expect(buffer.subarray(0, 2).toString()).toBe('PK'); // .docx es un .zip real

    const zip = await JSZip.loadAsync(buffer);
    const imagenes = Object.keys(zip.files).filter((ruta) => ruta.startsWith('word/media/') && ruta.endsWith('.png'));
    expect(imagenes).toHaveLength(10);

    // Cada imagen es un PNG real (firma de archivo), no un placeholder vacío.
    for (const ruta of imagenes) {
      const contenido = await zip.files[ruta].async('nodebuffer');
      expect(contenido.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // firma PNG
      expect(contenido.length).toBeGreaterThan(100);
    }
  });
});
