import { PlantillaDeAnalisis } from '../../../src/domain/entities/PlantillaDeAnalisis';
import { PlantillaDeAnalisisInvalidaError } from '../../../src/domain/errors/PlantillaDeAnalisisErrors';

describe('PlantillaDeAnalisis — RF-12', () => {
  describe('normalizarNombre', () => {
    test('quita los espacios al borde y conserva los de adentro y las mayúsculas', () => {
      expect(PlantillaDeAnalisis.normalizarNombre('  Encuestas de  Lima \t')).toBe('Encuestas de  Lima');
    });

    test('un nombre vacío o de solo espacios se rechaza', () => {
      expect(() => PlantillaDeAnalisis.normalizarNombre('')).toThrow(PlantillaDeAnalisisInvalidaError);
      expect(() => PlantillaDeAnalisis.normalizarNombre('   ')).toThrow(PlantillaDeAnalisisInvalidaError);
    });

    test('hasta 80 caracteres; los espacios al borde no cuentan', () => {
      expect(PlantillaDeAnalisis.normalizarNombre(`  ${'a'.repeat(80)}  `)).toHaveLength(80);
      expect(() => PlantillaDeAnalisis.normalizarNombre('a'.repeat(81))).toThrow('hasta 80 caracteres');
    });

    test('cuenta caracteres, no unidades UTF-16 (igual que char_length en la base)', () => {
      // Cada emoji ocupa 2 unidades UTF-16 pero es 1 carácter.
      expect(PlantillaDeAnalisis.normalizarNombre('📊'.repeat(80))).toBe('📊'.repeat(80));
    });
  });

  test('claveDeNombre: mismo nombre sin distinguir mayúsculas ni espacios al borde', () => {
    expect(PlantillaDeAnalisis.claveDeNombre(' Encuestas ')).toBe(PlantillaDeAnalisis.claveDeNombre('ENCUESTAS'));
    expect(PlantillaDeAnalisis.claveDeNombre('Análisis')).toBe(PlantillaDeAnalisis.claveDeNombre('ANÁLISIS'));
  });

  test('estaVacia: sin tipos, sin variable objetivo y sin criterio', () => {
    expect(PlantillaDeAnalisis.estaVacia({ tiposCorregidos: {}, variableObjetivo: null, clasificacion: null })).toBe(true);
    expect(PlantillaDeAnalisis.estaVacia({ tiposCorregidos: {}, variableObjetivo: 'nota', clasificacion: null })).toBe(false);
  });

  test('columnasMencionadas: todas las columnas que la plantilla necesita, sin repetir', () => {
    const plantilla = new PlantillaDeAnalisis('p1', 'analista-A', 'P', {
      tiposCorregidos: { edad: 'categorica_ordinal', ciudad: 'categorica_nominal' },
      variableObjetivo: 'edad',
      clasificacion: {
        criterio: { nombreColumna: 'puntaje', tipo: 'numerica', umbrales: [{ minimo: 0, etiqueta: 'Bajo' }] },
        columnaClave: 'codigo'
      }
    });

    expect(plantilla.columnasMencionadas).toEqual(['edad', 'ciudad', 'puntaje', 'codigo']);
  });
});
