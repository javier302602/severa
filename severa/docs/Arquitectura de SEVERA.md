# **Arquitectura de SEVERA**

SEVERA usa la arquitectura `Cliente-Servidor` para distinguir entre Frontend (`Cliente`) y Backend (`Servidor`).

# I. Backend

La aplicación usa la `Arquitectura Hexagonal` para organizar los elementos en el Backend. Esta arquitectura fue seleccionada, ya que permite separar el núcleo del sistema (operaciones estadísticas, gestión de usuarios y notificaciones) de cualquier tecnología externa, reduce el riesgo de romper múltiples funcionalidades al realizar cambios y permite la evolución modular del sistema.

Actualmente, la estructura de `Severa` sigue el modelo de tres capas de la `Arquitectura Hexagonal`:

- **Infrastructure**: Contiene las implementaciones de los puertos de salida definidos por Application y los adaptadores responsables de interactuar con tecnologías externas, como bases de datos, servicios HTTP, sistemas de archivos, servicios de notificación y mecanismos de extensibilidad mediante plugins.
- **Application**: Contiene la lógica de aplicación y orquesta los casos de uso. Define los puertos de entrada y salida que permiten interactuar con el núcleo de la aplicación sin acoplarlo a implementaciones externas.
- **Domain**: Define las Excepciones del sistema, la lógica de las operaciones estadísticas y las entidades de dominio usadas dentro del sistema.

A continuación, se muestra la estructura de `Severa` modificada aplicando otros patrones de arquitectura.

```text
severa/
│
├── application/
│   ├── ports/
│   │   ├── in/
│   │   │   ├── module_gestion_usuarios/
│   │   │   ├── module_perfil_analista/
│   │   │   ├── module_carga_gestion_datasets/
│   │   │   ├── module_catalogo_consulta_de_registros/
│   │   │   ├── module_distribucion_frecuencias/
│   │   │   ├── module_reportes_exportacion/
│   │   │   ├── module_seguridad_auditoria/
│   │   │   └─  module_notificaciones_alertas/
│   │   └─  out/
│   │       ├── dataset/
│   │       ├── graphics/
│   │       ├── plugin-contracts/
│   │       │   ├── i-plugin.ts 
│   │       │   ├── i-external-data-connection.ts 
│   │       │   ├── plugin-descriptor.ts 
│   │       │   ├── plugin-capabilities.ts 
│   │       ├── notificaciones/
│   │       ├── persistence/
│   │       │   ├── repositories/
│   │       │   └─  unit-of-work/
│   │       ├── scheduler/
│   │       ├── seguridad/
│   │       └─  context/
│   ├── usecases/
│   │   ├── module_gestion_usuarios/
│   │   ├── module_perfil_analista/
│   │   ├── module_carga_gestion_datasets/
│   │   ├── module_catalogo_consulta_de_registros/
│   │   ├── module_distribucion_frecuencias/
│   │   ├── module_reportes_exportacion/
│   │   ├── module_seguridad_auditoria/
│   │   └─  module_notificaciones_alertas/
│   └─  utils/
├── domain/
│   ├── entities/
│   ├── errors/
│   ├── services/
│   │   ├── descriptive-statistics/
│   │   ├── inferential-statistics/
│   │   └─  graphs/
│   ├── shared/
│   └─  value-objects/
└─  infrastructure/
    ├── adapters/
    │   ├── in/
    │   │   └─  http/
    │   │       ├── modules/
    │   │       │   ├── module_gestion_usuarios/
    │   │       │   │   ├── controllers/
    │   │       │   │   ├── mappers/
    │   │       │   │   └─  request-dtos/
    │   │       │   └─ ... 
    │   │       ├── filters/ <- son como los middleware pero afectan a controladores especificos
    │   │       ├── models/
    │   │       │   ├── data-response-model.ts
    │   │       │   ├── paginated-response-model.ts
    │   │       │   ├── error-response-model.ts
    │   │       │   └─  ...
    │   │       └─  middleware/
    │   └─  out/
    │       ├── dataset/
    │       ├── graphics/
    │       ├── plugins/
    │       │   ├── severa-plugin-nvd/
    │       │   ├── severa-plugin-github/
    │       │   └─  severa-plugin-xxx/
    │       ├── notificaciones/
    │       ├── persistence/
    │       │   ├── migrations/
    │       │   ├── repositories/
    │       │   └─  unit-of-work/
    │       ├── reportes/
    │       ├── scheduler/
    │       ├── seguridad/
    │       └─  context/  <- Esto podria guardar info de usuarios para recuperarlo luego
    ├── plugins-management/
    │   ├── plugin-manager.ts
    │   ├── plugin-loader.ts
    │   └─  plugin-discovery.ts
    └─  config/
```

Para mejorar la estructura actual se hicieron los siguientes cambios o adaptaciones:

- **Infrastructure**:
    - Añade la carpeta `modules/` donde se agrupan todos los elementos de un mismo modulo.
    - Agrupa los `controllers/` dentro de su módulo específico.
    - Agrega `mappers/` para transformar requests en una entrada valida para **Application**.
    - Agrega `request-dtos/`, contiene las clases que mapean los datos enviados por la API.
    - Agrega `models/`, dentro estarán modelos comunes usados por varios módulos, entre ellos estan:
        - **data-response-model.ts**: Sirve para estandarizar la respuesta de la API.
        - **paginated-response-model.ts**: Sirve para estandarizar respuestas paginadas de la API.
        - **error-response-model.ts**: Sirve para estandarizar los mensajes de error enviados.
    - Separación clara de `filters/` y `middlewares/`.
    - Añade `context/` para almacenar y recuperar información entre peticiones, como la información del usuario actual.
    - Añade `repositories/` para agrupar los diferentes repositorios.
    - Añade `unit-of-work/`, añadido para aplicar el patron unit-of-work a operaciones que requieran el uso de múltiples repositorios.
    - Modifica `http/` en `/adapters/out/` por `plugins/`, que contiene todos los plugins disponibles, esto es para implementar `RNF-18`.
    - Añade `plugins-management/` el cual contiene:
        - **plugin-manager-ts**: Coordina y administra los plugins disponibles: registrarlos, inicializarlos, obtenerlos, habilitarlos, etc.
        - **plugin-loader-ts**: Se encarga de cargar el plugin, por ejemplo cargar su código y crear sus instancias.
        - **plugin-discovery-ts**: Se encarga de buscar y detectar qué plugins existen. Por ejemplo, examinar /plugins buscando assemblies compatibles.
- **Application**:
    - Agrupa los puertos `in/` por módulo.
    - Añade `repositories/` y `unit-of-work/` dentro de los puertos `out/`.
    - Añade `context/`.
    - Agrupa los casos de uso en `usecases/` por módulo.
    - Añade `utils/` para colocar funciones que realizan tareas cortas de validación, formateo y verificación propias de application.
    - Modifica `http/` en `/ports/out/` por `plugin-contracts`, el cual contiene.
        - **i-plugin.ts**: Contrato base que debe cumplir cualquier plugin. Define operaciones generales como inicialización.
        - **i-external-data-connection.ts**: Contrato específico para plugins que obtienen/sincronizan datos de fuentes externas. Hereda de i-plugin.ts.
        - **plugin-descriptor.ts**: Describe el plugin: ID, nombre, versión, descripción, etc. Es metadatos, no lógica.
        - **plugin-capabilities.ts**: Indica qué capacidades ofrece el plugin. Por ejemplo: sincronización, importación, exportación, etc.
- **Domain**:
    - Añade `descriptive-statistics/`, `inferential-statistics/` y `graphs/` en `services/` para agrupar las operaciones estadísticas y de gráficos.
    - Añade `shared/` que contiene funciones o clases que podrian ser compartidas entre diferentes lugares de domain.

## 1.1. Adición de Arquitectura `Vertical Slicing`

La primera propuesta para reestructurar el `Backend` actual incluye principios de organización por funcionalidades de la Arquitectura `Vertical Slicing` pero aplicada a cada capa o separación lógica propia de la Arquitectura Hexagonal. 

Esta arquitectura fue elegida para cumplir `RNF-13`, ya que permite agrupar los elementos de cada capa en su módulo respectivo, reduciendo así el tiempo de búsqueda, la corrección de errores y la adición de nuevas funcionalidades sin afectar al resto de módulos.

A continuación se deja un ejemplo de como se aplicó la arquitectura a la estructura actual de Severa:

```text
└─  application/
    ├── ports/
    │   └─  in/
    │       ├── module_gestion_usuarios/
    │       ├── module_perfil_analista/
    │       ├── module_carga_gestion_datasets/
    │       ├── module_catalogo_consulta_de_registros/
    │       ├── module_distribucion_frecuencias/
    │       ├── module_reportes_exportacion/
    │       ├── module_seguridad_auditoria/
    │       └─  module_notificaciones_alertas/
    ...
    └─  usecases/
        ├── module_gestion_usuarios/
        ├── module_perfil_analista/
        ├── module_carga_gestion_datasets/
        ├── module_catalogo_consulta_de_registros/
        ├── module_distribucion_frecuencias/
        ├── module_reportes_exportacion/
        ├── module_seguridad_auditoria/
        └─  module_notificaciones_alertas/

└─  infrastructure/
    └─  adapters/
        └─  in/
            └─  http/
                └─  modules/
                    ├── module_gestion_usuarios/
                    │   ├── controllers/
                    │   ├── mappers/
                    │   └─  request-dtos/
                    └─ ... 
```

## 1.2. Adición de Arquitectura `Plug-in`

Otro patron de arquitectura implementado en la estructura del `Backend` es la `Arquitectura de Plugins`.

Esta arquitectura se añadió para cumplir con `RNF-18`, ya que permite la adición de conectores externos para sincronización con fuentes de datos externos.

```text
└─  application/
    └─  ports/
        └─  out/
            └─  plugin-contracts/
                ├── i-plugin.ts 
                ├── i-external-data-connector.ts 
                ├── plugin-descriptor.ts 
                └─  plugin-capabilities.ts 

└─  infrastructure/
    ├── adapters/
    │   └─  out/
    │       └─  plugins/
    │           ├── severa-plugin-nvd/
    │           ├── severa-plugin-github/
    │           └─  severa-plugin-xxx/
    └─  plugins-management/
        ├── plugin-manager.ts
        ├── plugin-loader.ts
        └─  plugin-discovery.ts
```