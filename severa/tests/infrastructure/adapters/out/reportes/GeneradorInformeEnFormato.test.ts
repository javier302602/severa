import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { GeneradorInformePDF } from '../../../../../src/infrastructure/adapters/out/reportes/GeneradorInformePDF';
import { recopilarDatosDeInforme } from '../../../../../src/application/usecases/module_reportes_exportacion/RecopilarDatosDeInforme';
import { recopilarDatosDeInformeDataset } from '../../../../../src/application/usecases/module_reportes_exportacion/RecopilarDatosDeInformeDataset';
import { FORMATOS_DE_INFORME, InformeSolicitado, esFormatoDeInforme } from '../../../../../src/application/ports/out/reportes/GeneradorDeInformes';
import { MAPEO_PLANTILLA_UNIVERSAL_RF130 } from '../../../../../src/domain/services/reportes/MapeoPlantillaUniversalRF130';
import { construirContenidoInforme } from '../../../../../src/infrastructure/adapters/out/reportes/ContenidoInformeUniversalRF130';
import { escaparHtml } from '../../../../../src/infrastructure/adapters/out/reportes/RenderizadorInformeHtml';
import { VulnerabilidadRepository } from '../../../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { AuditoriaRepository } from '../../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { Vulnerabilidad } from '../../../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../../../src/domain/shared/value-objects/TipoAcceso';

// M-10 Ronda 2, Pasada 3 (RF-79/RF-80/RF-132/RF-133): el informe completo en
// cada formato, de punta a punta — datos reales pasados por los mismos
// recopiladores que usa la app, archivos reales que después se vuelven a
// abrir. Lo que se verifica no es "no explota" sino que todos los formatos
// cuentan el mismo informe: mismas 20 secciones, mismas tablas, mismas
// figuras.
function vuln(id: string, cve: string, cvss: number, software: string, acceso: 'Sí' | 'No', dias?: number, tipo?: string): Vulnerabilidad {
  return new Vulnerabilidad(id, new IdentificadorCVE(cve), new CvssScore(cvss), software, new TipoAccesoValue(acceso), dias, software, tipo);
}

const VULNERABILIDADES = [
  vuln('1', 'CVE-2021-44228', 10.0, 'Apache Log4j', 'Sí', 5, 'RCE'),
  vuln('2', 'CVE-2021-45046', 9.0, 'Apache Log4j', 'Sí', 3, 'RCE'),
  vuln('3', 'CVE-2021-34527', 7.8, 'Microsoft Windows', 'No', 12, 'EoP'),
  vuln('4', 'CVE-2021-35587', 5.5, 'OpenSSL', 'No', 20, 'DoS'),
  vuln('5', 'CVE-2014-0160', 5.0, 'OpenSSL', 'Sí', 45, 'Info Leak'),
  vuln('6', 'CVE-2021-20021', 3.1, 'Nginx', 'No', undefined, 'DoS')
];

const COLUMNAS = ['Producto', 'Categoria', 'Precio', 'Unidades'];
const FILAS = [
  ['Laptop', 'Electrónica', 1200, 3],
  ['Mouse', 'Accesorios', 25, 40],
  ['Teclado', 'Accesorios', 45, 22],
  ['Monitor', 'Electrónica', 310, 9],
  ['Webcam', 'Accesorios', 60, 18],
  ['Tablet', 'Electrónica', 420, 7],
  ['Cable <HDMI> & "audio"', 'Accesorios', 12, 55]
].map(([Producto, Categoria, Precio, Unidades]) => ({ Producto, Categoria, Precio, Unidades }));

async function informeCvss(): Promise<InformeSolicitado> {
  const repositorio = { listar: jest.fn().mockResolvedValue(VULNERABILIDADES), listarSoftwareDisponible: jest.fn().mockResolvedValue([]) } as unknown as VulnerabilidadRepository;
  const auditoria: AuditoriaRepository = { registrar: jest.fn(), listar: jest.fn().mockResolvedValue([]) };
  return { pipeline: 'cvss', datos: await recopilarDatosDeInforme(repositorio, auditoria, 'Analista de Prueba', 'analista-1') };
}

function informeGenerico(): InformeSolicitado {
  return { pipeline: 'generico', datos: recopilarDatosDeInformeDataset(COLUMNAS, FILAS, 'Analista de Prueba') };
}

const SECCIONES = MAPEO_PLANTILLA_UNIVERSAL_RF130.filter((entrada) => entrada.numero !== 1).map((entrada) => `${entrada.numero}. ${entrada.nombreRF130}`);

const generador = new GeneradorInformePDF();

describe.each([
  ['cvss', informeCvss, 10],
  ['genérico', async () => informeGenerico(), 3]
] as const)('generarInformeEnFormato — pipeline %s', (_nombre, obtenerInforme, figurasEsperadas) => {
  let informe: InformeSolicitado;
  let tablasEsperadas: number;

  beforeAll(async () => {
    informe = await obtenerInforme();
    tablasEsperadas = (await construirContenidoInforme(informe)).filter((bloque) => bloque.tipo === 'tabla').length;
  });

  test('pdf: un PDF real', async () => {
    const archivo = await generador.generarInformeEnFormato(informe, 'pdf');

    expect(archivo.tipoMime).toBe('application/pdf');
    expect(archivo.extension).toBe('pdf');
    expect(archivo.contenido.subarray(0, 4).toString()).toBe('%PDF');
  });

  test('docx: un .docx real con las figuras incrustadas', async () => {
    const archivo = await generador.generarInformeEnFormato(informe, 'docx');

    expect(archivo.extension).toBe('docx');
    const zip = await JSZip.loadAsync(archivo.contenido);
    expect(Object.keys(zip.files).filter((ruta) => ruta.startsWith('word/media/') && ruta.endsWith('.png'))).toHaveLength(figurasEsperadas);
  });

  test('html (RF-132): las 20 secciones en orden, todas las tablas y todas las figuras, en un solo archivo', async () => {
    const archivo = await generador.generarInformeEnFormato(informe, 'html');
    const html = archivo.contenido.toString('utf-8');

    expect(archivo.tipoMime).toBe('text/html; charset=utf-8');
    expect(archivo.extension).toBe('html');
    const titulos = [...html.matchAll(/<h2 id="seccion-\d+">([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(titulos).toEqual(SECCIONES.map(escaparHtml));
    expect((html.match(/<table>/g) ?? []).length).toBe(tablasEsperadas);
    expect((html.match(/<figure>/g) ?? []).length).toBe(figurasEsperadas);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\b(src|href)="https?:/i);
  });

  test('latex (RF-133): un .zip con informe.tex, sus figuras y las instrucciones; el .tex cita exactamente las figuras que trae', async () => {
    const archivo = await generador.generarInformeEnFormato(informe, 'latex');

    expect(archivo.tipoMime).toBe('application/zip');
    expect(archivo.extension).toBe('zip');
    const zip = await JSZip.loadAsync(archivo.contenido);
    const tex = await zip.file('informe.tex')!.async('string');
    expect(zip.file('LEEME.txt')).not.toBeNull();

    const citadas = [...tex.matchAll(/\\includegraphics\[[^\]]*\]\{([^}]+)\}/g)].map((m) => m[1]);
    expect(citadas).toHaveLength(figurasEsperadas);
    for (const ruta of citadas) {
      const figura = zip.file(ruta);
      expect(figura).not.toBeNull();
      expect((await figura!.async('nodebuffer')).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
    const titulos = [...tex.matchAll(/\\section\*\{([^}]*(?:\\[^}]*)*)\}/g)].length;
    expect(titulos).toBe(SECCIONES.length);
    expect((tex.match(/\\begin\{longtable\}/g) ?? []).length).toBe(tablasEsperadas);
    // Llaves balanceadas fuera de las escapadas: un .tex con una llave de
    // más no compila.
    const sinEscapadas = tex.replace(/\\[{}]/g, '');
    expect((sinEscapadas.match(/\{/g) ?? []).length).toBe((sinEscapadas.match(/\}/g) ?? []).length);
  });

  test('xlsx (RF-79): una hoja por cada tabla del informe, más el índice', async () => {
    const archivo = await generador.generarInformeEnFormato(informe, 'xlsx');

    expect(archivo.extension).toBe('xlsx');
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(archivo.contenido as unknown as ArrayBuffer);
    expect(libro.worksheets).toHaveLength(tablasEsperadas + 1);
    expect(libro.worksheets[0].name).toBe('Índice');
  });

  test.each(['pdf', 'docx', 'html', 'xlsx'] as const)('RF-80 con formato %s: un .zip con el informe en ese formato y cada gráfico como PNG y SVG independientes', async (formato) => {
    const solo = await generador.generarInformeEnFormato(informe, formato);
    const paquete = await generador.generarInformeEnFormato(informe, formato, { adjuntarGraficos: true });

    expect(paquete.tipoMime).toBe('application/zip');
    expect(paquete.extension).toBe('zip');
    const zip = await JSZip.loadAsync(paquete.contenido);
    expect(zip.file(`informe.${solo.extension}`)).not.toBeNull();

    const graficos = Object.keys(zip.files).filter((ruta) => ruta.startsWith('graficos/') && !zip.files[ruta].dir);
    expect(graficos.filter((ruta) => ruta.endsWith('.png'))).toHaveLength(figurasEsperadas);
    expect(graficos.filter((ruta) => ruta.endsWith('.svg'))).toHaveLength(figurasEsperadas);
    // Numerados en el orden del informe, con un nombre legible y sin rutas raras.
    graficos.forEach((ruta) => expect(ruta).toMatch(/^graficos\/\d{2}-[a-z0-9-]+\.(png|svg)$/));
    const primerSvg = await zip.file(graficos.filter((ruta) => ruta.endsWith('.svg')).sort()[0])!.async('string');
    expect(primerSvg.startsWith('<svg')).toBe(true);
  });

  test('RF-80 con latex: el paquete LaTeX ya trae sus figuras sueltas, no se envuelve en otro zip', async () => {
    const paquete = await generador.generarInformeEnFormato(informe, 'latex', { adjuntarGraficos: true });

    const zip = await JSZip.loadAsync(paquete.contenido);
    expect(zip.file('informe.tex')).not.toBeNull();
    expect(zip.file('informe.zip')).toBeNull();
  });
});

describe('generarInformeEnFormato — texto del dataset en los formatos nuevos', () => {
  test('un valor con marcado HTML llega escapado al HTML y neutralizado al LaTeX', async () => {
    const informe = informeGenerico();

    const html = (await generador.generarInformeEnFormato(informe, 'html')).contenido.toString('utf-8');
    expect(html).toContain('Cable &lt;HDMI&gt; &amp; &quot;audio&quot;');
    expect(html).not.toContain('Cable <HDMI>');

    const zip = await JSZip.loadAsync((await generador.generarInformeEnFormato(informe, 'latex')).contenido);
    const tex = await zip.file('informe.tex')!.async('string');
    expect(tex).toContain('Cable \\textless{}HDMI\\textgreater{} \\& \\symbol{34}audio\\symbol{34}');
  });
});

describe('formatos de informe', () => {
  test('el puerto declara los cinco formatos y esFormatoDeInforme solo acepta esos', () => {
    expect([...FORMATOS_DE_INFORME]).toEqual(['pdf', 'docx', 'html', 'latex', 'xlsx']);
    FORMATOS_DE_INFORME.forEach((formato) => expect(esFormatoDeInforme(formato)).toBe(true));
    ['PDF', 'tex', 'zip', '', undefined, null, 5, ['pdf']].forEach((valor) => expect(esFormatoDeInforme(valor)).toBe(false));
  });
});
