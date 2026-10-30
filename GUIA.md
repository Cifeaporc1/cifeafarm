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

## 5. Paso de CIFEAPORC a CIFEAFARM (una sola app)

Hazlo cuando quieras que 1.º empiece con el porcino o que todos usen ya CIFEAFARM. Hasta entonces CIFEAPORC sigue funcionando igual.

1. En CIFEAPORC: **Gestión → Granja → Descargar Excel** y **Archivo para restaurar** (copia de seguridad).
2. En Supabase → **SQL Editor**: ejecuta `sql/02_porcino_unido.sql`. Desde ese momento la granja de porcino es una sola (la que usaba 2.º) y los dos cursos registran en ella. No borra nada.
3. (Opcional) Ejecuta `sql/03_borrar_granja_1.sql` para borrar los registros de la antigua granja de 1.º. No se puede deshacer.
4. Diles a los alumnos que instalen **CIFEAFARM** (`https://cifeaporc1.github.io/cifeafarm/`) y desinstalen CIFEAPORC. Entran con el mismo alias y PIN; el porcino está en **Granjas del centro → CIFEAPORC** (o tocando el logo de la cabecera).
5. Pide a Claude que deje la dirección antigua de CIFEAPORC redirigiendo a la nueva.

Los alumnos se gestionan ahora desde **CIFEAFARM → Gestión → Gestionar alumnos**.

## 6. Al actualizar CIFEARUMI (por ejemplo, la reproducción de la 0.3.0)

Cuando una versión nueva traiga cambios en la base de datos, vuelve a ejecutar `sql/01_rumiantes.sql` entero en Supabase (SQL Editor → New query → Run). Se puede repetir siempre: añade lo nuevo y no borra datos. Si no se ejecuta, la app avisa en **Hoy** con «Para usar la reproducción…».

## 7. Abrir o cerrar el acceso de un curso

1. Ejecuta una vez en Supabase `sql/04_acceso_por_curso.sql`.
2. En CIFEAFARM → **Más → Gestión → Acceso por curso**, pulsa el botón del curso para cerrarlo o abrirlo. Con el acceso cerrado, sus alumnos ven «El acceso de tu curso todavía está cerrado» y no pueden entrar en ninguna granja. Sus cuentas no se tocan.

## 8. Perfil de la veterinaria

1. Ejecuta una vez en Supabase `sql/05_veterinaria.sql` (repetible).
2. En CIFEAFARM → **Más → Gestión → Veterinaria**: escribe su alias (por ejemplo `VET1`), deja el PIN que propone la app o pon otro de 6 cifras y pulsa **Dar de alta**. Anota el alias y el PIN: no se vuelven a mostrar (si los olvida, **Nuevo PIN**).
3. Ella entra con la pestaña **Veterinaria**, su alias y su PIN. No hace falta su correo.

Trabaja con los animales y la granja: registra, corrige y borra cualquier registro, corrige datos de los animales, mantiene el catálogo de productos, importa el censo, descarga copias en Excel, cambia el uso de las corralinas y borra animales. No tiene nada que ver con los alumnos: no los ve (donde iría su alias pone «un alumno de 2.º»), no los gestiona, no ve su actividad y no abre ni cierra el acceso de un curso.

## 9. Controles analíticos y carácter de lo programado (0.8.0)

1. Ejecuta una vez en Supabase `sql/08_controles_analiticos.sql` (SQL Editor → New query → Run). Es repetible y no borra datos.
2. En **Sanidad → Programar** aparece «Control analítico» en «Qué» y hay que elegir si es **obligatorio, recomendado o voluntario** (también para vacunas, tratamientos y el resto).
3. Al marcar un control como hecho se apunta el resultado: pendiente, negativo o positivo, con el detalle.

## 10. Tratamientos antiguos, retrasos y cancelaciones (0.9.0)

1. Ejecuta una vez en Supabase `sql/09_cancelaciones.sql` (SQL Editor → New query → Run). Es repetible y no borra datos. Sin él, la app funciona pero no deja cancelar.
2. **Tratamientos antiguos:** Sanidad → Registrar lo hecho → la fecha está justo debajo de «Qué». Pon la fecha real (puede ser del año pasado). En cabras y ovejas, si eliges una especie, una corralina o toda la granja, se apuntan los animales que había en esa fecha. Los animales que se fueron antes de importar el censo no están en la app: si importa, anótalos en Observaciones.
3. **Atrasados:** muestran el tratamiento anterior, la fecha prevista y los días de retraso.
4. **Cancelar:** en cabras y ovejas, abre lo previsto y pulsa «No se va a hacer: cancelar»; en porcino, botón «Cancelar». Fecha, motivo y detalle (obligatorio si el motivo es «Otro»). Lo cancelado no se borra: en cabras y ovejas está al final de «Previsto», en «Cancelados»; en porcino sale en el calendario en gris. Desde ahí se puede deshacer.

## 11. Calendario, plano y repeticiones (0.10.0)

1. Ejecuta una vez en Supabase `sql/10_repeticion.sql` (SQL Editor → New query → Run). Es repetible y no borra datos. Sin él, al guardar un tratamiento que se repite da error.
2. **Calendario (CIFEARUMI):** Sanidad → Calendario. Verde hecho, naranja previsto, rojo atrasado, gris cancelado. Toca un día para ver sus registros; ‹ › cambian de mes.
3. **Repetir cada:** número y unidad (días, semanas, meses o años). «Cada 1 mes» desde el 31 de enero cae el 28 o 29 de febrero.
4. **Mapa (CIFEARUMI):** plano de las dos naves. Cada corralina muestra una cabra o una oveja (o las dos) con cuántos animales hay. Toca una corralina para ver sus animales. En el móvil, la nave de machos y ovejas se desliza de lado.
