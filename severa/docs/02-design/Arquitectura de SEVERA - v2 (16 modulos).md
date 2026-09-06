# Arquitectura de SEVERA — v2 (16 módulos)

> Reemplaza a `docs/02-design/Arquitectura de SEVERA - v1.md`. Ese documento se escribió cuando el SDS tenía 8 módulos; hoy el SDS (v4.0) tiene **16 módulos** (M-01 a M-16), varios de ellos generalizados para dejar de depender de "severidad"/CVSS. Este documento extiende el mismo estilo de Arquitectura Hexagonal del original a los 16 módulos, y de paso resuelve las 4 preguntas que quedaron abiertas durante el refactor estructural (decoradores de auditoría, dataset genérico, priorización, sistema de plugins).

SEVERA usa la arquitectura `Cliente-Servidor` para distinguir entre Frontend (`Cliente`) y Backend (`Servidor`).

## I. Backend

La aplicación usa la `Arquitectura Hexagonal` para organizar los elementos en el Backend: separa el núcleo del sistema (operaciones estadísticas, gestión de usuarios y notificaciones) de cualquier tecnología externa, reduce el riesgo de romper múltiples funcionalidades al realizar cambios y permite la evolución modular del sistema.

La estructura de SEVERA sigue el modelo de tres capas de la Arquitectura Hexagonal:

- **Infrastructure**: contiene las implementaciones de los puertos de salida definidos por Application y los adaptadores responsables de interactuar con tecnologías externas (bases de datos, servicios HTTP, sistemas de archivos, servicios de notificación y mecanismos de extensibilidad mediante plugins).
- **Application**: contiene la lógica de aplicación y orquesta los casos de uso. Define los puertos de entrada y salida que permiten interactuar con el núcleo de la aplicación sin acoplarlo a implementaciones externas.
- **Domain**: define las excepciones del sistema, la lógica de las operaciones estadísticas y las entidades de dominio usadas dentro del sistema.

## II. Tabla de correspondencia módulo del SDS → carpeta de arquitectura

Esta tabla es la que faltaba en el documento original y es la causa de la mayoría de las dudas del refactor: cada carpeta `module_*` de aquí en adelante corresponde EXACTAMENTE a uno de los 16 módulos del SDS v4.0. Ninguna funcionalidad del sistema debería quedar fuera de esta tabla.

| Módulo SDS | Nombre en el SDS | Carpeta (`module_*`) |
|---|---|---|
| M-01 | Gestión de Usuarios y Acceso | `module_gestion_usuarios` |
| M-02 | Perfil del Analista | `module_perfil_analista` |
| M-03 | Carga y Gestión de Datasets | `module_carga_gestion_datasets` |
| M-04 | Catálogo y Consulta de Registros | `module_catalogo_consulta_de_registros` |
| M-05 | Distribución de Frecuencias | `module_distribucion_frecuencias` |
| M-06 | Medidas de Tendencia Central y Dispersión | `module_medidas_tendencia_dispersion` |
| M-07 | Visualización Gráfica | `module_visualizacion_grafica` |
| M-08 | Comparación por Categorías | `module_comparacion_categorias` |
| M-09 | Priorización y Framework de Clasificación Configurable | `module_priorizacion_clasificacion` |
| M-10 | Reportes y Exportación Universal | `module_reportes_exportacion` |
| M-11 | Búsqueda y Filtros Avanzados | `module_busqueda_filtros_avanzados` |
| M-12 | Seguridad y Auditoría del Sistema | `module_seguridad_auditoria` |
| M-13 | Notificaciones y Alertas | `module_notificaciones_alertas` |
| M-14 | Motor de Detección Automática de Variables | `module_deteccion_variables` |
| M-15 | Limpieza y Calidad de Datos | `module_limpieza_calidad_datos` |
| M-16 | Predicción y Modelado (🔒 bloqueado) | `module_prediccion_modelado` |

Las 8 carpetas nuevas frente al documento original son M-06, M-07, M-08, M-09, M-11, M-14, M-15 y M-16. Las otras 8 ya existían y no cambian de nombre.

## III. Árbol completo

```
severa/
└── src/
    ├── application/
    │   ├── ports/
    │   │   ├── in/                                          # un puerto de entrada por módulo (16)
    │   │   │   ├── module_gestion_usuarios/                 # M-01
    │   │   │   ├── module_perfil_analista/                  # M-02
    │   │   │   ├── module_carga_gestion_datasets/           # M-03
    │   │   │   ├── module_catalogo_consulta_de_registros/   # M-04
    │   │   │   ├── module_distribucion_frecuencias/         # M-05
    │   │   │   ├── module_medidas_tendencia_dispersion/     # M-06  (nuevo)
    │   │   │   ├── module_visualizacion_grafica/             # M-07  (nuevo)
    │   │   │   ├── module_comparacion_categorias/            # M-08  (nuevo)
    │   │   │   ├── module_priorizacion_clasificacion/        # M-09  (nuevo — ver sección V)
    │   │   │   ├── module_reportes_exportacion/              # M-10
    │   │   │   ├── module_busqueda_filtros_avanzados/        # M-11  (nuevo)
    │   │   │   ├── module_seguridad_auditoria/               # M-12
    │   │   │   ├── module_notificaciones_alertas/            # M-13
    │   │   │   ├── module_deteccion_variables/               # M-14  (nuevo)
    │   │   │   ├── module_limpieza_calidad_datos/            # M-15  (nuevo)
    │   │   │   └── module_prediccion_modelado/               # M-16  (nuevo, 🔒 bloqueado — interfaz puede
    │   │   │                                                 #        definirse ya, sin implementar detrás)
    │   │   └── out/
    │   │       ├── dataset/                                  # leer/escribir el dataset cargado (M-03/M-14/M-15)
    │   │       ├── plugins/                                  # 🔜 DISEÑO FUTURO — ver sección VI, NO CREAR TODAVÍA
    │   │       │   └── plugin-contracts/
    │   │       │       ├── IPlugin.ts
    │   │       │       ├── IExternalDataConnection.ts
    │   │       │       ├── plugin-descriptor.ts
    │   │       │       └── plugin-capabilities.ts
    │   │       ├── fuentes-externas/                         # contratos de fuentes externas normales (NVD/GitHub),
    │   │       │                                              # sin sistema de plugins todavía (ver sección VI)
    │   │       ├── graphics/                                 # generación de gráficos (M-07), YA NO contiene
    │   │       │                                              # plugin-contracts (ver sección VI: eso no era
    │   │       │                                              # sobre gráficos, era sobre fuentes de datos)
    │   │       ├── prediccion/                                # M-16, 🔒 bloqueado — contrato IMotorPrediccion
    │   │       │                                              # pendiente de definir junto al material académico
    │   │       ├── notificaciones/
    │   │       ├── reportes/                                  # generación de informes PDF/Word (M-10)
    │   │       ├── persistencia/
    │   │       │   ├── repositorios/
    │   │       │   └── unit-of-work/
    │   │       ├── scheduler/
    │   │       ├── seguridad/
    │   │       └── context/
    │   ├── usecases/                                          # un caso de uso por módulo (16)
    │   │   ├── module_gestion_usuarios/                       # M-01
    │   │   ├── module_perfil_analista/                        # M-02
    │   │   ├── module_carga_gestion_datasets/                 # M-03
    │   │   │   └── (incluye AnalizarDatasetGenerico — ver sección IV)
    │   │   ├── module_catalogo_consulta_de_registros/         # M-04
    │   │   ├── module_distribucion_frecuencias/               # M-05
    │   │   ├── module_medidas_tendencia_dispersion/           # M-06  (nuevo)
    │   │   │   └── (incluye CalcularEstadisticasDescriptivasGenerico,
    │   │   │        AnalizarColumnaUnivariadoGenerico, CalcularMatrizCorrelacionGenerico)
    │   │   ├── module_visualizacion_grafica/                  # M-07  (nuevo)
    │   │   ├── module_comparacion_categorias/                 # M-08  (nuevo)
    │   │   ├── module_priorizacion_clasificacion/             # M-09  (nuevo)
    │   │   │   └── (ClasificarRiesgo, FiltrarPorRangoDeVariable*, MarcarComoRemediada,
    │   │   │        MarcarEnProcesoDeRemediacion, GenerarRankingUrgencia,
    │   │   │        ConsultarVulnerabilidadPorCVE — este último es específico de ciberseguridad,
    │   │   │        ver Anexo D del SDS; *renombrado, ver sección V)
    │   │   ├── module_reportes_exportacion/                   # M-10
    │   │   │   └── (incluye GenerarInformeDataset, RecopilarDatosDeInformeDataset)
    │   │   ├── module_busqueda_filtros_avanzados/             # M-11  (nuevo)
    │   │   ├── module_seguridad_auditoria/                    # M-12
    │   │   │   ├── (casos de uso nativos del módulo: registrar bitácora, consultar auditoría, etc.)
    │   │   │   └── decoradores/                               # ver sección IV — los 7 *ConAuditoria van aquí
    │   │   │       ├── IniciarSesionConAuditoria.ts
    │   │   │       ├── ImportarDatasetConAuditoria.ts
    │   │   │       ├── GenerarInformeConAuditoria.ts
    │   │   │       ├── GenerarResumenEjecutivoConAuditoria.ts
    │   │   │       ├── MarcarComoRemediadaConAuditoria.ts
    │   │   │       ├── MarcarEnProcesoDeRemediacionConAuditoria.ts
    │   │   │       └── ReiniciarDatasetConAuditoria.ts
    │   │   ├── module_notificaciones_alertas/                 # M-13
    │   │   ├── module_deteccion_variables/                    # M-14  (nuevo)
    │   │   │   └── (incluye DetectarColumnasDataset)
    │   │   ├── module_limpieza_calidad_datos/                 # M-15  (nuevo)
    │   │   │   └── (incluye DetectarOutliersGenerico)
    │   │   └── module_prediccion_modelado/                    # M-16  (nuevo, 🔒 bloqueado)
    │   └── utils/
    ├── domain/
    │   ├── entities/
    │   ├── errors/
    │   ├── services/
    │   │   ├── descriptive-statistics/                        # ya existía — usado por M-06 y M-08
    │   │   ├── inferential-statistics/                         # ya existía — usado por M-08
    │   │   ├── graphs/                                         # ya existía — usado por M-07
    │   │   ├── variable-detection/                             # nuevo — M-14
    │   │   ├── data-cleaning/                                  # nuevo — M-15
    │   │   ├── classification/                                 # nuevo — M-09 (lógica del criterio configurable,
    │   │   │                                                    #        RF-139: Prioridad/Riesgo/Importancia/
    │   │   │                                                    #        Puntaje/Categoría/Variable objetivo)
    │   │   └── prediction/                                     # nuevo — M-16, 🔒 bloqueado (carpeta vacía o con
    │   │                                                        #        un stub que lanza "no implementado",
    │   │                                                        #        pendiente de material académico)
    │   └── shared/
    │       └── value-objects/
    │           └── (candidato nuevo: CriterioDeClasificacion — RF-139)
    ├── infrastructure/
    │   ├── adapters/
    │   │   ├── in/
    │   │   │   └── http/
    │   │   │       ├── modules/                                # mismo patrón interno para los 16 módulos:
    │   │   │       │   ├── module_gestion_usuarios/            # controllers/ + mappers/ + request-dtos/
    │   │   │       │   │   ├── controllers/
    │   │   │       │   │   ├── mappers/
    │   │   │       │   │   └── request-dtos/
    │   │   │       │   ├── module_perfil_analista/             # (misma subestructura)
    │   │   │       │   ├── module_carga_gestion_datasets/      # (misma subestructura)
    │   │   │       │   ├── module_catalogo_consulta_de_registros/
    │   │   │       │   ├── module_distribucion_frecuencias/
    │   │   │       │   ├── module_medidas_tendencia_dispersion/    # nuevo
    │   │   │       │   ├── module_visualizacion_grafica/            # nuevo
    │   │   │       │   ├── module_comparacion_categorias/           # nuevo
    │   │   │       │   ├── module_priorizacion_clasificacion/       # nuevo
    │   │   │       │   ├── module_reportes_exportacion/
    │   │   │       │   ├── module_busqueda_filtros_avanzados/       # nuevo
    │   │   │       │   ├── module_seguridad_auditoria/
    │   │   │       │   ├── module_notificaciones_alertas/
    │   │   │       │   ├── module_deteccion_variables/              # nuevo
    │   │   │       │   ├── module_limpieza_calidad_datos/           # nuevo
    │   │   │       │   └── module_prediccion_modelado/              # nuevo, 🔒 bloqueado
    │   │   │       ├── filtros/            # como middleware pero atado a controladores específicos
    │   │   │       ├── models/
    │   │   │       │   ├── data-response-model.ts
    │   │   │       │   ├── paginated-response-model.ts
    │   │   │       │   └── error-response-model.ts
    │   │   │       └── middleware/
    │   │   └── out/
    │   │       ├── dataset/
    │   │       │   └── parsers/            # csv/excel/json — soporte universal, no ligado a un módulo específico
    │   │       ├── fuentes-externas/       # 🆕 reemplaza a "graphics/plugins" del doc original (ver sección VI)
    │   │       │   ├── nvd/                # NvdApiClientHttp, ParseadorRespuestaNvd — adaptador NORMAL por ahora
    │   │       │   └── github/             # si aplica — adaptador NORMAL por ahora
    │   │       ├── graphics/               # renderizado de gráficos (M-07) — SIN plugins anidados
    │   │       ├── prediccion/             # M-16, 🔒 bloqueado
    │   │       ├── notificaciones/
    │   │       ├── reportes/               # generación de informes PDF/Word (M-10): GeneradorInformePDF,
    │   │       │                           # GeneradorInformeWord, DibujoDeGraficosPdf, RasterizadorDeGraficosWord
    │   │       ├── persistencia/
    │   │       │   ├── migrations/
    │   │       │   ├── repositorios/
    │   │       │   └── unit-of-work/
    │   │       ├── scheduler/
    │   │       ├── seguridad/
    │   │       └── context/                # p. ej. guardar info de usuario/preferencias para recuperar luego
    │   ├── plugins-engine/                 # 🔜 NO CREAR TODAVÍA — ver sección VI
    │   │   ├── plugin-manager.ts
    │   │   ├── plugin-loader.ts
    │   │   └── plugin-discovery.ts
    │   └── config/
```

## IV. Resolución: "módulo dataset genérico" y "decoradores de auditoría"

Estos 8 casos de uso NO tienen un único módulo — cada uno pertenece a un módulo distinto del SDS, y así quedan repartidos en el árbol de arriba:

| Caso de uso | Módulo destino | Por qué |
|---|---|---|
| `AnalizarDatasetGenerico` | M-03 (`module_carga_gestion_datasets`) | Es el punto de entrada del flujo "subo mi dataset y lo analizo" |
| `CalcularEstadisticasDescriptivasGenerico` | M-06 | Es literalmente la definición de M-06 en el SDS |
| `AnalizarColumnaUnivariadoGenerico` | M-06 | Análisis univariado = medidas de tendencia/dispersión de una columna |
| `CalcularMatrizCorrelacionGenerico` | M-06 | Extensión de las medidas descriptivas a relaciones entre variables |
| `DetectarOutliersGenerico` | M-15 | El SDS define M-15 explícitamente como detección de outliers, faltantes, duplicados y formatos inconsistentes |
| `DetectarColumnasDataset` | M-14 | Es literalmente la definición de M-14 en el SDS |
| `GenerarInformeDataset` | M-10 | Generación de informes = M-10 |
| `RecopilarDatosDeInformeDataset` | M-10 | Soporte directo de `GenerarInformeDataset` |

Los 7 decoradores `*ConAuditoria` van agrupados en `application/usecases/module_seguridad_auditoria/decoradores/`, separados de sus casos de uso originales (que se quedan intactos en su propio módulo). Es un *cross-cutting concern*: pertenece a auditoría (M-12), no a cada módulo que envuelve. El cableado (qué decorador envuelve a qué caso de uso) queda explícito en `container.ts`, no en la ubicación del archivo.

## V. Resolución: módulo de priorización

`ClasificarRiesgo`, `FiltrarPorRangoCvss` → `FiltrarPorRangoDeVariable`, `FiltrarPorSeveridad` → `FiltrarPorCategoriaClasificacion`, `MarcarComoRemediada`, `MarcarEnProcesoDeRemediacion`, `GenerarRankingUrgencia`, `ConsultarVulnerabilidadPorCVE`, `PriorizacionController` van todos a **M-09** (`module_priorizacion_clasificacion`). El documento original SÍ contempla esto — es el mismo módulo que ya generalizamos en el SDS v3.1 (RF-69 a RF-76, RF-139): "Priorización y Framework de Clasificación Configurable". El error no era que faltara el módulo, era que el árbol de arquitectura nunca se actualizó con los 8 módulos nuevos/generalizados.

De paso, dos nombres de caso de uso todavía tienen naming viejo específico de CVSS/severidad y conviene renombrarlos para que coincidan con la generalización ya hecha en el SDS:
- `FiltrarPorRangoCvss` → `FiltrarPorRangoDeVariable` (coincide con RF-27 ya renombrado en el SDS)
- `FiltrarPorSeveridad` → `FiltrarPorCategoriaClasificacion` (coincide con RF-28 ya renombrado en el SDS)

`ConsultarVulnerabilidadPorCVE` se queda con su nombre tal cual: es explícitamente el caso de uso especializado de ciberseguridad documentado en el Anexo D del SDS, no una funcionalidad universal — no hay que generalizarlo, solo ubicarlo dentro de M-09 junto a los demás.

## VI. Resolución: sistema de plugins — pospuesto

El documento original mezclaba dos cosas que no existen hoy en el código: (a) mover el cliente NVD a `infrastructure/adapters/out/graphics/plugins/severa-plugin-nvd/`, y (b) construir un sistema de plugins completo (`IPlugin`, `plugin-manager`, `plugin-loader`, `plugin-discovery`) para soportarlo. Eso es diseño de una capacidad nueva, no una reorganización de carpetas — construirlo ahora, aunque sea "vacío o mínimo", rompe la regla de este refactor de no tocar lógica.

Decisión: por ahora, el cliente NVD (y el de GitHub si existe) se mueven como **adaptadores normales** a `infrastructure/adapters/out/fuentes-externas/nvd/` y `.../github/`, sin ningún contrato `IPlugin` de por medio. El diseño del sistema de plugins queda documentado en este archivo (sección III, marcado 🔜) como objetivo futuro, para no perderlo, pero **no se implementa en este refactor**. Cuando se aborde como tarea aparte, esos contratos van en `application/ports/out/plugins/plugin-contracts/` (no anidados bajo `graphics/`, que era un error del documento original: el contrato `i-external-data-connection.ts` es sobre fuentes de datos externas, no sobre gráficos).

## VII. Qué queda pendiente de decidir (no adivinar)

- `PriorizacionController` está en la lista de M-09 como nombre de archivo, pero los controladores van en `infrastructure/adapters/in/http/modules/module_priorizacion_clasificacion/controllers/`, no en `application/usecases/`. Si el código actual tiene un archivo llamado así dentro de usecases, es candidato a moverse de capa, no solo de carpeta — confirmar antes de mover.
- Revisar si `module_prediccion_modelado` necesita placeholders reales (interfaces vacías) o si es mejor dejar la carpeta sin crear hasta que llegue el material académico — cualquiera de las dos es válida, pero decídanlo explícitamente en vez de dejarlo ambiguo.
