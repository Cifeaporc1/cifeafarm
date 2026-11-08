// CIFEAFARM · Almacenes (material fungible, herramientas y máquinas) y roturas de instalaciones.
// Común a todas las granjas. Lo usa la app principal: window.Almacen(ctx) devuelve { vista, resumen }.
// ctx: { sb, S, esc, fmt, hoy, toast, traducirError, pintar, cabecera, navegacion, esProf, esAdmin, verAlias, zonasRumi }
(function () {
  'use strict';
  const BUCKET = 'cifeafarm-fotos';
  const TIPOS = { fungible: 'Material fungible', herramienta: 'Herramienta', maquina: 'Máquina o equipo' };
  const ESTADOS = { bueno: 'Buen estado', regular: 'Regular', averiado: 'Averiado', baja: 'De baja' };
  const ELEMENTOS = { suelo_continuo: 'Suelo continuo', suelo_rejilla: 'Suelo de rejilla', techo: 'Techo', paredes: 'Paredes', ventanas: 'Ventanas', puertas: 'Puertas y cerramientos',
    bebedero: 'Bebedero', comedero: 'Comedero', iluminacion: 'Iluminación', jaula: 'Jaula', agua: 'Instalación de agua', electricidad: 'Electricidad', ventilacion: 'Ventilación',
    programador: 'Programador', sensores: 'Sensores', otro: 'Otro' };
  // Sin agua, sin aire o sin comida, los animales sufren en horas: urgente por defecto
  const URGENTES = ['agua', 'bebedero', 'comedero', 'ventilacion'];
  const GRANJAS = { rumi: 'Rumiantes', porc: 'Porcino', otra: 'Otras zonas' };
  const ZONAS_PORC = ['Parideras', 'Gestación', 'Cubrición', 'Transición', 'Cebo', 'Verraqueras', 'Sala de extracción', 'Laboratorio de semen', 'Oficina', 'Almacén', 'Exterior'];
  const PRIORIDAD = { urgente: 'Urgente', normal: 'Normal', baja: 'Puede esperar' };

  // ---- Lógica pura (se prueba sin navegador)
  const pocoStock = (a) => a.tipo === 'fungible' && (a.queda_poco || (a.minimo != null && Number(a.cantidad) <= Number(a.minimo)));
  // ¿Está listo un material de la lista? Del almacén: hay cantidad suficiente (fungible) o la herramienta funciona.
  // Lo que no está en el almacén: cuando alguien lo marca como conseguido.
  function materialListo(m, articulos) {
    if (m.conseguido) return true;
    if (!m.articulo_id) return false;
    const a = articulos.find((x) => x.id === m.articulo_id);
    if (!a) return false;
    if (a.tipo === 'fungible') return Number(a.cantidad) >= Number(m.cantidad || 1);
    return ['bueno', 'regular'].includes(a.estado);
  }
  // Situación de una rotura: sin_lista → pendiente (falta material) → lista (se activa sola) → reparacion → reparada
  function situacion(r, articulos) {
    if (r.estado === 'reparada' || r.estado === 'descartada' || r.estado === 'reparacion') return { clave: r.estado, listos: 0, total: (r.materiales || []).length };
    const mats = r.materiales || [];
    if (!mats.length) return r.sin_material ? { clave: 'lista', listos: 0, total: 0 } : { clave: 'sin_lista', listos: 0, total: 0 };
    const listos = mats.filter((m) => materialListo(m, articulos)).length;
    return { clave: listos === mats.length ? 'lista' : 'pendiente', listos, total: mats.length };
  }
  const NOMBRE_SIT = { sin_lista: 'Falta preparar la lista de materiales', pendiente: 'Pendiente de material', lista: 'Lista para reparar', reparacion: 'En reparación', reparada: 'Reparada', descartada: 'Descartada' };
  const CHIP_SIT = { sin_lista: 'gris', pendiente: 'nar', lista: '', reparacion: 'nar', reparada: 'gris', descartada: 'gris' };

  function Almacen(ctx) {
    const { sb, S, esc, fmt, hoy, toast, traducirError } = ctx;
    const M = { listo: false, falta: false, almacenes: [], articulos: [], roturas: [], urls: {}, filtro: { almacen: 'todos', tipo: 'todos', q: '' }, filtroR: 'todas' };

    async function cargar() {
      const [al, ar, ro] = await Promise.all([
        sb.from('almacenes').select('*').eq('activo', true).order('orden').order('nombre'),
        sb.from('inv_articulos').select('*').order('nombre'),
        sb.from('roturas').select('*').order('creado', { ascending: false })]);
      const err = al.error || ar.error || ro.error;
      if (err) { if (/does not exist|schema cache|PGRST205|42P01/i.test(`${err.message} ${err.code}`)) { M.falta = true; M.listo = true; return; } throw err; }
      Object.assign(M, { almacenes: al.data, articulos: ar.data, roturas: ro.data, listo: true, falta: false });
    }
    // Fotos: carpeta privada; se piden enlaces temporales (1 hora)
    async function enlaces(fotos) {
      const faltan = [...new Set(fotos.map((f) => f.path))].filter((p) => !M.urls[p] || M.urls[p].hasta < Date.now());
      if (!faltan.length) return;
      const r = await sb.storage.from(BUCKET).createSignedUrls(faltan, 3600);
      if (r.error || !r.data) return;
      for (const x of r.data) if (x.signedUrl) M.urls[x.path] = { url: x.signedUrl, hasta: Date.now() + 3500e3 };
    }
    // Reduce la foto antes de subirla (lado mayor 1280 px, JPEG): ahorra espacio y datos del móvil
    function reducir(file) {
      return new Promise((ok, mal) => {
        const img = new Image(); const u = URL.createObjectURL(file);
        img.onload = () => {
          const k = Math.min(1, 1280 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(u); c.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo leer la foto'))), 'image/jpeg', 0.78);
        };
        img.onerror = () => { URL.revokeObjectURL(u); mal(new Error('No se pudo leer la foto')); };
        img.src = u;
      });
    }
    async function subirFotos(carpeta, files, nota) {
      const out = [];
      for (const f of files) {
        const blob = await reducir(f);
        const path = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const r = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
        if (r.error) throw new Error(/bucket|not found/i.test(r.error.message || '') ? 'Falta la carpeta de fotos: ejecuta en Supabase 16_almacenes_roturas.sql.' : r.error.message);
        out.push({ path, fecha: hoy(), ...(nota ? { nota } : {}) });
      }
      return out;
    }
    const galeria = (fotos, borrable) => (fotos && fotos.length ? `<div class="fotos-tira">${fotos.slice().reverse().map((f) => { const u = M.urls[f.path];
      return `<figure>${u ? `<a href="${esc(u.url)}" target="_blank" rel="noopener"><img src="${esc(u.url)}" alt="Foto del ${esc(fmt(f.fecha))}" loading="lazy"></a>` : '<div class="foto-falta">Foto</div>'}
        <figcaption>${esc(fmt(f.fecha))}${f.nota ? ` · ${esc(f.nota)}` : ''}${borrable ? ` <button type="button" class="enlace-btn" data-borrar-foto="${esc(f.path)}">Quitar</button>` : ''}</figcaption></figure>`; }).join('')}</div>` : '<div class="suave peq">Sin fotos.</div>');
    const campoFotos = (id, texto) => `<div class="campo"><label for="${id}">${texto}</label><input id="${id}" type="file" accept="image/*" multiple><span class="ayuda">Desde el móvil puedes hacer la foto en el momento. Se reducen antes de subirlas.</span></div>`;
    const faltaSQL = () => `<div class="aviso-caja">Para usar esta parte, ejecuta una vez en Supabase <strong>sql/16_almacenes_roturas.sql</strong> (SQL Editor → New query → Run).</div>`;
    const pantalla = (o, cuerpo) => ctx.pintar(`${ctx.cabecera({ comun: true, ...o })}<main class="cuerpo" id="alm">${cuerpo}</main>${ctx.navegacion('granjas')}`);
    const nomAlmacen = (id) => (M.almacenes.find((x) => x.id === id) || {}).nombre || 'Sin almacén';
    const art = (id) => M.articulos.find((x) => x.id === id);
    const cant = (a) => `${Number(a.cantidad).toLocaleString('es-ES')}${a.unidad ? ` ${a.unidad}` : ''}`;
    const $ = (s) => document.querySelector(s);
    const msg = (t) => { const m = $('#msg'); if (m) { m.innerHTML = `<div class="aviso-caja">${esc(t)}</div>`; m.scrollIntoView({ block: 'center' }); } };

    // ================================================================ ALMACÉN
    const filtrar = () => { const f = M.filtro, q = f.q.trim().toLowerCase();
      return M.articulos.filter((a) => (f.almacen === 'todos' || String(a.almacen_id) === f.almacen) && (f.tipo === 'todos' || a.tipo === f.tipo) && (f.bajas || a.estado !== 'baja')
        && (!q || `${a.nombre} ${a.marca || ''} ${a.modelo || ''} ${a.ubicacion || ''}`.toLowerCase().includes(q))); };
    function vistaLista() {
      const f = M.filtro, adm = ctx.esAdmin();
      const poco = M.articulos.filter((a) => pocoStock(a) && a.estado !== 'baja');
      const revisar = M.articulos.filter((a) => a.proxima_revision && a.proxima_revision <= hoy() && a.estado !== 'baja');
      pantalla({ volver: '#/granjas', textoVolver: 'CIFEAFARM', titulo: 'Almacenes y herramientas' }, `
        ${adm ? '<div class="botones"><a class="btn" href="#/almacen/nuevo">Añadir artículo</a><a class="btn sec" href="#/almacen/almacenes">Almacenes</a></div>'
          : '<div class="ok-caja">Puedes consultar lo que hay y avisar de que algo se está acabando («Queda poco») o de una avería. Solo el profesor cambia el almacén.</div>'}
        ${poco.length ? `<section class="tarjeta" style="border-color:var(--naranja-borde)"><h2>Queda poco (${poco.length})</h2>${poco.map((a) => `<a class="evento enlace" href="#/almacen/articulo/${a.id}"><div class="entre"><strong>${esc(a.nombre)}</strong><span class="chip nar">${esc(cant(a))}</span></div>
          <div class="suave peq">${esc(nomAlmacen(a.almacen_id))}${a.queda_poco ? ` · avisó ${esc(ctx.verAlias(a.queda_poco_alias, a.queda_poco_curso) || '?')} el ${esc(fmt(String(a.queda_poco_fecha || '').slice(0, 10)))}` : ' · por debajo del mínimo'}</div></a>`).join('')}</section>` : ''}
        ${revisar.length ? `<section class="tarjeta"><h2>Revisión pendiente</h2>${revisar.map((a) => `<a class="evento enlace" href="#/almacen/articulo/${a.id}"><div class="entre"><strong>${esc(a.nombre)}</strong><span class="chip nar">${esc(fmt(a.proxima_revision))}</span></div></a>`).join('')}</section>` : ''}
        <div class="campo"><label for="f-alm">Almacén</label><select id="f-alm"><option value="todos">Todos los almacenes</option>${M.almacenes.map((x) => `<option value="${x.id}" ${f.almacen === String(x.id) ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></div>
        <div class="pestanas">${[['todos', 'Todo'], ['fungible', 'Fungible'], ['herramienta', 'Herram.'], ['maquina', 'Máquinas']].map(([k, t]) => `<button type="button" data-tipo="${k}" class="${f.tipo === k ? 'activo' : ''}">${t}</button>`).join('')}</div>
        <div class="campo"><label for="f-q">Buscar</label><input id="f-q" type="text" enterkeyhint="search" value="${esc(f.q)}" placeholder="Nombre, marca, estante…"></div>
        <section class="tarjeta" id="lista-art">${filasArticulos(filtrar())}</section>
        <label class="check-todos"><input type="checkbox" id="f-bajas" ${f.bajas ? 'checked' : ''}> Ver también lo dado de baja</label>`);
      $('#f-alm').addEventListener('change', (e) => { f.almacen = e.target.value; vistaLista(); });
      document.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => { f.tipo = b.dataset.tipo; vistaLista(); }));
      $('#f-bajas').addEventListener('change', (e) => { f.bajas = e.target.checked; vistaLista(); });
      $('#f-q').addEventListener('input', (e) => { f.q = e.target.value; $('#lista-art').innerHTML = filasArticulos(filtrar()); });
    }
    function filasArticulos(lista) {
      if (!lista.length) return `<div class="vacio">${M.articulos.length ? 'No hay nada con estos filtros.' : `Aún no hay nada en los almacenes.${ctx.esAdmin() ? ' Pulsa «Añadir artículo».' : ''}`}</div>`;
      const porAlm = {}; for (const a of lista) (porAlm[a.almacen_id] = porAlm[a.almacen_id] || []).push(a);
      return Object.entries(porAlm).sort((x, y) => nomAlmacen(+x[0]).localeCompare(nomAlmacen(+y[0]))).map(([id, as]) => `<h3 class="peq" style="margin:10px 0 4px">${esc(nomAlmacen(+id))} · ${as.length}</h3>${as.map((a) =>
        `<a class="evento enlace" href="#/almacen/articulo/${a.id}"><div class="entre"><strong>${esc(a.nombre)}</strong><span class="chip ${a.tipo === 'fungible' ? (pocoStock(a) ? 'nar' : '') : a.estado === 'averiado' ? 'rojo' : a.estado === 'regular' ? 'nar' : a.estado === 'baja' ? 'gris' : ''}">${a.tipo === 'fungible' ? esc(cant(a)) : esc(ESTADOS[a.estado])}</span></div>
        <div class="suave peq">${esc(TIPOS[a.tipo])}${a.ubicacion ? ` · ${esc(a.ubicacion)}` : ''}${a.marca || a.modelo ? ` · ${esc([a.marca, a.modelo].filter(Boolean).join(' '))}` : ''}${a.fotos && a.fotos.length ? ` · ${a.fotos.length} foto${a.fotos.length > 1 ? 's' : ''}` : ''}</div></a>`).join('')}`).join('');
    }

    async function vistaArticulo(id) {
      const a = art(id); if (!a) return pantalla({ volver: '#/almacen', textoVolver: 'Almacén', titulo: 'No encontrado' }, '<div class="vacio">Este artículo ya no existe.</div>');
      const adm = ctx.esAdmin();
      await enlaces(a.fotos || []);
      const usos = M.roturas.filter((r) => (r.materiales || []).some((m) => m.articulo_id === id) && ['abierta', 'reparacion'].includes(r.estado));
      const dato = (t, v) => (v || v === 0 ? `<div class="dato"><span class="et">${t}</span><span>${esc(v)}</span></div>` : '');
      pantalla({ volver: '#/almacen', textoVolver: 'Almacén', titulo: a.nombre, sub: `${esc(TIPOS[a.tipo])} · ${esc(nomAlmacen(a.almacen_id))}` }, `<div id="msg"></div>
        <section class="tarjeta"><div class="ficha-datos">
          ${a.tipo === 'fungible' ? dato('Cantidad', cant(a)) + dato('Mínimo', a.minimo != null ? `${a.minimo}${a.unidad ? ` ${a.unidad}` : ''}` : '') : dato('Estado', ESTADOS[a.estado]) + (a.cantidad > 1 ? dato('Unidades', cant(a)) : '')}
          ${dato('Dónde', a.ubicacion)}${dato('Marca', a.marca)}${dato('Modelo', a.modelo)}${dato('N.º de serie', a.n_serie)}
          ${dato('Comprado', a.fecha_compra ? fmt(a.fecha_compra) : '')}${adm ? dato('Precio', a.precio != null ? `${Number(a.precio).toLocaleString('es-ES')} €` : '') : ''}${dato('Proveedor', a.proveedor)}
          ${dato('Garantía hasta', a.garantia_hasta ? fmt(a.garantia_hasta) : '')}${dato('Próxima revisión', a.proxima_revision ? fmt(a.proxima_revision) : '')}</div>
          ${a.notas ? `<p class="peq" style="white-space:pre-wrap">${esc(a.notas)}</p>` : ''}
          ${a.tipo === 'fungible' && a.queda_poco ? `<div class="aviso-caja">Avisado «queda poco» por ${esc(ctx.verAlias(a.queda_poco_alias, a.queda_poco_curso) || '?')} el ${esc(fmt(String(a.queda_poco_fecha || '').slice(0, 10)))}.</div>` : ''}
          <div class="botones">${a.tipo === 'fungible' ? (a.queda_poco ? (adm ? '<button class="btn sec peq" type="button" id="b-poco-no">Quitar el aviso «queda poco»</button>' : '') : '<button class="btn sec peq" type="button" id="b-poco">Avisar: queda poco</button>') : ''}
            <a class="btn sec peq" href="#/roturas/nueva/otra/${a.id}">${a.tipo === 'fungible' ? 'Avisar de un problema' : 'Avisar de una avería'}</a>${adm ? `<a class="btn peq" href="#/almacen/editar/${a.id}">Editar</a>` : ''}</div></section>
        ${adm && a.tipo === 'fungible' ? `<section class="tarjeta"><h2>Cambiar la cantidad</h2><div class="dos"><div class="campo"><label for="c-mas">Entra (+) o sale (−)</label><input id="c-mas" type="number" step="any" inputmode="decimal" placeholder="+10 o −2"></div>
          <div class="campo"><label for="c-nueva">o cantidad que hay ahora</label><input id="c-nueva" type="number" step="any" inputmode="decimal" placeholder="${esc(a.cantidad)}"></div></div>
          <button class="btn peq" type="button" id="b-cant">Guardar cantidad</button></section>` : ''}
        <section class="tarjeta"><h2>Fotos${a.tipo === 'maquina' ? ' del estado' : ''}</h2>${galeria(a.fotos, adm)}
          ${adm ? `${campoFotos('fotos-nuevas', 'Añadir fotos')}<div class="campo"><label for="foto-nota">Nota de las fotos <span class="suave">(opcional)</span></label><input id="foto-nota" type="text" placeholder="Al comprarla, tras la revisión, golpe en el lateral…"></div><button class="btn sec peq" type="button" id="b-fotos">Subir fotos</button>` : ''}</section>
        ${usos.length ? `<section class="tarjeta"><h2>Se necesita para reparar</h2>${usos.map((r) => `<a class="evento enlace" href="#/roturas/${r.id}"><strong>${esc(ELEMENTOS[r.elemento])} · ${esc(r.zona)}</strong><div class="suave peq">${esc(r.materiales.filter((m) => m.articulo_id === id).map((m) => `${m.cantidad || 1} ${m.unidad || a.unidad || ''}`).join(', '))}</div></a>`).join('')}</section>` : ''}`);
      const poco = $('#b-poco'); if (poco) poco.addEventListener('click', async () => { poco.disabled = true; const r = await sb.rpc('avisar_queda_poco', { p_id: id, p_si: true }); if (r.error) { poco.disabled = false; return msg(traducirError(r.error)); } toast('Avisado: queda poco'); await cargar(); vistaArticulo(id); });
      const no = $('#b-poco-no'); if (no) no.addEventListener('click', async () => { const r = await sb.rpc('avisar_queda_poco', { p_id: id, p_si: false }); if (r.error) return msg(traducirError(r.error)); await cargar(); vistaArticulo(id); });
      const bc = $('#b-cant'); if (bc) bc.addEventListener('click', async () => {
        const mas = $('#c-mas').value, nueva = $('#c-nueva').value;
        if (mas === '' && nueva === '') return msg('Escribe lo que entra o sale, o la cantidad que hay ahora.');
        const n = nueva !== '' ? Number(nueva) : Number(a.cantidad) + Number(mas);
        if (!Number.isFinite(n) || n < 0) return msg('La cantidad no puede quedar en negativo.');
        const cambio = { cantidad: n }; if (a.queda_poco && (a.minimo == null || n > Number(a.minimo))) Object.assign(cambio, { queda_poco: false, queda_poco_alias: null, queda_poco_curso: null, queda_poco_fecha: null });
        bc.disabled = true; const r = await sb.from('inv_articulos').update(cambio).eq('id', id); if (r.error) { bc.disabled = false; return msg(traducirError(r.error)); }
        toast(`Ahora hay ${n.toLocaleString('es-ES')}${a.unidad ? ` ${a.unidad}` : ''}`); await cargar(); vistaArticulo(id);
      });
      enlazarFotos('inv_articulos', a, 'fotos', `inventario/${id}`, () => vistaArticulo(id));
    }
    // Subir y quitar fotos de un registro (artículo o rotura)
    function enlazarFotos(tabla, fila, campo, carpeta, volver, idInput = 'fotos-nuevas', idBoton = 'b-fotos') {
      const b = document.getElementById(idBoton);
      if (b) b.addEventListener('click', async () => {
        const files = [...(document.getElementById(idInput).files || [])]; if (!files.length) return msg('Elige o haz una foto primero.');
        b.disabled = true; b.textContent = 'Subiendo…';
        try {
          const nota = ($('#foto-nota') || {}).value || '';
          const nuevas = await subirFotos(carpeta, files, nota.trim());
          const r = await sb.from(tabla).update({ [campo]: (fila[campo] || []).concat(nuevas) }).eq('id', fila.id); if (r.error) throw r.error;
          toast(nuevas.length === 1 ? 'Foto subida' : `${nuevas.length} fotos subidas`); await cargar(); volver();
        } catch (e) { b.disabled = false; b.textContent = 'Subir fotos'; msg(e.message || traducirError(e)); }
      });
      document.querySelectorAll('[data-borrar-foto]').forEach((x) => x.addEventListener('click', async (ev) => {
        ev.preventDefault(); const p = x.dataset.borrarFoto;
        if (!confirm('¿Quitar esta foto?')) return;
        const camp = (fila.fotos_despues || []).some((f) => f.path === p) ? 'fotos_despues' : campo;
        const r = await sb.from(tabla).update({ [camp]: (fila[camp] || []).filter((f) => f.path !== p) }).eq('id', fila.id); if (r.error) return msg(traducirError(r.error));
        await sb.storage.from(BUCKET).remove([p]); await cargar(); volver();
      }));
    }

    function vistaFormArticulo(id) {
      if (!ctx.esAdmin()) return pantalla({ volver: '#/almacen', textoVolver: 'Almacén', titulo: 'Solo el administrador' }, '<div class="vacio">Solo el administrador da de alta y cambia lo del almacén.</div>');
      const a = id ? art(id) : null; const v = a || { tipo: 'fungible', estado: 'bueno', cantidad: 0, almacen_id: M.filtro.almacen !== 'todos' ? +M.filtro.almacen : null };
      const t = (k, l, extra = '', tipo = 'text') => `<div class="campo"><label for="${k}">${l}</label><input id="${k}" name="${k}" type="${tipo}" ${tipo === 'number' ? 'step="any" inputmode="decimal"' : ''} value="${esc(v[k] ?? '')}" ${extra}></div>`;
      pantalla({ volver: a ? `#/almacen/articulo/${id}` : '#/almacen', textoVolver: a ? 'Ficha' : 'Almacén', titulo: a ? 'Editar artículo' : 'Añadir artículo' }, `<div id="msg"></div>
        <form class="formu" id="f-art" novalidate>
          <div class="campo"><span class="et">Qué es</span><div class="opciones">${Object.entries(TIPOS).map(([k, x]) => `<label><input type="radio" name="tipo" value="${k}" ${v.tipo === k ? 'checked' : ''}> ${x}</label>`).join('')}</div>
            <span class="ayuda">Fungible: se gasta (guantes, jeringas, cal, tornillos…). Máquina: cosas caras con ficha y fotos de su estado.</span></div>
          ${t('nombre', 'Nombre', 'required')}
          <div class="dos"><div class="campo"><label for="almacen_id">Almacén</label><select id="almacen_id" name="almacen_id"><option value="">—</option>${M.almacenes.map((x) => `<option value="${x.id}" ${v.almacen_id === x.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></div>
            ${t('ubicacion', 'Dónde exactamente', 'placeholder="Estante 2, armario azul…"')}</div>
          <div class="dos">${t('cantidad', 'Cantidad', '', 'number')}${t('unidad', 'Unidad', 'list="l-unid" placeholder="ud, cajas, kg, l…"')}</div><datalist id="l-unid">${['ud', 'cajas', 'paquetes', 'kg', 'g', 'l', 'ml', 'm', 'rollos', 'sacos', 'pares'].map((x) => `<option value="${x}">`).join('')}</datalist>
          <div id="b-fung" ${v.tipo === 'fungible' ? '' : 'hidden'}>${t('minimo', 'Mínimo (por debajo avisa «queda poco»)', '', 'number')}</div>
          <div id="b-equipo" ${v.tipo === 'fungible' ? 'hidden' : ''}>
            <div class="campo"><span class="et">Estado</span><div class="opciones">${Object.entries(ESTADOS).map(([k, x]) => `<label><input type="radio" name="estado" value="${k}" ${v.estado === k ? 'checked' : ''}> ${x}</label>`).join('')}</div></div>
            <div class="dos">${t('marca', 'Marca')}${t('modelo', 'Modelo')}</div>
            ${t('n_serie', 'N.º de serie')}
            <div class="dos">${t('fecha_compra', 'Fecha de compra', '', 'date')}${t('precio', 'Precio (€)', '', 'number')}</div>
            <div class="dos">${t('proveedor', 'Proveedor')}${t('garantia_hasta', 'Garantía hasta', '', 'date')}</div>
            ${t('proxima_revision', 'Próxima revisión o mantenimiento', '', 'date')}</div>
          <div class="campo"><label for="notas">Notas</label><textarea id="notas" name="notas" rows="3">${esc(v.notas || '')}</textarea></div>
          ${a ? '' : campoFotos('fotos-alta', 'Fotos')}
          <button class="btn" type="submit">${a ? 'Guardar cambios' : 'Añadir'}</button>
          ${a ? '<button class="btn peligro" type="button" id="b-borrar">Eliminar artículo</button><div class="ayuda">Si se ha roto o ya no se usa, mejor márcalo «De baja»: se conserva su ficha.</div>' : ''}
        </form>`);
      const f = $('#f-art');
      f.querySelectorAll('input[name=tipo]').forEach((r) => r.addEventListener('change', () => { const fu = f.tipo.value === 'fungible'; $('#b-fung').hidden = !fu; $('#b-equipo').hidden = fu; }));
      f.addEventListener('submit', async (ev) => {
        ev.preventDefault(); const x = new FormData(f); const s = (k) => String(x.get(k) || '').trim() || null; const n = (k) => (x.get(k) === '' || x.get(k) == null ? null : Number(x.get(k)));
        const tipo = x.get('tipo');
        const r = { tipo, nombre: s('nombre'), almacen_id: n('almacen_id'), ubicacion: s('ubicacion'), cantidad: n('cantidad') ?? 0, unidad: s('unidad'), notas: s('notas'),
          minimo: tipo === 'fungible' ? n('minimo') : null, estado: tipo === 'fungible' ? 'bueno' : (x.get('estado') || 'bueno') };
        if (tipo !== 'fungible') Object.assign(r, { marca: s('marca'), modelo: s('modelo'), n_serie: s('n_serie'), fecha_compra: s('fecha_compra'), precio: n('precio'), proveedor: s('proveedor'), garantia_hasta: s('garantia_hasta'), proxima_revision: s('proxima_revision') });
        if (!r.nombre) return msg('Falta el nombre.');
        if (!r.almacen_id) return msg('Elige el almacén.');
        if (r.cantidad < 0) return msg('La cantidad no puede ser negativa.');
        const b = f.querySelector('button[type=submit]'); b.disabled = true;
        const res = a ? await sb.from('inv_articulos').update(r).eq('id', id).select().single() : await sb.from('inv_articulos').insert(r).select().single();
        if (res.error) { b.disabled = false; return msg(traducirError(res.error)); }
        const files = a ? [] : [...($('#fotos-alta').files || [])];
        if (files.length) { try { const fotos = await subirFotos(`inventario/${res.data.id}`, files); await sb.from('inv_articulos').update({ fotos }).eq('id', res.data.id); } catch (e) { toast(`Guardado, pero las fotos no se subieron: ${e.message}`); } }
        toast(a ? 'Guardado' : 'Añadido'); await cargar(); location.hash = `#/almacen/articulo/${res.data.id}`;
      });
      const bb = $('#b-borrar'); if (bb) bb.addEventListener('click', async () => {
        if (!confirm(`¿Eliminar «${a.nombre}» y sus fotos? No se puede deshacer.`)) return;
        const r = await sb.from('inv_articulos').delete().eq('id', id); if (r.error) return msg(traducirError(r.error));
        if ((a.fotos || []).length) await sb.storage.from(BUCKET).remove(a.fotos.map((p) => p.path));
        toast('Eliminado'); await cargar(); location.hash = '#/almacen';
      });
    }

    function vistaAlmacenes() {
      if (!ctx.esAdmin()) return vistaLista();
      pantalla({ volver: '#/almacen', textoVolver: 'Almacén', titulo: 'Almacenes' }, `<div id="msg"></div>
        <section class="tarjeta">${M.almacenes.map((x) => `<div class="evento"><div class="entre"><input type="text" value="${esc(x.nombre)}" data-alm="${x.id}" aria-label="Nombre del almacén" style="flex:1">
          <span class="chip gris">${M.articulos.filter((a) => a.almacen_id === x.id).length}</span></div></div>`).join('')}
          <div class="ayuda">Cambia un nombre y sal de la casilla para guardarlo.</div></section>
        <form class="tarjeta formu" id="f-alm-nuevo"><div class="campo"><label for="alm-nuevo">Nuevo almacén</label><input id="alm-nuevo" type="text"></div><button class="btn sec" type="submit">Añadir almacén</button></form>`);
      document.querySelectorAll('[data-alm]').forEach((i) => i.addEventListener('change', async () => {
        const nombre = i.value.trim(); if (!nombre) return msg('El nombre no puede quedar vacío.');
        const r = await sb.from('almacenes').update({ nombre }).eq('id', +i.dataset.alm); if (r.error) return msg(traducirError(r.error)); toast('Guardado'); await cargar();
      }));
      $('#f-alm-nuevo').addEventListener('submit', async (ev) => {
        ev.preventDefault(); const nombre = $('#alm-nuevo').value.trim(); if (!nombre) return;
        const r = await sb.from('almacenes').insert({ nombre, orden: M.almacenes.length + 1 }); if (r.error) return msg(/duplicate|unique/i.test(r.error.message) ? 'Ya hay un almacén con ese nombre.' : traducirError(r.error));
        toast('Almacén añadido'); await cargar(); vistaAlmacenes();
      });
    }

    // ================================================================ ROTURAS
    function tarjetaRotura(r) {
      const s = situacion(r, M.articulos);
      return `<a class="evento enlace" href="#/roturas/${r.id}"><div class="entre"><strong>${esc(ELEMENTOS[r.elemento])} · ${esc(r.zona)}</strong>
        <span class="chip ${r.prioridad === 'urgente' && !['reparada', 'descartada'].includes(r.estado) ? 'rojo' : CHIP_SIT[s.clave]}">${r.prioridad === 'urgente' && !['reparada', 'descartada'].includes(r.estado) ? 'Urgente' : esc(NOMBRE_SIT[s.clave])}</span></div>
        <div class="suave peq">${esc(GRANJAS[r.granja])} · ${esc(NOMBRE_SIT[s.clave])}${s.clave === 'pendiente' ? ` (${s.listos}/${s.total} materiales)` : ''} · avisó ${esc(ctx.verAlias(r.autor_alias, r.curso) || '?')} el ${esc(fmt(String(r.creado).slice(0, 10)))}${(r.fotos || []).length ? ` · ${r.fotos.length} foto${r.fotos.length > 1 ? 's' : ''}` : ''}</div></a>`;
    }
    function vistaRoturas() {
      const g = M.filtroR;
      const de = M.roturas.filter((r) => g === 'todas' || r.granja === g);
      const abiertas = de.filter((r) => ['abierta', 'reparacion'].includes(r.estado));
      const orden = { reparacion: 0, lista: 1, pendiente: 2, sin_lista: 3 };
      const prio = { urgente: 0, normal: 1, baja: 2 };
      abiertas.sort((a, b) => prio[a.prioridad] - prio[b.prioridad] || orden[situacion(a, M.articulos).clave] - orden[situacion(b, M.articulos).clave]);
      const grupos = [['reparacion', 'En reparación'], ['lista', 'Listas para reparar'], ['pendiente', 'Pendientes de material'], ['sin_lista', 'Falta preparar la lista de materiales']];
      const cerradas = de.filter((r) => ['reparada', 'descartada'].includes(r.estado)).sort((a, b) => String(b.reparada_fecha || b.modificado).localeCompare(String(a.reparada_fecha || a.modificado)));
      pantalla({ volver: '#/granjas', textoVolver: 'CIFEAFARM', titulo: 'Roturas e instalaciones' }, `
        <a class="btn" href="#/roturas/nueva/${g === 'todas' ? '' : g}">Avisar de una rotura</a>
        <div class="pestanas">${[['todas', 'Todas'], ['rumi', 'Rumiantes'], ['porc', 'Porcino'], ['otra', 'Otras']].map(([k, t]) => `<button type="button" data-g="${k}" class="${g === k ? 'activo' : ''}">${t}</button>`).join('')}</div>
        ${abiertas.length ? grupos.map(([k, t]) => { const l = abiertas.filter((r) => situacion(r, M.articulos).clave === k); return l.length ? `<section class="tarjeta"><h2>${t} (${l.length})</h2>${l.map(tarjetaRotura).join('')}</section>` : ''; }).join('')
          : '<div class="vacio">No hay nada roto pendiente. 👍</div>'}
        ${cerradas.length ? `<details class="tarjeta"><summary style="min-height:44px;display:flex;align-items:center;font-weight:700">Reparadas y descartadas (${cerradas.length})</summary>${cerradas.slice(0, 50).map(tarjetaRotura).join('')}</details>` : ''}
        <div class="suave peq">Una rotura pasa sola a «Lista para reparar» cuando todo el material de su lista está en el almacén (o se ha marcado como conseguido).</div>`);
      document.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => { M.filtroR = b.dataset.g; vistaRoturas(); }));
    }

    function vistaNuevaRotura(granja, articuloId) {
      const a = articuloId ? art(articuloId) : null;
      const zonas = { rumi: ctx.zonasRumi ? ctx.zonasRumi() : [], porc: ZONAS_PORC, otra: M.almacenes.map((x) => x.nombre) };
      const g0 = GRANJAS[granja] ? granja : '';
      pantalla({ volver: '#/roturas', textoVolver: 'Roturas', titulo: 'Avisar de una rotura' }, `<div id="msg"></div>
        <form class="formu" id="f-rot" novalidate>
          <div class="campo"><span class="et">Dónde</span><div class="opciones">${Object.entries(GRANJAS).map(([k, x]) => `<label><input type="radio" name="granja" value="${k}" ${g0 === k ? 'checked' : ''}> ${x}</label>`).join('')}</div></div>
          <div class="campo"><label for="zona">Zona o sala</label><input id="zona" name="zona" type="text" list="l-zonas" value="${a ? esc(nomAlmacen(a.almacen_id)) : ''}" placeholder="Corralina 3, paridera 2, laboratorio…"><datalist id="l-zonas"></datalist></div>
          <div class="campo"><label for="elemento">Qué está roto</label><select id="elemento" name="elemento"><option value="">Elige…</option>${Object.entries(ELEMENTOS).map(([k, x]) => `<option value="${k}" ${a && k === 'otro' ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
          <div class="campo"><label for="descripcion">Qué le pasa</label><textarea id="descripcion" name="descripcion" rows="3" placeholder="El bebedero de la izquierda gotea, falta una rejilla…">${a ? esc(`${a.nombre}${a.marca ? ` (${a.marca}${a.modelo ? ` ${a.modelo}` : ''})` : ''}: `) : ''}</textarea></div>
          <div class="campo"><span class="et">Prioridad</span><div class="opciones">${Object.entries(PRIORIDAD).map(([k, x]) => `<label><input type="radio" name="prioridad" value="${k}" ${k === 'normal' ? 'checked' : ''}> ${x}</label>`).join('')}</div>
            <span class="ayuda" id="ay-urg">Agua, bebederos, comederos y ventilación se marcan urgentes: sin ellos los animales sufren en pocas horas.</span></div>
          ${campoFotos('fotos-rot', 'Fotos de la rotura')}
          <button class="btn" type="submit">Enviar aviso</button></form>`);
      const f = $('#f-rot');
      const ponZonas = () => { const g = (f.querySelector('input[name=granja]:checked') || {}).value; $('#l-zonas').innerHTML = (zonas[g] || []).map((z) => `<option value="${esc(z)}">`).join(''); };
      f.querySelectorAll('input[name=granja]').forEach((r) => r.addEventListener('change', ponZonas)); ponZonas();
      f.elemento.addEventListener('change', () => { if (URGENTES.includes(f.elemento.value)) f.querySelector('input[name=prioridad][value=urgente]').checked = true; });
      f.addEventListener('submit', async (ev) => {
        ev.preventDefault(); const x = new FormData(f);
        const r = { granja: x.get('granja'), zona: String(x.get('zona') || '').trim(), elemento: x.get('elemento'), descripcion: String(x.get('descripcion') || '').trim() || null, prioridad: x.get('prioridad') || 'normal' };
        if (!r.granja) return msg('Elige dónde está: rumiantes, porcino u otras zonas.');
        if (!r.zona) return msg('Escribe la zona o sala.');
        if (!r.elemento) return msg('Elige qué está roto.');
        const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Enviando…';
        const res = await sb.from('roturas').insert(r).select().single();
        if (res.error) { b.disabled = false; b.textContent = 'Enviar aviso'; return msg(/elemento_check/.test(res.error.message || '') ? 'Ejecuta otra vez en Supabase 16_almacenes_roturas.sql.' : traducirError(res.error)); }
        const files = [...($('#fotos-rot').files || [])];
        if (files.length) { try { const fotos = await subirFotos(`roturas/${res.data.id}`, files); const u = await sb.from('roturas').update({ fotos }).eq('id', res.data.id); if (u.error) throw u.error; } catch (e) { toast(`Aviso enviado, pero las fotos no se subieron: ${e.message || ''}`); } }
        toast('Aviso enviado'); await cargar(); location.hash = `#/roturas/${res.data.id}`;
      });
    }

    async function vistaRotura(id) {
      const r = M.roturas.find((x) => x.id === id); if (!r) return pantalla({ volver: '#/roturas', textoVolver: 'Roturas', titulo: 'No encontrada' }, '<div class="vacio">Este aviso ya no existe.</div>');
      const prof = ctx.esProf(), mio = r.autor === (S.sesion && S.sesion.user.id), abierta = ['abierta', 'reparacion'].includes(r.estado);
      await enlaces((r.fotos || []).concat(r.fotos_despues || []));
      const s = situacion(r, M.articulos);
      const mats = r.materiales || [];
      const filaMat = (m, i) => { const a = m.articulo_id ? art(m.articulo_id) : null; const ok = materialListo(m, M.articulos);
        const hay = a ? (a.tipo === 'fungible' ? `hay ${cant(a)}` : ESTADOS[a.estado]) : 'no está en el almacén';
        return `<div class="evento"><div class="entre"><span><strong>${esc(m.nombre)}</strong>${m.cantidad ? ` · ${esc(m.cantidad)} ${esc(m.unidad || (a && a.unidad) || '')}` : ''}</span><span class="chip ${ok ? '' : 'nar'}">${ok ? 'Listo' : 'Falta'}</span></div>
          <div class="suave peq">${a ? `<a href="#/almacen/articulo/${a.id}">${esc(nomAlmacen(a.almacen_id))}</a> · ` : ''}${esc(hay)}${m.conseguido ? ' · marcado como conseguido' : ''}</div>
          ${prof && abierta ? `<div class="acciones">${!a || !materialListo({ ...m, conseguido: false }, M.articulos) ? `<button type="button" class="btn sec peq" data-conseguido="${i}">${m.conseguido ? 'Quitar «conseguido»' : 'Marcar conseguido'}</button>` : ''}<button type="button" class="btn peligro peq" data-quitar-mat="${i}">Quitar</button></div>` : ''}</div>`; };
      pantalla({ volver: '#/roturas', textoVolver: 'Roturas', titulo: `${ELEMENTOS[r.elemento]} · ${r.zona}`, sub: esc(GRANJAS[r.granja]) }, `<div id="msg"></div>
        <section class="tarjeta"><div class="chips-fila"><span class="chip ${CHIP_SIT[s.clave]}">${esc(NOMBRE_SIT[s.clave])}</span><span class="chip ${r.prioridad === 'urgente' ? 'rojo' : 'gris'}">${esc(PRIORIDAD[r.prioridad])}</span></div>
          ${r.descripcion ? `<p style="white-space:pre-wrap">${esc(r.descripcion)}</p>` : ''}
          <div class="suave peq">Avisó ${esc(ctx.verAlias(r.autor_alias, r.curso) || '?')} el ${esc(fmt(String(r.creado).slice(0, 10)))}${r.estado === 'reparada' ? ` · reparada el ${esc(fmt(r.reparada_fecha))}${r.reparada_por ? ` por ${esc(ctx.verAlias(r.reparada_por) || '')}` : ''}` : ''}</div>
          ${r.nota_reparacion ? `<p class="peq"><strong>Reparación:</strong> ${esc(r.nota_reparacion)}</p>` : ''}
          ${prof ? `<div class="campo"><span class="et">Prioridad</span><div class="opciones">${Object.entries(PRIORIDAD).map(([k, x]) => `<label><input type="radio" name="prio" value="${k}" ${r.prioridad === k ? 'checked' : ''}> ${x}</label>`).join('')}</div></div>` : ''}</section>
        <section class="tarjeta"><h2>Fotos${r.fotos_despues && r.fotos_despues.length ? ' de antes' : ''}</h2>${galeria(r.fotos, ctx.esAdmin())}
          ${(prof || (mio && r.estado === 'abierta')) && abierta ? `${campoFotos('fotos-nuevas', 'Añadir fotos')}<button class="btn sec peq" type="button" id="b-fotos">Subir fotos</button>` : ''}</section>
        ${r.fotos_despues && r.fotos_despues.length ? `<section class="tarjeta"><h2>Fotos después de reparar</h2>${galeria(r.fotos_despues, ctx.esAdmin())}</section>` : ''}
        <section class="tarjeta"><h2>Material y herramientas para la reparación${mats.length ? ` (${s.clave === 'pendiente' ? `${s.listos}/${s.total} listos` : 'todo listo'})` : ''}</h2>
          ${mats.length ? mats.map(filaMat).join('') : `<div class="${r.sin_material ? 'ok-caja' : 'vacio'}">${r.sin_material ? 'No necesita material: está lista para reparar.' : 'Aún no hay lista de materiales.'}</div>`}
          ${prof && abierta ? `<form class="formu" id="f-mat" novalidate style="margin-top:10px">
            <div class="campo"><label for="mat-nombre">Añadir material o herramienta</label><input id="mat-nombre" type="text" list="l-arts" placeholder="Escribe para buscar en el almacén…"><datalist id="l-arts">${M.articulos.filter((a) => a.estado !== 'baja').map((a) => `<option value="${esc(a.nombre)}">${esc(nomAlmacen(a.almacen_id))}</option>`).join('')}</datalist>
              <span class="ayuda">Si está en el almacén, la app comprueba sola si hay suficiente. Si no, escríbelo igual (hay que comprarlo o pedirlo).</span></div>
            <div class="dos"><div class="campo"><label for="mat-cant">Cantidad</label><input id="mat-cant" type="number" step="any" inputmode="decimal" value="1"></div><div class="campo"><label for="mat-unid">Unidad</label><input id="mat-unid" type="text" placeholder="ud, m, kg…"></div></div>
            <button class="btn sec peq" type="submit">Añadir a la lista</button>
            ${!mats.length && !r.sin_material ? '<button class="btn sec peq" type="button" id="b-sin-mat">No necesita material</button>' : ''}</form>` : ''}</section>
        ${prof && abierta ? `<section class="tarjeta"><h2>Reparación</h2>
          ${r.estado === 'abierta' ? `<button class="btn ${s.clave === 'lista' ? '' : 'sec'}" type="button" id="b-empezar">Empezar la reparación</button>${s.clave !== 'lista' ? '<div class="ayuda">Aún falta material, pero puedes empezar si hace falta.</div>' : ''}` : ''}
          <details ${r.estado === 'reparacion' ? 'open' : ''}><summary style="min-height:44px;display:flex;align-items:center;font-weight:700">Marcar como reparada</summary>
            <form class="formu" id="f-rep" novalidate>
              <div class="campo"><label for="rep-fecha">Fecha</label><input id="rep-fecha" type="date" value="${hoy()}" max="${hoy()}"></div>
              <div class="campo"><label for="rep-nota">Qué se hizo <span class="suave">(opcional)</span></label><textarea id="rep-nota" rows="2"></textarea></div>
              ${campoFotos('fotos-despues', 'Fotos después de reparar')}
              ${ctx.esAdmin() && mats.some((m) => m.articulo_id && (art(m.articulo_id) || {}).tipo === 'fungible') ? '<label class="check-todos"><input type="checkbox" id="rep-descontar" checked> Descontar del almacén el material gastado</label>' : ''}
              <button class="btn" type="submit">Guardar como reparada</button></form></details>
          <button class="btn peligro peq" type="button" id="b-descartar">Descartar el aviso</button></section>` : ''}
        ${prof && !abierta ? '<button class="btn sec peq" type="button" id="b-reabrir">Volver a abrir</button>' : ''}
        ${ctx.esAdmin() ? '<button class="btn peligro peq" type="button" id="b-borrar-rot">Eliminar el aviso</button>' : ''}`);
      const guardar = async (cambio, texto) => { const u = await sb.from('roturas').update(cambio).eq('id', id); if (u.error) { msg(traducirError(u.error)); return false; } if (texto) toast(texto); await cargar(); vistaRotura(id); return true; };
      document.querySelectorAll('input[name=prio]').forEach((x) => x.addEventListener('change', () => guardar({ prioridad: x.value }, 'Prioridad cambiada')));
      const fm = $('#f-mat'); if (fm) fm.addEventListener('submit', async (ev) => {
        ev.preventDefault(); const nombre = $('#mat-nombre').value.trim(); if (!nombre) return msg('Escribe el material o la herramienta.');
        const a = M.articulos.find((z) => z.nombre.toLowerCase() === nombre.toLowerCase() && z.estado !== 'baja');
        const cantidad = Number($('#mat-cant').value) || 1;
        await guardar({ materiales: mats.concat([{ articulo_id: a ? a.id : null, nombre: a ? a.nombre : nombre, cantidad, unidad: $('#mat-unid').value.trim() || (a && a.unidad) || null, conseguido: false }]), sin_material: false },
          a ? `Añadido · ${materialListo({ articulo_id: a.id, cantidad }, M.articulos) ? 'hay en el almacén' : 'no hay bastante en el almacén'}` : 'Añadido (no está en el almacén)');
      });
      document.querySelectorAll('[data-conseguido]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.conseguido; guardar({ materiales: mats.map((m, j) => (j === i ? { ...m, conseguido: !m.conseguido } : m)) }); }));
      document.querySelectorAll('[data-quitar-mat]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.quitarMat; guardar({ materiales: mats.filter((_, j) => j !== i) }); }));
      const bs = $('#b-sin-mat'); if (bs) bs.addEventListener('click', () => guardar({ sin_material: true }, 'Lista para reparar'));
      const be = $('#b-empezar'); if (be) be.addEventListener('click', () => guardar({ estado: 'reparacion' }, 'En reparación'));
      const bd = $('#b-descartar'); if (bd) bd.addEventListener('click', () => { if (confirm('¿Descartar este aviso? (repetido, no era una rotura…)')) guardar({ estado: 'descartada' }, 'Descartado'); });
      const br = $('#b-reabrir'); if (br) br.addEventListener('click', () => guardar({ estado: 'abierta', reparada_fecha: null, reparada_por: null }, 'Abierto de nuevo'));
      const bx = $('#b-borrar-rot'); if (bx) bx.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este aviso y sus fotos? No se puede deshacer.')) return;
        const d = await sb.from('roturas').delete().eq('id', id); if (d.error) return msg(traducirError(d.error));
        const ps = (r.fotos || []).concat(r.fotos_despues || []).map((p) => p.path); if (ps.length) await sb.storage.from(BUCKET).remove(ps);
        toast('Eliminado'); await cargar(); location.hash = '#/roturas';
      });
      const fr = $('#f-rep'); if (fr) fr.addEventListener('submit', async (ev) => {
        ev.preventDefault(); const b = fr.querySelector('button[type=submit]'); b.disabled = true;
        try {
          const files = [...($('#fotos-despues').files || [])];
          const despues = files.length ? await subirFotos(`roturas/${id}`, files) : [];
          const descontar = $('#rep-descontar') && $('#rep-descontar').checked;
          if (descontar) {
            for (const m of mats) { const a = m.articulo_id && art(m.articulo_id); if (!a || a.tipo !== 'fungible') continue;
              const u = await sb.from('inv_articulos').update({ cantidad: Math.max(0, Number(a.cantidad) - Number(m.cantidad || 1)) }).eq('id', a.id); if (u.error) throw u.error; }
          }
          const ok = await guardar({ estado: 'reparada', reparada_fecha: $('#rep-fecha').value || hoy(), reparada_por: S.perfil.alias, nota_reparacion: $('#rep-nota').value.trim() || null,
            fotos_despues: (r.fotos_despues || []).concat(despues) }, descontar ? 'Reparada · material descontado del almacén' : 'Reparada');
          if (!ok) b.disabled = false;
        } catch (e) { b.disabled = false; msg(e.message || traducirError(e)); }
      });
      enlazarFotos('roturas', r, 'fotos', `roturas/${id}`, () => vistaRotura(id));
    }

    // ================================================================ entrada
    async function vista(ruta, a, b, c) {
      if (!M.listo) {
        pantalla({ volver: '#/granjas', textoVolver: 'CIFEAFARM', titulo: ruta === 'roturas' ? 'Roturas e instalaciones' : 'Almacenes y herramientas' }, '<div class="ok-caja">Cargando…</div>');
        try { await cargar(); } catch (e) { return pantalla({ volver: '#/granjas', textoVolver: 'CIFEAFARM', titulo: 'Error' }, `<div class="aviso-caja">${esc(traducirError(e))}</div>`); }
      }
      if (M.falta) return pantalla({ volver: '#/granjas', textoVolver: 'CIFEAFARM', titulo: ruta === 'roturas' ? 'Roturas e instalaciones' : 'Almacenes y herramientas' }, faltaSQL());
      if (ruta === 'almacen') {
        if (a === 'articulo') return vistaArticulo(b);
        if (a === 'nuevo') return vistaFormArticulo(null);
        if (a === 'editar') return vistaFormArticulo(b);
        if (a === 'almacenes') return vistaAlmacenes();
        return vistaLista();
      }
      if (a === 'nueva') return vistaNuevaRotura(b, c);
      if (a) return vistaRotura(a);
      return vistaRoturas();
    }
    // Para las tarjetas de inicio: { poco, roturas abiertas, urgentes, listas }
    async function resumen(recargar) {
      if (!M.listo || recargar) { try { await cargar(); } catch (_) { return null; } }
      if (M.falta) return null;
      const ab = M.roturas.filter((r) => ['abierta', 'reparacion'].includes(r.estado));
      return { poco: M.articulos.filter((a) => pocoStock(a) && a.estado !== 'baja').length, abiertas: ab.length, urgentes: ab.filter((r) => r.prioridad === 'urgente').length,
        listas: ab.filter((r) => situacion(r, M.articulos).clave === 'lista' && r.estado === 'abierta').length, roturas: ab };
    }
    return { vista, resumen, recargar: () => { M.listo = false; } };
  }
  // Tarjeta de Hoy para cada granja (la usan las dos apps). base: '' en rumiantes, '../' en porcino.
  function htmlHoy(roturas, granja, base, esc) {
    const l = (roturas || []).filter((r) => r.granja === granja && ['abierta', 'reparacion'].includes(r.estado));
    const urg = l.filter((r) => r.prioridad === 'urgente');
    const enlace = `<a class="btn sec peq" href="${base}#/roturas/nueva/${granja}">Avisar de una rotura</a>`;
    if (!l.length) return `<div class="botones">${enlace}</div>`;
    return `<section class="tarjeta ${urg.length ? 'alerta' : ''}"><div class="entre"><h2>Roturas pendientes</h2><span class="chip ${urg.length ? 'rojo' : 'nar'}">${l.length}</span></div>
      ${(urg.length ? urg : l.slice(0, 3)).map((r) => `<a class="evento enlace" href="${base}#/roturas/${r.id}"><div class="entre"><strong>${esc(ELEMENTOS[r.elemento] || r.elemento)} · ${esc(r.zona)}</strong>${r.prioridad === 'urgente' ? '<span class="chip rojo">Urgente</span>' : ''}</div>${r.descripcion ? `<div class="suave peq">${esc(r.descripcion.slice(0, 90))}</div>` : ''}</a>`).join('')}
      <div class="botones"><a class="btn sec peq" href="${base}#/roturas">Ver todas</a>${enlace}</div></section>`;
  }
  Almacen.htmlHoy = htmlHoy;
  Almacen._ = { pocoStock, materialListo, situacion, ELEMENTOS, URGENTES };
  if (typeof module !== 'undefined') module.exports = Almacen; else window.Almacen = Almacen;
})();
