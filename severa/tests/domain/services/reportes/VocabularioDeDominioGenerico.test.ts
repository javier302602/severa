import {
  detectarVocabularioDataset,
  VOCABULARIO_NEUTRO
} from '../../../../src/domain/services/reportes/VocabularioDeDominioGenerico';

describe('VocabularioDeDominioGenerico', () => {
  test('sin ninguna columna reconocible, devuelve el vocabulario neutro', () => {
    expect(detectarVocabularioDataset(['precio', 'ciudad', 'fecha_alta'])).toEqual(VOCABULARIO_NEUTRO);
  });

  test('columnas vacías devuelven el vocabulario neutro', () => {
    expect(detectarVocabularioDataset([])).toEqual(VOCABULARIO_NEUTRO);
  });

  test('detecta el dominio biología por nombre de columna exacto', () => {
    const vocabulario = detectarVocabularioDataset(['especie', 'peso_kg', 'habitat']);
    expect(vocabulario.dominio).toBe('biologia');
    expect(vocabulario.unidadSingular).toBe('espécimen');
    expect(vocabulario.unidadPlural).toBe('especímenes');
  });

  test('detecta el dominio dentro de un nombre de columna compuesto (token, no substring crudo)', () => {
    const vocabulario = detectarVocabularioDataset(['nombre_especie', 'fecha_captura']);
    expect(vocabulario.dominio).toBe('biologia');
  });

  test('no matchea una coincidencia de substring que no es un token real', () => {
    // "cliente" aparece como substring de "reclientelizacion" pero no como
    // token propio — no debe disparar el dominio comercial.
    const vocabulario = detectarVocabularioDataset(['reclientelizacion_score', 'fecha']);
    expect(vocabulario).toEqual(VOCABULARIO_NEUTRO);
  });

  test('detecta el dominio de ciencias sociales', () => {
    const vocabulario = detectarVocabularioDataset(['encuestado_id', 'edad', 'respuesta']);
    expect(vocabulario.dominio).toBe('cienciasSociales');
    expect(vocabulario.unidadSingular).toBe('encuestado');
  });

  test('detecta el dominio comercial', () => {
    const vocabulario = detectarVocabularioDataset(['cliente_id', 'producto', 'venta_total']);
    expect(vocabulario.dominio).toBe('comercial');
  });

  // Bug real: el dominio comercial llamaba "cliente" a cada fila siempre. Un
  // registro de ventas (Producto/Precio/Cantidad/FechaVenta) salía en el
  // informe como "un dataset de 30 clientes".
  describe('dominio comercial: qué es cada fila se decide por la evidencia, no se asume "cliente"', () => {
    const unidad = (columnas: string[]) => {
      const vocabulario = detectarVocabularioDataset(columnas);
      expect(vocabulario.dominio).toBe('comercial');
      return [vocabulario.unidadSingular, vocabulario.unidadPlural];
    };

    test('con una columna de transacción, cada fila es esa transacción aunque haya columnas de cliente y producto', () => {
      expect(unidad(['Producto', 'Categoria', 'Precio', 'Cantidad', 'FechaVenta'])).toEqual(['venta', 'ventas']);
      expect(unidad(['cliente_id', 'producto', 'venta_total'])).toEqual(['venta', 'ventas']);
      expect(unidad(['nro_pedido', 'cliente', 'monto'])).toEqual(['pedido', 'pedidos']);
      expect(unidad(['factura', 'cliente', 'total'])).toEqual(['factura', 'facturas']);
    });

    test('con más de un tipo de transacción no elige una: "transacciones"', () => {
      expect(unidad(['pedido', 'factura', 'monto'])).toEqual(['transacción', 'transacciones']);
    });

    test('un padrón que nombra una sola entidad usa esa entidad', () => {
      expect(unidad(['cliente', 'ciudad', 'telefono'])).toEqual(['cliente', 'clientes']);
      expect(unidad(['Producto', 'Precio', 'Stock'])).toEqual(['producto', 'productos']);
    });

    test('con cliente y producto y ninguna transacción no se puede saber: "registros", que es verdad en cualquier caso', () => {
      expect(unidad(['cliente', 'producto', 'monto'])).toEqual(['registro', 'registros']);
    });
  });

  describe('ciencias sociales: "encuestado" solo si el dataset habla de una encuesta', () => {
    test('con una palabra propia de encuestas: encuestados', () => {
      const vocabulario = detectarVocabularioDataset(['respuesta', 'edad', 'genero']);
      expect([vocabulario.dominio, vocabulario.unidadPlural]).toEqual(['cienciasSociales', 'encuestados']);
    });

    test('solo con datos demográficos (pacientes, empleados, estudiantes): personas', () => {
      const vocabulario = detectarVocabularioDataset(['nombre', 'edad', 'ocupacion', 'salario']);
      expect([vocabulario.dominio, vocabulario.unidadSingular, vocabulario.unidadPlural]).toEqual(['cienciasSociales', 'persona', 'personas']);
    });
  });

  test('separa palabras pegadas por mayúsculas (PascalCase/camelCase), como los encabezados típicos de un Excel', () => {
    expect(detectarVocabularioDataset(['NombreEspecie', 'PesoKg']).dominio).toBe('biologia');
    expect(detectarVocabularioDataset(['idEncuestado', 'respuestaP1']).dominio).toBe('cienciasSociales');
    expect(detectarVocabularioDataset(['IDCliente', 'Ciudad']).unidadPlural).toBe('clientes');
    // Sigue siendo por token, no por substring: "Reclientelizacion" es una sola palabra.
    expect(detectarVocabularioDataset(['ReclientelizacionScore'])).toEqual(VOCABULARIO_NEUTRO);
  });

  test('ignora mayúsculas y acentos al comparar', () => {
    const vocabulario = detectarVocabularioDataset(['ESPÉCIMEN', 'Peso']);
    expect(vocabulario.dominio).toBe('biologia');
  });

  test('un empate entre dos dominios cae al vocabulario neutro, no adivina', () => {
    // 1 coincidencia de biología ("especie") y 1 de comercial ("cliente") —
    // empate, ningún dominio gana con evidencia estrictamente mayor.
    const vocabulario = detectarVocabularioDataset(['especie', 'cliente']);
    expect(vocabulario).toEqual(VOCABULARIO_NEUTRO);
  });

  test('con más coincidencias de un dominio que de otro, gana el que tiene más evidencia', () => {
    const vocabulario = detectarVocabularioDataset(['especie', 'muestra', 'organismo', 'cliente']);
    expect(vocabulario.dominio).toBe('biologia');
  });
});
