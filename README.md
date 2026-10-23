# CIFEAFARM

App web instalable para gestionar las granjas del centro en clase. Reúne:

- **CIFEARUMI** (`/`): cabras murciano-granadinas y ovejas segureñas.
- **CIFEAPORC** (`/porc/`): porcino de ciclo cerrado, chato murciano. Integrada desde la 0.2.0: es el código de la app CIFEAPORC ([repositorio antiguo](https://github.com/Cifeaporc1/cifeaporc)) adaptado a una sola granja real, con el acceso, la instalación y la gestión de alumnos de CIFEAFARM.

Es una herramienta docente para las clases de Luis. No sustituye a los libros oficiales de la explotación.

- **Datos:** el mismo proyecto de Supabase que CIFEAPORC. Las tablas de rumiantes empiezan por `rum_` y no tocan las de porcino. Los alumnos entran con el mismo alias y PIN.
- **Publicación:** GitHub Pages, desde la rama `main`, carpeta raíz.
- **Sin compilación:** HTML, CSS y JavaScript, sin dependencias aparte de `supabase-js` (y `xlsx` para Excel, que se carga solo al usarlo).

## Archivos

| Archivo | Qué contiene |
| --- | --- |
| `index.html` | Página de la app |
| `js/config.js` | Dirección y clave pública de Supabase, dirección de CIFEAPORC |
| `js/logica.js` | Categorías, ubicación, edad, datos por completar e importación del Excel |
| `js/app.js` | Pantallas y conexión con la base de datos |
| `css/estilos.css` | Estilos (los de CIFEAPORC más los de rumiantes) |
| `sw.js`, `manifest.webmanifest` | Instalación en el móvil |
| `porc/` | Granja de porcino (pantallas, lógica, estilos e imágenes propias) |
| `sql/01_rumiantes.sql` | Tablas, reglas de acceso, importación y reproducción de CIFEARUMI (repetible: se vuelve a ejecutar en cada versión) |
| `sql/02_porcino_unido.sql` | Porcino: de dos granjas por curso a una granja real (repetible, no borra nada) |
| `sql/03_borrar_granja_1.sql` | Opcional: borra los registros de la antigua granja de 1.º de porcino |
| `sql/06_porcino_correcciones.sql` | Las dos granjas: los alumnos corrigen registros de otros (el profesor lo ve en Correcciones y puede deshacerlo), catálogo de productos abierto a los alumnos y lechones destetados que se quedan en la paridera y otros crotales de los verracos (repetible) |
| `GUIA.md` | Puesta en marcha paso a paso |

## Reglas

- Una sola granja real para los dos cursos. Cada registro guarda quién lo hizo y de qué curso es.
- Cualquiera da altas, bajas, traslados y notas. El alumno corrige o borra lo suyo durante 24 horas; después, solo el profesor.
- En las dos granjas (desde la 0.7.1), cualquier alumno puede corregir un registro de otro; queda en **Correcciones** (solo el profesor; las de porcino en CIFEAPORC y las de rumiantes en Más → Correcciones), con el antes y el después y la opción de deshacer. Borrar sigue siendo lo suyo durante 24 horas. Los registros automáticos (alta, baja, cambio de datos, parto, acrotalado) solo los cambia el profesor.
- El catálogo de productos es común y lo pueden completar también los alumnos (enlace a la ficha técnica, lote, caducidad…); retirar un producto, solo el profesor.
- Los datos de un animal (crotal, collar, capa, categoría…) solo los cambia el profesor, y cada cambio queda en el historial.
- El nº de manejo es el del collar y se reutiliza tras una baja: el animal se identifica por su crotal.
- Las crías se registran sin crotal ni collar, con un código provisional: nº de la madre + orden (A12-1).

## Versiones

1. **Hecha (0.1.0):** censo, fichas, mapa de corralinas, traslados, altas y bajas, importación del Excel, censo a fecha y copia de seguridad.
2. **Hecha (0.3.0):** reproducción: lotes de cubrición (el macho va a la corralina de las hembras), ecografía a partir de 45 días de sacar el macho, ventana de partos (150 días cabra, 147 oveja), partos con alta automática de las crías y paso de chiva/cordera a cabra/oveja, encalostrado, inicio del ordeño (día 2), destete, acrotalado (hembras y machos a reposición), secado natural, avisos en Hoy y paridera con prolificidad y mortalidad.
3. **Hecha (0.4.0):** sanidad: catálogo de productos común con CIFEAPORC (con tiempos de espera de leche y carne para pequeños rumiantes), tratamientos hechos o programados a un animal, varios, una corralina, una especie o toda la granja; lo previsto lo valida un profesor o un alumno al hacerlo; repeticiones automáticas; retirada de leche y carne en la ficha, el mapa, Hoy y la pestaña Retiradas.
4. **Hecha (0.5.0):** manejo diario por corralina (limpieza, alimentación, agua, cama, ordeño), condición corporal (1–5) y FAMACHA (1–5) por animal o en grupo con avisos, control lechero de práctica (litros por cabra) y actividad por alumno (por curso y fechas, con Excel) para evaluar.
5. **Hecha (0.2.0):** integración de CIFEAPORC en una sola app, con una sola granja real de porcino y gestión de alumnos común.
