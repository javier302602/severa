import PDFDocument from 'pdfkit';
import { recopilarDatosDeInformeDataset } from '../../../../../src/application/usecases/module_reportes_exportacion/RecopilarDatosDeInformeDataset';
import {
  DatosInformeDataset,
  OperacionDeLimpiezaEnInforme,
  ProcedenciaDeDatasetEnInforme
} from '../../../../../src/application/ports/out/reportes/GeneradorDeInformes';
import { CorreccionesDeTipo } from '../../../../../src/domain/services/variable-detection/DetectorDeTipoDeColumna';
import {
  encabezadoDeColumnaTipo,
  narrarLimpiezaRealizada,
  narrarTiposCorregidos,
  narrarVariableObjetivo
} from '../../../../../src/infrastructure/adapters/out/reportes/NarrativaDeProcedenciaDataset';
import { construirContenidoInforme } from '../../../../../src/infrastructure/adapters/out/reportes/ContenidoInformeUniversalRF130';
import { BloqueDeInforme, textoPlano } from '../../../../../src/infrastructure/adapters/out/reportes/BloquesDeInforme';

jest.mock('../../../../../src/infrastructure/adapters/out/reportes/LayoutInformePdf', () => {
  const real = jest.requireActual('../../../../../src/infrastructure/adapters/out/reportes/LayoutInformePdf');
  return { ...real, nuevaSeccion: jest.fn(real.nuevaSeccion) };
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LayoutInformePdf = require('../../../../../src/infrastructure/adapters/out/reportes/LayoutInformePdf');
import { renderizarInformeUniversal } from '../../../../../src/infrastructure/adapters/out/reportes/InformeUniversalRF130';

// Sección 8 "Limpieza realizada" del informe genérico (RF-130), y lo que el
// informe dice de las correcciones de tipo (RF-111) y la variable objetivo
// (RF-110). El informe tiene dos renderers (PDF y bloques para Word, HTML,
// LaTeX y Excel): los dos toman el contenido de la misma narrativa, y acá se
// comprueba que los dos lo muestran.
const COLUMNAS = ['edad', 'ciudad', 'puntaje'];
const FILAS = [
  { edad: 20, ciudad: 'Lima', puntaje: 1.5 },
  { edad: 30, ciudad: 'Cusco', puntaje: 2.5 },
  { edad: 30, ciudad: 'Lima', puntaje: 3.5 },
  { edad: 40, ciudad: 'Cusco', puntaje: 4.5 },
  { edad: 25, ciudad: 'Lima', puntaje: 5.5 },
  { edad: 35, ciudad: 'Lima', puntaje: 6.5 }
];

const FECHA = new Date('2026-03-02T15:00:00Z');

function operacion(cambios: Partial<OperacionDeLimpiezaEnInforme>): OperacionDeLimpiezaEnInforme {
  return {
    fecha: FECHA,
    versionOrigen: 0,
    versionResultado: 1,
    operacion: 'imputar',
    variable: 'edad',
    registrosAfectados: 2,
    metodo: 'media',
    ...cambios
  };
}

function datosCon(procedencia?: Partial<ProcedenciaDeDatasetEnInforme>, correcciones?: CorreccionesDeTipo): DatosInformeDataset {
  const datos = recopilarDatosDeInformeDataset(COLUMNAS, FILAS, 'Analista de Prueba', correcciones);
  if (!procedencia) return datos;
  return {
    ...datos,
    procedencia: { nombreArchivo: 'encuesta.csv', version: 0, versionBase: null, operaciones: [], variableObjetivo: null, ...procedencia }
  };
}

const VERSION_PROCESADA: Partial<ProcedenciaDeDatasetEnInforme> = {
  version: 2,
  versionBase: 1,
  operaciones: [
    operacion({ operacion: 'eliminar_columna', variable: 'notas', registrosAfectados: 9, metodo: 'eliminación de la columna' }),
    operacion({ operacion: 'eliminar_registros', variable: 'ciudad', registrosAfectados: 3, metodo: 'eliminación de filas con el valor faltante' }),
    operacion({ versionOrigen: 1, versionResultado: 2, valorImputado: 37.777777, nota: 'La media (37.777777) no es un número entero.' })
  ]
};

describe('narrarLimpiezaRealizada — sección 8', () => {
  test('dataset original: dice que no se le aplicó ninguna limpieza, sin tabla ni advertencias', () => {
    const narrativa = narrarLimpiezaRealizada(datosCon({}));

    expect(narrativa.parrafos).toEqual([
      'Este informe se calculó sobre el dataset original («encuesta.csv») tal como fue importado: no se le aplicó ninguna limpieza ni transformación.',
      'No se detectaron filas duplicadas exactas.'
    ]);
    expect(narrativa).toMatchObject({ operaciones: null, notas: [], advertencias: [] });
  });

  test('sin procedencia (sesión sin dataset guardado): mismo mensaje, sin nombre de archivo', () => {
    const narrativa = narrarLimpiezaRealizada(datosCon());

    expect(narrativa.parrafos[0]).toBe(
      'Este informe se calculó sobre los datos tal como fueron importados: no se le aplicó ninguna limpieza ni transformación.'
    );
    expect(narrativa.operaciones).toBeNull();
  });

  test('si hay filas duplicadas las informa, y aclara que no se eliminan solas', () => {
    const datos = { ...datosCon({}), filasDuplicadas: 4 };

    expect(narrarLimpiezaRealizada(datos).parrafos[1]).toBe(
      'Se detectaron 4 fila(s) duplicada(s) exacta(s) (ver sección 6): SIADE no las elimina ni modifica automáticamente.'
    );
  });

  test('versión procesada: dice qué versión es, de cuál salió y que el original no se modificó', () => {
    const narrativa = narrarLimpiezaRealizada(datosCon(VERSION_PROCESADA));

    expect(narrativa.parrafos[0]).toBe(
      'Este informe se calculó sobre la versión 2 de «encuesta.csv», generada a partir de la versión 1. ' +
        'El dataset original no se modificó: se conserva como fue importado y se puede volver a abrir.'
    );
    expect(narrativa.parrafos[2]).toMatch(/^Para llegar a esta versión se aplicaron 3 operación\(es\) de limpieza, todas elegidas y confirmadas por el analista/);
    expect(narrativa.parrafos[2]).toMatch(/El detalle completo está en la bitácora del dataset\.$/);
  });

  test('una versión generada directamente desde el original lo dice así', () => {
    const narrativa = narrarLimpiezaRealizada(datosCon({ version: 1, versionBase: 0, operaciones: [operacion({})] }));

    expect(narrativa.parrafos[0]).toMatch(/la versión 1 de «encuesta.csv», generada a partir del dataset original\./);
  });

  test('la tabla tiene una fila por operación, en orden, con el paso entre versiones y el valor imputado', () => {
    const { operaciones } = narrarLimpiezaRealizada(datosCon(VERSION_PROCESADA));

    expect(operaciones?.encabezados).toEqual(['Paso', 'Operación', 'Variable', 'Registros', 'Método']);
    expect(operaciones?.filas).toEqual([
      ['del original a v1', 'Eliminación de la variable', 'notas', '9', 'columna completa'],
      ['del original a v1', 'Eliminación de registros', 'ciudad', '3', 'filas con el valor faltante'],
      ['de v1 a v2', 'Imputación', 'edad', '2', 'media (valor: 37.7778)']
    ]);
    // El PDF usa hoja carta con márgenes de 72 pt: 468 pt de ancho útil.
    expect(operaciones?.anchos.reduce((suma, ancho) => suma + ancho, 0)).toBe(468);
    // Solo caracteres que las fuentes estándar del PDF pueden dibujar.
    expect(JSON.stringify(operaciones?.filas)).not.toMatch(/[→←⇒]/);
  });

  test('las notas de las operaciones aparecen, cada una con su variable', () => {
    const { notas } = narrarLimpiezaRealizada(datosCon(VERSION_PROCESADA));

    expect(notas).toEqual(['«edad»: La media (37.777777) no es un número entero.']);
  });

  test('si hubo imputación, advierte que reduce la dispersión de esas variables', () => {
    const { advertencias } = narrarLimpiezaRealizada(datosCon(VERSION_PROCESADA));

    expect(advertencias[0]).toMatch(/^Los valores imputados \(«edad»\) son valores calculados a partir de los datos presentes, no observaciones\./);
    expect(advertencias[0]).toMatch(/reduce la dispersión de la variable/);
  });

  test('si se eliminaron registros, advierte del sesgo posible y dice cuántos fueron en total', () => {
    const { advertencias } = narrarLimpiezaRealizada(datosCon(VERSION_PROCESADA));

    expect(advertencias[1]).toMatch(/^Se eliminaron 3 registro\(s\) por tener valores faltantes\./);
    expect(advertencias[1]).toMatch(/los resultados describen a los registros que quedaron, no al conjunto original/);
  });

  test('sin imputaciones ni filas eliminadas no hay advertencias', () => {
    const narrativa = narrarLimpiezaRealizada(
      datosCon({ version: 1, versionBase: 0, operaciones: [operacion({ operacion: 'eliminar_columna', variable: 'notas', metodo: 'eliminación de la columna' })] })
    );

    expect(narrativa.advertencias).toEqual([]);
  });

  test('versión procesada sin operaciones en la bitácora: lo dice, en vez de mostrar una tabla vacía', () => {
    const narrativa = narrarLimpiezaRealizada(datosCon({ version: 1, versionBase: 0, operaciones: [] }));

    expect(narrativa.operaciones).toBeNull();
    expect(narrativa.parrafos[narrativa.parrafos.length - 1]).toBe(
      'No se encontró en la bitácora el detalle de las operaciones que generaron esta versión.'
    );
  });

  test('un valor imputado de texto (moda) se muestra tal cual', () => {
    const { operaciones } = narrarLimpiezaRealizada(
      datosCon({ version: 1, versionBase: 0, operaciones: [operacion({ variable: 'ciudad', metodo: 'moda', valorImputado: 'Lima' })] })
    );

    expect(operaciones?.filas[0][4]).toBe('moda (valor: Lima)');
  });
});

describe('narrarTiposCorregidos y encabezadoDeColumnaTipo — RF-111', () => {
  test('sin correcciones: nada que decir, y la columna se sigue llamando "Tipo detectado"', () => {
    const datos = datosCon({});

    expect(narrarTiposCorregidos(datos)).toEqual([]);
    expect(encabezadoDeColumnaTipo(datos)).toBe('Tipo detectado');
  });

  test('con correcciones: una frase por variable, con el tipo fijado y el que se había detectado', () => {
    const datos = datosCon({}, { edad: 'categorica_nominal' });

    expect(narrarTiposCorregidos(datos)).toEqual([
      'El analista fijó a mano el tipo de 1 variable(s); todos los cálculos de este informe usan el tipo fijado, no el detectado:',
      '«edad» se trata como categórica nominal (el sistema había detectado numérica discreta).'
    ]);
    expect(encabezadoDeColumnaTipo(datos)).toBe('Tipo');
  });
});

describe('narrarVariableObjetivo — RF-110', () => {
  test('solo se menciona si el analista confirmó una, y aclara que el informe no modela nada con ella', () => {
    expect(narrarVariableObjetivo(datosCon({}))).toBeNull();
    expect(narrarVariableObjetivo(datosCon())).toBeNull();
    expect(narrarVariableObjetivo(datosCon({ variableObjetivo: 'puntaje' }))).toBe(
      'Variable objetivo definida por el analista: «puntaje». Es una anotación sobre el propósito del análisis: este informe no construye ningún modelo a partir de ella.'
    );
  });
});

// Los dos renderers muestran lo mismo.
describe('la procedencia llega al informe en los dos renderers', () => {
  function textoDeSeccion(bloques: BloqueDeInforme[], numero: number): string {
    const inicio = bloques.findIndex((bloque) => bloque.tipo === 'encabezado' && bloque.nivel === 1 && bloque.texto.startsWith(`${numero}. `));
    const fin = bloques.findIndex((bloque, indice) => indice > inicio && bloque.tipo === 'encabezado' && bloque.nivel === 1);
    return bloques
      .slice(inicio + 1, fin === -1 ? undefined : fin)
      .map((bloque) => {
        if (bloque.tipo === 'parrafo') return textoPlano(bloque.fragmentos);
        if (bloque.tipo === 'vineta') return `• ${bloque.texto}`;
        if (bloque.tipo === 'tabla') return [bloque.encabezados.join(' ; '), ...bloque.filas.map((fila) => fila.join(' ; '))].join('\n');
        return '';
      })
      .join('\n');
  }

  async function textoDeSeccionEnPdf(datos: DatosInformeDataset, numero: number): Promise<string> {
    const nuevaSeccion = LayoutInformePdf.nuevaSeccion as jest.Mock;
    nuevaSeccion.mockClear();
    const spyTexto = jest.spyOn(PDFDocument.prototype, 'text');
    try {
      await renderizarInformeUniversal({ pipeline: 'generico', datos });
      const secciones = nuevaSeccion.mock.calls.map((llamada, indice) => ({ numero: Number(llamada[1]), orden: nuevaSeccion.mock.invocationCallOrder[indice] }));
      const actual = secciones.find((seccion) => seccion.numero === numero);
      if (!actual) throw new Error(`no se dibujó la sección ${numero}`);
      const siguiente = secciones.filter((seccion) => seccion.orden > actual.orden).sort((a, b) => a.orden - b.orden)[0];
      return spyTexto.mock.calls
        .filter((_, indice) => {
          const orden = spyTexto.mock.invocationCallOrder[indice];
          return orden > actual.orden && (siguiente === undefined || orden < siguiente.orden);
        })
        .map((llamada) => llamada[0])
        .filter((valor): valor is string => typeof valor === 'string')
        .join('\n');
    } finally {
      spyTexto.mockRestore();
    }
  }

  const datosProcesados = datosCon({ ...VERSION_PROCESADA, variableObjetivo: 'puntaje' }, { edad: 'categorica_nominal' });

  test('sección 8, versión procesada: versión, operaciones, nota y advertencias, en bloques y en PDF', async () => {
    const enBloques = textoDeSeccion(await construirContenidoInforme({ pipeline: 'generico', datos: datosProcesados }), 8);
    const enPdf = await textoDeSeccionEnPdf(datosProcesados, 8);

    [enBloques, enPdf].forEach((texto) => {
      expect(texto).toContain('Este informe se calculó sobre la versión 2 de «encuesta.csv», generada a partir de la versión 1.');
      expect(texto).toContain('Eliminación de registros');
      expect(texto).toContain('media (valor: 37.7778)');
      expect(texto).toContain('de v1 a v2');
      expect(texto).toContain('• «edad»: La media (37.777777) no es un número entero.');
      expect(texto).toContain('reduce la dispersión de la variable');
      expect(texto).toContain('Se eliminaron 3 registro(s) por tener valores faltantes.');
      // Lo que decía antes de que existiera la limpieza ya no es cierto.
      expect(texto).not.toContain('SIADE no transforma datos');
    });
  });

  test('sección 8, dataset original: sin tabla de operaciones, en bloques y en PDF', async () => {
    const datos = datosCon({});
    const enBloques = textoDeSeccion(await construirContenidoInforme({ pipeline: 'generico', datos }), 8);
    const enPdf = await textoDeSeccionEnPdf(datos, 8);

    [enBloques, enPdf].forEach((texto) => {
      expect(texto).toContain('no se le aplicó ninguna limpieza ni transformación');
      expect(texto).not.toContain('Imputación');
      expect(texto).not.toContain('Paso');
    });
  });

  test('sección 5: lista los tipos corregidos y cambia el encabezado de la columna, en bloques y en PDF', async () => {
    const enBloques = textoDeSeccion(await construirContenidoInforme({ pipeline: 'generico', datos: datosProcesados }), 5);
    const enPdf = await textoDeSeccionEnPdf(datosProcesados, 5);

    [enBloques, enPdf].forEach((texto) => {
      expect(texto).toContain('Composición por tipo vigente:');
      expect(texto).toContain('«edad» se trata como categórica nominal (el sistema había detectado numérica discreta).');
      expect(texto).not.toContain('Tipo detectado');
    });
  });

  test('sección 5 sin correcciones: queda exactamente como antes', async () => {
    const datos = datosCon({});
    const enBloques = textoDeSeccion(await construirContenidoInforme({ pipeline: 'generico', datos }), 5);
    const enPdf = await textoDeSeccionEnPdf(datos, 5);

    [enBloques, enPdf].forEach((texto) => {
      expect(texto).toContain('Composición por tipo detectado:');
      expect(texto).toContain('Tipo detectado');
      expect(texto).not.toContain('El analista fijó a mano');
    });
  });

  test('sección 3: menciona la variable objetivo confirmada, en bloques y en PDF', async () => {
    const enBloques = textoDeSeccion(await construirContenidoInforme({ pipeline: 'generico', datos: datosProcesados }), 3);
    const enPdf = await textoDeSeccionEnPdf(datosProcesados, 3);

    [enBloques, enPdf].forEach((texto) => {
      expect(texto).toContain('Variable objetivo definida por el analista: «puntaje».');
    });
  });
});
