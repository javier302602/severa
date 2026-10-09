import ExcelJS from 'exceljs';
import { ExportarDistribucionFrecuencias } from '../../../src/application/usecases/module_distribucion_frecuencias/ExportarDistribucionFrecuencias';
import { GenerarDistribucionFrecuencias } from '../../../src/application/usecases/module_distribucion_frecuencias/GenerarDistribucionFrecuencias';
import { GenerarDistribucionFrecuenciasUseCase } from '../../../src/application/ports/in/module_distribucion_frecuencias/GenerarDistribucionFrecuenciasUseCase';
import { VulnerabilidadRepository } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';
import { ValorEstadisticoError } from '../../../src/domain/errors/ValorEstadisticoError';

function vuln(id: string, cvss: number, dias?: number): Vulnerabilidad {
  return new Vulnerabilidad(id, new IdentificadorCVE(`CVE-2024-${String(1000 + Number(id))}`), new CvssScore(cvss), 'Software', undefined, dias);
}

const VULNERABILIDADES = [vuln('1', 9.8, 5), vuln('2', 9.8, 12), vuln('3', 7.5, 30), vuln('4', 5.0), vuln('5', 3.1, 44), vuln('6', 1.0, 8)];

function casoDeUsoReal(lista = VULNERABILIDADES): ExportarDistribucionFrecuencias {
  const repositorio = { listar: jest.fn().mockResolvedValue(lista) } as unknown as VulnerabilidadRepository;
  return new ExportarDistribucionFrecuencias(new GenerarDistribucionFrecuencias(repositorio));
}

async function abrir(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  return libro;
}

// RF-38: la tabla de frecuencias como .xlsx. Se prueba contra el caso de uso
// real que calcula la tabla (no un fake): lo que importa es que el archivo
// tenga los mismos números que la pantalla.
describe('ExportarDistribucionFrecuencias (RF-38)', () => {
  test('agrupada: una hoja con una fila por intervalo y los mismos valores que calcula GenerarDistribucionFrecuencias, como números', async () => {
    const libro = await abrir(await casoDeUsoReal().ejecutar('agrupada', 'analista-1'));

    expect(libro.worksheets.map((hoja) => hoja.name)).toEqual(['Índice', '1. Frecuencias agrupadas']);
    expect(libro.getWorksheet('Índice')!.getCell('A1').value).toBe('Distribución de frecuencias — CVSS Score');

    const hoja = libro.worksheets[1];
    expect(hoja.getRow(1).values).toEqual([
      undefined,
      'Intervalo',
      'Límite inferior',
      'Límite superior',
      'Marca de clase',
      'Frec. absoluta',
      'Frec. relativa (%)',
      'Frec. acumulada',
      'Frec. rel. acumulada (%)'
    ]);
    // 5 bandas oficiales de CVSS.
    expect(hoja.rowCount).toBe(6);
    // [0-2): solo el 1.0 -> 1 de 6.
    expect(hoja.getRow(2).values).toEqual([undefined, '[0-2)', 0, 2, 1, 1, 16.67, 1, 16.67]);
    // [8-10]: los dos 9.8 -> acumulada 6, 100%.
    expect(hoja.getRow(6).values).toEqual([undefined, '[8-10]', 8, 10, 9, 2, 33.33, 6, 100]);
    // La suma de las frecuencias absolutas es el total de registros: se puede calcular en Excel.
    const absolutas = [2, 3, 4, 5, 6].map((fila) => hoja.getRow(fila).getCell(5).value as number);
    expect(absolutas.every((valor) => typeof valor === 'number')).toBe(true);
    expect(absolutas.reduce((a, b) => a + b, 0)).toBe(VULNERABILIDADES.length);
  });

  test('sin agrupar: un valor por fila con su frecuencia, y la columna lleva el nombre de la variable', async () => {
    const libro = await abrir(await casoDeUsoReal().ejecutar('sinAgrupar', 'analista-1'));
    const hoja = libro.getWorksheet('1. Frecuencias sin agrupar')!;

    expect(hoja.getRow(1).values).toEqual([undefined, 'CVSS Score', 'Frecuencia']);
    const filas = [2, 3, 4, 5, 6].map((fila) => [hoja.getRow(fila).getCell(1).value, hoja.getRow(fila).getCell(2).value]);
    expect(filas).toEqual([
      [1, 1],
      [3.1, 1],
      [5, 1],
      [7.5, 1],
      [9.8, 2]
    ]);
  });

  test('exporta la tabla que se pidió: variable y número de intervalos llegan al cálculo', async () => {
    const libro = await abrir(await casoDeUsoReal().ejecutar('agrupada', 'analista-1', 3, 'diasParaParche'));

    expect(libro.getWorksheet('Índice')!.getCell('A1').value).toBe('Distribución de frecuencias — Días para parche');
    const hoja = libro.worksheets[1];
    // 3 intervalos pedidos sobre el rango real 5-44 (5 registros con días cargados).
    expect(hoja.rowCount).toBe(4);
    expect(hoja.getRow(2).getCell(2).value).toBe(5);
    expect(hoja.getRow(4).getCell(3).value).toBe(44);
    expect(hoja.getRow(4).getCell(7).value).toBe(5);
  });

  test('pasa los parámetros tal cual al caso de uso que calcula', async () => {
    const generar: jest.Mocked<GenerarDistribucionFrecuenciasUseCase> = { ejecutar: jest.fn().mockResolvedValue([{ valor: 1, frecuencia: 2 }]) };

    await new ExportarDistribucionFrecuencias(generar).ejecutar('sinAgrupar', 'analista-9', 7, 'diasParaParche');

    expect(generar.ejecutar).toHaveBeenCalledWith('sinAgrupar', 'analista-9', undefined, 7, 'diasParaParche');
  });

  test('catálogo vacío: el mismo error que da la pantalla, no un Excel vacío', async () => {
    await expect(casoDeUsoReal([]).ejecutar('agrupada', 'analista-1')).rejects.toThrow(ValorEstadisticoError);
  });
});
