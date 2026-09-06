# persistencia/unit-of-work

El documento de arquitectura (sección I "Infrastructure"/III) reserva esta carpeta para aplicar el patrón unit-of-work a operaciones que requieran usar múltiples repositorios de forma transaccional. Hoy ningún caso de uso necesita esa coordinación — cada uno usa un único repositorio — así que no existe ninguna interfaz que mover aquí todavía.

Carpeta reservada para cuando exista una operación real que la necesite.
