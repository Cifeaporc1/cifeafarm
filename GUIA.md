# Puesta en marcha de CIFEAFARM

Se hace una sola vez. Unos 10 minutos. No hace falta crear otro proyecto de Supabase ni cuentas nuevas: se usa el de CIFEAPORC.

## 1. Base de datos (Supabase)

1. Entra en el proyecto de Supabase de CIFEAPORC → **SQL Editor** → **New query**.
2. Abre `sql/01_rumiantes.sql`, copia **todo** su contenido, pégalo y pulsa **Run**. Debe terminar con "Success. No rows returned".
   - Se puede volver a ejecutar sin perder datos.
   - No cambia nada de CIFEAPORC.

## 2. Publicación (GitHub Pages)

1. En GitHub, repositorio **cifeafarm** → **Settings → Pages**.
2. En **Build and deployment → Source**, elige **Deploy from a branch**; rama **main**, carpeta **/ (root)**; **Save**.
3. A los uno o dos minutos la app está en `https://cifeaporc1.github.io/cifeafarm/`.

## 3. Cargar el censo

1. Entra como **Profesor** con el mismo correo y contraseña que en CIFEAPORC.
2. **Gestión → Importar el censo desde Excel** → elige `CIFEARUMI_censo_2025-26.xlsx`.
3. Revisa el resumen (las filas que se saltan aparecen con el motivo) y pulsa **Importar**.
4. En **Hoy** aparece «Datos por completar»: crotales de 14 cifras, animales sin collar y cabras sin capa. Corrígelos desde la ficha de cada animal → **Corregir datos**.

## 4. Primeros pasos en clase

- Los alumnos entran con su **curso**, su **alias** y su **PIN** de CIFEAPORC. Las cuentas nuevas se siguen creando en CIFEAPORC → Gestión → Alumnos.
- Para instalarla en el móvil: Android, Chrome → menú ⋮ → **Instalar aplicación**; iPhone, Safari → Compartir → **Añadir a pantalla de inicio**.
- Haz una **copia de seguridad** cada mes: Gestión → Copia de seguridad.

## Si algo falla

- **«Falta preparar la base de datos»**: falta el paso 1.
- **«Tu cuenta no tiene acceso»**: la cuenta está desactivada en CIFEAPORC → Gestión → Alumnos.
- **La base de datos se ha pausado**: la tarea *Mantener activa la base de datos* del repositorio de CIFEAPORC lo evita para las dos apps. Si aun así ocurre, en Supabase pulsa **Restore project**.
