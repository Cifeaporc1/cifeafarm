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

## 12. Unir productos repetidos (0.11.0)

1. Ejecuta una vez en Supabase `sql/11_unir_productos.sql` (SQL Editor → New query → Run). Es repetible y no borra datos al ejecutarlo.
2. En la app (profesor o veterinaria): Sanidad → Productos → **Productos repetidos / unir**. Si hay repetidos, sale un aviso arriba de la lista.
3. En cada grupo está marcado el más completo; cambia la marca si prefieres otro. **Unir este grupo** o **Unir todos** (pide confirmar pulsando otra vez).
4. Lo que hace: completa el producto conservado con los datos que solo tengan los otros, pasa a él los tratamientos de las dos granjas y borra los otros. Los borrados quedan copiados en la tabla `medicamentos_unidos` de Supabase.
5. **Unir a mano:** para el mismo producto escrito de forma distinta («Oxitetraciclina LA» y «Oxitetra 20 %»), elige cuál se conserva y cuál se une.

## 13. Administrador, historial, protocolos y pantallas comunes (0.12.0)

1. Ejecuta una vez en Supabase `sql/12_administrador.sql` (SQL Editor → New query → Run). Es repetible y no borra datos. Te marca como administrador (el profesor más antiguo). Si algún día vuelves a ejecutar `05_veterinaria.sql`, ejecuta después otra vez este.
2. Al entrar, la pantalla de inicio de CIFEAFARM separa **Operaciones de granja** (CIFEARUMI y CIFEAPORC), lo **común** (Gestión y Cuenta) y tu parte de **Administrador**, que solo ves tú.
3. **Administrador:** operaciones repetidas (abre, corrige o pulsa «Está bien así»), correcciones de cada granja, historial de actividad (quién, qué, fecha y hora, y cuántas veces ha entrado cada uno; filtra por persona, fechas o tipo), actividad para evaluar y personas.
4. **Personas** (Gestión → Personas): alta de alumnos (uno a uno o una lista), nombre, nuevo PIN, desactivar y **eliminar**. Eliminar quita a la persona y su acceso; sus registros de la granja se conservan con su alias.
5. **Hoy** en cada granja: tareas de los protocolos del centro (diarias, quincenales, mensuales, trimestrales y semestrales). Se marcan al hacerlas y queda quién y cuándo. El alumno puede desmarcar la suya durante 24 h; el profesor, siempre.
6. **Dosis de semen:** caducan con más de 4 días (día 0 = extracción). Las caducadas y agotadas dejan de salir en Reproducción y en la ficha del verraco pasan a «Caducadas o agotadas», donde se pueden eliminar las que no se usaron en ninguna inseminación.

## 14. Códigos QR (0.13.0)

1. CIFEAFARM → Gestión → Datos → **Códigos QR** (profesor o veterinaria).
2. Elige qué imprimir: zonas de porcino, corralinas, cerdas, verracos, cabras u ovejas. En «Elegir cuáles» puedes quitar los que no quieras.
3. Pulsa **Imprimir**: salen 4 por hoja A4. Plastifícalos y pégalos en cada zona o corralina (los de animales, en la tarjeta de la jaula o un llavero).
4. Se escanean con la cámara del móvil. Abre la zona con sus animales o la ficha del animal. Si en ese móvil no se ha entrado antes, pide alias y PIN y después va directamente. Sin cuenta no se ve nada.
5. No hace falta ejecutar nada en Supabase.

## 15. Contraindicaciones, celo tras el destete, nombres, hoja de partos y pautas (0.14.0)

1. Ejecuta una vez en Supabase `sql/13_mejoras_noviembre.sql` (SQL Editor → New query → Run). Es repetible y no borra datos.
2. **Contraindicaciones:** en la ficha de cada producto (Sanidad → Productos). Cuando alguien elige ese producto en un tratamiento, sale un aviso con ellas.
3. **Celo tras el destete (porcino):** en Hoy aparece «Vigilar celo» desde el destete hasta el día 6 (urgente del día 3 al 6). Si se pierde, avisa hacia el día 21 del posible celo de repetición.
4. **Nombres de los alumnos:** solo los ves tú. Los demás (alumnos, otros profesores y veterinaria) ven «un alumno de 2.º». Cada alumno ve lo suyo.
5. **Hoja de partos:** en la ficha de cada cerda, una columna por ciclo con todos los datos de la ficha de papel.
6. **Pauta con varias dosis:** al registrar o programar un tratamiento, abre «Pauta con varias dosis» y pon la 2.ª, 3.ª… dosis (cada una contada desde la anterior). Al marcar una dosis como hecha se programa sola la siguiente. Si después se repite siempre, rellena también «Repetir cada».

## 16. Uso de CIFEAFARM en DIACLASHOM (informe de uso)

1. Ejecuta una vez en el Supabase de **CIFEAFARM** `sql/14_informe_uso.sql` (SQL Editor → New query → Run). Es repetible.
2. En **DIACLASHOM** → Más → **Uso de CIFEAFARM**: escribe el correo y la contraseña con los que entras como profesor en CIFEAFARM y pulsa «Guardar y probar». Se guardan cifrados en DIACLASHOM.
3. En cada curso, revisa las fechas (por defecto, la evaluación del CE) y pulsa **Traer datos de CIFEAFARM**. La primera vez empareja cada alias de CIFEAFARM con la clave del alumno por orden: revísalo en la columna «Alias en CIFEAFARM».
4. Pulsa **Crear la calificación con estas propuestas**. Se abre la calificación «Uso de CIFEAFARM» con la propuesta de cada alumno y el resumen en el comentario: ajusta lo que quieras. Cuenta como una nota más del CE.

## 17. Resultados y comparar (0.15.0)

No hay que ejecutar nada en Supabase.
1. En cada granja, **Reproducción → Resultados y gráficas**: cifras principales y gráficas ya preparadas. Arriba eliges las fechas (por defecto, el último año; «Todo» quita el límite).
2. **Comparar**: abre «Qué comparar», marca lo que quieras (por ejemplo inseminaciones, nacidos vivos y volumen del eyaculado) y elige «Agrupar por» (verraco, número de parto, mes…). Sale una tabla y una gráfica por cada cosa.
3. **Copiar para analizar con IA**: copia la tabla, lo que significa cada columna y los datos uno a uno. Pégalo en Claude y pide el análisis. No lleva nombres de alumnos.
4. **Descargar Excel**: hoja «Resumen», hoja «Qué es cada columna» y una hoja con los datos uno a uno de cada tipo.
5. Barra gris y asterisco (*): media o porcentaje calculado con menos de 5 datos; no saques conclusiones de esa cifra.
6. En rumiantes, el «número de parto» solo cuenta los partos apuntados en la app (los anteriores no se conocen).

## 18. Esquilado de las ovejas (0.15.1)

1. Ejecuta una vez en Supabase `sql/15_esquilado.sql` (SQL Editor → New query → Run). Es repetible y no borra datos.
2. **Sanidad → Registrar lo hecho (o Programar) → Qué: Esquilado (ovejas).** Se marca solo «Una especie → Ovejas». No pide producto. Si eliges una corralina con cabras, solo se apuntan las ovejas.
3. En Hoy, dentro de los protocolos de ovino, en marzo y abril aparece la tarea anual «Esquilado de las ovejas» (lo normal es a principios de primavera). Al marcarla, ya no vuelve a salir hasta el año siguiente.

## 19. Almacenes y roturas (0.16.0)

1. Ejecuta una vez en Supabase `sql/16_almacenes_roturas.sql` (SQL Editor → New query → Run). Es repetible y no borra datos. Crea los 9 almacenes, las tablas y la carpeta privada de fotos «cifeafarm-fotos» (se ve en Supabase → Storage).
2. **CIFEAFARM → Almacenes y herramientas → Añadir artículo.** Elige si es material fungible (se gasta: pon la cantidad y el mínimo), herramienta o máquina (ficha con marca, modelo, compra, precio, garantía, próxima revisión y fotos). El precio solo lo ves tú.
3. **Cambiar cantidades:** en la ficha de un fungible, «Entra (+) o sale (−)» o la cantidad que hay ahora. Si baja del mínimo o alguien pulsa «Avisar: queda poco», sale arriba en «Queda poco».
4. **Fotos del estado de una máquina:** en su ficha, «Añadir fotos» con una nota (por ejemplo «tras la revisión»). Se guardan con la fecha, así se ve cómo ha ido cambiando.
5. **Almacenes:** con el botón «Almacenes» cambias nombres o añades otros.
5b. **Sacar inventario** (solo tú): Almacenes y herramientas → «Sacar inventario». Elige el almacén (o todos), qué (todo, fungible, herramientas o máquinas) y si incluyes lo dado de baja y los precios. «Imprimir o guardar en PDF» saca una hoja por almacén con la columna «Comprobado» para marcar a mano; «Descargar Excel» trae todos los datos.
6. **Roturas:** cualquiera pulsa «Avisar de una rotura» (en Hoy de cada granja o en CIFEAFARM → Roturas e instalaciones), elige la granja, la zona y el número (por ejemplo «Sala de implantación» → «jaula 6», o «Nave Machos y Ovejas» → «corralina 3»; «Toda la zona» si afecta a toda), qué está roto, describe el problema y hace fotos. Las corralinas salen de las que tengas en la app: si añades una, aparece sola.
7. Tú (o el profesorado) abres el aviso y añades el material y las herramientas que hacen falta. Si están en el almacén, la app comprueba sola si hay bastante; lo que hay que comprar se marca «conseguido» cuando llegue. Cuando todo está, pasa sola a **Lista para reparar**. Si no necesita material, pulsa «No necesita material».
8. Al terminar: «Marcar como reparada», con qué se hizo, fotos de después y, si quieres, descontar del almacén el material gastado.

## 20. Ordenar cerdas y pasar de una ficha a otra (0.17.0)

1. **Animales → Reproductoras → Ordenar por:** elige el dato (fecha de la última IA, del último parto, nacidos vivos, destetados, días de gestación…). El botón de al lado invierte el sentido (más reciente o más antiguo, más o menos). Puedes combinarlo con el filtro de fase y la búsqueda.
2. Al abrir una cerda, arriba aparecen **‹ anterior** y **siguiente ›** con su crotal, en el mismo orden y filtro de la lista. Si entras en la ficha desde otro sitio (Hoy, el mapa), el orden es por crotal.
3. En la ficha, bajo la fase del ciclo: **Gestación · Día N** (desde la IA, si está inseminada, gestante o en paridera) y **cuántos días lleva en la fase actual** y desde qué fecha.

## 21. Plano ampliado y control de piensos (0.18.0)

1. Ejecuta una vez en Supabase `sql/17_piensos.sql` (SQL Editor → New query → Run). Es repetible y no borra datos. Crea los silos de porcino (madres, transición y cebo).
2. **Plano de porcino:** ya salen los parques de gestación 5 y 6, el parque vacías efecto macho, los tres silos (en rojo; al tocarlos se abre su control de pienso), el contenedor de cadáveres y el foso de purines. Para llevar una cerda al parque vacías efecto macho o a los parques 5 y 6: en su ficha, Traslado.
3. **Fichas de pienso** (profesorado): Hoy → Piensos y consumo → Fichas de pienso → Nueva. Nombre, tipo, fabricante, composición de la etiqueta, proteína, grasa, fibra, cenizas, energía y si es medicado.
4. **Silos** (profesorado): Piensos y consumo → Silos. Revisa a qué zonas da de comer cada uno; en rumiantes crea los que uséis (tolvas, comederos…).
5. **Cada reposición** (cualquiera): «Anotar reposición»: silo, pienso, fecha y kilos. Si sabes lo que quedaba en el silo, anótalo: el consumo diario sale más exacto. Si el pienso es distinto al anterior, la app avisa del cambio.
6. **Diarreas y problemas de consumo** (cualquiera): «Anotar diarrea u otro problema»: qué pasa, zona, animales afectados. La app pone sola el silo de esa zona y el pienso que comían.
7. **¿Tiene relación con el pienso?**: cuenta los casos por días tras el último cambio de pienso, por pienso y en los 14 días siguientes a cada cambio. Para más análisis, Reproducción → Comparar, con las medidas de pienso y el botón «Copiar para analizar con IA».

## 22. Tres granjas: 1.º, 2.º y MADRE (0.19.0)

**Antes de empezar:** CIFEAFARM → Gestión → descarga la copia de seguridad (Excel y archivo para restaurar). Hazlo un día sin clase.
1. En Supabase → SQL Editor → New query, pega entero `sql/18_tres_granjas.sql` y pulsa Run. Es repetible y no borra datos: la primera vez pasa todo lo que había a GRANJA 2.º y lo copia a GRANJA MADRE; las siguientes veces no vuelve a copiar.
2. Cierra la app y vuelve a abrirla (o pulsa Actualizar). Debe poner versión 0.19.0.
3. **Saber en qué granja estás:** la etiqueta blanca bajo el nombre (GRANJA 1.º, GRANJA 2.º o GRANJA MADRE) y el color de la cabecera: naranja 1.º, verde 2.º, granate MADRE.
4. **Cambiar de granja** (solo tú): toca la etiqueta o CIFEAFARM → «Cambiar». Ahí ves la última actualización de cada una.
5. **Alumnos:** cada uno entra solo en la granja de su curso, en rumiantes y en porcino. La de 1.º empieza vacía. Para abrirla o cerrarla, el interruptor de acceso por curso de siempre.
6. **Pasar a MADRE:** CIFEAFARM → «Pasar a MADRE». Para cada registro eliges Pasar / No pasar; si ya existe en MADRE, «Ya está en MADRE: unirlos»; si se cambió o se borró después de pasarlo, decides si actualizar o borrar en MADRE. «Pasar todo lo de GRANJA X» marca todo de golpe. Pulsa «Aplicar lo marcado».
7. **Traer el censo de MADRE** a 1.º o 2.º: copia las altas y bajas de animales (sin su historia) para que la granja del curso tenga los mismos animales que la real.
8. **Notas:** DIACLASHOM sigue igual: cada alumno puntúa en su curso. Lo copiado a MADRE no cuenta.
9. **Otros profesores:** Gestión → Personas → marca a qué granjas entra cada uno. La veterinaria entra a GRANJA 2.º.

## 23. Cambio de curso (0.20.0)

1. Ejecuta una vez en Supabase `sql/19_cambio_de_curso.sql` (después del 18). Es repetible y no borra datos.
2. **Pasar alumnos a otro curso:** Gestión → Cursos → marca los alumnos (o «Marcar todos los de 1.º») → «Pasar los marcados a 2.º» (pulsa dos veces). Al entrar, el alumno elige su curso nuevo con su alias y PIN de siempre. Sus registros anteriores se quedan donde los metió.
3. **Final de curso, en este orden:**
   1. Pasa a MADRE lo que quieras conservar de 2.º y de 1.º (CIFEAFARM → Pasar a MADRE).
   2. Haz la copia de seguridad.
   3. «Cerrar 2.º»: desactiva a los alumnos que terminan y borra sus nombres (sus registros quedan con el alias).
   4. «Pasar la granja de 1.º a 2.º» (con «Pasar también a 2.º a los alumnos de 1.º» marcado): lo de 2.º se archiva, la granja de 1.º pasa a ser la de 2.º y 1.º queda vacía.
   5. En septiembre, crea los alias de los nuevos de 1.º en Personas (no pueden repetir un alias de 2.º).
4. **Consultar un archivo:** toca la etiqueta de la granja → elige el ARCHIVO (gris). Para volver, elige otra granja.

## 24. Permisos de alumnos y veterinaria (0.20.1)

1. Ejecuta una vez en Supabase `sql/20_permisos_alumnos.sql` (después del 18). Es repetible y no borra datos.
2. Desde ahora, en la granja de su curso, los alumnos llevan el almacén (altas, cantidades, fotos, precios), preparan y reparan las roturas y pueden anular o corregir una baja.
3. Roturas y almacén son de cada granja: lo que había está en GRANJA 2.º y copiado en MADRE; GRANJA 1.º empieza vacía.
4. Lo que cambie la veterinaria en registros de otros aparece en Correcciones, como lo de los alumnos. Todo lo que hace cualquiera (altas, cambios, borrados) sigue en el Historial, que solo ves tú.

## 25. Almacén y roturas en «Pasar a MADRE» (0.20.2)

1. Ejecuta una vez en Supabase `sql/21_madre_almacen_roturas.sql` (después del 18, 19 y 20). Es repetible y no borra datos.
2. En CIFEAFARM → Pasar a MADRE salen también «Almacén · artículo» y «Rotura», con las mismas opciones que el resto: pasar, no pasar, unir con lo que ya hay en MADRE, actualizar MADRE si cambió (por ejemplo, una cantidad) o borrar en MADRE si el curso lo borró.

## 26. Parque vacías efecto macho (0.20.3)

Ejecuta una vez en Supabase `sql/22_efecto_macho.sql`. Cambia el nombre «Parque erótico» por «Parque vacías efecto macho» en lo ya anotado (traslados, silos, piensos y roturas). Es repetible y no borra datos.

## 27. Verracos y fichas de pienso (0.20.4)

1. Ejecuta una vez en Supabase `sql/23_piensos_alumnos.sql`: los alumnos pueden crear fichas de pienso nuevas.
2. En la ficha de un verraco, arriba, «‹ anterior» y «siguiente ›» como en las cerdas.

## 28. Listado de roturas y espacio de fotos (0.20.5)

1. Ejecuta una vez en Supabase `sql/24_uso_fotos.sql` (para que la app sepa cuánto ocupan las fotos).
2. **Listado:** Roturas e instalaciones → «Sacar listado». Elige cuáles (pendientes, reparadas…), dónde y entre qué fechas. «Imprimir o guardar en PDF» o «Descargar Excel».
3. **Fotos:** se reducen solas a unos 50–100 KB. En Almacén y en Roturas verás «Fotos guardadas: n · MB de 1024 MB». A partir del 80 % sale un aviso naranja; al 100 % no se pueden subir más hasta borrar fotos antiguas (botón «Quitar» en cada foto de roturas reparadas o artículos de baja).

