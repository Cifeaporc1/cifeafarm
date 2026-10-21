# CIFEAFARM

App web instalable para gestionar las granjas del centro en clase. Reúne:

- **CIFEARUMI**: cabras murciano-granadinas y ovejas segureñas (esta versión).
- **CIFEAPORC**: porcino de ciclo cerrado. De momento sigue siendo una app aparte ([repositorio](https://github.com/Cifeaporc1/cifeaporc)); se integrará más adelante.

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
| `sql/01_rumiantes.sql` | Tablas, reglas de acceso e importación de CIFEARUMI (repetible) |
| `GUIA.md` | Puesta en marcha paso a paso |

## Reglas

- Una sola granja real para los dos cursos. Cada registro guarda quién lo hizo y de qué curso es.
- Cualquiera da altas, bajas, traslados y notas. El alumno corrige o borra lo suyo durante 24 horas; después, solo el profesor.
- Los datos de un animal (crotal, collar, capa, categoría…) solo los cambia el profesor, y cada cambio queda en el historial.
- El nº de manejo es el del collar y se reutiliza tras una baja: el animal se identifica por su crotal.
- Las crías se registran sin crotal ni collar, con un código provisional: nº de la madre + orden (A12-1).

## Versiones

1. **Hecha (0.1.0):** censo, fichas, mapa de corralinas, traslados, altas y bajas, importación del Excel, censo a fecha y copia de seguridad.
2. Reproducción: lotes con macho, ecografías, partos (con alta de crías), encalostrado, ordeño, destete, acrotalado y secado.
3. Sanidad: medicamentos, tratamientos programados y realizados, retirada de leche y carne.
4. Manejo diario, condición corporal, FAMACHA, control lechero de práctica, indicadores y evaluación por alumno.
5. Integración de CIFEAPORC.
