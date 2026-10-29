// CIFEAFARM · app: acceso común y granja de rumiantes CIFEARUMI (V1: censo, fichas,
// corralinas, traslados, altas, bajas, importación y copia de seguridad).
(function () {
  'use strict';
  const L = window.Logica;
  const C = window.CONFIG;
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);

  // ---------------------------------------------------------------- estado
  const S = {
    sesion: null, perfil: null, nombres: {}, corralinas: [], animales: [], eventos: [], porAnimal: {},
    cargado: null, faltaSQL: false, faltaSQL2: false, faltaSQL3: false, faltaSQL4: false, correcciones: [], faltaCorr: false, lotes: [], sanidad: [], medicamentos: [], manejo: [], borrador: {}, importacion: null,
    ultimaCopia: (() => { try { const x = localStorage.getItem('farm-ultima-copia'); return x ? new Date(x) : null; } catch (_) { return null; } })(),
  };
  const $app = document.getElementById('app');

  // ---------------------------------------------------------------- utilidades
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const dos = (x) => String(x).padStart(2, '0');
  const fechaHora = (d) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} · ${dos(d.getHours())}:${dos(d.getMinutes())}`;
  const hoy = () => L.hoyISO();
  // esProf(): profesor o veterinaria (animales y registros); esAdmin(): solo el profesor (controla la app).
  const esProf = () => S.perfil && ['profesor', 'veterinario'].includes(S.perfil.rol);
  const esAdmin = () => S.perfil && S.perfil.rol === 'profesor';
  const rolNombre = () => (S.perfil.rol === 'veterinario' ? 'Veterinaria' : S.perfil.rol === 'profesor' ? 'Profesor' : 'Alumno');
  const uid = () => S.sesion && S.sesion.user.id;
  const yo = () => (S.perfil.nombre ? `${S.perfil.nombre} (${S.perfil.alias})` : S.perfil.alias);
  // La veterinaria no ve a los alumnos: «un alumno de 2.º» en lugar de su alias.
  const esVet = () => S.perfil && S.perfil.rol === 'veterinario';
  const aliasPersonal = () => new Set(Object.values(S.nombres).filter((p) => p.rol !== 'alumno' && p.alias).map((p) => p.alias).concat(S.perfil ? [S.perfil.alias] : []));
  const verAlias = (alias, cursoN) => (!esVet() || !alias || aliasPersonal().has(alias) ? alias : `un alumno${cursoN ? ` de ${cursoN}.º` : ''}`);
  const quienEs = (userId, alias, cursoN) => { const p = S.nombres[userId];
    if (esVet() && (!p || p.rol === 'alumno')) return verAlias(alias, cursoN || (p && p.granja_id)) || '?';
    return p && p.nombre ? `${p.nombre} (${p.alias})` : (alias || (p && p.alias) || '?'); };
  const curso = (g) => (g ? `${g}.º` : 'profesor');
  const animal = (id) => S.animales.find((a) => a.id === id);
  const activos = () => S.animales.filter((a) => !a.fecha_baja);
  // Animales que estaban en la granja en una fecha. Los del censo importado cuentan
  // desde su nacimiento (si se sabe), porque su fecha de alta es la de la importación.
  const presentesEn = (f) => (f >= hoy() ? activos() : S.animales.filter((a) => (!a.fecha_baja || a.fecha_baja > f)
    && (!a.fecha_nacimiento || a.fecha_nacimiento <= f) && (a.importado || a.fecha_alta <= f)));
  const corralina = (id) => S.corralinas.find((c) => c.id === Number(id));
  const nombreCorr = (id) => { const c = corralina(id); return c ? `${c.nave} · ${c.numero}` : 'Sin ubicar'; };
  const nombreCorrCorto = (id) => { const c = corralina(id); return c ? `${c.nave} ${c.numero}` : 'Sin ubicar'; };
  const ubic = (a) => L.ubicacion(a, S.porAnimal[a.id], null);
  const nombreA = (a) => (a ? L.nombreAnimal(a) : '?');
  const catNombre = (k) => (L.CAT[k] || {}).nombre || k;
  // Sin raza anotada: la capa bicolor es cruce; si no, la raza de la especie.
  const raza = (a) => a.raza || (a.capa === 'bicolor' ? 'Cruce' : (L.ESPECIES[a.especie] || {}).raza || '—');

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
  }
  function traducirError(e) {
    const m = (e && (e.message || e.error_description || e.details || e.hint || e.code)) || (e && typeof e === 'object' ? JSON.stringify(e) : String(e));
    if (/Invalid login credentials/i.test(m)) return 'Alias, curso o PIN incorrectos.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No hay conexión. Revisa la cobertura e inténtalo de nuevo.';
    if (/rum_animales_manejo/i.test(m)) return 'Ese nº de collar ya lo lleva otro animal vivo de la misma especie.';
    if (/rum_animales_crotal/i.test(m)) return 'Ya hay un animal con ese crotal.';
    if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para hacer esto (o han pasado más de 24 horas desde el registro).';
    if (/rum_animales_check/i.test(m)) return 'Los datos no son coherentes (especie, categoría, sexo, capa o madre). Revísalos.';
    if (/does not exist|schema cache|PGRST205|42P01/i.test(m)) return 'Falta ejecutar en Supabase el archivo sql/01_rumiantes.sql (ver guía).';
    if (/Email not confirmed/i.test(m)) return 'La cuenta no está confirmada (ver guía de CIFEAPORC).';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos seguidos. Espera unos minutos.';
    if (/Password should be/i.test(m)) return 'El PIN debe tener 6 cifras.';
    return m;
  }

  const SVG = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONOS = {
    inicio: SVG('<path d="M4 11l8-6 8 6v8H4z"/>'),
    mapa: SVG('<path d="M3 4h18v16H3zM3 11h8M11 4v16M15 11h6"/>'),
    animales: SVG('<path d="M6 4h12v16H6zM9 9h6M9 13h6M9 17h3"/>'),
    censo: SVG('<path d="M5 20V10M10 20V4M15 20v-7M20 20v-4"/>'),
    repro: SVG('<circle cx="9" cy="10" r="5"/><circle cx="15" cy="14" r="5"/>'),
    gestion: SVG('<path d="M4 6h16M4 12h16M4 18h10"/>'),
    sanidad: SVG('<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>'),
    puntos: SVG('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
    cuenta: SVG('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
    mas: SVG('<path d="M12 5v14M5 12h14"/>', 2.4),
    atras: SVG('<path d="M15 5l-7 7 7 7"/>', 2.2),
    flecha: SVG('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  };

  // ---------------------------------------------------------------- datos
  async function cargarPerfil() {
    const { data, error } = await sb.from('perfiles').select('*').eq('user_id', uid()).maybeSingle();
    if (error) throw error;
    S.perfil = data && data.activo ? data : null; S.cursoCerrado = false;
    // Alumno con el acceso de su curso cerrado: no ve su curso en la tabla de cursos.
    if (S.perfil && S.perfil.rol === 'alumno') {
      const g = await sb.from('granjas').select('*').eq('id', S.perfil.granja_id).maybeSingle();
      if (!g.error && (!g.data || g.data.acceso === false)) { S.perfil = null; S.cursoCerrado = true; }
    }
  }
  async function todasLasFilas(tabla, orden) {
    const out = [];
    for (let desde = 0; ; desde += 1000) {
      let q = sb.from(tabla).select('*');
      for (const o of orden) q = q.order(o);
      const { data, error } = await q.range(desde, desde + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }
  async function cargarDatos() {
    try {
      const [c, a, e] = await Promise.all([
        todasLasFilas('rum_corralinas', ['id']), todasLasFilas('rum_animales', ['creado']), todasLasFilas('rum_eventos', ['fecha', 'creado'])]);
      S.corralinas = c; S.animales = a; S.eventos = e; S.faltaSQL = false;
    } catch (err) {
      if (/does not exist|schema cache|PGRST205|42P01/i.test(`${err.message} ${err.code}`)) { S.faltaSQL = true; S.corralinas = []; S.animales = []; S.eventos = []; }
      else throw err;
    }
    { const rl = S.faltaSQL ? { error: true } : await sb.from('rum_lotes').select('*').order('fecha_entrada', { ascending: false });
      S.faltaSQL2 = !!rl.error; S.lotes = rl.error ? [] : rl.data; }
    { const [rs, rm] = S.faltaSQL ? [{ error: true }, { error: true }] : await Promise.all([sb.from('rum_sanidad').select('*').order('fecha'), sb.from('medicamentos').select('*').order('nombre')]);
      S.faltaSQL3 = !!rs.error; S.sanidad = rs.error ? [] : rs.data;
      const rmj = S.faltaSQL ? { error: true } : await sb.from('rum_manejo').select('*').order('fecha', { ascending: false }).order('creado', { ascending: false }).limit(400);
      S.faltaSQL4 = !!rmj.error; S.manejo = rmj.error ? [] : rmj.data;
      if (esAdmin()) { const rc = await sb.from('correcciones').select('*').like('tabla', 'rum_%').order('creado', { ascending: false }).limit(300); S.faltaCorr = !!rc.error; S.correcciones = rc.error ? [] : rc.data; } else S.correcciones = [];
      S.medicamentos = rm.error ? [] : rm.data; } // catálogo común a todas las especies
    S.porAnimal = {};
    for (const ev of S.eventos) (S.porAnimal[ev.animal_id] = S.porAnimal[ev.animal_id] || []).push(ev);
    if (esAdmin()) { const g = await sb.from('granjas').select('*').order('id'); S.cursos = g.error ? [] : g.data; }
    const nv = await sb.rpc('nombres_visibles');
    S.nombres = {};
    if (!nv.error && Array.isArray(nv.data)) for (const p of nv.data) S.nombres[p.user_id] = p;
    S.cargado = new Date();
  }
  async function cargarTodo() { await cargarPerfil(); if (S.perfil) await cargarDatos(); }
  async function refrescar(mostrar) {
    try { await cargarDatos(); render(); if (mostrar) toast('Datos actualizados'); } catch (e) { toast(traducirError(e)); }
  }

  // ---------------------------------------------------------------- maquetación
  function cabecera(o = {}) {
    const quien = esProf() ? `${rolNombre()} · ${esc(yo())}` : `${curso(S.perfil.granja_id)} curso · ${esc(yo())}`;
    const horas = `<div class="horas"><span>Consulta: <span id="hora-consulta">${fechaHora(new Date())}</span></span><span>Datos: ${S.cargado ? fechaHora(S.cargado) : '—'}</span></div>`;
    if (o.volver) {
      return `<header class="cab ${esProf() ? 'prof' : ''}">
        <div class="fila"><a class="volver" href="${o.volver}">${ICONOS.atras}${esc(o.textoVolver || 'Volver')}</a>
        <span class="granja-tag">CIFEARUMI</span></div>
        <h1>${esc(o.titulo)}</h1>${o.sub ? `<div class="sub">${o.sub}</div>` : ''}
        <div class="quien peq" style="margin-top:4px">${quien}</div></header>`;
    }
    return `<header class="cab ${esProf() ? 'prof' : ''}">
      <div class="fila"><a class="logo-enlace" href="#/granjas" aria-label="Cambiar de granja"><img class="logo" src="img/rumi.jpg" alt=""></a>
        <div><div class="marca">CIFEARUMI</div><div class="quien">${quien}</div></div>
        <button class="refrescar" type="button" data-accion="refrescar" aria-label="Actualizar datos">Actualizar</button></div>
      ${horas}</header>`;
  }
  function navegacion(activa) {
    const items = [['inicio', 'Hoy'], ['mapa', 'Mapa'], ['animales', 'Animales'], ['repro', 'Reprod.'], ['sanidad', 'Sanidad'], ['mas', 'Más']];
    if (['censo', 'gestion', 'cuenta'].includes(activa)) activa = 'mas';
    return `<nav class="nav" aria-label="Secciones"><div class="dentro">${items.map(([id, t]) =>
      `<a href="#/${id === 'repro' ? 'reproduccion' : id}" class="${activa === id ? 'activo' : ''}" ${activa === id ? 'aria-current="page"' : ''}>${ICONOS[id === 'mas' ? 'puntos' : id]}${t}</a>`).join('')}</div></nav>`;
  }
  function pintar(html) { $app.className = ''; $app.innerHTML = html; window.scrollTo(0, 0); }
  const faltaSQLCaja = () => (S.faltaSQL ? `<div class="error-caja" role="alert"><strong>Falta preparar la base de datos.</strong> ${esProf() ? 'Ejecuta en Supabase el archivo <code>sql/01_rumiantes.sql</code> (ver GUIA.md).' : 'Avisa a tu profesor.'}</div>` : '');
  const ctxR = { eventos: (id) => S.porAnimal[id] || [], animal: (id) => animal(id) };
  const estR = (h) => L.estadoRepro(h, S.lotes, ctxR, hoy());
  const esHembraRepro = (a) => L.HEMBRAS.includes(a.categoria);
  const corta = (iso) => (iso ? `${Number(iso.slice(8))} ${MESES[Number(iso.slice(5, 7)) - 1]}` : '—');
  const chipEstado = (r) => `<span class="chip ${['gestante', 'lactacion', 'criando'].includes(r.estado) ? '' : ['lote', 'cubierta'].includes(r.estado) ? 'nar' : 'gris'}">${esc(estadoNombre(r))}</span>`;
  const estadoNombre = (r) => (r.estado === 'lactacion' && r.ordeno ? 'En ordeño' : L.ESTADOS[r.estado].nombre);
  const faltaSQL2Caja = () => (S.faltaSQL2 && !S.faltaSQL && esProf() ? '<div class="aviso-caja"><strong>Para usar la reproducción</strong>, vuelve a ejecutar en Supabase el archivo <code>sql/01_rumiantes.sql</code> (se puede repetir sin perder datos).</div>' : '');
  const retiradasHoy = () => L.retiradas(S.sanidad, hoy());
  const chipRetirada = (x) => (x && x.leche ? '<span class="chip rojo">Leche retirada</span>' : x && x.carne ? '<span class="chip rojo">Carne retirada</span>' : '');
  const faltaSQL3Caja = () => (S.faltaSQL3 && !S.faltaSQL && esProf() ? '<div class="aviso-caja"><strong>Para usar la sanidad</strong>, vuelve a ejecutar en Supabase el archivo <code>sql/01_rumiantes.sql</code> (se puede repetir sin perder datos).</div>' : '');
  const chipCat = (a) => `<span class="chip ${a.especie === 'ovino' ? 'ovi' : ''}">${esc(catNombre(a.categoria))}</span>`;

  // ---------------------------------------------------------------- acceso
  function vistaAcceso(modo = 'alumno', mensaje = '') {
    pintar(`<main class="acceso">
      <div class="logo-acceso"><img src="img/logo.jpg" alt="CIFEAFARM"></div>
      <h1 style="text-align:center">Entrar en CIFEAFARM</h1>
      <p class="suave" style="text-align:center;margin:0">Granjas del centro · cabras, ovejas y cerdos</p>
      <div class="pestanas" role="tablist">
        <button type="button" role="tab" aria-selected="${modo === 'alumno'}" class="${modo === 'alumno' ? 'activo' : ''}" data-modo="alumno">Alumno</button>
        <button type="button" role="tab" aria-selected="${modo === 'veterinaria'}" class="${modo === 'veterinaria' ? 'activo' : ''}" data-modo="veterinaria">Veterinaria</button>
        <button type="button" role="tab" aria-selected="${modo === 'profesor'}" class="${modo === 'profesor' ? 'activo' : ''}" data-modo="profesor">Profesor</button>
      </div>
      ${mensaje ? `<div class="error-caja" role="alert">${esc(mensaje)}</div>` : ''}
      <form class="formu" id="f-acceso" novalidate>
        ${modo === 'alumno' || modo === 'veterinaria' ? `${modo === 'alumno' ? `
          <div class="campo"><span class="et" id="et-curso">Curso</span>
            <div class="opciones" role="radiogroup" aria-labelledby="et-curso">
              <label><input type="radio" name="curso" value="1" checked> 1.º curso</label>
              <label><input type="radio" name="curso" value="2"> 2.º curso</label></div></div>` : ''}
          <div class="campo"><label for="alias">Alias</label>
            <input id="alias" name="alias" type="text" autocomplete="username" autocapitalize="characters" placeholder="Ej.: A07" required></div>
          <div class="campo"><label for="pin">PIN</label>
            <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password" placeholder="6 cifras" required></div>`
        : `
          <div class="campo"><label for="correo">Correo</label><input id="correo" name="correo" type="email" autocomplete="username" required></div>
          <div class="campo"><label for="clave">Contraseña</label><input id="clave" name="clave" type="password" autocomplete="current-password" required></div>`}
        <button class="btn" type="submit">Entrar</button>
      </form>
      <p class="suave" style="text-align:center">Si has olvidado el PIN, pide uno nuevo a tu profesor.</p>
    </main>`);
    $app.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => vistaAcceso(b.dataset.modo)));
    document.getElementById('f-acceso').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const boton = ev.target.querySelector('button[type=submit]');
      let email, password;
      if (modo === 'alumno' || modo === 'veterinaria') {
        const alias = String(f.get('alias') || '').trim().toUpperCase();
        email = modo === 'alumno' ? `${alias.toLowerCase()}.g${f.get('curso')}@${C.dominioAlumnos}` : `${alias.toLowerCase()}.vet@${C.dominioAlumnos}`;
        password = String(f.get('pin') || '').trim();
        if (!alias || !/^\d{6}$/.test(password)) { vistaAcceso(modo, 'Escribe tu alias y un PIN de 6 cifras.'); return; }
      } else { email = String(f.get('correo') || '').trim(); password = String(f.get('clave') || ''); }
      boton.disabled = true; boton.textContent = 'Entrando…';
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { vistaAcceso(modo, traducirError(error)); return; }
      S.sesion = data.session;
      try { await cargarTodo(); } catch (e) { vistaAcceso(modo, traducirError(e)); return; }
      location.hash = '#/inicio'; render();
    });
  }
  function vistaSinPerfil() {
    pintar(`<main class="acceso"><div class="logo-acceso"><img src="img/logo.jpg" alt="CIFEAFARM"></div>
      <div class="aviso-caja">${S.cursoCerrado ? '<strong>El acceso de tu curso todavía está cerrado.</strong><br>Tu profesor lo abrirá cuando empecéis a usar la app.' : '<strong>Tu cuenta no tiene acceso.</strong><br>Puede que esté desactivada. Habla con tu profesor.'}</div>
      <button class="btn sec" type="button" data-accion="salir">Salir</button></main>`);
  }

  // ---------------------------------------------------------------- granjas
  function vistaGranjas() {
    pintar(`<header class="cab ${esProf() ? 'prof' : ''}"><div class="fila"><img class="logo" src="img/logo-mini.jpg" alt="">
        <div><div class="marca">CIFEAFARM</div><div class="quien">${esProf() ? `${rolNombre()} · ${esc(yo())}` : `${curso(S.perfil.granja_id)} curso · ${esc(yo())}`}</div></div></div></header>
      <main class="cuerpo">
        <h1 style="font-size:22px">Granjas del centro</h1>
        <a class="granja-card" href="#/inicio"><img src="img/rumi.jpg" alt=""><div><strong>CIFEARUMI</strong>
          <div class="suave">Cabras murciano-granadinas y ovejas segureñas · ${activos().length} animales</div></div>${ICONOS.flecha}</a>
        <a class="granja-card" href="${esc(C.urlPorcino)}"><img src="img/porc.png" alt=""><div><strong>CIFEAPORC</strong>
          <div class="suave">Porcino de ciclo cerrado, chato murciano</div></div>${ICONOS.flecha}</a>
        <button class="btn sec" type="button" data-accion="salir">Salir</button>
        <div class="suave peq" style="text-align:center">CIFEAFARM · versión ${esc(C.version)}</div>
      </main>`);
  }

  // ---------------------------------------------------------------- hoy
  function contar(lista) {
    const r = { caprino: 0, ovino: 0 }; const cat = {};
    for (const a of lista) { r[a.especie]++; cat[a.categoria] = (cat[a.categoria] || 0) + 1; }
    return { ...r, cat };
  }
  function vistaInicio() {
    const d = new Date(); const act = activos(); const n = contar(act);
    const porRevisar = esProf() ? act.filter((a) => L.revisar(a).length) : [];
    const recientes = S.eventos.filter((e) => !(e.datos && e.datos.importado)).sort((x, y) => String(y.creado).localeCompare(String(x.creado))).slice(0, 8);
    pintar(`${cabecera()}
      <main class="cuerpo">
        ${faltaSQLCaja()}
        <div class="foto logo"><img src="img/rumi-logo.jpg" alt="Logotipo de CIFEARUMI: cabra murciano-granadina y oveja segureña"></div>
        <div class="entre"><h1 style="font-size:22px">Hoy, ${DIAS_SEM[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}</h1></div>
        <div class="dos">
          <a class="dato enlace" href="#/animales/caprino"><span class="et">Caprino</span><span class="val">${n.caprino}</span><span class="nota">${n.cat.cabra || 0} cabras · ${n.cat.chiva || 0} chivas · ${n.cat.macho_cabrio || 0} machos${n.cat.cabrito ? ` · ${n.cat.cabrito} cabritos` : ''}</span></a>
          <a class="dato ovi enlace" href="#/animales/ovino"><span class="et">Ovino</span><span class="val">${n.ovino}</span><span class="nota">${n.cat.oveja || 0} ovejas · ${n.cat.cordera || 0} corderas · ${n.cat.morueco || 0} moruecos${n.cat.cordero ? ` · ${n.cat.cordero} corderos` : ''}</span></a>
        </div>
        ${faltaSQL2Caja()}${faltaSQL3Caja()}
        ${(() => { const ret = retiradasHoy(); const leche = activos().filter((a) => ret[a.id] && ret[a.id].leche && a.especie === 'caprino' && esHembraRepro(a)).sort(L.ordenNatural);
          return leche.length ? `<a class="tarjeta enlace alerta" href="#/sanidad/retiradas"><div class="entre"><strong>Leche no apta: ${leche.length} ${leche.length === 1 ? 'cabra' : 'cabras'}</strong><span class="chip rojo">No al tanque</span></div>
            <div>${leche.map((a) => `<strong>${esc(nombreA(a))}</strong> hasta el ${corta(ret[a.id].leche.hasta)}`).join(' · ')}</div></a>` : ''; })()}
        ${(() => { const av = S.faltaSQL4 ? [] : L.avisosSeguimiento(S.animales, (id) => S.porAnimal[id] || [], S.sanidad, hoy()); return av.length ? `<section class="tarjeta"><h2>Seguimiento</h2>${av.map((x) => `<a class="evento enlace" href="#/animal/${x.a.id}"><div class="entre"><strong>${esc(nombreA(x.a))} · ${x.tipo === 'famacha' ? `FAMACHA ${x.valor}` : `CC ${String(x.valor).replace('.', ',')}`}</strong><span class="chip nar">${corta(x.fecha)}</span></div><div class="suave peq">${x.tipo === 'famacha' ? 'Anemia: valorar desparasitar' : 'Condición corporal baja: revisar la ración y la salud'}</div></a>`).join('')}</section>` : ''; })()}
        ${(() => { if (S.faltaSQL4) return ''; const h = S.manejo.filter((m) => m.fecha === hoy()); const hechas = new Set(h.flatMap((m) => m.tareas)); return `<a class="tarjeta enlace" href="#/manejo"><div class="entre"><strong>Manejo de hoy</strong><span class="chip ${h.length ? '' : 'gris'}">${h.length ? `${h.length} ${h.length === 1 ? 'registro' : 'registros'}` : 'Sin anotar'}</span></div><div class="suave peq">${h.length ? Object.entries(L.TAREAS).filter(([k]) => hechas.has(k)).map(([, t]) => t).join(' · ') : 'Anota limpieza, alimentación, ordeño… por corralina'}</div></a>`; })()}
        ${(() => { const av = S.faltaSQL3 ? [] : L.avisosSanidad(S.sanidad, hoy()); return av.length ? `<section class="tarjeta"><h2>Sanidad prevista</h2>${av.map((x) => `<a class="evento enlace" href="#/sanidad/realizar/${x.s.id}"><div class="entre"><strong>${esc(L.TIPOS_SAN[x.s.tipo])} · ${esc(x.s.producto || '')}</strong><span class="chip ${x.nivel === 'urgente' ? 'nar' : ''}">${x.vencido ? 'Atrasado' : x.nivel === 'urgente' ? 'Hoy' : corta(x.s.fecha)}</span></div><div class="suave peq">${esc(destinoSan(x.s))}${x.vencido ? ` · previsto el ${fmt(x.s.fecha)}` : ''} · toca para validarlo</div></a>`).join('')}</section>` : ''; })()}
        ${(() => { const av = S.faltaSQL2 ? [] : L.avisosRepro(S.animales, S.lotes, ctxR, hoy()); return av.length ? `<section class="tarjeta"><h2>Avisos</h2>${av.map((x) => `<a class="evento enlace" href="${x.enlace}"><div class="entre"><strong>${esc(x.titulo)}</strong><span class="chip ${x.nivel === 'urgente' ? 'nar' : x.nivel === 'info' ? 'gris' : ''}">${x.nivel === 'urgente' ? 'Hoy' : x.nivel === 'info' ? 'En curso' : corta(x.fecha)}</span></div><div class="suave peq">${esc(x.detalle)}</div></a>`).join('')}</section>` : '<div class="vacio">No hay avisos de reproducción para hoy.</div>'; })()}
        ${porRevisar.length ? `<a class="tarjeta enlace" href="#/animales/revisar" style="border-color:var(--naranja-borde)"><div class="entre"><strong>Datos por completar</strong><span class="chip nar">${porRevisar.length}</span></div>
          <div class="suave">Crotales de 14 cifras, animales sin collar o cabras sin capa. Corrígelos desde la ficha de cada animal.</div></a>` : ''}
        ${esAdmin() && S.correcciones.some((c) => !c.revisada) ? `<a class="tarjeta enlace" href="#/correcciones" style="border-color:var(--naranja-borde)"><div class="entre"><strong>${S.correcciones.filter((c) => !c.revisada).length} correcciones de alumnos sin revisar</strong><span class="chip nar">Profesor</span></div><div class="suave">Un alumno ha cambiado registros de otros</div></a>` : ''}
        ${esProf() && (!S.ultimaCopia || Date.now() - S.ultimaCopia > 30 * 864e5) && act.length ? `<a class="tarjeta enlace" href="#/gestion" style="border-color:var(--naranja-borde)"><div class="entre"><strong>Haz una copia de seguridad</strong><span class="chip nar">Profesor</span></div><div class="suave">${S.ultimaCopia ? `La última es del ${fechaHora(S.ultimaCopia)}` : 'Aún no has descargado ninguna desde este dispositivo'} · Gestión</div></a>` : ''}
        ${act.length === 0 && !S.faltaSQL ? `<div class="vacio">Aún no hay animales en el censo.${esProf() ? ' Impórtalos desde <a href="#/gestion">Gestión → Importar censo</a> o da de alta uno a uno.' : ''}</div>` : ''}
        <div class="botones"><a class="btn" href="#/animales">${ICONOS.animales}Buscar animal</a><a class="btn sec" href="#/mapa">${ICONOS.mapa}Mapa</a></div>
        <section class="tarjeta"><h2>Últimos registros</h2>
          ${recientes.map((e) => { const a = animal(e.animal_id); return `<a class="evento enlace" href="#/animal/${e.animal_id}"><div class="entre"><strong>${esc(nombreA(a))} · ${esc(nombreEvento(e))}</strong><span class="suave">${fmt(e.fecha)}</span></div><div class="suave peq">${resumenEvento(e)} · ${esc(quienEs(e.autor, e.autor_alias))}</div></a>`; }).join('') || '<div class="suave">Todavía no hay registros.</div>'}
        </section>
        <a class="btn sec" href="#/alta">${ICONOS.mas}Alta de un animal</a>
      </main>${navegacion('inicio')}`);
  }

  // ---------------------------------------------------------------- mapa
  function vistaMapa() {
    const act = activos(); const n = contar(act);
    const en = {}; for (const a of act) { const u = ubic(a) || 0; (en[u] = en[u] || []).push(a); }
    const naves = [...new Set(S.corralinas.map((c) => c.nave))];
    const tile = (c) => {
      const l = en[c.id] || []; const k = contar(l);
      const desglose = Object.entries(k.cat).sort((x, y) => Object.keys(L.CAT).indexOf(x[0]) - Object.keys(L.CAT).indexOf(y[0])).map(([cat, x]) => `${x} ${(x === 1 ? L.CAT[cat].nombre : L.CAT[cat].plural).toLowerCase()}`).join(' · ');
      return `<a class="corral-tile ${l.length ? 'ocupado' : ''} ${c.activa ? '' : 'inactiva'}" href="#/corralina/${c.id}">
        <span class="num">${c.numero}</span><strong>${l.length}</strong>
        <span class="uso">${esc(c.uso || '')}</span><span class="peq suave">${desglose || 'Vacía'}</span>${(() => { const ret = retiradasHoy(); const n = l.filter((a) => ret[a.id] && ret[a.id].leche && a.especie === 'caprino' && esHembraRepro(a)).length; return n ? `<span class="chip rojo">Leche retirada: ${n}</span>` : ''; })()}</a>`;
    };
    pintar(`${cabecera()}
      <main class="cuerpo">${faltaSQLCaja()}
        <h1 style="font-size:22px">Mapa de la granja</h1>
        <div class="totales3"><div class="dato"><span class="et">Caprino</span><span class="val">${n.caprino}</span></div>
          <div class="dato ovi"><span class="et">Ovino</span><span class="val">${n.ovino}</span></div>
          <div class="dato gris"><span class="et">Total</span><span class="val">${act.length}</span></div></div>
        ${naves.map((nv) => `<section class="nave"><h2>Nave ${esc(nv)}</h2>
          <div class="nave-grid">${S.corralinas.filter((c) => c.nave === nv).sort((x, y) => x.numero - y.numero).map(tile).join('')}</div>
          ${nv === 'Cría y Ordeño' ? '<div class="sala-ordeno">Sala de ordeño</div>' : ''}</section>`).join('')}
        ${en[0] && en[0].length ? `<a class="tarjeta enlace" href="#/corralina/0"><div class="entre"><strong>Sin ubicar</strong><span class="chip nar">${en[0].length}</span></div><div class="suave">Animales sin corralina asignada.</div></a>` : ''}
      </main>${navegacion('mapa')}`);
  }

  // ---------------------------------------------------------------- corralina (lista y traslado en grupo)
  function vistaCorralina(id) {
    const cid = Number(id);
    const c = corralina(cid);
    if (cid && !c) return vistaNoEncontrado();
    const lista = activos().filter((a) => (ubic(a) || 0) === cid).sort((x, y) => (x.especie === y.especie ? L.ordenNatural(x, y) : x.especie.localeCompare(y.especie)));
    pintar(`${cabecera({ volver: '#/mapa', textoVolver: 'Mapa', titulo: c ? `Corralina ${c.numero}` : 'Sin ubicar', sub: c ? `Nave ${esc(c.nave)}${c.uso ? ` · ${esc(c.uso)}` : ''} · ${lista.length} animales` : `${lista.length} animales` })}
      <main class="cuerpo">
        ${lista.length ? `<form id="f-sel" class="formu">
          <div class="entre"><label class="check-todos"><input type="checkbox" id="todos"> Seleccionar todos</label><span class="suave" id="n-sel">0 seleccionados</span></div>
          <div class="lista">${lista.map((a) => `<label class="animal-fila check"><input type="checkbox" name="sel" value="${a.id}">
            <div><strong>${esc(nombreA(a))}</strong><div class="suave">${esc(catNombre(a.categoria))}${esHembraRepro(a) && !S.faltaSQL2 ? ` · ${esc(estadoNombre(estR(a)))}` : ''}${a.crotal ? ` · ${esc(a.crotal)}` : ''}</div>${chipRetirada(retiradasHoy()[a.id])}</div>
            <a class="ver" href="#/animal/${a.id}" aria-label="Ver ficha de ${esc(nombreA(a))}">Ficha</a></label>`).join('')}</div>
          <div class="botones pegado"><button class="btn" type="submit" id="b-trasladar" disabled>${ICONOS.flecha}Trasladar</button><button class="btn sec" type="button" id="b-tratar" disabled>Sanidad</button><button class="btn sec" type="button" id="b-cc" disabled>CC / FAMACHA</button>${lista.some((a) => a.categoria === 'cabra') ? '<button class="btn sec" type="button" id="b-leche" disabled>Leche</button>' : ''}${lista.some((a) => a.categoria === 'cabra') ? '<button class="btn sec" type="button" id="b-secado" disabled>Secado</button>' : ''}</div></form>`
        : '<div class="vacio">No hay animales en esta corralina.</div>'}
        ${esProf() && c ? `<form class="formu tarjeta" id="f-uso"><h2>Uso de la corralina</h2>
          <div class="campo"><label for="uso">Texto libre (p. ej. «Chivas», «Machos»)</label><input id="uso" name="uso" type="text" value="${esc(c.uso || '')}"></div>
          <button class="btn sec" type="submit">Guardar</button></form>` : ''}
      </main>${navegacion('mapa')}`);
    const f = document.getElementById('f-sel');
    if (f) {
      const marcar = () => { const k = f.querySelectorAll('input[name=sel]:checked').length; document.getElementById('n-sel').textContent = `${k} ${k === 1 ? 'seleccionado' : 'seleccionados'}`; document.getElementById('b-trasladar').disabled = !k; const bs = document.getElementById('b-secado'); if (bs) bs.disabled = !k; document.getElementById('b-tratar').disabled = !k; document.getElementById('b-cc').disabled = !k; const bl = document.getElementById('b-leche'); if (bl) bl.disabled = !k; };
      f.addEventListener('change', (ev) => { if (ev.target.id === 'todos') f.querySelectorAll('input[name=sel]').forEach((x) => { x.checked = ev.target.checked; }); marcar(); });
      const grupo = (ruta) => () => { const ids = [...f.querySelectorAll('input[name=sel]:checked')].map((x) => x.value); S.borrador.grupo = { ids, volver: `#/corralina/${cid}` }; location.hash = ruta; };
      document.getElementById('b-cc').addEventListener('click', grupo('#/seguimiento/condicion'));
      const bl = document.getElementById('b-leche'); if (bl) bl.addEventListener('click', grupo('#/seguimiento/lechero'));
      document.getElementById('b-tratar').addEventListener('click', () => { const ids = [...f.querySelectorAll('input[name=sel]:checked')].map((x) => x.value); S.borrador.grupo = { ids, volver: `#/corralina/${cid}` }; location.hash = '#/sanidad/nuevo/grupo'; });
      const bs = document.getElementById('b-secado');
      if (bs) bs.addEventListener('click', () => { const ids = [...f.querySelectorAll('input[name=sel]:checked')].map((x) => x.value); S.borrador.grupo = { ids, volver: `#/corralina/${cid}` }; location.hash = '#/registro/secado'; });
      f.addEventListener('submit', (ev) => { ev.preventDefault(); const ids = [...f.querySelectorAll('input[name=sel]:checked')].map((x) => x.value); S.borrador.traslado = { ids, volver: `#/corralina/${cid}` }; location.hash = '#/trasladar'; });
    }
    const fu = document.getElementById('f-uso');
    if (fu) fu.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const { error } = await sb.from('rum_corralinas').update({ uso: String(new FormData(fu).get('uso') || '').trim() || null }).eq('id', cid);
      if (error) return toast(traducirError(error));
      toast('Guardado'); refrescar();
    });
  }

  // ---------------------------------------------------------------- animales
  function vistaAnimales(filtroInicial) {
    if (filtroInicial !== undefined) { S.borrador.especie = ['caprino', 'ovino'].includes(filtroInicial) ? filtroInicial : ''; S.borrador.revisar = filtroInicial === 'revisar'; }
    const t = (S.borrador.buscar || '').trim().toUpperCase();
    const esp = S.borrador.especie || ''; const cat = S.borrador.cat || ''; const bajas = !!S.borrador.bajas; const rev = !!S.borrador.revisar;
    const lista = S.animales.filter((a) => (bajas ? true : !a.fecha_baja) && (!esp || a.especie === esp) && (!cat || a.categoria === cat)
      && (!rev || L.revisar(a).length)
      && (!t || [a.manejo, a.codigo_cria, a.crotal].some((x) => x && x.toUpperCase().includes(t)))).sort(L.ordenNatural);
    pintar(`${cabecera()}
      <main class="cuerpo">${faltaSQLCaja()}
        <div class="entre"><h1 style="font-size:22px">Animales</h1><a class="btn sec peq" href="#/alta">${ICONOS.mas}Alta</a></div>
        <div class="campo"><input id="buscar" type="text" inputmode="search" autocapitalize="characters" aria-label="Buscar por nº de collar, código o crotal" placeholder="Nº de collar, código de cría o crotal…" value="${esc(S.borrador.buscar || '')}"></div>
        <div class="pestanas">${[['', 'Todos'], ['caprino', 'Caprino'], ['ovino', 'Ovino']].map(([k, x]) => `<button type="button" data-esp="${k}" class="${esp === k ? 'activo' : ''}">${x}</button>`).join('')}</div>
        <div class="dos"><select id="f-cat" aria-label="Categoría"><option value="">Todas las categorías</option>${Object.entries(L.CAT).filter(([, v]) => !esp || v.especie === esp).map(([k, v]) => `<option value="${k}" ${cat === k ? 'selected' : ''}>${v.plural}</option>`).join('')}</select>
          <label class="check-todos"><input type="checkbox" id="f-bajas" ${bajas ? 'checked' : ''}> Ver bajas</label></div>
        ${esProf() ? `<label class="check-todos"><input type="checkbox" id="f-rev" ${rev ? 'checked' : ''}> Solo con datos por completar</label>` : ''}
        <div class="suave">${lista.length} ${lista.length === 1 ? 'animal' : 'animales'}</div>
        <div class="lista">${lista.map((a) => `<a class="animal-fila" href="#/animal/${a.id}"><div><strong>${esc(nombreA(a))}</strong>
          <div class="suave">${esc(catNombre(a.categoria))} · ${a.fecha_baja ? `Baja ${fmt(a.fecha_baja)}` : esc(nombreCorrCorto(ubic(a)))}${a.crotal ? ` · ${esc(a.crotal)}` : ''}</div></div>
          ${a.fecha_baja ? '<span class="chip gris">Baja</span>' : rev ? `<span class="chip nar">${L.revisar(a).length}</span>` : chipCat(a)}</a>`).join('') || '<div class="vacio">No hay animales que coincidan.</div>'}</div>
      </main>${navegacion('animales')}`);
    const b = document.getElementById('buscar');
    b.addEventListener('input', () => { S.borrador.buscar = b.value; const pos = b.selectionStart; vistaAnimales(); const nb = document.getElementById('buscar'); nb.focus(); nb.setSelectionRange(pos, pos); });
    $app.querySelectorAll('[data-esp]').forEach((x) => x.addEventListener('click', () => { S.borrador.especie = x.dataset.esp; S.borrador.cat = ''; vistaAnimales(); }));
    document.getElementById('f-cat').addEventListener('change', (ev) => { S.borrador.cat = ev.target.value; vistaAnimales(); });
    document.getElementById('f-bajas').addEventListener('change', (ev) => { S.borrador.bajas = ev.target.checked; vistaAnimales(); });
    const r = document.getElementById('f-rev'); if (r) r.addEventListener('change', (ev) => { S.borrador.revisar = ev.target.checked; vistaAnimales(); });
  }

  // ---------------------------------------------------------------- ficha
  const TIPOS = { alta: 'Alta', baja: 'Baja', baja_anulada: 'Baja anulada', datos: 'Datos corregidos', traslado: 'Traslado', nota: 'Nota', condicion: 'Condición corporal / FAMACHA', lechero: 'Control lechero', eco: 'Ecografía', parto: 'Parto', encalostrado: 'Encalostrado', inicio_ordeno: 'Inicio del ordeño', destete: 'Destete', acrotalado: 'Acrotalado', secado: 'Secado' };
  const TIPO_PARTO = { normal: 'Normal', asistido: 'Asistido', distocico: 'Distócico' };
  const loteDe = (id) => S.lotes.find((l) => l.id === id);
  const CAMPOS = { especie: 'Especie', raza: 'Raza', categoria: 'Categoría', sexo: 'Sexo', crotal: 'Crotal', manejo: 'Nº de manejo', codigo_cria: 'Código de cría', capa: 'Capa', fecha_nacimiento: 'Nacimiento', anio_nacimiento: 'Año de nacimiento', madre_id: 'Madre', padre_id: 'Padre', madre_txt: 'Madre', padre_txt: 'Padre', origen: 'Origen', corralina_id: 'Corralina de entrada', fecha_alta: 'Fecha de alta', obs: 'Observaciones', peso_nacimiento: 'Peso al nacer (kg)' };
  const nombreEvento = (e) => TIPOS[e.tipo] || e.tipo;
  function valorCampo(k, v) {
    if (v === null || v === undefined || v === '') return '—';
    if (k === 'categoria') return catNombre(v);
    if (k === 'capa') return L.CAPAS[v] || v;
    if (k === 'origen') return L.ORIGENES[v] || v;
    if (k === 'especie') return L.ESPECIES[v] ? L.ESPECIES[v].nombre : v;
    if (k === 'madre_id' || k === 'padre_id') return nombreA(animal(v));
    if (k === 'corralina_id') return nombreCorr(v);
    if (/fecha/.test(k)) return fmt(v);
    return String(v);
  }
  function resumenEvento(e) {
    const d = e.datos || {};
    switch (e.tipo) {
      case 'alta': return d.importado ? 'Censo inicial (importado)' : esc(d.motivo || 'Alta');
      case 'baja': return `${esc(d.causa || '')}${d.destino ? ` · ${esc(d.destino)}` : ''}`;
      case 'baja_anulada': return 'Vuelve al censo';
      case 'datos': return Object.entries(d.cambios || {}).map(([k, [a, b]]) => `${esc(CAMPOS[k] || k)}: ${esc(valorCampo(k, a))} → ${esc(valorCampo(k, b))}`).join(' · ');
      case 'traslado': return `${esc(nombreCorrCorto(d.de))} → <strong>${esc(nombreCorrCorto(d.a))}</strong>${d.lote && loteDe(d.lote) ? ` · ${esc(loteDe(d.lote).nombre)}` : ''}`;
      case 'eco': return `${d.resultado === 'vacia' ? 'Vacía' : `<strong>Gestante</strong>${d.fetos ? ` · ${esc(d.fetos)} ${+d.fetos === 1 ? 'feto' : 'fetos'}` : ''}`}${d.lote && loteDe(d.lote) ? ` · ${esc(loteDe(d.lote).nombre)}` : ''}`;
      case 'parto': return `${esc(TIPO_PARTO[d.tipo] || 'Normal')} · <strong>${+d.vivas || 0} ${+d.vivas === 1 ? 'viva' : 'vivas'}</strong>${+d.muertas ? ` · ${d.muertas} ${+d.muertas === 1 ? 'muerta' : 'muertas'}` : ''}${(d.crias || []).length ? ` · ${(d.crias || []).map((x) => esc(nombreA(animal(x)))).join(', ')}` : ''}${d.asistentes && !esVet() ? ` · asistieron ${esc(d.asistentes)}` : ''}`;
      case 'encalostrado': return esc(d.resultado || 'Correcto');
      case 'inicio_ordeno': return 'Empieza a ordeñarse';
      case 'destete': return `${d.peso ? `${esc(d.peso)} kg · ` : ''}${esc(d.destino || '')}`;
      case 'acrotalado': return `Crotal ${esc(d.crotal || '')}${d.manejo ? ` · collar ${esc(d.manejo)}` : ''} · pasa a ${esc(catNombre(d.categoria))}`;
      case 'secado': return 'Secado natural';
      case 'condicion': return [d.cc != null ? `CC ${String(d.cc).replace('.', ',')}` : null, d.famacha != null ? `FAMACHA ${d.famacha}` : null].filter(Boolean).join(' · ');
      case 'lechero': return `${String(d.litros).replace('.', ',')} litros`;
      case 'nota': return esc(d.texto || '');
      default: return esc(e.tipo);
    }
  }
  const AUTO = ['alta', 'baja', 'baja_anulada', 'datos', 'parto', 'acrotalado'];
  const puedeEditarEv = (e) => esProf() || (!AUTO.includes(e.tipo) && e.autor === uid() && Date.now() - new Date(e.creado).getTime() < 864e5);
  // Corregir lo de otro: cualquiera; el profesor lo ve en Correcciones
  const esAjeno = (r) => !esProf() && r && r.autor !== uid();
  const avisoAjeno = (r) => (esAjeno(r) ? `<div class="aviso-caja"><strong>Vas a corregir un registro de ${esc(quienEs(r.autor, r.autor_alias, r.curso))}.</strong> Quedará tu nombre y el profesor verá lo que cambias.</div>` : '');
  const puedeEditarAnimal = (a) => esProf() || (a.alta_autor === uid() && Date.now() - new Date(a.creado).getTime() < 864e5);

  function vistaFicha(id) {
    const a = animal(id);
    if (!a) return vistaNoEncontrado('No se ha encontrado ese animal.');
    const h = hoy(); const u = ubic(a);
    const madre = a.madre_id ? animal(a.madre_id) : null; const padre = a.padre_id ? animal(a.padre_id) : null;
    const crias = S.animales.filter((x) => x.madre_id === a.id || x.padre_id === a.id).sort((x, y) => String(y.fecha_nacimiento || y.fecha_alta).localeCompare(String(x.fecha_nacimiento || x.fecha_alta)));
    const rev = esProf() ? L.revisar(a) : [];
    const evs = (S.porAnimal[a.id] || []).slice().sort(L.porFecha).reverse();
    const tarjetaEv = (e) => `<div class="evento"><div class="entre"><strong>${esc(nombreEvento(e))}</strong><span class="suave">${fmt(e.fecha)}</span></div>
      <div>${resumenEvento(e)}</div>${e.datos && e.datos.obs ? `<div class="suave">${esc(e.datos.obs)}</div>` : ''}
      <div class="suave peq">${e.datos && e.datos.importado ? 'Importado del Excel' : `Por ${esc(quienEs(e.autor, e.autor_alias, e.curso))}${esVet() ? '' : ` (${curso(e.curso)})`}`}${e.modificado ? ` · corregido por ${esc(verAlias(e.modificado_por) || '?')}` : ''}</div>
      ${e.tipo === 'parto' && esProf() ? `<div class="acciones"><button class="btn peligro peq" type="button" data-borrar-parto="${e.id}">Borrar parto</button></div>` : ''}
      ${!AUTO.includes(e.tipo) ? `<div class="acciones"><a class="btn sec peq" href="${e.tipo === 'nota' ? `#/nota/${a.id}/${e.id}` : `#/corregir/${a.id}/${e.id}`}">Corregir</a>${puedeEditarEv(e) ? `<button class="btn peligro peq" type="button" data-borrar="${e.id}">Borrar</button>` : ''}</div>` : ''}</div>`;
    const historial = evs.slice(0, 10).map(tarjetaEv).join('') + (evs.length > 10 ? `<details><summary class="suave" style="min-height:44px;display:flex;align-items:center">Ver ${evs.length - 10} registros anteriores</summary>${evs.slice(10).map(tarjetaEv).join('')}</details>` : '');
    const ident = [a.crotal ? `Crotal ${esc(a.crotal)}` : null, a.manejo && a.codigo_cria ? `antes ${esc(a.codigo_cria)}` : null].filter(Boolean).join(' · ');
    pintar(`${cabecera({ volver: '#/animales', textoVolver: 'Animales', titulo: nombreA(a), sub: `${esc(catNombre(a.categoria))} · ${esc(raza(a))}${ident ? ` · ${ident}` : ''}` })}
      <main class="cuerpo">
        ${a.fecha_baja ? `<div class="error-caja"><strong>Dado de baja el ${fmt(a.fecha_baja)}</strong> · ${esc(a.causa_baja)}${a.destino_baja ? ` · ${esc(a.destino_baja)}` : ''}${a.baja_por ? ` · por ${esc(verAlias(a.baja_por))}` : ''}</div>` : ''}
        ${rev.length ? `<div class="aviso-caja"><strong>Por completar:</strong> ${esc(rev.join(' · '))}. <a href="#/editar/${a.id}">Corregir datos</a></div>` : ''}
        <div class="dos"><div class="dato ${a.especie === 'ovino' ? 'ovi' : ''}"><span class="et">Ubicación</span><span class="val peq-val">${esc(a.fecha_baja ? '—' : nombreCorrCorto(u))}</span><span class="nota">${a.fecha_baja ? '' : esc((corralina(u) || {}).uso || '')}</span></div>
          <div class="dato gris"><span class="et">Edad</span><span class="val peq-val">${esc(L.edad(a, h))}</span><span class="nota">${a.fecha_nacimiento ? `Nació el ${fmt(a.fecha_nacimiento)}` : a.anio_nacimiento ? `Año ${a.anio_nacimiento}` : 'Fecha sin anotar'}</span></div></div>
        ${a.fecha_baja ? '' : `<div class="botones"><a class="btn" href="#/trasladar/${a.id}">${ICONOS.flecha}Trasladar</a><a class="btn sec" href="#/nota/${a.id}">Nota</a></div>`}
        <div class="botones">${a.fecha_baja ? (esProf() ? '<button class="btn sec peq" type="button" id="b-anular">Anular la baja</button>' : '') : `<a class="btn sec peq" href="#/baja/${a.id}">Dar de baja</a>`}
          ${puedeEditarAnimal(a) ? `<a class="btn sec peq" href="#/editar/${a.id}">Corregir datos</a>` : ''}</div>
        ${(() => { const x = retiradasHoy()[a.id]; if (!x || a.fecha_baja) return ''; const t = []; if (x.leche) t.push(`<strong>Leche no apta hasta el ${fmt(x.leche.hasta)}</strong>${a.especie === 'caprino' && esHembraRepro(a) ? ': no va al tanque' : ''} (${esc(x.leche.producto)})`); if (x.carne) t.push(`Carne no apta hasta el ${fmt(x.carne.hasta)} (${esc(x.carne.producto)})`); return `<div class="error-caja">${t.join('<br>')}</div>`; })()}
        ${a.fecha_baja || S.faltaSQL2 ? '' : seccionRepro(a)}
        ${S.faltaSQL3 ? '' : seccionSanidad(a)}
        ${S.faltaSQL4 || a.fecha_baja ? '' : seccionSeguimiento(a)}
        <section class="tarjeta"><h2>Datos</h2><div class="filas">
          <div><span>Especie</span><span>${esc(L.ESPECIES[a.especie].nombre)}</span></div>
          <div><span>Raza</span><span>${esc(raza(a))}</span></div>
          <div><span>Categoría</span><span>${esc(catNombre(a.categoria))}</span></div>
          <div><span>Nº de manejo (collar)</span><span>${esc(a.manejo || '—')}</span></div>
          ${a.codigo_cria ? `<div><span>Código de cría</span><span>${esc(a.codigo_cria)}</span></div>` : ''}
          <div><span>Crotal</span><span>${esc(a.crotal || '—')}</span></div>
          <div><span>Sexo</span><span>${esc(a.sexo ? (a.sexo === 'hembra' ? 'Hembra' : 'Macho') : '—')}</span></div>
          ${a.especie === 'caprino' ? `<div><span>Capa</span><span>${esc(a.capa ? L.CAPAS[a.capa] : '—')}</span></div>` : ''}
          <div><span>Origen</span><span>${esc(a.origen ? L.ORIGENES[a.origen] : '—')}</span></div>
          ${a.peso_nacimiento ? `<div><span>Peso al nacer</span><span>${esc(a.peso_nacimiento)} kg</span></div>` : ''}
          <div><span>Alta en el censo</span><span>${fmt(a.fecha_alta)}${a.alta_por ? ` · ${esc(verAlias(a.alta_por))}` : ''}</span></div>
          ${a.obs ? `<div><span>Observaciones</span><span>${esc(a.obs)}</span></div>` : ''}</div></section>
        <section class="tarjeta"><h2>Familia</h2><div class="filas">
          <div><span>Madre</span><span>${madre ? `<a href="#/animal/${madre.id}">${esc(nombreA(madre))}</a>` : esc(a.madre_txt || '—')}</span></div>
          <div><span>Padre</span><span>${padre ? `<a href="#/animal/${padre.id}">${esc(nombreA(padre))}</a>` : esc(a.padre_txt || '—')}</span></div></div>
          ${crias.length ? `<div class="suave peq" style="font-weight:700;margin-top:4px">CRÍAS (${crias.length})</div><div class="lista">${crias.map((x) => `<a class="animal-fila mini" href="#/animal/${x.id}"><div><strong>${esc(nombreA(x))}</strong><div class="suave">${esc(catNombre(x.categoria))} · ${fmt(x.fecha_nacimiento)}</div></div>${x.fecha_baja ? '<span class="chip gris">Baja</span>' : chipCat(x)}</a>`).join('')}</div>` : ''}</section>
        <section class="tarjeta"><h2>Historial</h2>${historial || '<div class="suave">Sin registros.</div>'}</section>
        ${esProf() ? '<details class="tarjeta"><summary class="suave">Borrar el animal (solo si es un error)</summary><p class="suave">Borra el animal y todo su historial. Para un animal vendido o muerto, usa «Dar de baja».</p><button class="btn peligro" type="button" id="b-borrar-animal">Borrar definitivamente</button></details>' : ''}
      </main>${navegacion('animales')}`);
    $app.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = '¿Seguro? Pulsa otra vez'; return; }
      const { error } = await sb.from('rum_eventos').delete().eq('id', b.dataset.borrar);
      if (error) return toast(traducirError(error));
      toast('Registro borrado'); refrescar();
    }));
    $app.querySelectorAll('[data-borrar-parto]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = '¿Seguro? Se borran también las crías que creó'; return; }
      const { error } = await sb.rpc('rum_borrar_parto', { p_evento: b.dataset.borrarParto });
      if (error) return toast(traducirError(error));
      toast('Parto borrado'); refrescar();
    }));
    const an = document.getElementById('b-anular');
    if (an) an.addEventListener('click', async () => {
      if (an.dataset.confirmar !== '1') { an.dataset.confirmar = '1'; an.textContent = '¿Seguro? Pulsa otra vez'; return; }
      const { error } = await sb.from('rum_animales').update({ fecha_baja: null, causa_baja: null, destino_baja: null }).eq('id', a.id);
      if (error) return toast(traducirError(error));
      toast('Baja anulada'); refrescar();
    });
    const ba = document.getElementById('b-borrar-animal');
    if (ba) ba.addEventListener('click', async () => {
      if (ba.dataset.confirmar !== '1') { ba.dataset.confirmar = '1'; ba.textContent = '¿Seguro? Se borra todo su historial. Pulsa otra vez'; return; }
      const { error } = await sb.from('rum_animales').delete().eq('id', a.id);
      if (error) return toast(traducirError(error));
      toast('Animal borrado'); await refrescar(); location.hash = '#/animales';
    });
  }

  // ---------------------------------------------------------------- formularios
  const opcionesCorralinas = (sel, vacia) => `${vacia ? `<option value="">${vacia}</option>` : ''}${[...new Set(S.corralinas.map((c) => c.nave))].map((nv) => `<optgroup label="Nave ${esc(nv)}">${S.corralinas.filter((c) => c.nave === nv && c.activa).sort((x, y) => x.numero - y.numero).map((c) => `<option value="${c.id}" ${Number(sel) === c.id ? 'selected' : ''}>${esc(nv)} · ${c.numero}${c.uso ? ` (${esc(c.uso)})` : ''}</option>`).join('')}</optgroup>`).join('')}`;
  const errorCaja = (t) => `<div class="error-caja" role="alert">${esc(t)}</div>`;

  function vistaTrasladar(id) {
    const ids = id ? [id] : ((S.borrador.traslado || {}).ids || []);
    const lista = ids.map(animal).filter((a) => a && !a.fecha_baja);
    if (!lista.length) return vistaNoEncontrado('No hay animales seleccionados.');
    const volver = id ? `#/animal/${id}` : (S.borrador.traslado.volver || '#/mapa');
    const origenes = [...new Set(lista.map((a) => ubic(a)))];
    pintar(`${cabecera({ volver, titulo: 'Trasladar', sub: lista.length === 1 ? `${esc(nombreA(lista[0]))} · ahora en ${esc(nombreCorrCorto(origenes[0]))}` : `${lista.length} animales` })}
      <main class="cuerpo"><div id="msg"></div>
        ${lista.length > 1 ? `<div class="tarjeta"><div class="suave">${lista.map((a) => esc(nombreA(a))).join(', ')}</div></div>` : ''}
        <form class="formu" id="f-tras" novalidate>
          <div class="campo"><label for="destino">Corralina de destino</label><select id="destino" name="destino" required>${opcionesCorralinas(null, 'Elige…')}</select></div>
          <div class="campo"><label for="fecha">Fecha</label><input id="fecha" name="fecha" type="date" value="${hoy()}" max="${hoy()}" required></div>
          <div class="campo"><label for="obs">Observaciones (opcional)</label><textarea id="obs" name="obs"></textarea></div>
          <button class="btn" type="submit">Guardar traslado</button></form>
      </main>${navegacion('mapa')}`);
    document.getElementById('f-tras').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target); const destino = Number(f.get('destino')); const fecha = String(f.get('fecha'));
      if (!destino || !fecha) { document.getElementById('msg').innerHTML = errorCaja('Elige la corralina y la fecha.'); return; }
      const filas = lista.filter((a) => ubic(a) !== destino).map((a) => ({ animal_id: a.id, tipo: 'traslado', fecha, datos: { de: ubic(a), a: destino, ...(f.get('obs') ? { obs: String(f.get('obs')).trim() } : {}) } }));
      if (!filas.length) { document.getElementById('msg').innerHTML = errorCaja('Ya están en esa corralina.'); return; }
      ev.target.querySelector('button').disabled = true;
      const { error } = await sb.from('rum_eventos').insert(filas);
      if (error) { ev.target.querySelector('button').disabled = false; document.getElementById('msg').innerHTML = errorCaja(traducirError(error)); return; }
      toast(`${filas.length} ${filas.length === 1 ? 'animal trasladado' : 'animales trasladados'} a ${nombreCorrCorto(destino)}`);
      S.borrador.traslado = null; await refrescar(); location.hash = volver;
    });
  }

  function vistaNota(id, evId) {
    const a = animal(id); if (!a) return vistaNoEncontrado();
    const e = evId ? S.eventos.find((x) => x.id === evId) : null;
    pintar(`${cabecera({ volver: `#/animal/${id}`, textoVolver: 'Ficha', titulo: e ? 'Corregir nota' : 'Nota', sub: esc(nombreA(a)) })}
      <main class="cuerpo">${avisoAjeno(e)}<div id="msg"></div>
        <form class="formu" id="f-nota" novalidate>
          <div class="campo"><label for="fecha">Fecha</label><input id="fecha" name="fecha" type="date" value="${e ? e.fecha : hoy()}" max="${hoy()}" required></div>
          <div class="campo"><label for="texto">Nota</label><textarea id="texto" name="texto" required>${esc(e ? e.datos.texto : '')}</textarea></div>
          <button class="btn" type="submit">Guardar</button></form>
      </main>${navegacion('animales')}`);
    document.getElementById('f-nota').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target); const texto = String(f.get('texto') || '').trim();
      if (!texto) { document.getElementById('msg').innerHTML = errorCaja('Escribe la nota.'); return; }
      const reg = { fecha: String(f.get('fecha')), datos: { texto } };
      const { error } = e ? await sb.from('rum_eventos').update(reg).eq('id', e.id) : await sb.from('rum_eventos').insert({ animal_id: a.id, tipo: 'nota', ...reg });
      if (error) { document.getElementById('msg').innerHTML = errorCaja(traducirError(error)); return; }
      toast('Nota guardada'); await refrescar(); location.hash = `#/animal/${a.id}`;
    });
  }

  // ---- Corregir un registro de la ficha (fecha, datos principales y observaciones)
  const CAMPOS_EV = {
    eco: [['resultado', 'Resultado', 'radio', [['gestante', 'Gestante'], ['vacia', 'Vacía']]], ['fetos', 'Fetos (si gestante)', 'number']],
    encalostrado: [['resultado', '¿Cómo ha tomado el calostro?', 'radio', [['Correcto', 'Solo, sin problemas'], ['Con ayuda', 'Con ayuda'], ['Con biberón o sonda', 'Biberón o sonda']]]],
    destete: [['peso', 'Peso (kg)', 'number'], ['destino', 'Destino', 'text']],
    condicion: [['cc', 'Condición corporal (1–5)', 'number'], ['famacha', 'FAMACHA (1–5)', 'number']],
    lechero: [['litros', 'Litros', 'number']],
  };
  function vistaCorregirEv(id, evId) {
    const a = animal(id); const e = S.eventos.find((x) => x.id === evId);
    if (!a || !e || AUTO.includes(e.tipo)) return vistaNoEncontrado('Este registro solo lo puede corregir el profesor.');
    if (e.tipo === 'nota') return vistaNota(id, evId);
    const d = e.datos || {}; const campos = CAMPOS_EV[e.tipo] || [];
    const campo = ([k, l, t, op]) => t === 'radio'
      ? `<div class="campo"><span class="et">${esc(l)}</span><div class="opciones">${op.map(([v, tx]) => `<label><input type="radio" name="${k}" value="${esc(v)}" ${String(d[k]) === v ? 'checked' : ''}> ${esc(tx)}</label>`).join('')}</div></div>`
      : `<div class="campo"><label for="c-${k}">${esc(l)}</label><input id="c-${k}" name="${k}" type="${t}" ${t === 'number' ? 'step="0.1" min="0" inputmode="decimal"' : ''} value="${esc(d[k] ?? '')}"></div>`;
    pintar(`${cabecera({ volver: `#/animal/${id}`, textoVolver: 'Ficha', titulo: `Corregir: ${nombreEvento(e).toLowerCase()}`, sub: esc(nombreA(a)) })}
      <main class="cuerpo">${avisoAjeno(e)}<div id="msg"></div>
        <form class="formu" id="f-corr" novalidate>
          <div class="campo"><label for="c-fecha">Fecha</label><input id="c-fecha" name="fecha" type="date" value="${e.fecha}" max="${hoy()}" required></div>
          ${campos.map(campo).join('')}
          <div class="campo"><label for="c-obs">Observaciones</label><textarea id="c-obs" name="obs">${esc(d.obs || '')}</textarea></div>
          ${e.tipo === 'traslado' ? '<div class="suave peq">Si el animal fue a otra corralina, borra este traslado (o pide al profesor que lo haga) y registra el correcto.</div>' : ''}
          <button class="btn" type="submit">Guardar corrección</button></form>
      </main>${navegacion('animales')}`);
    document.getElementById('f-corr').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const x = new FormData(ev.target); const nd = { ...d };
      for (const [k, , t] of campos) { const v = String(x.get(k) ?? '').trim(); if (v === '') delete nd[k]; else nd[k] = t === 'number' ? Number(v.replace(',', '.')) : v; }
      if (e.tipo === 'eco' && nd.resultado === 'vacia') delete nd.fetos;
      const obs = String(x.get('obs') || '').trim(); if (obs) nd.obs = obs; else delete nd.obs;
      const fecha = String(x.get('fecha') || '');
      if (!fecha || fecha > hoy()) { document.getElementById('msg').innerHTML = errorCaja('Revisa la fecha.'); return; }
      const { error } = await sb.from('rum_eventos').update({ fecha, datos: nd }).eq('id', e.id);
      if (error) { document.getElementById('msg').innerHTML = errorCaja(traducirError(error)); return; }
      toast('Corrección guardada'); await refrescar(); location.hash = `#/animal/${id}`;
    });
  }

  // ---- Correcciones de alumnos (solo el profesor)
  const TABLAS_CORR = { rum_eventos: 'Registro de la ficha', rum_sanidad: 'Sanidad', rum_manejo: 'Manejo diario' };
  const META_C = ['id', 'autor', 'autor_alias', 'creado', 'modificado', 'modificado_por', 'curso', 'realizado_por'];
  function cambiosCorr(a, d) {
    const out = []; const ver = (x) => (x == null || x === '' ? '—' : Array.isArray(x) ? x.join(', ') : typeof x === 'object' ? JSON.stringify(x) : /^\d{4}-\d{2}-\d{2}$/.test(String(x)) ? fmt(x) : String(x));
    const nombre = (k) => ({ fecha: 'Fecha', resultado: 'Resultado', fetos: 'Fetos', peso: 'Peso', destino: 'Destino', cc: 'Condición corporal', famacha: 'FAMACHA', litros: 'Litros', obs: 'Observaciones', texto: 'Nota', producto: 'Producto', dosis: 'Dosis', via: 'Vía', lote: 'Lote', caducidad: 'Caducidad', motivo: 'Motivo', tareas: 'Tareas', corralinas: 'Corralinas', detalle: 'Detalle', participantes: 'Participantes', animales: 'Animales' }[k] || k.replace(/_/g, ' '));
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(d || {})])) {
      if (META_C.includes(k)) continue;
      if (k === 'datos') { const da = a.datos || {}, dd = d.datos || {}; for (const j of new Set([...Object.keys(da), ...Object.keys(dd)])) if (JSON.stringify(da[j]) !== JSON.stringify(dd[j])) out.push([nombre(j), ver(da[j]), ver(dd[j])]); continue; }
      if (JSON.stringify(a[k]) !== JSON.stringify(d[k])) out.push([nombre(k), k === 'animales' ? ver((a[k] || []).map((i) => nombreA(animal(i)))) : ver(a[k]), k === 'animales' ? ver((d[k] || []).map((i) => nombreA(animal(i)))) : ver(d[k])]);
    }
    return out;
  }
  function vistaCorrecciones(sec) {
    if (!esAdmin()) return vistaNoEncontrado();
    const lista = S.correcciones.filter((c) => (sec === 'todas' ? true : !c.revisada));
    const que = (c) => { const d = c.despues || {};
      if (c.tabla === 'rum_eventos') return [`${nombreEvento(d)} de ${nombreA(animal(d.animal_id))} · ${fmt(d.fecha)}`, `#/animal/${d.animal_id}`];
      if (c.tabla === 'rum_sanidad') return [`${L.TIPOS_SAN[d.tipo] || d.tipo}${d.producto ? ` · ${d.producto}` : ''} · ${fmt(d.fecha)}`, `#/sanidad/editar/${d.id}`];
      if (c.tabla === 'rum_manejo') return [`${(d.tareas || []).map((t) => L.TAREAS[t] || t).join(' · ')} · ${fmt(d.fecha)}`, `#/manejo/editar/${d.id}`];
      return [c.tabla, '']; };
    const tarjeta = (c) => { const cam = cambiosCorr(c.antes, c.despues); const [txt, enl] = que(c);
      return `<div class="evento"><div class="entre"><strong>${esc(TABLAS_CORR[c.tabla] || c.tabla)}</strong><span class="chip ${c.deshecha ? 'gris' : c.revisada ? '' : 'nar'}">${c.deshecha ? 'Deshecha' : c.revisada ? 'Revisada' : 'Sin revisar'}</span></div>
        <div>${enl ? `<a href="${enl}">${esc(txt)}</a>` : esc(txt)}</div>
        <div class="suave peq">Corrige <strong>${esc(quienEs(c.autor, c.autor_alias, c.curso))}</strong>${c.curso ? ` (${c.curso}.º)` : ''} · ${fechaHora(new Date(c.creado))} · registro original de ${esc(quienEs(c.antes.autor, c.antes.autor_alias, c.antes.curso))}</div>
        ${cam.length ? `<table class="tabla"><thead><tr><th>Dato</th><th>Antes</th><th>Ahora</th></tr></thead><tbody>${cam.map(([k, x, y]) => `<tr><td>${esc(k)}</td><td>${esc(x)}</td><td><strong>${esc(y)}</strong></td></tr>`).join('')}</tbody></table>` : '<div class="suave">Sin cambios visibles.</div>'}
        ${c.deshecha ? '' : `<div class="acciones">${c.revisada ? '' : `<button class="btn peq" type="button" data-rev="${c.id}">Correcta</button>`}<button class="btn peligro peq" type="button" data-deshacer="${c.id}">Deshacer</button></div>`}</div>`; };
    pintar(`${cabecera({ volver: '#/mas', textoVolver: 'Más', titulo: 'Correcciones de alumnos' })}
      <main class="cuerpo">
        <div class="suave">Cada vez que un alumno cambia un registro que hizo otra persona en CIFEARUMI. «Correcta» la da por revisada; «Deshacer» devuelve el registro a como estaba. Las de porcino están en CIFEAPORC.</div>
        ${S.faltaCorr ? '<div class="aviso-caja">Falta ejecutar en Supabase el archivo 06_porcino_correcciones.sql.</div>' : ''}
        <div class="pestanas" role="tablist"><a role="tab" href="#/correcciones/pendientes" class="${sec !== 'todas' ? 'activo' : ''}">Sin revisar (${S.correcciones.filter((c) => !c.revisada).length})</a><a role="tab" href="#/correcciones/todas" class="${sec === 'todas' ? 'activo' : ''}">Todas</a></div>
        ${sec !== 'todas' && lista.length > 1 ? '<button class="btn sec" type="button" id="rev-todas">Marcar todas como correctas</button>' : ''}
        ${lista.length ? lista.map(tarjeta).join('') : '<div class="vacio">No hay correcciones pendientes.</div>'}
      </main>${navegacion('mas')}`);
    const marcar = async (ids) => { const { error } = await sb.from('correcciones').update({ revisada: true, revisada_en: new Date().toISOString() }).in('id', ids); if (error) { toast(traducirError(error)); return false; } return true; };
    $app.querySelectorAll('[data-rev]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; if (await marcar([b.dataset.rev])) await refrescar(); else b.disabled = false; }));
    const rt = document.getElementById('rev-todas'); if (rt) rt.addEventListener('click', async () => { rt.disabled = true; if (await marcar(lista.map((c) => c.id))) { toast('Revisadas'); await refrescar(); } });
    $app.querySelectorAll('[data-deshacer]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = '¿Volver a como estaba? Pulsa otra vez'; return; }
      const c = S.correcciones.find((x) => x.id === b.dataset.deshacer); b.disabled = true;
      const fila = {}; for (const [k, x] of Object.entries(c.antes)) if (!META_C.includes(k)) fila[k] = x;
      const { error } = await sb.from(c.tabla).update(fila).eq('id', c.registro_id);
      if (error) { toast(traducirError(error)); b.disabled = false; return; }
      await sb.from('correcciones').update({ revisada: true, deshecha: true, revisada_en: new Date().toISOString() }).eq('id', c.id);
      toast('Corrección deshecha'); await refrescar();
    }));
  }

  function vistaBaja(id) {
    const a = animal(id); if (!a || a.fecha_baja) return vistaNoEncontrado();
    pintar(`${cabecera({ volver: `#/animal/${id}`, textoVolver: 'Ficha', titulo: 'Dar de baja', sub: `${esc(nombreA(a))} · ${esc(catNombre(a.categoria))}` })}
      <main class="cuerpo"><div id="msg"></div>
        <form class="formu" id="f-baja" novalidate>
          <div class="campo"><label for="fecha">Fecha de la baja</label><input id="fecha" name="fecha" type="date" value="${hoy()}" max="${hoy()}" required></div>
          <div class="campo"><span class="et" id="et-causa">Causa</span><div class="opciones" role="radiogroup" aria-labelledby="et-causa">
            ${L.CAUSAS_BAJA.map((c) => `<label><input type="radio" name="causa" value="${esc(c)}"> ${esc(c)}</label>`).join('')}</div></div>
          <div class="campo"><label for="destino">Destino o detalle</label><input id="destino" name="destino" type="text" placeholder="Comprador, matadero, causa de la muerte…">
            <span class="ayuda">${a.manejo ? `El collar ${esc(a.manejo)} quedará libre para otro animal.` : ''}</span></div>
          <button class="btn peligro" type="submit">Dar de baja</button></form>
      </main>${navegacion('animales')}`);
    document.getElementById('f-baja').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      if (!f.get('causa')) { document.getElementById('msg').innerHTML = errorCaja('Indica la causa de la baja.'); return; }
      if (String(f.get('fecha')) < a.fecha_alta) { document.getElementById('msg').innerHTML = errorCaja('La baja no puede ser anterior al alta.'); return; }
      const { error } = await sb.from('rum_animales').update({ fecha_baja: String(f.get('fecha')), causa_baja: String(f.get('causa')), destino_baja: String(f.get('destino') || '').trim() || null }).eq('id', a.id);
      if (error) { document.getElementById('msg').innerHTML = errorCaja(traducirError(error)); return; }
      toast(`${nombreA(a)} dado de baja`); await refrescar(); location.hash = `#/animal/${a.id}`;
    });
  }

  // Alta o corrección de datos de un animal.
  function vistaFormAnimal(id) {
    const a = id ? animal(id) : null;
    if (id && (!a || !puedeEditarAnimal(a))) return vistaNoEncontrado('No puedes corregir los datos de este animal: pídeselo al profesor.');
    const v = S.borrador.formAnimal && S.borrador.formAnimal.id === (id || null) ? S.borrador.formAnimal.v : (a ? { ...a } : { especie: 'caprino', fecha_alta: hoy(), origen: 'centro' });
    const esp = v.especie;
    const madres = activos().filter((x) => x.especie === esp && ['cabra', 'oveja', 'chiva', 'cordera'].includes(x.categoria) && x.id !== id).sort(L.ordenNatural);
    const padres = activos().filter((x) => x.especie === esp && ['macho_cabrio', 'morueco'].includes(x.categoria) && x.id !== id).sort(L.ordenNatural);
    const incluye = (lista, x) => (x && !lista.find((y) => y.id === x) && animal(x) ? [animal(x), ...lista] : lista);
    const opt = (lista, sel) => `<option value="">— Sin anotar —</option>${incluye(lista, sel).map((x) => `<option value="${x.id}" ${sel === x.id ? 'selected' : ''}>${esc(nombreA(x))}${x.fecha_baja ? ' (baja)' : ''}</option>`).join('')}`;
    pintar(`${cabecera({ volver: a ? `#/animal/${a.id}` : '#/animales', textoVolver: a ? 'Ficha' : 'Animales', titulo: a ? `Corregir ${nombreA(a)}` : 'Alta de un animal' })}
      <main class="cuerpo"><div id="msg"></div>
        <form class="formu" id="f-animal" novalidate>
          <div class="campo"><span class="et">Especie</span><div class="opciones">${Object.entries(L.ESPECIES).map(([k, x]) => `<label><input type="radio" name="especie" value="${k}" ${esp === k ? 'checked' : ''}> ${x.nombre}</label>`).join('')}</div></div>
          <div class="campo"><label for="categoria">Categoría</label><select id="categoria" name="categoria"><option value="">Elige…</option>${Object.entries(L.CAT).filter(([, x]) => x.especie === esp).map(([k, x]) => `<option value="${k}" ${v.categoria === k ? 'selected' : ''}>${x.nombre}</option>`).join('')}</select></div>
          <div class="campo"><span class="et">Sexo</span><div class="opciones"><label><input type="radio" name="sexo" value="hembra" ${v.sexo === 'hembra' ? 'checked' : ''}> Hembra</label><label><input type="radio" name="sexo" value="macho" ${v.sexo === 'macho' ? 'checked' : ''}> Macho</label></div></div>
          <div class="dos"><div class="campo"><label for="manejo">Nº de manejo (collar)</label><input id="manejo" name="manejo" type="text" autocapitalize="characters" value="${esc(v.manejo || '')}" placeholder="A12"></div>
            <div class="campo"><label for="crotal">Crotal</label><input id="crotal" name="crotal" type="text" inputmode="numeric" value="${esc(v.crotal || '')}" placeholder="724…"></div></div>
          <div class="ayuda suave">Las crías se registran sin crotal ni collar: la app les da un código con el nº de la madre (A12-1). Al acrotalarlas, pasan a chiva o cordera de reposición.</div>
          ${esp === 'caprino' ? `<div class="campo"><span class="et">Capa</span><div class="opciones"><label><input type="radio" name="capa" value="" ${!v.capa ? 'checked' : ''}> Sin anotar</label>${Object.entries(L.CAPAS).map(([k, x]) => `<label><input type="radio" name="capa" value="${k}" ${v.capa === k ? 'checked' : ''}> ${x}</label>`).join('')}</div></div>` : ''}
          <div class="campo"><label for="raza">Raza</label><input id="raza" name="raza" type="text" list="razas" value="${esc(v.raza || '')}" placeholder="${esc(L.ESPECIES[esp].raza)}">
            <datalist id="razas"><option value="${esc(L.ESPECIES[esp].raza)}"><option value="Cruce"></datalist><span class="ayuda">Si se deja vacía, es ${esc(L.ESPECIES[esp].raza.toLowerCase())}${esp === 'caprino' ? ' (o cruce, si la capa es bicolor)' : ''}. Para animales no puros, escribe «Cruce» o la raza que sea.</span></div>
          <div class="dos"><div class="campo"><label for="fecha_nacimiento">Fecha de nacimiento</label><input id="fecha_nacimiento" name="fecha_nacimiento" type="date" max="${hoy()}" value="${esc(v.fecha_nacimiento || '')}"></div>
            <div class="campo"><label for="anio_nacimiento">o año aproximado</label><input id="anio_nacimiento" name="anio_nacimiento" type="number" min="1990" max="2100" value="${esc(v.anio_nacimiento || '')}"></div></div>
          <div class="dos"><div class="campo"><label for="madre_id">Madre</label><select id="madre_id" name="madre_id">${opt(madres, v.madre_id)}</select>${v.madre_txt ? `<span class="ayuda">Anotada como «${esc(v.madre_txt)}» (no está en el censo)</span>` : ''}</div>
            <div class="campo"><label for="padre_id">Padre</label><select id="padre_id" name="padre_id">${opt(padres, v.padre_id)}</select>${v.padre_txt ? `<span class="ayuda">Anotado como «${esc(v.padre_txt)}»</span>` : ''}</div></div>
          <div class="campo"><label for="origen">Origen</label><select id="origen" name="origen"><option value="">—</option>${Object.entries(L.ORIGENES).map(([k, x]) => `<option value="${k}" ${v.origen === k ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
          ${a ? '' : `<div class="dos"><div class="campo"><label for="corralina_id">Corralina</label><select id="corralina_id" name="corralina_id">${opcionesCorralinas(v.corralina_id, 'Elige…')}</select></div>
            <div class="campo"><label for="fecha_alta">Fecha de alta</label><input id="fecha_alta" name="fecha_alta" type="date" max="${hoy()}" value="${esc(v.fecha_alta || hoy())}"></div></div>
            <div class="campo"><label for="motivo_alta">Motivo del alta</label><select id="motivo_alta" name="motivo_alta"><option>Nacimiento</option><option>Compra</option><option>Otro</option></select></div>`}
          <div class="campo"><label for="obs">Observaciones</label><textarea id="obs" name="obs">${esc(v.obs || '')}</textarea></div>
          <button class="btn" type="submit">${a ? 'Guardar cambios' : 'Dar de alta'}</button></form>
      </main>${navegacion('animales')}`);
    const form = document.getElementById('f-animal');
    const leer = () => {
      const f = new FormData(form); const o = {};
      for (const k of ['especie', 'categoria', 'sexo', 'manejo', 'crotal', 'capa', 'raza', 'fecha_nacimiento', 'anio_nacimiento', 'madre_id', 'padre_id', 'origen', 'corralina_id', 'fecha_alta', 'motivo_alta', 'obs']) {
        const x = f.get(k); o[k] = x === null ? (k in v ? v[k] : null) : String(x).trim() || null;
      }
      o.madre_txt = o.madre_id ? null : v.madre_txt || null; o.padre_txt = o.padre_id ? null : v.padre_txt || null;
      if (o.especie !== 'caprino') o.capa = null;
      if (o.capa === 'bicolor' && !o.raza) o.raza = 'Cruce';
      if (o.manejo) o.manejo = o.manejo.toUpperCase();
      if (o.crotal) o.crotal = o.crotal.replace(/\s/g, '').toUpperCase();
      o.anio_nacimiento = o.anio_nacimiento ? Number(o.anio_nacimiento) : null;
      o.corralina_id = o.corralina_id ? Number(o.corralina_id) : null;
      return o;
    };
    form.querySelectorAll('input[name=capa]').forEach((r) => r.addEventListener('change', () => { const z = document.getElementById('raza'); if (r.checked && r.value === 'bicolor' && !z.value.trim()) z.value = 'Cruce'; }));
    form.querySelectorAll('input[name=especie]').forEach((r) => r.addEventListener('change', () => { const o = leer(); o.categoria = null; o.madre_id = null; o.padre_id = null; S.borrador.formAnimal = { id: id || null, v: { ...v, ...o } }; vistaFormAnimal(id); }));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const o = leer(); const msg = (t) => { document.getElementById('msg').innerHTML = errorCaja(t); window.scrollTo(0, 0); };
      const cat = L.CAT[o.categoria];
      if (!cat) return msg('Elige la categoría.');
      if (cat.sexo && o.sexo && cat.sexo !== o.sexo) return msg('El sexo no cuadra con la categoría.');
      if (cat.sexo) o.sexo = cat.sexo;
      if (cat.cria && !o.madre_id && !o.madre_txt) return msg('Una cría necesita su madre.');
      if (!cat.cria && !o.manejo && !o.crotal) return msg('Anota el nº de collar o el crotal.');
      if (!a && !o.corralina_id) return msg('Elige la corralina.');
      if (o.anio_nacimiento && !(o.anio_nacimiento >= 1990 && o.anio_nacimiento <= 2100)) return msg('Año de nacimiento no válido.');
      const boton = form.querySelector('button[type=submit]'); boton.disabled = true;
      let res;
      if (a) {
        const cambios = {};
        for (const k of ['categoria', 'sexo', 'manejo', 'crotal', 'capa', 'raza', 'fecha_nacimiento', 'anio_nacimiento', 'madre_id', 'padre_id', 'madre_txt', 'padre_txt', 'origen', 'obs', 'especie']) if ((o[k] ?? null) !== (a[k] ?? null)) cambios[k] = o[k];
        if (!Object.keys(cambios).length) { boton.disabled = false; location.hash = `#/animal/${a.id}`; return; }
        res = await sb.from('rum_animales').update(cambios).eq('id', a.id).select();
      } else {
        const { motivo_alta: motivo, ...resto } = o;
        if (!resto.raza) delete resto.raza;
        res = await sb.from('rum_animales').insert({ ...resto, motivo_alta: motivo || 'Nacimiento' }).select();
      }
      if (res.error) { boton.disabled = false; return msg(traducirError(res.error)); }
      S.borrador.formAnimal = null;
      const nuevo = res.data && res.data[0];
      toast(a ? 'Cambios guardados' : `${nuevo ? nombreA(nuevo) : 'Animal'} dado de alta`);
      await refrescar(); location.hash = `#/animal/${a ? a.id : nuevo.id}`;
    });
  }

  // ---------------------------------------------------------------- reproducción
  // Sección de la ficha: estado de la hembra, lote, ventana de parto, partos; o acciones de la cría.
  function seccionRepro(a) {
    if (esHembraRepro(a)) {
      const r = estR(a); const h = hoy();
      const partos = r.partos.slice().reverse();
      const btn = (href, t, prin) => `<a class="btn ${prin ? '' : 'sec'} peq" href="${href}">${t}</a>`;
      const acciones = [];
      if (['lote', 'cubierta', 'gestante'].includes(r.estado)) acciones.push(btn(`#/eco/animal/${a.id}`, 'Ecografía', r.estado === 'cubierta'));
      if (!['lactacion', 'criando'].includes(r.estado) || (r.diasParto ?? 99) > 30) acciones.push(btn(`#/parto/${a.id}`, 'Registrar parto', r.estado === 'gestante'));
      if (r.estado === 'lactacion' && !r.ordeno) acciones.push(btn(`#/registro/inicio_ordeno/${a.id}`, 'Inicio del ordeño', true));
      if (r.estado === 'lactacion') acciones.push(btn(`#/registro/secado/${a.id}`, 'Secado'));
      return `<section class="tarjeta"><div class="entre"><h2>Reproducción</h2>${chipEstado(r)}</div><div class="filas">
        ${r.lote ? `<div><span>Lote</span><span><a href="#/lote/${r.lote.id}">${esc(r.lote.nombre)}</a></span></div>
          <div><span>Macho</span><span>${fmt(r.lote.fecha_entrada)} → ${r.lote.fecha_salida ? fmt(r.lote.fecha_salida) : 'sigue en el lote'}</span></div>` : ''}
        ${r.ventana ? `<div><span>Partos previstos</span><span>${corta(r.ventana.desde)} – ${corta(r.ventana.hasta)}</span></div>` : ''}
        ${r.estado === 'cubierta' && r.ecoDesde ? `<div><span>Ecografía</span><span>desde el ${fmt(r.ecoDesde)}</span></div>` : ''}
        ${r.eco && ['gestante'].includes(r.estado) ? `<div><span>Ecografía</span><span>${fmt(r.eco.fecha)} · ${r.eco.datos.fetos ? `${esc(r.eco.datos.fetos)} fetos` : 'gestante'}</span></div>` : ''}
        ${r.parto && ['lactacion', 'criando', 'seca'].includes(r.estado) ? `<div><span>Último parto</span><span>${fmt(r.parto.fecha)} · hace ${r.diasParto} días</span></div>` : ''}
        ${r.estado === 'lactacion' ? `<div><span>Ordeño</span><span>${r.ordeno ? `desde el ${fmt(r.ordeno.fecha)}` : 'sin empezar'}</span></div>` : ''}
        <div><span>Partos registrados</span><span>${partos.length}</span></div></div>
        ${acciones.length ? `<div class="botones">${acciones.join('')}</div>` : ''}
        ${partos.length ? `<table class="tabla"><thead><tr><th>Parto</th><th>Tipo</th><th class="num">Vivas</th><th class="num">Muertas</th></tr></thead><tbody>${partos.map((e) => `<tr><td>${fmt(e.fecha)}</td><td>${esc(TIPO_PARTO[e.datos.tipo] || 'Normal')}</td><td class="num">${+e.datos.vivas || 0}</td><td class="num">${+e.datos.muertas || 0}</td></tr>`).join('')}</tbody></table>` : ''}
        ${r.estado === 'vacia' && !r.lote ? '<div class="suave peq">Entrará en reproducción cuando se forme un lote con macho en su corralina (Reprod. → Nuevo lote).</div>' : ''}</section>`;
    }
    if (L.esCria(a)) {
      const evs = S.porAnimal[a.id] || [];
      const enc = evs.find((e) => e.tipo === 'encalostrado'); const des = evs.find((e) => e.tipo === 'destete');
      return `<section class="tarjeta"><h2>Cría</h2><div class="filas">
        <div><span>Encalostrado</span><span>${enc ? `${fmt(enc.fecha)} · ${esc(enc.datos.resultado || 'Correcto')}` : 'sin anotar'}</span></div>
        <div><span>Destete</span><span>${des ? `${fmt(des.fecha)}${des.datos.peso ? ` · ${esc(des.datos.peso)} kg` : ''} · ${esc(des.datos.destino || '')}` : 'sin destetar'}</span></div></div>
        <div class="botones">${enc ? '' : `<a class="btn sec peq" href="#/registro/encalostrado/${a.id}">Encalostrado</a>`}${des ? '' : `<a class="btn sec peq" href="#/registro/destete/${a.id}">Destete</a>`}
          <a class="btn sec peq" href="#/acrotalar/${a.id}">Acrotalar (se queda)</a></div>
        <div class="suave peq">Si se vende, usa «Dar de baja» con la causa «Venta».</div></section>`;
    }
    if (L.MACHOS.includes(a.categoria)) {
      const ls = S.lotes.filter((l) => (l.machos || []).includes(a.id));
      return ls.length ? `<section class="tarjeta"><h2>Lotes de cubrición</h2><div class="lista">${ls.map((l) => `<a class="animal-fila mini" href="#/lote/${l.id}"><div><strong>${esc(l.nombre)}</strong><div class="suave">${fmt(l.fecha_entrada)} → ${l.fecha_salida ? fmt(l.fecha_salida) : 'en curso'} · ${l.hembras.length} hembras</div></div>${l.fecha_salida ? '' : '<span class="chip nar">En curso</span>'}</a>`).join('')}</div></section>` : '';
    }
    return '';
  }

  function vistaRepro(tab) {
    const esp = S.borrador.espRepro || '';
    const pest = [['lotes', 'Lotes'], ['hembras', 'Hembras'], ['paridera', 'Paridera']];
    let cuerpo = '';
    if (tab === 'lotes') {
      const act = S.lotes.filter((l) => !l.fecha_salida); const ant = S.lotes.filter((l) => l.fecha_salida);
      const fila = (l) => { const pend = l.fecha_salida ? l.hembras.map(animal).filter((h) => h && !h.fecha_baja && estR(h).lote && estR(h).lote.id === l.id && estR(h).estado === 'cubierta').length : 0;
        return `<a class="animal-fila" href="#/lote/${l.id}"><div><strong>${esc(l.nombre)}</strong><div class="suave">${esc(L.ESPECIES[l.especie].nombre)} · ${esc(nombreCorrCorto(l.corralina_id))} · ${l.hembras.length} hembras · machos: ${l.machos.map((x) => esc(nombreA(animal(x)))).join(', ') || '—'}</div>
          <div class="suave peq">Macho ${fmt(l.fecha_entrada)} → ${l.fecha_salida ? fmt(l.fecha_salida) : 'en el lote'}</div></div>${l.fecha_salida ? (pend ? `<span class="chip nar">${pend} sin eco</span>` : '') : '<span class="chip nar">En curso</span>'}</a>`; };
      cuerpo = `<a class="btn" href="#/lote/nuevo">${ICONOS.mas}Nuevo lote de cubrición</a>
        <div class="suave">El macho va a la corralina de las hembras. Al sacarlo vuelve a su corralina; la ecografía se hace a partir de ${L.REF.ecoTrasSalida} días.</div>
        ${act.length ? `<h2>En curso</h2><div class="lista">${act.map(fila).join('')}</div>` : ''}
        <h2>Anteriores</h2><div class="lista">${ant.map(fila).join('') || '<div class="vacio">Todavía no hay lotes cerrados.</div>'}</div>`;
    } else if (tab === 'hembras') {
      const hs = activos().filter((a) => esHembraRepro(a) && (!esp || a.especie === esp)).map((a) => ({ a, r: estR(a) }));
      const orden = ['lote', 'cubierta', 'gestante', 'lactacion', 'criando', 'seca', 'vacia'];
      cuerpo = `<div class="pestanas">${[['', 'Todas'], ['caprino', 'Cabras'], ['ovino', 'Ovejas']].map(([k, x]) => `<button type="button" data-esp="${k}" class="${esp === k ? 'activo' : ''}">${x}</button>`).join('')}</div>
        ${orden.map((est) => { const g = hs.filter((x) => x.r.estado === est).sort((x, y) => String(x.r.ventana ? x.r.ventana.desde : '').localeCompare(String(y.r.ventana ? y.r.ventana.desde : '')) || L.ordenNatural(x.a, y.a)); if (!g.length) return '';
          return `<details class="tarjeta" ${['gestante', 'lactacion', 'cubierta', 'lote'].includes(est) ? 'open' : ''}><summary><strong>${esc(L.ESTADOS[est].nombre)}</strong>&nbsp;<span class="chip gris">${g.length}</span></summary><div class="lista">${g.map(({ a, r }) => `<a class="animal-fila mini" href="#/animal/${a.id}"><div><strong>${esc(nombreA(a))}</strong><div class="suave">${esc(catNombre(a.categoria))}${r.ventana ? ` · partos ${corta(r.ventana.desde)}–${corta(r.ventana.hasta)}` : ''}${r.parto && ['lactacion', 'criando', 'seca'].includes(r.estado) ? ` · parió hace ${r.diasParto} d` : ''}${r.estado === 'lactacion' && !r.ordeno ? ' · sin ordeño' : ''}</div></div>${chipEstado(r)}</a>`).join('')}</div></details>`; }).join('') || '<div class="vacio">No hay hembras.</div>'}`;
    } else {
      const anios = [...new Set(S.eventos.filter((e) => e.tipo === 'parto').map((e) => e.fecha.slice(0, 4)).concat([hoy().slice(0, 4)]))].sort().reverse();
      const an = S.borrador.anioParidera || anios[0];
      const partos = S.eventos.filter((e) => e.tipo === 'parto' && e.fecha.startsWith(an) && (!esp || (animal(e.animal_id) || {}).especie === esp)).sort(L.porFecha).reverse();
      const R2 = L.resumenParidera(partos); const pc = (x) => (x === null ? '—' : `${Math.round(x * 100)} %`);
      const sinDestetar = activos().filter((a) => L.esCria(a) && (!esp || a.especie === esp) && !(S.porAnimal[a.id] || []).some((e) => e.tipo === 'destete')).sort((x, y) => String(x.fecha_nacimiento).localeCompare(String(y.fecha_nacimiento)));
      cuerpo = `<div class="pestanas">${[['', 'Todas'], ['caprino', 'Cabras'], ['ovino', 'Ovejas']].map(([k, x]) => `<button type="button" data-esp="${k}" class="${esp === k ? 'activo' : ''}">${x}</button>`).join('')}</div>
        <div class="campo"><label for="f-anio">Año</label><select id="f-anio">${anios.map((x) => `<option ${x === an ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div class="totales3"><div class="dato"><span class="et">Partos</span><span class="val">${R2.partos}</span></div><div class="dato"><span class="et">Nacidas vivas</span><span class="val">${R2.vivas}</span></div><div class="dato gris"><span class="et">Muertas</span><span class="val">${R2.muertas}</span></div></div>
        <section class="tarjeta"><h2>Indicadores</h2><div class="filas">
          <div><span>Prolificidad (crías nacidas por parto)</span><span>${R2.prolificidad === null ? '—' : R2.prolificidad.toFixed(2).replace('.', ',')}</span></div>
          <div><span>Mortalidad al nacer</span><span>${pc(R2.mortalidad)}</span></div>
          <div><span>Partos asistidos o distócicos</span><span>${(R2.tipos.asistido || 0) + (R2.tipos.distocico || 0)}</span></div></div>
          <div class="suave peq">Prolificidad = (vivas + muertas) ÷ partos. Mortalidad = muertas ÷ (vivas + muertas).</div></section>
        <section class="tarjeta"><h2>Partos de ${an}</h2>${partos.map((e) => { const m = animal(e.animal_id); return `<a class="evento enlace" href="#/animal/${e.animal_id}"><div class="entre"><strong>${esc(nombreA(m))}</strong><span class="suave">${fmt(e.fecha)}</span></div><div class="suave peq">${resumenEvento(e)}</div></a>`; }).join('') || '<div class="suave">Sin partos registrados.</div>'}</section>
        <section class="tarjeta"><h2>Crías sin destetar (${sinDestetar.length})</h2><div class="lista">${sinDestetar.map((c) => `<a class="animal-fila mini" href="#/animal/${c.id}"><div><strong>${esc(nombreA(c))}</strong><div class="suave">${esc(catNombre(c.categoria))} · ${esc(L.edad(c, hoy()))}${c.sexo ? ` · ${c.sexo}` : ''}</div></div>${chipCat(c)}</a>`).join('') || '<div class="suave">Ninguna.</div>'}</div></section>`;
    }
    pintar(`${cabecera()}
      <main class="cuerpo">${faltaSQLCaja()}${faltaSQL2Caja()}
        <h1 style="font-size:22px">Reproducción</h1>
        <div class="pestanas">${pest.map(([k, x]) => `<a href="#/reproduccion/${k}" class="${tab === k ? 'activo' : ''}">${x}</a>`).join('')}</div>
        ${cuerpo}
      </main>${navegacion('repro')}`);
    $app.querySelectorAll('[data-esp]').forEach((x) => x.addEventListener('click', () => { S.borrador.espRepro = x.dataset.esp; vistaRepro(tab); }));
    const fa = document.getElementById('f-anio'); if (fa) fa.addEventListener('change', () => { S.borrador.anioParidera = fa.value; vistaRepro(tab); });
  }

  function vistaLote(id) {
    const l = loteDe(id); if (!l) return vistaNoEncontrado('No se ha encontrado ese lote.');
    const hs = l.hembras.map(animal).filter(Boolean).sort(L.ordenNatural);
    const pend = hs.filter((h) => !h.fecha_baja && estR(h).lote && estR(h).lote.id === l.id && estR(h).estado === 'cubierta');
    const g = L.REF.gestacion[l.especie]; const ecoDesde = l.fecha_salida ? L.sumarDias(l.fecha_salida, L.REF.ecoTrasSalida) : null;
    const puedeBorrar = esProf() || (l.autor === uid() && Date.now() - new Date(l.creado).getTime() < 864e5);
    pintar(`${cabecera({ volver: '#/reproduccion/lotes', textoVolver: 'Lotes', titulo: l.nombre, sub: `${esc(L.ESPECIES[l.especie].nombre)} · ${esc(nombreCorr(l.corralina_id))}` })}
      <main class="cuerpo">
        <div class="dos"><div class="dato ${l.fecha_salida ? 'gris' : 'nar'}"><span class="et">Macho</span><span class="val peq-val">${l.fecha_salida ? 'Fuera' : 'En el lote'}</span><span class="nota">${fmt(l.fecha_entrada)} → ${l.fecha_salida ? fmt(l.fecha_salida) : `${L.dias(l.fecha_entrada, hoy())} días`}</span></div>
          <div class="dato"><span class="et">Partos previstos</span><span class="val peq-val">${corta(L.sumarDias(l.fecha_entrada, g))} – ${corta(L.sumarDias(l.fecha_salida || hoy(), g))}</span><span class="nota">Gestación de ${g} días</span></div></div>
        ${l.fecha_salida ? '' : `<a class="btn" href="#/sacar/${l.id}">Sacar el macho</a>`}
        ${l.fecha_salida && pend.length ? `<a class="btn ${hoy() >= ecoDesde ? '' : 'sec'}" href="#/eco/lote/${l.id}">Ecografía del lote (${pend.length})</a>${hoy() < ecoDesde ? `<div class="suave">La ecografía toca a partir del ${fmt(ecoDesde)}.</div>` : ''}` : ''}
        <section class="tarjeta"><h2>Machos</h2><div class="lista">${l.machos.map(animal).filter(Boolean).map((m) => `<a class="animal-fila mini" href="#/animal/${m.id}"><div><strong>${esc(nombreA(m))}</strong><div class="suave">${esc(catNombre(m.categoria))} · ahora en ${esc(nombreCorrCorto(ubic(m)))}</div></div></a>`).join('') || '<div class="suave">—</div>'}</div></section>
        <section class="tarjeta"><h2>Hembras (${hs.length})</h2><div class="lista">${hs.map((h) => { const r = estR(h); const deEste = r.lote && r.lote.id === l.id; return `<a class="animal-fila mini" href="#/animal/${h.id}"><div><strong>${esc(nombreA(h))}</strong><div class="suave">${esc(catNombre(h.categoria))}${h.fecha_baja ? ' · baja' : ''}</div></div>${deEste ? chipEstado(r) : '<span class="chip gris">Otro lote</span>'}</a>`; }).join('')}</div></section>
        ${l.obs ? `<div class="tarjeta"><div class="suave">${esc(l.obs)}</div></div>` : ''}
        <div class="suave peq">Creado por ${esc(quienEs(l.autor, l.autor_alias, l.curso))}${esVet() ? '' : ` (${curso(l.curso)})`}${l.modificado ? ` · modificado por ${esc(verAlias(l.modificado_por) || '?')}` : ''}</div>
        ${puedeBorrar ? '<details class="tarjeta"><summary class="suave">Borrar el lote (solo si es un error)</summary><p class="suave">No deshace los traslados del macho ni borra ecografías: corrígelos aparte si hace falta.</p><button class="btn peligro" type="button" id="b-borrar-lote">Borrar el lote</button></details>' : ''}
      </main>${navegacion('repro')}`);
    const bb = document.getElementById('b-borrar-lote');
    if (bb) bb.addEventListener('click', async () => {
      if (bb.dataset.confirmar !== '1') { bb.dataset.confirmar = '1'; bb.textContent = '¿Seguro? Pulsa otra vez'; return; }
      const { error } = await sb.from('rum_lotes').delete().eq('id', l.id);
      if (error) return toast(traducirError(error));
      toast('Lote borrado'); await refrescar(); location.hash = '#/reproduccion/lotes';
    });
  }

  function vistaLoteNuevo() {
    const v = S.borrador.loteNuevo || (S.borrador.loteNuevo = { especie: 'caprino', corralina: null, fecha: hoy(), quitadas: [], machos: [] });
    const enCorr = v.corralina ? activos().filter((a) => a.especie === v.especie && esHembraRepro(a) && ubic(a) === Number(v.corralina)).sort(L.ordenNatural) : [];
    const machos = activos().filter((a) => a.especie === v.especie && L.MACHOS.includes(a.categoria)).sort(L.ordenNatural);
    const ocupado = (h) => { const r = estR(h); return r.estado === 'lote' ? 'ya está con macho' : r.estado === 'gestante' ? 'gestante' : ''; };
    const c = corralina(v.corralina); const d = new Date(`${v.fecha}T12:00:00`);
    const nombreDef = c ? `Lote ${c.nave === 'Cría y Ordeño' ? 'CyO' : 'MyO'}-${c.numero} · ${MESES[d.getMonth()]} ${d.getFullYear()}` : '';
    pintar(`${cabecera({ volver: '#/reproduccion/lotes', textoVolver: 'Lotes', titulo: 'Nuevo lote de cubrición' })}
      <main class="cuerpo"><div id="msg"></div>
        <form class="formu" id="f-lote" novalidate>
          <div class="campo"><span class="et">Especie</span><div class="opciones">${Object.entries(L.ESPECIES).map(([k, x]) => `<label><input type="radio" name="especie" value="${k}" ${v.especie === k ? 'checked' : ''}> ${x.nombre}</label>`).join('')}</div></div>
          <div class="campo"><label for="corralina">Corralina de las hembras</label><select id="corralina" name="corralina">${opcionesCorralinas(v.corralina, 'Elige…')}</select></div>
          ${v.corralina ? `<fieldset><legend>Hembras del lote (${enCorr.length - v.quitadas.filter((x) => enCorr.some((h) => h.id === x)).length})</legend>
            ${enCorr.length ? `<div class="lista">${enCorr.map((h) => `<label class="animal-fila check mini"><input type="checkbox" name="hembra" value="${h.id}" ${v.quitadas.includes(h.id) ? '' : 'checked'}><div><strong>${esc(nombreA(h))}</strong><div class="suave">${esc(catNombre(h.categoria))}${ocupado(h) ? ` · <span class="rojo">${ocupado(h)}</span>` : ''}</div></div></label>`).join('')}</div>` : '<div class="suave">No hay hembras de esta especie en esa corralina.</div>'}</fieldset>` : ''}
          <fieldset><legend>Machos</legend>${machos.length ? `<div class="lista">${machos.map((m) => `<label class="animal-fila check mini"><input type="checkbox" name="macho" value="${m.id}" ${v.machos.includes(m.id) ? 'checked' : ''}><div><strong>${esc(nombreA(m))}</strong><div class="suave">${esc(catNombre(m.categoria))} · ahora en ${esc(nombreCorrCorto(ubic(m)))}</div></div></label>`).join('')}</div>` : '<div class="suave">No hay machos de esta especie en el censo.</div>'}
            <span class="ayuda">Los machos se trasladan solos a la corralina de las hembras. Sirve también como efecto macho.</span></fieldset>
          <div class="dos"><div class="campo"><label for="fecha">Entrada del macho</label><input id="fecha" name="fecha" type="date" value="${v.fecha}" max="${hoy()}"></div>
            <div class="campo"><label for="nombre">Nombre del lote</label><input id="nombre" name="nombre" type="text" value="${esc(v.nombre || nombreDef)}"></div></div>
          <div class="campo"><label for="obs">Observaciones (opcional)</label><textarea id="obs" name="obs">${esc(v.obs || '')}</textarea></div>
          <button class="btn" type="submit">Crear el lote</button></form>
      </main>${navegacion('repro')}`);
    const f = document.getElementById('f-lote');
    const leer = () => { const x = new FormData(f); v.especie = x.get('especie'); v.fecha = x.get('fecha') || hoy(); v.nombre = String(x.get('nombre') || '').trim() || null; v.obs = String(x.get('obs') || ''); v.machos = x.getAll('macho');
      const marcadas = new Set(x.getAll('hembra')); v.quitadas = enCorr.filter((h) => !marcadas.has(h.id)).map((h) => h.id); };
    f.querySelectorAll('input[name=especie]').forEach((r) => r.addEventListener('change', () => { leer(); v.machos = []; v.quitadas = []; v.nombre = null; vistaLoteNuevo(); }));
    document.getElementById('corralina').addEventListener('change', (ev) => { leer(); v.corralina = ev.target.value ? Number(ev.target.value) : null; v.quitadas = []; v.nombre = null; vistaLoteNuevo(); });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); leer();
      const msg = (t) => { document.getElementById('msg').innerHTML = errorCaja(t); window.scrollTo(0, 0); };
      const hembras = enCorr.filter((h) => !v.quitadas.includes(h.id)).map((h) => h.id);
      if (!v.corralina) return msg('Elige la corralina de las hembras.');
      if (!hembras.length) return msg('El lote necesita al menos una hembra.');
      if (!v.machos.length) return msg('Elige al menos un macho.');
      const b = f.querySelector('button[type=submit]'); b.disabled = true;
      const d2 = new Date(`${v.fecha}T12:00:00`); const def2 = c ? `Lote ${c.nave === 'Cría y Ordeño' ? 'CyO' : 'MyO'}-${c.numero} · ${MESES[d2.getMonth()]} ${d2.getFullYear()}` : '';
      const nombre = !v.nombre || v.nombre === nombreDef ? def2 : v.nombre;
      const { data, error } = await sb.from('rum_lotes').insert({ especie: v.especie, nombre, corralina_id: Number(v.corralina), machos: v.machos, hembras, fecha_entrada: v.fecha, obs: v.obs.trim() || null }).select();
      if (error) { b.disabled = false; return msg(traducirError(error)); }
      const lote = data[0];
      const tras = v.machos.map(animal).filter((m) => ubic(m) !== Number(v.corralina)).map((m) => ({ animal_id: m.id, tipo: 'traslado', fecha: v.fecha, datos: { de: ubic(m), a: Number(v.corralina), lote: lote.id } }));
      if (tras.length) { const r2 = await sb.from('rum_eventos').insert(tras); if (r2.error) toast(`Lote creado, pero falló el traslado del macho: ${traducirError(r2.error)}`); }
      S.borrador.loteNuevo = null; toast(`${nombre} creado`); await refrescar(); location.hash = `#/lote/${lote.id}`;
    });
  }

  function vistaSacar(id) {
    const l = loteDe(id); if (!l || l.fecha_salida) return vistaNoEncontrado('Ese lote ya no tiene el macho.');
    const machos = l.machos.map(animal).filter((m) => m && !m.fecha_baja);
    const origen = (m) => { const t = (S.porAnimal[m.id] || []).filter((e) => e.tipo === 'traslado' && e.datos && e.datos.lote === l.id).sort(L.porFecha)[0]; return t ? t.datos.de : null; };
    pintar(`${cabecera({ volver: `#/lote/${id}`, textoVolver: 'Lote', titulo: 'Sacar el macho', sub: esc(l.nombre) })}
      <main class="cuerpo"><div id="msg"></div>
        <form class="formu" id="f-sacar" novalidate>
          <div class="campo"><label for="fecha">Fecha de salida</label><input id="fecha" name="fecha" type="date" value="${hoy()}" min="${l.fecha_entrada}" max="${hoy()}"></div>
          ${machos.map((m) => `<div class="campo"><label for="d-${m.id}">${esc(nombreA(m))} vuelve a</label><select id="d-${m.id}" name="d-${m.id}">${opcionesCorralinas(origen(m) || '', 'Se queda donde está')}</select></div>`).join('')}
          <div class="suave">La ecografía se podrá hacer a partir de ${L.REF.ecoTrasSalida} días después de esta fecha.</div>
          <button class="btn" type="submit">Guardar</button></form>
      </main>${navegacion('repro')}`);
    document.getElementById('f-sacar').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const x = new FormData(ev.target); const fecha = String(x.get('fecha'));
      if (!fecha || fecha < l.fecha_entrada) { document.getElementById('msg').innerHTML = errorCaja('La salida no puede ser anterior a la entrada.'); return; }
      ev.target.querySelector('button').disabled = true;
      const { error } = await sb.from('rum_lotes').update({ fecha_salida: fecha }).eq('id', l.id);
      if (error) { ev.target.querySelector('button').disabled = false; document.getElementById('msg').innerHTML = errorCaja(traducirError(error)); return; }
      const tras = machos.map((m) => ({ m, a: Number(x.get(`d-${m.id}`)) || null })).filter((t) => t.a && t.a !== ubic(t.m)).map((t) => ({ animal_id: t.m.id, tipo: 'traslado', fecha, datos: { de: ubic(t.m), a: t.a, lote: l.id } }));
      if (tras.length) { const r2 = await sb.from('rum_eventos').insert(tras); if (r2.error) toast(traducirError(r2.error)); }
      toast('Macho fuera del lote'); await refrescar(); location.hash = `#/lote/${l.id}`;
    });
  }

  // Ecografía de una hembra o de todo un lote.
  function vistaEco(modo, id) {
    const l = modo === 'lote' ? loteDe(id) : null;
    const lista = modo === 'lote' ? (l ? l.hembras.map(animal).filter((h) => h && !h.fecha_baja && estR(h).lote && estR(h).lote.id === l.id && ['cubierta', 'lote'].includes(estR(h).estado)).sort(L.ordenNatural) : []) : [animal(id)].filter(Boolean);
    if (!lista.length) return vistaNoEncontrado('No hay hembras pendientes de ecografía.');
    const volver = l ? `#/lote/${l.id}` : `#/animal/${id}`;
    pintar(`${cabecera({ volver, textoVolver: l ? 'Lote' : 'Ficha', titulo: 'Ecografía', sub: l ? esc(l.nombre) : esc(nombreA(lista[0])) })}
      <main class="cuerpo"><div id="msg"></div>
        <form class="formu" id="f-eco" novalidate>
          <div class="campo"><label for="fecha">Fecha</label><input id="fecha" name="fecha" type="date" value="${hoy()}" max="${hoy()}"></div>
          ${lista.map((h) => `<fieldset><legend>${esc(nombreA(h))}</legend>
            <div class="opciones"><label><input type="radio" name="r-${h.id}" value="gestante"> Gestante</label><label><input type="radio" name="r-${h.id}" value="vacia"> Vacía</label>${lista.length > 1 ? `<label><input type="radio" name="r-${h.id}" value="" checked> No vista</label>` : ''}</div>
            <div class="campo"><label for="f-${h.id}">Fetos (si se ven)</label><select id="f-${h.id}" name="f-${h.id}"><option value="">—</option><option>1</option><option>2</option><option>3</option><option>4</option></select></div></fieldset>`).join('')}
          <div class="campo"><label for="obs">Observaciones (opcional)</label><textarea id="obs" name="obs"></textarea></div>
          <button class="btn" type="submit">Guardar</button></form>
      </main>${navegacion('repro')}`);
    document.getElementById('f-eco').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const x = new FormData(ev.target); const fecha = String(x.get('fecha')); const obs = String(x.get('obs') || '').trim();
      const filas = lista.map((h) => ({ h, r: x.get(`r-${h.id}`), f: x.get(`f-${h.id}`) })).filter((y) => y.r).map((y) => { const lt = estR(y.h).lote; return { animal_id: y.h.id, tipo: 'eco', fecha, datos: { resultado: y.r, ...(y.r === 'gestante' && y.f ? { fetos: Number(y.f) } : {}), ...(lt ? { lote: lt.id } : {}), ...(obs ? { obs } : {}) } }; });
      if (!filas.length) { document.getElementById('msg').innerHTML = errorCaja('Marca el resultado de al menos una hembra.'); return; }
      const antes = lista.find((h) => { const lt = estR(h).lote; return lt && fecha < lt.fecha_entrada; });
      if (antes) { document.getElementById('msg').innerHTML = errorCaja(`La fecha es anterior a la entrada del macho en el lote (${fmt(estR(antes).lote.fecha_entrada)}).`); return; }
      ev.target.querySelector('button').disabled = true;
      const { error } = await sb.from('rum_eventos').insert(filas);
      if (error) { ev.target.querySelector('button').disabled = false; document.getElementById('msg').innerHTML = errorCaja(traducirError(error)); return; }
      toast(`${filas.length} ${filas.length === 1 ? 'ecografía guardada' : 'ecografías guardadas'}`); await refrescar(); location.hash = volver;
    });
  }

  function vistaParto(id) {
    const m = animal(id); if (!m || m.fecha_baja || !esHembraRepro(m)) return vistaNoEncontrado();
    const r = estR(m);
    const v = S.borrador.parto && S.borrador.parto.id === id ? S.borrador.parto : (S.borrador.parto = { id, n: (r.eco && r.eco.datos.fetos) || 1, fecha: hoy(), tipo: 'normal', crias: [] });
    const enPartos = new Set(S.eventos.filter((e) => e.tipo === 'parto').flatMap((e) => e.datos.crias || []));
    const previas = activos().filter((c) => c.madre_id === m.id && L.esCria(c) && !enPartos.has(c.id));
    const machosLote = r.lote ? r.lote.machos : [];
    const crias = Array.from({ length: v.n }, (_, i) => v.crias[i] || { sexo: '', viva: true, peso: '' });
    const pierdeCat = ['chiva', 'cordera'].includes(m.categoria);
    pintar(`${cabecera({ volver: `#/animal/${id}`, textoVolver: 'Ficha', titulo: 'Parto', sub: `${esc(nombreA(m))} · ${esc(catNombre(m.categoria))}` })}
      <main class="cuerpo"><div id="msg"></div>
        ${r.ventana ? `<div class="ok-caja">Partos previstos del ${fmt(r.ventana.desde)} al ${fmt(r.ventana.hasta)}${r.eco && r.eco.datos.fetos ? ` · ecografía: ${r.eco.datos.fetos} fetos` : ''}</div>` : ''}
        <form class="formu" id="f-parto" novalidate>
          <div class="campo"><label for="fecha">Fecha del parto</label><input id="fecha" name="fecha" type="date" value="${v.fecha}" max="${hoy()}"></div>
          <div class="campo"><span class="et">Tipo de parto</span><div class="opciones">${Object.entries(TIPO_PARTO).map(([k, x]) => `<label><input type="radio" name="tipo" value="${k}" ${v.tipo === k ? 'checked' : ''}> ${x}</label>`).join('')}</div></div>
          ${previas.length ? `<fieldset><legend>Crías ya dadas de alta</legend><div class="suave peq">Márcalas si son de este parto (por ejemplo, las del censo inicial).</div>
            ${previas.map((c) => `<label class="animal-fila check mini"><input type="checkbox" name="previa" value="${c.id}" ${(v.previas || []).includes(c.id) ? 'checked' : ''}><div><strong>${esc(nombreA(c))}</strong><div class="suave">${esc(catNombre(c.categoria))} · ${fmt(c.fecha_nacimiento)}${c.sexo ? ` · ${c.sexo}` : ''}</div></div></label>`).join('')}</fieldset>` : ''}
          <div class="contador"><span class="et" style="font-weight:700">Crías nuevas</span><div class="ctl"><button type="button" data-n="-1" aria-label="Una menos">−</button><input type="number" id="n" value="${v.n}" readonly aria-label="Número de crías"><button type="button" data-n="1" aria-label="Una más">+</button></div></div>
          ${crias.map((c, i) => `<fieldset><legend>Cría ${i + 1}</legend>
            <div class="opciones"><label><input type="radio" name="s${i}" value="hembra" ${c.sexo === 'hembra' ? 'checked' : ''}> Hembra</label><label><input type="radio" name="s${i}" value="macho" ${c.sexo === 'macho' ? 'checked' : ''}> Macho</label></div>
            <div class="dos"><div class="campo"><label for="v${i}">Estado</label><select id="v${i}" name="v${i}"><option value="1" ${c.viva ? 'selected' : ''}>Viva</option><option value="0" ${c.viva ? '' : 'selected'}>Muerta</option></select></div>
              <div class="campo"><label for="p${i}">Peso (kg)</label><input id="p${i}" name="p${i}" type="number" step="0.1" min="0.5" max="15" inputmode="decimal" value="${esc(c.peso)}"></div></div></fieldset>`).join('')}
          ${machosLote.length > 1 ? `<div class="campo"><label for="padre">Padre</label><select id="padre" name="padre"><option value="">No se sabe (lote con varios machos)</option>${machosLote.map((x) => `<option value="${x}" ${v.padre === x ? 'selected' : ''}>${esc(nombreA(animal(x)))}</option>`).join('')}</select></div>` : machosLote.length === 1 ? `<div class="suave">Padre: <strong>${esc(nombreA(animal(machosLote[0])))}</strong> (el macho del lote)</div>` : ''}
          <div class="campo"><label for="asistentes">Alumnos que asistieron</label><input id="asistentes" name="asistentes" type="text" value="${esc(v.asistentes ?? yo())}"></div>
          <div class="campo"><label for="obs">Observaciones (opcional)</label><textarea id="obs" name="obs">${esc(v.obs || '')}</textarea></div>
          ${pierdeCat ? `<div class="suave">Es su primer parto: pasará de ${esc(catNombre(m.categoria).toLowerCase())} a ${m.categoria === 'chiva' ? 'cabra' : 'oveja'}.</div>` : ''}
          <div class="suave">Las crías vivas se dan de alta solas, sin crotal, con el código ${esc(m.manejo || '?')}-1, ${esc(m.manejo || '?')}-2…, en ${esc(nombreCorrCorto(ubic(m)))}.</div>
          <button class="btn" type="submit">Guardar el parto</button></form>
      </main>${navegacion('repro')}`);
    const f = document.getElementById('f-parto');
    const leer = () => { const x = new FormData(f); v.fecha = x.get('fecha') || hoy(); v.tipo = x.get('tipo') || 'normal'; v.asistentes = String(x.get('asistentes') || ''); v.obs = String(x.get('obs') || ''); v.padre = x.get('padre') || null; v.previas = x.getAll('previa');
      v.crias = crias.map((_, i) => ({ sexo: x.get(`s${i}`) || '', viva: x.get(`v${i}`) !== '0', peso: x.get(`p${i}`) || '' })); };
    f.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => { leer(); v.n = Math.max(0, Math.min(6, v.n + Number(b.dataset.n))); vistaParto(id); }));
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); leer();
      const msg = (t) => { document.getElementById('msg').innerHTML = errorCaja(t); window.scrollTo(0, 0); };
      if (!v.n && !v.previas.length) return msg('Indica al menos una cría.');
      if (r.desde && v.fecha < r.desde && ['lote', 'cubierta', 'gestante'].includes(r.estado)) return msg(`La fecha del parto es anterior a ${r.eco ? 'la ecografía' : 'la entrada del macho'} (${fmt(r.desde)}). Revísala.`);
      if (v.crias.some((c) => c.peso && !(Number(c.peso) > 0 && Number(c.peso) < 20))) return msg('Revisa los pesos (en kg, por ejemplo 3,2).');
      const b = f.querySelector('button[type=submit]'); b.disabled = true;
      const padre = machosLote.length === 1 ? machosLote[0] : v.padre;
      const { error } = await sb.rpc('rum_parto', { p_madre: m.id, p_fecha: v.fecha, p_datos: { tipo: v.tipo, asistentes: v.asistentes.trim() || null, ...(v.obs.trim() ? { obs: v.obs.trim() } : {}), ...(r.lote ? { lote: r.lote.id } : {}) },
        p_crias: v.crias.map((c) => ({ sexo: c.sexo || null, viva: c.viva, ...(c.peso ? { peso: Number(String(c.peso).replace(',', '.')) } : {}) })), p_corralina: ubic(m), p_padre: padre || null, p_existentes: v.previas });
      if (error) { b.disabled = false; return msg(traducirError(error)); }
      S.borrador.parto = null; toast('Parto guardado'); await refrescar(); location.hash = `#/animal/${m.id}`;
    });
  }

  // Registros sencillos: encalostrado, inicio del ordeño, destete y secado (uno o varios animales).
  const REGISTROS = {
    encalostrado: { titulo: 'Encalostrado', apto: (a) => L.esCria(a) },
    inicio_ordeno: { titulo: 'Inicio del ordeño', apto: (a) => a.especie === 'caprino' && esHembraRepro(a) && estR(a).estado === 'lactacion' },
    destete: { titulo: 'Destete', apto: (a) => L.esCria(a) },
    secado: { titulo: 'Secado', apto: (a) => a.especie === 'caprino' && esHembraRepro(a) && estR(a).estado === 'lactacion' },
  };
  function vistaRegistro(tipo, id) {
    const T = REGISTROS[tipo]; if (!T) return vistaNoEncontrado();
    const ids = id ? [id] : ((S.borrador.grupo || {}).ids || []);
    const todos = ids.map(animal).filter((a) => a && !a.fecha_baja);
    const lista = todos.filter(T.apto); const fuera = todos.filter((a) => !T.apto(a));
    const volver = id ? `#/animal/${id}` : (S.borrador.grupo || {}).volver || '#/inicio';
    if (!lista.length) return vistaNoEncontrado(tipo === 'secado' ? 'Ninguno de los animales elegidos es una cabra en lactación.' : 'No hay animales para este registro.');
    let fechaDef = hoy();
    if (tipo === 'inicio_ordeno' && lista.length === 1) { const r = estR(lista[0]); if (r.parto) fechaDef = [L.sumarDias(r.parto.fecha, L.REF.ordenoTrasParto), hoy()].sort()[0]; }
    pintar(`${cabecera({ volver, textoVolver: id ? 'Ficha' : 'Corralina', titulo: T.titulo, sub: lista.length === 1 ? esc(nombreA(lista[0])) : `${lista.length} animales` })}
      <main class="cuerpo"><div id="msg"></div>
        ${lista.length > 1 ? `<div class="tarjeta"><div class="suave">${lista.map((a) => esc(nombreA(a))).join(', ')}</div></div>` : ''}
        ${fuera.length ? `<div class="aviso-caja">Se dejan fuera ${fuera.length} (no ${tipo === 'secado' ? 'son cabras en lactación' : 'corresponde'}): ${fuera.map((a) => esc(nombreA(a))).join(', ')}.</div>` : ''}
        <form class="formu" id="f-reg" novalidate>
          <div class="campo"><label for="fecha">${tipo === 'secado' ? 'Fecha en que quedan secas' : 'Fecha'}</label><input id="fecha" name="fecha" type="date" value="${fechaDef}" max="${hoy()}"></div>
          ${tipo === 'encalostrado' ? '<div class="campo"><span class="et">¿Cómo ha tomado el calostro?</span><div class="opciones"><label><input type="radio" name="resultado" value="Correcto" checked> Solo, sin problemas</label><label><input type="radio" name="resultado" value="Con ayuda"> Con ayuda</label><label><input type="radio" name="resultado" value="Con biberón o sonda"> Biberón o sonda</label></div></div>' : ''}
          ${tipo === 'destete' ? '<div class="campo"><label for="peso">Peso al destete (kg, opcional)</label><input id="peso" name="peso" type="number" step="0.1" min="1" max="60" inputmode="decimal"></div><div class="campo"><span class="et">Destino previsto</span><div class="opciones"><label><input type="radio" name="destino" value="Venta" checked> Venta</label><label><input type="radio" name="destino" value="Reposición"> Reposición</label></div></div>' : ''}
          ${tipo === 'secado' ? '<div class="suave">Secado natural: espaciando los ordeños y bajando la ración hasta que se secan.</div>' : ''}
          <div class="campo"><label for="obs">Observaciones (opcional)</label><textarea id="obs" name="obs"></textarea></div>
          <button class="btn" type="submit">Guardar</button></form>
      </main>${navegacion('repro')}`);
    document.getElementById('f-reg').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const x = new FormData(ev.target); const obs = String(x.get('obs') || '').trim();
      const datos = { ...(x.get('resultado') ? { resultado: x.get('resultado') } : {}), ...(x.get('peso') ? { peso: Number(String(x.get('peso')).replace(',', '.')) } : {}), ...(x.get('destino') ? { destino: x.get('destino') } : {}), ...(tipo === 'secado' ? { metodo: 'natural' } : {}), ...(obs ? { obs } : {}) };
      ev.target.querySelector('button').disabled = true;
      const { error } = await sb.from('rum_eventos').insert(lista.map((a) => ({ animal_id: a.id, tipo, fecha: String(x.get('fecha')), datos })));
      if (error) { ev.target.querySelector('button').disabled = false; document.getElementById('msg').innerHTML = errorCaja(traducirError(error)); return; }
      S.borrador.grupo = null; toast(`${T.titulo}: ${lista.length} ${lista.length === 1 ? 'animal' : 'animales'}`); await refrescar(); location.hash = volver;
    });
  }

  function vistaAcrotalar(id) {
    const c = animal(id); if (!c || c.fecha_baja || !L.esCria(c)) return vistaNoEncontrado();
    const destino = c.sexo ? catNombre(c.especie === 'caprino' ? (c.sexo === 'hembra' ? 'chiva' : 'macho_cabrio') : (c.sexo === 'hembra' ? 'cordera' : 'morueco')) : null;
    pintar(`${cabecera({ volver: `#/animal/${id}`, textoVolver: 'Ficha', titulo: 'Acrotalar', sub: `${esc(nombreA(c))} · se queda para reposición` })}
      <main class="cuerpo"><div id="msg"></div>
        ${destino ? `<div class="ok-caja">Pasará a <strong>${esc(destino.toLowerCase())}</strong>.</div>` : '<div class="aviso-caja">Falta el sexo de la cría: anótalo antes con «Corregir datos» (o pídeselo al profesor).</div>'}
        <form class="formu" id="f-acr" novalidate>
          <div class="campo"><label for="fecha">Fecha</label><input id="fecha" name="fecha" type="date" value="${hoy()}" max="${hoy()}"></div>
          <div class="campo"><label for="crotal">Crotal</label><input id="crotal" name="crotal" type="text" inputmode="numeric" placeholder="724…"></div>
          <div class="campo"><label for="manejo">Nº de manejo (collar)</label><input id="manejo" name="manejo" type="text" autocapitalize="characters" placeholder="A45"></div>
          <button class="btn" type="submit" ${destino ? '' : 'disabled'}>Guardar</button></form>
      </main>${navegacion('animales')}`);
    document.getElementById('f-acr').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const x = new FormData(ev.target); const crotal = String(x.get('crotal') || '').replace(/\s/g, '');
      if (!crotal) { document.getElementById('msg').innerHTML = errorCaja('Escribe el crotal.'); return; }
      ev.target.querySelector('button').disabled = true;
      const { error } = await sb.rpc('rum_acrotalar', { p_cria: c.id, p_fecha: String(x.get('fecha')), p_crotal: crotal, p_manejo: String(x.get('manejo') || '').trim() || null });
      if (error) { ev.target.querySelector('button').disabled = false; document.getElementById('msg').innerHTML = errorCaja(traducirError(error)); return; }
      toast(`${nombreA(c)} acrotalada`); await refrescar(); location.hash = `#/animal/${c.id}`;
    });
  }

  // ---------------------------------------------------------------- sanidad
  function destinoSan(r) {
    if (r.ambito === 'granja') return 'Toda la granja';
    if (r.ambito === 'especie') return r.especie === 'ovino' ? 'Todas las ovejas' : 'Todas las cabras';
    if (r.ambito === 'corralina') return nombreCorr(r.corralina_id);
    const n = (r.animales || []).map((x) => nombreA(animal(x)));
    return n.length > 4 ? `${n.slice(0, 4).join(', ')} y ${n.length - 4} más` : n.join(', ') || '—';
  }
  const aplicaA = (r, a) => (r.estado === 'realizado' ? (r.animales || []).includes(a.id)
    : r.ambito === 'granja' || (r.ambito === 'especie' && r.especie === a.especie) || (r.ambito === 'corralina' && r.corralina_id === ubic(a)) || (r.animales || []).includes(a.id));
  const CHIP_CAR = { obligatorio: 'rojo', recomendado: 'nar', voluntario: 'gris' };
  const CHIP_RES = { pendiente: 'nar', negativo: 'verde', positivo: 'rojo' };
  function chipsSan(r) {
    const d = r.tipo === 'analitica' ? [r.muestra && `Muestra: ${r.muestra}`, r.laboratorio && `Laboratorio: ${r.laboratorio}`].filter(Boolean).join(' · ') : '';
    const res = r.tipo === 'analitica' && r.estado === 'realizado' && r.resultado ? `<span class="chip ${CHIP_RES[r.resultado]}">Resultado: ${esc(L.RESULTADOS[r.resultado])}</span>` : '';
    const car = r.caracter ? `<span class="chip ${CHIP_CAR[r.caracter]}">${esc(L.CARACTER[r.caracter])}</span>` : '';
    return (car || res ? `<div class="chips-fila">${car}${res}</div>` : '') + (d ? `<div class="suave peq">${esc(d)}</div>` : '') + (r.tipo === 'analitica' && r.resultado_nota ? `<div class="peq">${esc(r.resultado_nota)}</div>` : '');
  }
  // Último realizado del mismo tratamiento (mismo tipo, producto o análisis y destino) antes de esa fecha.
  const mismoQue = (x, r) => x.tipo === r.tipo && (r.tipo === 'analitica' ? String(x.analisis || '').toLowerCase() === String(r.analisis || '').toLowerCase()
    : (x.medicamento_id && r.medicamento_id ? x.medicamento_id === r.medicamento_id : String(x.producto || '').toLowerCase() === String(r.producto || '').toLowerCase()));
  const mismoDestino = (x, r) => x.ambito === r.ambito && (r.ambito === 'corralina' ? x.corralina_id === r.corralina_id : r.ambito === 'especie' ? x.especie === r.especie
    : r.ambito === 'animales' ? (x.animales || []).some((id) => (r.animales || []).includes(id)) : true);
  const anteriorSan = (r) => S.sanidad.filter((x) => x.estado === 'realizado' && x.id !== r.id && x.fecha < r.fecha && mismoQue(x, r) && mismoDestino(x, r)).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  function retrasoSan(r) {
    if (r.estado !== 'previsto' || r.fecha >= hoy()) return '';
    const ant = anteriorSan(r); const d = diasEntre(r.fecha, hoy());
    return `<div class="peq rojo">${ant ? `Anterior: ${fmt(ant.fecha)} · ` : 'Sin tratamiento anterior registrado · '}Previsto: ${fmt(r.fecha)} · <strong>${d} ${d === 1 ? 'día' : 'días'} de retraso</strong></div>`;
  }
  const cancelSan = (r) => (r.estado === 'cancelado' ? `<div class="peq">Cancelado el ${fmt(r.cancelado_fecha || r.fecha)}${r.cancelado_motivo ? ` · ${esc(L.MOTIVOS_CANCEL[r.cancelado_motivo] || r.cancelado_motivo)}` : ''}${r.cancelado_detalle ? `: ${esc(r.cancelado_detalle)}` : ''}${r.cancelado_por ? ` · por ${esc(verAlias(r.cancelado_por) || '?')}` : ''}</div>` : '');
  function tarjetaSan(r, conEnlace = true) {
    const prev = r.estado === 'previsto'; const canc = r.estado === 'cancelado';
    const href = canc ? `#/sanidad/cancelar/${r.id}` : prev ? `#/sanidad/realizar/${r.id}` : `#/sanidad/editar/${r.id}`;
    const dentro = `<div class="entre"><strong>${esc(L.TIPOS_SAN[r.tipo])}${r.tipo === 'analitica' && r.analisis ? ` · ${esc(r.analisis)}` : r.producto ? ` · ${esc(r.producto)}` : ''}</strong><span class="chip ${prev ? (r.fecha < hoy() ? 'rojo' : 'nar') : 'gris'}">${canc ? `Cancelado · previsto ${corta(r.fecha)}` : prev ? (r.fecha < hoy() ? `Atrasado ${diasEntre(r.fecha, hoy())} d` : `Previsto ${corta(r.fecha)}`) : fmt(r.fecha)}</span></div>
      ${retrasoSan(r)}${cancelSan(r)}
      <div class="suave peq">${esc(destinoSan(r))}${r.dosis ? ` · ${esc(r.dosis)}` : ''}${r.via ? ` · ${esc(r.via)}` : ''}${r.duracion_dias > 1 ? ` · ${r.duracion_dias} días` : ''}${r.motivo ? ` · ${esc(r.motivo)}` : ''}</div>
      ${chipsSan(r)}
      ${r.leche_hasta || r.carne_hasta ? `<div class="peq ${(r.leche_hasta && r.leche_hasta >= hoy()) || (r.carne_hasta && r.carne_hasta >= hoy()) ? 'rojo' : 'suave'}">${r.leche_hasta ? `Leche no apta hasta ${fmt(r.leche_hasta)}` : ''}${r.leche_hasta && r.carne_hasta ? ' · ' : ''}${r.carne_hasta ? `Carne no apta hasta ${fmt(r.carne_hasta)}` : ''}</div>` : ''}
      <div class="suave peq">${prev ? `Programado por ${esc(verAlias(r.autor_alias, r.curso) || '?')}` : `Por ${esc(verAlias(r.realizado_por || r.autor_alias) || '?')}`}${r.veterinario ? ` · prescribe ${esc(r.veterinario)}` : ''}</div>`;
    return conEnlace ? `<a class="evento enlace" href="${href}">${dentro}</a>` : `<div class="evento">${dentro}</div>`;
  }
  function seccionSanidad(a) {
    const rs = S.sanidad.filter((r) => aplicaA(r, a));
    const prev = rs.filter((r) => r.estado === 'previsto'); const hechos = rs.filter((r) => r.estado === 'realizado').reverse();
    return `<section class="tarjeta"><h2>Sanidad</h2>
      ${prev.map((r) => tarjetaSan(r)).join('')}${hechos.slice(0, 5).map((r) => tarjetaSan(r)).join('')}
      ${hechos.length > 5 ? `<a class="suave" href="#/sanidad/registro">Ver los ${hechos.length} registros en Sanidad</a>` : ''}
      ${!rs.length ? '<div class="suave">Sin tratamientos registrados.</div>' : ''}
      ${a.fecha_baja ? '' : `<div class="botones"><a class="btn sec peq" href="#/sanidad/nuevo/animal/${a.id}">Registrar tratamiento</a><a class="btn sec peq" href="#/sanidad/programar/animal/${a.id}">Programar</a></div>`}</section>`;
  }

  function vistaSanidad(tab) {
    const pest = [['calendario', 'Previsto'], ['registro', 'Hecho'], ['retiradas', 'Retiradas'], ['medicamentos', 'Productos']];
    let cuerpo = '';
    if (tab === 'calendario') {
      const prev = S.sanidad.filter((r) => r.estado === 'previsto').sort((x, y) => x.fecha.localeCompare(y.fecha));
      const atr = prev.filter((r) => r.fecha < hoy()); const resto = prev.filter((r) => r.fecha >= hoy());
      cuerpo = `<div class="botones"><a class="btn" href="#/sanidad/nuevo/granja">${ICONOS.mas}Registrar lo hecho</a><a class="btn sec" href="#/sanidad/programar/granja">Programar</a></div>
        <div class="suave">Lo previsto queda pendiente hasta que alguien (profesor o alumno) lo valida al hacerlo: toca el registro y pulsa «Hecho».</div>
        ${atr.length ? `<section class="tarjeta" style="border-color:#E4A59E"><h2>Atrasado (${atr.length})</h2>${atr.map((r) => tarjetaSan(r)).join('')}</section>` : ''}
        <section class="tarjeta"><h2>Próximamente</h2>${resto.map((r) => tarjetaSan(r)).join('') || '<div class="suave">No hay nada programado.</div>'}</section>
        ${(() => { const c = S.sanidad.filter((r) => r.estado === 'cancelado').sort((x, y) => String(y.cancelado_fecha || y.fecha).localeCompare(String(x.cancelado_fecha || x.fecha))); return c.length ? `<section class="tarjeta"><details><summary class="suave" style="min-height:44px;display:flex;align-items:center">Cancelados (${c.length})</summary>${c.map((r) => tarjetaSan(r)).join('')}</details></section>` : ''; })()}`;
    } else if (tab === 'registro') {
      const hechos = S.sanidad.filter((r) => r.estado === 'realizado').sort((x, y) => y.fecha.localeCompare(x.fecha));
      cuerpo = `<a class="btn" href="#/sanidad/nuevo/granja">${ICONOS.mas}Registrar lo hecho</a>
        <section class="tarjeta"><h2>Registro de tratamientos (${hechos.length})</h2>${hechos.map((r) => tarjetaSan(r)).join('') || '<div class="suave">Todavía no hay nada registrado.</div>'}</section>`;
    } else if (tab === 'retiradas') {
      const ret = retiradasHoy(); const lista = activos().filter((a) => ret[a.id]).sort((x, y) => x.especie.localeCompare(y.especie) || L.ordenNatural(x, y));
      cuerpo = `<div class="suave">Animales con tiempo de espera vigente. La leche de las cabras de esta lista <strong>no va al tanque</strong>.</div>
        <div class="lista">${lista.map((a) => `<a class="animal-fila" href="#/animal/${a.id}"><div><strong>${esc(nombreA(a))}</strong><div class="suave">${esc(catNombre(a.categoria))} · ${esc(nombreCorrCorto(ubic(a)))}</div>
          <div class="peq rojo">${ret[a.id].leche ? `Leche hasta ${fmt(ret[a.id].leche.hasta)}` : ''}${ret[a.id].leche && ret[a.id].carne ? ' · ' : ''}${ret[a.id].carne ? `Carne hasta ${fmt(ret[a.id].carne.hasta)}` : ''}</div></div>${chipRetirada(ret[a.id])}</a>`).join('') || '<div class="vacio">Ningún animal en tiempo de espera.</div>'}</div>`;
    } else {
      cuerpo = `<a class="btn" href="#/medicamento/nuevo">${ICONOS.mas}Añadir producto</a><div class="suave peq">Toca un producto para ver su ficha técnica o completar sus datos.</div>
        <div class="suave">Catálogo común a todas las especies (también lo usa CIFEAPORC). La especie se elige al aplicarlo.</div>
        <div class="lista">${S.medicamentos.filter((m) => m.activo !== false).map((m) => `<a href="#/medicamento/${m.id}" class="animal-fila"><div><strong>${esc(m.nombre)}</strong><div class="suave">${esc(m.materia_activa || '')}${resumenPoso(m, ESP_POSO.slice(0, 2)) ? ` · ${esc(resumenPoso(m, ESP_POSO.slice(0, 2)))}` : ''}${m.via ? ` · ${esc(m.via)}` : ''}</div>
          ${(m.clases || []).length ? `<div class="opciones" style="gap:4px;margin-top:4px">${m.clases.map((c) => `<span class="chip">${esc(L.nombreClase(c))}</span>`).join('')}</div>` : ''}
          <div class="suave peq">Espera rumiantes: carne ${m.espera_carne_rum ?? '—'} d · leche ${m.espera_leche_rum ?? '—'} d · porcino: carne ${m.supresion_dias ?? '—'} d</div></div><span class="chip ${m.ficha_url ? '' : 'gris'}">${m.ficha_url ? 'Ficha técnica' : esc((L.TIPOS_MED.find((t) => t[0] === m.tipo) || [0, m.tipo])[1])}</span></a>`).join('') || '<div class="vacio">Todavía no hay productos para rumiantes en el catálogo.</div>'}</div>`;
    }
    pintar(`${cabecera()}
      <main class="cuerpo">${faltaSQLCaja()}${faltaSQL3Caja()}
        <h1 style="font-size:22px">Sanidad</h1>
        <div class="pestanas">${pest.map(([k, x]) => `<a href="#/sanidad/${k}" class="${tab === k ? 'activo' : ''}">${x}</a>`).join('')}</div>
        ${cuerpo}
      </main>${navegacion('sanidad')}`);
  }

  // Cancelar un previsto (con fecha y motivo) o ver/deshacer una cancelación.
  function vistaSanCancelar(id) {
    const r = S.sanidad.find((x) => x.id === id);
    if (!r || r.estado === 'realizado') return vistaNoEncontrado();
    const ya = r.estado === 'cancelado';
    pintar(`${cabecera({ volver: '#/sanidad', textoVolver: 'Volver', titulo: ya ? 'Tratamiento cancelado' : 'Cancelar lo previsto' })}
      <main class="cuerpo"><div id="msg"></div>
        <section class="tarjeta">${tarjetaSan(r, false)}</section>
        ${ya ? `<button class="btn sec" type="button" id="b-deshacer">Deshacer la cancelación (vuelve a previsto)</button>`
        : `<form class="formu" id="f-canc" novalidate>
          <div class="campo"><label for="c-fecha">Fecha de cancelación</label><input id="c-fecha" name="fecha" type="date" value="${hoy()}" max="${hoy()}"></div>
          <div class="campo"><span class="et">Motivo</span><div class="opciones">${Object.entries(L.MOTIVOS_CANCEL).map(([k, t]) => `<label><input type="radio" name="motivo" value="${k}"> ${t}</label>`).join('')}</div></div>
          <div class="campo"><label for="c-detalle">Detalle</label><input id="c-detalle" name="detalle" type="text" placeholder="Qué veterinario, por qué producto se cambia…"><span class="ayuda">Obligatorio si eliges «Otro motivo».</span></div>
          <button class="btn peligro" type="submit">Cancelar el tratamiento</button></form>`}
      </main>${navegacion('sanidad')}`);
    const msg = (t) => { document.getElementById('msg').innerHTML = errorCaja(t); window.scrollTo(0, 0); };
    if (ya) return document.getElementById('b-deshacer').addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      const { error } = await sb.from('rum_sanidad').update({ estado: 'previsto', cancelado_fecha: null, cancelado_motivo: null, cancelado_detalle: null, cancelado_por: null }).eq('id', id);
      if (error) { ev.target.disabled = false; return msg(traducirError(error)); }
      toast('Vuelve a estar previsto'); await refrescar(); location.hash = '#/sanidad/calendario';
    });
    const f = document.getElementById('f-canc');
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const x = new FormData(f);
      const fecha = x.get('fecha'); const motivo = x.get('motivo'); const detalle = String(x.get('detalle') || '').trim() || null;
      if (!fecha || fecha > hoy()) return msg('Revisa la fecha de cancelación.');
      if (!motivo) return msg('Elige el motivo.');
      if (motivo === 'otro' && !detalle) return msg('Explica el motivo en «Detalle».');
      const b = f.querySelector('button[type=submit]'); b.disabled = true;
      const { error } = await sb.from('rum_sanidad').update({ estado: 'cancelado', cancelado_fecha: fecha, cancelado_motivo: motivo, cancelado_detalle: detalle, cancelado_por: S.perfil.alias }).eq('id', id);
      if (error) { b.disabled = false; return msg(traducirError(error)); }
      toast('Cancelado'); await refrescar(); location.hash = '#/sanidad/calendario';
    });
  }

  // Registrar (hecho), programar (previsto), validar un previsto o corregir un registro.
  function vistaSanForm(modo, id, ambitoPre, refPre) {
    const fila = id ? S.sanidad.find((r) => r.id === id) : null;
    if (id && !fila) return vistaNoEncontrado();
    const realizado = modo === 'nuevo' || modo === 'realizar' || (modo === 'editar' && fila.estado === 'realizado');
    const idsPre = ambitoPre === 'animal' ? [refPre] : ambitoPre === 'grupo' ? ((S.borrador.grupo || {}).ids || []) : [];
    const v = fila ? { ...fila } : { tipo: 'tratamiento', ambito: idsPre.length ? 'animales' : 'especie', animales: idsPre, especie: 'caprino', fecha: hoy(), duracion_dias: 1 };
    if (modo === 'realizar') v.fecha = hoy();
    const volver = ambitoPre === 'animal' ? `#/animal/${refPre}` : ambitoPre === 'grupo' ? ((S.borrador.grupo || {}).volver || '#/sanidad') : '#/sanidad';
    const titulo = { nuevo: 'Registrar tratamiento', programar: 'Programar', realizar: 'Hecho: validar', editar: fila && fila.estado === 'previsto' ? 'Corregir lo previsto' : 'Corregir registro' }[modo];
    const puedeBorrar = fila && (esProf() || (fila.autor === uid() && Date.now() - new Date(fila.creado).getTime() < 864e5));
    const optMed = `<option value="">Otro (escribir)</option>${S.medicamentos.filter((m) => m.activo !== false || m.id === v.medicamento_id).map((m) => `<option value="${m.id}" ${v.medicamento_id === m.id ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}`;
    const anim = (v.animales || []).map(animal).filter(Boolean);
    const carObl = modo === 'programar' || (modo === 'editar' && fila.estado === 'previsto');
    const pideCar = carObl || modo === 'realizar' || !!v.caracter;
    pintar(`${cabecera({ volver, textoVolver: ambitoPre === 'animal' ? 'Ficha' : 'Volver', titulo })}
      <main class="cuerpo">${modo === 'editar' && fila && fila.estado === 'realizado' ? avisoAjeno(fila) : ''}<div id="msg"></div>
        ${fila ? retrasoSan(fila) : ''}
        ${modo === 'realizar' ? '<div class="ok-caja">Revisa los datos, completa el lote del producto y pulsa «Guardar como hecho». Quedará validado a tu nombre.</div>' : ''}
        <form class="formu" id="f-san" novalidate>
          <div class="campo"><label for="tipo">Qué</label><select id="tipo" name="tipo">${Object.entries(L.TIPOS_SAN).map(([k, x]) => `<option value="${k}" ${v.tipo === k ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
          <div class="campo"><label for="fecha">${realizado ? 'Fecha en que se hizo (primer día)' : 'Fecha prevista'}</label><input id="fecha" name="fecha" type="date" value="${v.fecha}" ${realizado ? `max="${hoy()}"` : ''}>${realizado ? '<span class="ayuda">Puedes poner una fecha pasada para apuntar tratamientos antiguos.</span>' : ''}</div>
          <div class="campo"><span class="et">A quién</span><div class="opciones">
            ${anim.length || v.ambito === 'animales' ? `<label><input type="radio" name="ambito" value="animales" ${v.ambito === 'animales' ? 'checked' : ''}> ${anim.length === 1 ? esc(nombreA(anim[0])) : `${anim.length} animales`}</label>` : ''}
            <label><input type="radio" name="ambito" value="corralina" ${v.ambito === 'corralina' ? 'checked' : ''}> Una corralina</label>
            <label><input type="radio" name="ambito" value="especie" ${v.ambito === 'especie' ? 'checked' : ''}> Una especie</label>
            <label><input type="radio" name="ambito" value="granja" ${v.ambito === 'granja' ? 'checked' : ''}> Toda la granja</label></div>
            ${anim.length > 1 ? `<span class="ayuda">${anim.map((a) => esc(nombreA(a))).join(', ')}</span>` : ''}</div>
          <div class="dos"><div class="campo"><label for="corralina_id">Corralina</label><select id="corralina_id" name="corralina_id">${opcionesCorralinas(v.corralina_id, '—')}</select></div>
            <div class="campo"><label for="especie">Especie</label><select id="especie" name="especie"><option value="caprino" ${v.especie !== 'ovino' ? 'selected' : ''}>Cabras</option><option value="ovino" ${v.especie === 'ovino' ? 'selected' : ''}>Ovejas</option></select></div></div>
          ${pideCar ? `<div class="campo"><span class="et">Carácter${carObl ? '' : ' <span class="suave">(opcional)</span>'}</span><div class="opciones">${Object.entries(L.CARACTER).map(([k, t]) => `<label><input type="radio" name="caracter" value="${k}" ${v.caracter === k ? 'checked' : ''}> ${t}</label>`).join('')}</div></div>` : ''}
          <div id="b-ana" ${v.tipo === 'analitica' ? '' : 'hidden'}>
            <div class="campo"><label for="analisis">Qué se analiza</label><input id="analisis" name="analisis" type="text" value="${esc(v.analisis || '')}" placeholder="Tuberculosis, brucelosis, calidad de leche…"></div>
            <div class="dos"><div class="campo"><label for="muestra">Tipo de muestra</label><input id="muestra" name="muestra" type="text" list="l-muestras" value="${esc(v.muestra || '')}"><datalist id="l-muestras">${L.MUESTRAS.map((m) => `<option value="${m}">`).join('')}</datalist></div>
              <div class="campo"><label for="laboratorio">Laboratorio</label><input id="laboratorio" name="laboratorio" type="text" value="${esc(v.laboratorio || '')}"></div></div>
            ${realizado ? `<div class="campo"><span class="et">Resultado</span><div class="opciones">${Object.entries(L.RESULTADOS).map(([k, t]) => `<label><input type="radio" name="resultado" value="${k}" ${(v.resultado || 'pendiente') === k ? 'checked' : ''}> ${t}</label>`).join('')}</div></div>
            <div class="campo"><label for="resultado_nota">Detalle del resultado <span class="suave">(opcional)</span></label><input id="resultado_nota" name="resultado_nota" type="text" value="${esc(v.resultado_nota || '')}" placeholder="Valores, animales positivos, nº de informe…"></div>` : ''}
          </div>
          <div id="b-prod" ${v.tipo === 'analitica' ? 'hidden' : ''}>
          <div class="campo"><label for="medicamento_id">Producto del catálogo</label><select id="medicamento_id" name="medicamento_id">${optMed}</select><span class="ayuda" id="clase-med">${(() => { const m = S.medicamentos.find((z) => z.id === v.medicamento_id); return m && (m.clases || []).length ? m.clases.map(L.nombreClase).join(' · ') : ''; })()}</span></div>
          <div class="campo"><label for="producto">Nombre del producto</label><input id="producto" name="producto" type="text" value="${esc(v.producto || '')}"></div>
          <div class="dos"><div class="campo"><label for="dosis">Dosis</label><input id="dosis" name="dosis" type="text" value="${esc(v.dosis || '')}" placeholder="2 ml / animal"></div>
            <div class="campo"><label for="via">Vía</label><input id="via" name="via" type="text" value="${esc(v.via || '')}" placeholder="SC, IM, oral…"></div></div>
          <div class="campo"><label for="duracion_dias">Días de tratamiento</label><input id="duracion_dias" name="duracion_dias" type="number" min="1" max="60" value="${v.duracion_dias || 1}"></div>
          <div class="dos"><div class="campo"><label for="espera_leche">Espera leche (días)</label><input id="espera_leche" name="espera_leche" type="number" min="0" value="${esc(v.espera_leche ?? '')}"></div>
            <div class="campo"><label for="espera_carne">Espera carne (días)</label><input id="espera_carne" name="espera_carne" type="number" min="0" value="${esc(v.espera_carne ?? '')}"></div></div>
          <div class="ayuda suave">La leche y la carne quedan retiradas hasta el último día de tratamiento más el tiempo de espera. Compruébalo en el prospecto o con el veterinario.</div>
          ${realizado ? `<div class="dos"><div class="campo"><label for="lote">Lote del producto</label><input id="lote" name="lote" type="text" value="${esc(v.lote || '')}"></div>
            <div class="campo"><label for="caducidad">Caducidad</label><input id="caducidad" name="caducidad" type="date" value="${esc(v.caducidad || '')}"></div></div>` : ''}
          </div>
          <div class="dos"><div class="campo"><label for="motivo">Motivo</label><input id="motivo" name="motivo" type="text" value="${esc(v.motivo || '')}" placeholder="Mamitis, cojera, plan sanitario…"></div>
            <div class="campo"><label for="veterinario">Veterinario que lo prescribe</label><input id="veterinario" name="veterinario" type="text" value="${esc(v.veterinario || '')}"></div></div>
          ${modo !== 'editar' ? `<div class="campo"><label for="repetir_dias">Repetir dentro de (días, opcional)</label><input id="repetir_dias" name="repetir_dias" type="number" min="1" value="${esc(v.repetir_dias || '')}"><span class="ayuda">Al guardarlo como hecho, se programa solo el siguiente.</span></div>` : ''}
          <div class="campo"><label for="obs">Observaciones</label><textarea id="obs" name="obs">${esc(v.obs || '')}</textarea></div>
          <button class="btn" type="submit">${realizado && modo !== 'editar' ? 'Guardar como hecho' : modo === 'programar' ? 'Programar' : 'Guardar'}</button>
          ${modo === 'realizar' ? '<a class="btn sec" href="#/sanidad/editar/' + id + '">Solo corregir lo previsto</a>' : ''}
          ${modo === 'realizar' || (modo === 'editar' && fila.estado === 'previsto') ? `<a class="btn sec" href="#/sanidad/cancelar/${id}">No se va a hacer: cancelar</a>` : ''}</form>
        ${puedeBorrar && modo === 'editar' ? '<button class="btn peligro" type="button" id="b-borrar-san">Borrar este registro</button>' : ''}
      </main>${navegacion('sanidad')}`);
    const f = document.getElementById('f-san');
    f.tipo.addEventListener('change', () => { const an = f.tipo.value === 'analitica'; document.getElementById('b-ana').hidden = !an; document.getElementById('b-prod').hidden = an; });
    document.getElementById('medicamento_id').addEventListener('change', (ev) => {
      const m = S.medicamentos.find((x) => x.id === ev.target.value); document.getElementById('clase-med').textContent = m && (m.clases || []).length ? m.clases.map(L.nombreClase).join(' · ') : ''; if (!m) return;
      f.producto.value = m.nombre; { const esp = (f.especie && f.especie.value) || ((v.animales || []).map(animal).filter(Boolean)[0] || {}).especie || 'caprino'; const d = posologiaDe(m, esp); if (d) f.dosis.value = d; } if (m.via) f.via.value = m.via;
      if (m.espera_leche_rum != null) f.espera_leche.value = m.espera_leche_rum; if (m.espera_carne_rum != null) f.espera_carne.value = m.espera_carne_rum;
      if (m.tipo === 'vacuna' || (m.clases || []).includes('vacuna')) f.tipo.value = 'vacunacion'; if (m.tipo === 'antiparasitario' || (m.clases || []).some((c) => /^antiparasitario/.test(c))) f.tipo.value = 'desparasitacion'; if ((m.clases || []).includes('vitaminas')) f.tipo.value = 'vitaminas';
    });
    const bb = document.getElementById('b-borrar-san');
    if (bb) bb.addEventListener('click', async () => {
      if (bb.dataset.confirmar !== '1') { bb.dataset.confirmar = '1'; bb.textContent = '¿Seguro? Pulsa otra vez'; return; }
      const { error } = await sb.from('rum_sanidad').delete().eq('id', id); if (error) return toast(traducirError(error));
      toast('Registro borrado'); await refrescar(); location.hash = '#/sanidad';
    });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const x = new FormData(f); const msg = (t) => { document.getElementById('msg').innerHTML = errorCaja(t); window.scrollTo(0, 0); };
      const num = (k) => (x.get(k) === '' || x.get(k) === null ? null : Number(x.get(k)));
      const r = { tipo: x.get('tipo'), ambito: x.get('ambito'), fecha: x.get('fecha'), medicamento_id: x.get('medicamento_id') || null, producto: String(x.get('producto') || '').trim() || null, dosis: String(x.get('dosis') || '').trim() || null, via: String(x.get('via') || '').trim() || null,
        duracion_dias: num('duracion_dias') || 1, espera_leche: num('espera_leche'), espera_carne: num('espera_carne'), motivo: String(x.get('motivo') || '').trim() || null, veterinario: String(x.get('veterinario') || '').trim() || null, obs: String(x.get('obs') || '').trim() || null };
      if (x.get('lote') !== null) { r.lote = String(x.get('lote') || '').trim() || null; r.caducidad = x.get('caducidad') || null; }
      const txt = (k) => String(x.get(k) || '').trim() || null;
      if (pideCar) r.caracter = x.get('caracter') || null;
      const an = r.tipo === 'analitica';
      Object.assign(r, { analisis: an ? txt('analisis') : null, muestra: an ? txt('muestra') : null, laboratorio: an ? txt('laboratorio') : null,
        resultado: an && realizado ? x.get('resultado') || 'pendiente' : null, resultado_nota: an && realizado ? txt('resultado_nota') : null });
      if (an) { Object.assign(r, { medicamento_id: null, producto: null, dosis: null, via: null, duracion_dias: 1, espera_leche: null, espera_carne: null }); if ('lote' in r) { r.lote = null; r.caducidad = null; } }
      r.corralina_id = r.ambito === 'corralina' ? (num('corralina_id') || null) : null;
      r.especie = r.ambito === 'especie' ? x.get('especie') : null;
      const repetir = num('repetir_dias');
      if (!r.ambito) return msg('Elige a quién se aplica.');
      if (r.ambito === 'corralina' && !r.corralina_id) return msg('Elige la corralina.');
      if (carObl && !r.caracter) return msg('Indica si es obligatorio, recomendado o voluntario.');
      if (an && !r.analisis) return msg('Indica qué se analiza.');
      if (!r.producto && !['pezunas', 'analitica', 'otro'].includes(r.tipo)) return msg('Escribe o elige el producto.');
      if (!r.fecha) return msg('Falta la fecha.');
      if (realizado && r.fecha > hoy()) return msg('Lo hecho no puede tener fecha futura: prográmalo.');
      // Animales afectados: al hacerlo, los presentes en ese momento.
      // En una fecha pasada, los que estaban entonces (y en la corralina de entonces).
      const enFecha = presentesEn(r.fecha);
      const presentes = r.ambito === 'animales' ? (v.animales || []) : r.ambito === 'corralina' ? enFecha.filter((a) => (L.ubicacion(a, S.porAnimal[a.id], r.fecha) || null) === r.corralina_id).map((a) => a.id)
        : r.ambito === 'especie' ? enFecha.filter((a) => a.especie === r.especie).map((a) => a.id) : enFecha.map((a) => a.id);
      if (realizado && (modo !== 'editar' || r.ambito !== fila.ambito || r.corralina_id !== fila.corralina_id || r.especie !== fila.especie)) r.animales = presentes;
      if (!realizado) r.animales = r.ambito === 'animales' ? (v.animales || []) : [];
      if (realizado && !(r.animales || fila.animales || []).length) return msg(r.fecha < hoy() ? 'No había animales en ese destino en esa fecha (según los datos de la app).' : 'No hay animales en ese destino.');
      const b = f.querySelector('button[type=submit]'); b.disabled = true;
      let res;
      if (modo === 'nuevo') res = await sb.from('rum_sanidad').insert({ ...r, estado: 'realizado', repetir_dias: repetir });
      else if (modo === 'programar') res = await sb.from('rum_sanidad').insert({ ...r, estado: 'previsto', repetir_dias: repetir });
      else if (modo === 'realizar') res = await sb.from('rum_sanidad').update({ ...r, estado: 'realizado', repetir_dias: repetir }).eq('id', id);
      else res = await sb.from('rum_sanidad').update(r).eq('id', id);
      if (res.error) { b.disabled = false; return msg(traducirError(res.error)); }
      let pasado = false;
      if (realizado && repetir && modo !== 'editar' && L.sumarDias(r.fecha, repetir) < hoy()) pasado = true;
      else if (realizado && repetir && modo !== 'editar') {
        const sig = { ...r, estado: 'previsto', fecha: L.sumarDias(r.fecha, repetir), repetir_dias: repetir, lote: null, caducidad: null, resultado: null, resultado_nota: null, caracter: r.caracter || (fila && fila.caracter) || null, animales: r.ambito === 'animales' ? r.animales : [] };
        const r2 = await sb.from('rum_sanidad').insert(sig); if (r2.error) toast(`Guardado, pero no se pudo programar el siguiente: ${traducirError(r2.error)}`);
      }
      S.borrador.grupo = null;
      const ret = r.espera_leche && realizado && L.sumarDias(r.fecha, (r.duracion_dias || 1) - 1 + r.espera_leche) >= hoy() ? (r.animales || []).map(animal).filter((a) => a && a.especie === 'caprino' && esHembraRepro(a) && estR(a).estado === 'lactacion').length : 0;
      if (pasado) toast('Guardado. No se programa la repetición porque su fecha ya ha pasado.'); else toast(ret ? `Guardado · ${ret} ${ret === 1 ? 'cabra' : 'cabras'} en ordeño con leche retirada` : modo === 'programar' ? 'Programado' : 'Guardado');
      await refrescar(); location.hash = volver === '#/sanidad' ? (modo === 'programar' ? '#/sanidad/calendario' : '#/sanidad/registro') : volver;
    });
  }

  // Posología por especie de destino (la antigua «dosificación» queda como respaldo)
  const ESP_POSO = [['caprino', 'Cabras'], ['ovino', 'Ovejas'], ['porcino', 'Cerdos']];
  const posologiaDe = (m, esp) => ((m && m.posologia) || {})[esp] || (m && m.dosis) || '';
  const resumenPoso = (m, esps) => { const p = (m && m.posologia) || {}; const t = esps.filter(([k]) => p[k]).map(([k, n]) => `${n}: ${p[k]}`); return t.length ? t.join(' · ') : (m && m.dosis) || ''; };
  // Enlace que se abre fuera de la app, en el navegador
  const enlaceFicha = (url, texto = 'Abrir la ficha técnica', cls = 'btn') => (url ? `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer external">${texto} ↗</a>` : '');
  function vistaMedicamento(id, desde) {
    const m = id === 'nuevo' ? { especies: [], clases: [], tipo: 'medicamento' } : S.medicamentos.find((x) => x.id === id);
    const volver = desde === 'porc' ? 'porc/#/sanidad/medicamentos' : '#/sanidad/medicamentos';
    if (!m) return vistaNoEncontrado();
    const nuevo = !m.id;
    const c = (n, l, tipo = 'text', extra = '') => `<div class="campo"><label for="m-${n}">${l}</label><input id="m-${n}" name="${n}" type="${tipo}" value="${esc(m[n] ?? '')}" ${extra}></div>`;
    const otras = (m.clases || []).filter((c) => !L.CLASES_MED[c]);
    pintar(`${cabecera({ volver, textoVolver: 'Productos', titulo: nuevo ? 'Añadir producto' : m.nombre, sub: 'Catálogo común a todas las especies' })}
      <main class="cuerpo">${enlaceFicha(m.ficha_url)}
        ${!nuevo && (m.autor_alias || m.modificado_por) ? `<div class="suave peq">${m.autor_alias ? `Añadido por ${esc(verAlias(m.autor_alias))}` : ''}${m.autor_alias && m.modificado_por ? ' · ' : ''}${m.modificado_por ? `última modificación de ${esc(verAlias(m.modificado_por))}` : ''}</div>` : ''}
        ${!nuevo && !esProf() ? '<div class="suave">Puedes completar o corregir los datos del producto (por ejemplo, el enlace a la ficha técnica). El profesor verá los cambios.</div>' : ''}
        <div id="msg"></div><form class="formu" id="f-med" novalidate>
        ${c('ficha_url', 'Enlace a la ficha técnica', 'url', 'placeholder="https://…" inputmode="url"')}
        <a class="btn sec peq" id="abrir-ficha" href="${esc(m.ficha_url || '#')}" target="_blank" rel="noopener noreferrer external" ${m.ficha_url ? '' : 'hidden'}>Abrir este enlace en el navegador ↗</a>
        ${c('nombre', 'Nombre comercial')}${c('materia_activa', 'Materia activa')}
        <div class="campo"><label for="m-tipo">Tipo</label><select id="m-tipo" name="tipo">${L.TIPOS_MED.map(([k, t]) => `<option value="${k}" ${(m.tipo || 'medicamento') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        ${c('via', 'Vía de administración', 'text', 'placeholder="SC, IM, oral…"')}
        <fieldset><legend>Clase</legend><div class="opciones">${Object.entries(L.CLASES_MED).map(([k, t]) => `<label><input type="checkbox" name="clases" value="${k}" ${(m.clases || []).includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}</div>
          <div class="campo"><label for="m-otra">Otra clase (opcional)</label><input id="m-otra" name="otra" type="text" value="${esc(otras.join(', '))}" placeholder="Ej.: mucolítico"></div></fieldset>
        <fieldset><legend>Tiempos de espera (días)</legend>
          <div class="dos">${c('espera_leche_rum', 'Leche · cabra y oveja', 'number', 'min="0" inputmode="numeric"')}${c('espera_carne_rum', 'Carne · cabra y oveja', 'number', 'min="0" inputmode="numeric"')}</div>
          ${c('supresion_dias', 'Carne · cerdo', 'number', 'min="0" inputmode="numeric"')}
          <span class="ayuda">Déjalo vacío si no se usa en esa especie o no tiene espera. Compruébalo en la ficha técnica.</span></fieldset>
        <fieldset><legend>Especies de destino y posología</legend>
          <div class="suave peq">Marca las especies para las que está autorizado (según la ficha técnica) y escribe su posología: dosis, frecuencia y duración.</div>
          ${ESP_POSO.map(([k, t]) => { const marcada = (m.especies || []).includes(k); const val = ((m.posologia || {})[k]) || (marcada && m.dosis ? m.dosis : '');
            return `<label class="opciones"><input type="checkbox" name="especies" value="${k}" ${marcada ? 'checked' : ''} data-poso="${k}"> ${t}</label>
            <div class="campo" id="poso-${k}" ${marcada || val ? '' : 'hidden'}><label for="m-poso-${k}">Posología · ${t.toLowerCase()}</label><input id="m-poso-${k}" name="poso_${k}" type="text" value="${esc(val)}" placeholder="Ej.: 1 ml/10 kg PV, IM, cada 24 h, 3 días"></div>`; }).join('')}
          ${m.dosis && !Object.keys(m.posologia || {}).length ? `<div class="suave peq">Dosificación anotada antes: «${esc(m.dosis)}». Revísala en cada especie.</div>` : ''}</fieldset>
        <div class="dos">${c('lote', 'Lote')}${c('caducidad', 'Caducidad', 'date')}</div>
        ${c('presentacion', 'Presentación', 'text', 'placeholder="Frasco 100 ml…"')}
        <div class="campo"><label for="m-notas">Notas</label><textarea id="m-notas" name="notas">${esc(m.notas || '')}</textarea></div>
        ${nuevo || !esProf() ? '' : `<label class="check-todos"><input type="checkbox" name="activo" ${m.activo !== false ? 'checked' : ''}> En uso (desmárcalo para retirarlo sin perder el historial)</label>`}
        <button class="btn" type="submit">${nuevo ? 'Añadir' : 'Guardar cambios'}</button></form></main>${navegacion('sanidad')}`);
    const fm = document.getElementById('f-med');
    fm.querySelectorAll('[data-poso]').forEach((cb) => cb.addEventListener('change', () => { document.getElementById(`poso-${cb.dataset.poso}`).hidden = !cb.checked; }));
    const urlIn = document.getElementById('m-ficha_url'); const abrir = document.getElementById('abrir-ficha');
    urlIn.addEventListener('input', () => { const u = urlIn.value.trim(); abrir.hidden = !/^https?:\/\/\S+/i.test(u); abrir.href = u || '#'; });
    fm.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const x = new FormData(ev.target); const t = (k) => String(x.get(k) || '').trim() || null; const n = (k) => (x.get(k) === '' ? null : Number(x.get(k)));
      const posologia = {}; for (const [k] of ESP_POSO) { const v = t(`poso_${k}`); if (v) posologia[k] = v; }
      const otras = String(x.get('otra') || '').split(',').map((z) => z.trim().toLowerCase()).filter(Boolean);
      const fila = { nombre: t('nombre'), materia_activa: t('materia_activa'), tipo: x.get('tipo'), clases: [...x.getAll('clases'), ...otras], posologia, via: t('via'), espera_leche_rum: n('espera_leche_rum'), espera_carne_rum: n('espera_carne_rum'), supresion_dias: n('supresion_dias'), especies: x.getAll('especies'), presentacion: t('presentacion'), ficha_url: t('ficha_url'), lote: t('lote'), caducidad: x.get('caducidad') || null, notas: t('notas') };
      if (!nuevo && esProf()) fila.activo = x.get('activo') === 'on';
      if (!fila.nombre) { document.getElementById('msg').innerHTML = errorCaja('Falta el nombre comercial.'); return; }
      if (fila.ficha_url && !/^https?:\/\//i.test(fila.ficha_url)) { document.getElementById('msg').innerHTML = errorCaja('El enlace debe empezar por https://'); return; }
      const { error } = nuevo ? await sb.from('medicamentos').insert(fila) : await sb.from('medicamentos').update(fila).eq('id', m.id);
      if (error) { document.getElementById('msg').innerHTML = errorCaja(/posologia/i.test(error.message || '') ? 'Falta ejecutar en Supabase el archivo 07_posologia.sql.' : traducirError(error)); return; }
      toast(nuevo ? 'Añadido al catálogo' : 'Cambios guardados');
      if (desde === 'porc') { location.href = 'porc/#/sanidad/medicamentos'; return; }
      await refrescar(); location.hash = '#/sanidad/medicamentos';
    });
  }

  function vistaMas() {
    pintar(`${cabecera()}
      <main class="cuerpo"><h1 style="font-size:22px">Más</h1>
        <a class="granja-card" href="#/manejo">${ICONOS.mapa}<div><strong>Manejo diario</strong><div class="suave">Limpieza, alimentación, agua, cama y ordeño por corralina</div></div>${ICONOS.flecha}</a>
        ${S.perfil.rol === 'veterinario' ? '' : `<a class="granja-card" href="#/actividad">${ICONOS.cuenta}<div><strong>${esProf() ? 'Actividad de los alumnos' : 'Mi actividad'}</strong><div class="suave">${esProf() ? 'Qué ha registrado cada alumno, por curso y fechas, para evaluar' : 'Todo lo que has registrado'}</div></div>${ICONOS.flecha}</a>`}
        <a class="granja-card" href="#/censo">${ICONOS.censo}<div><strong>Censo</strong><div class="suave">A cualquier fecha, por categoría y corralina; altas y bajas; Excel</div></div>${ICONOS.flecha}</a>
        ${esAdmin() ? `<a class="granja-card" href="#/correcciones">${ICONOS.cuenta}<div><strong>Correcciones de alumnos</strong><div class="suave">${S.correcciones.filter((c) => !c.revisada).length} sin revisar · cambios de un alumno en registros de otros</div></div>${ICONOS.flecha}</a>` : ''}
        ${esProf() ? `<a class="granja-card" href="#/gestion">${ICONOS.gestion}<div><strong>Gestión</strong><div class="suave">Importar el censo y copia de seguridad${esAdmin() ? ', acceso por curso, veterinaria y alumnos' : ''}</div></div>${ICONOS.flecha}</a>` : ''}
        <a class="granja-card" href="#/cuenta">${ICONOS.cuenta}<div><strong>Tu cuenta</strong><div class="suave">${esProf() ? 'Contraseña' : 'PIN'} e instalación en el móvil</div></div>${ICONOS.flecha}</a>
        <a class="granja-card" href="#/granjas"><img src="img/logo-mini.jpg" alt=""><div><strong>Granjas del centro</strong><div class="suave">Ir a CIFEAPORC</div></div>${ICONOS.flecha}</a>
        <button class="btn sec" type="button" data-accion="salir">Salir</button>
      </main>${navegacion('mas')}`);
  }

  // ---------------------------------------------------------------- manejo diario y seguimiento
  const CC_VALORES = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'];
  function seccionSeguimiento(a) {
    if (L.esCria(a)) return '';
    const evs = (S.porAnimal[a.id] || []);
    const cc = evs.filter((e) => e.tipo === 'condicion').sort(L.porFecha).reverse();
    const lt = evs.filter((e) => e.tipo === 'lechero').sort(L.porFecha).reverse();
    const u = L.ultimoSeguimiento(evs);
    const esCabra = a.categoria === 'cabra';
    return `<section class="tarjeta"><h2>Seguimiento</h2>
      <div class="dos"><div class="dato ${u.cc && u.cc.valor <= L.REF4.ccBaja ? 'nar' : 'gris'}"><span class="et">Condición corporal</span><span class="val peq-val">${u.cc ? String(u.cc.valor).replace('.', ',') : '—'}</span><span class="nota">${u.cc ? fmt(u.cc.fecha) : 'Escala 1–5'}</span></div>
        <div class="dato ${u.famacha && u.famacha.valor >= L.REF4.famachaAviso ? 'nar' : 'gris'}"><span class="et">FAMACHA</span><span class="val peq-val">${u.famacha ? u.famacha.valor : '—'}</span><span class="nota">${u.famacha ? fmt(u.famacha.fecha) : 'Escala 1–5'}</span></div></div>
      ${esCabra && lt.length ? `<div class="suave peq" style="font-weight:700">CONTROL LECHERO</div><table class="tabla"><tbody>${lt.slice(0, 6).map((e) => `<tr><td>${fmt(e.fecha)}</td><td class="num">${String(e.datos.litros).replace('.', ',')} l</td></tr>`).join('')}</tbody></table>` : ''}
      ${cc.length > 1 ? `<details><summary class="suave">Ver ${cc.length} revisiones</summary><table class="tabla"><tbody>${cc.map((e) => `<tr><td>${fmt(e.fecha)}</td><td>${resumenEvento(e)}</td></tr>`).join('')}</tbody></table></details>` : ''}
      <div class="botones"><a class="btn sec peq" href="#/seguimiento/condicion/${a.id}">CC / FAMACHA</a>${esCabra ? `<a class="btn sec peq" href="#/seguimiento/lechero/${a.id}">Litros</a>` : ''}</div></section>`;
  }

  // Condición corporal / FAMACHA o control lechero de uno o varios animales (con su valor cada uno).
  function vistaSeguimiento(tipo, id) {
    if (!['condicion', 'lechero'].includes(tipo)) return vistaNoEncontrado();
    const ids = id ? [id] : ((S.borrador.grupo || {}).ids || []);
    const apto = tipo === 'lechero' ? (a) => a.categoria === 'cabra' : (a) => !L.esCria(a);
    const lista = ids.map(animal).filter((a) => a && !a.fecha_baja && apto(a)).sort(L.ordenNatural);
    if (!lista.length) return vistaNoEncontrado(tipo === 'lechero' ? 'No hay cabras en la selección.' : 'No hay animales adultos en la selección.');
    const volver = id ? `#/animal/${id}` : (S.borrador.grupo || {}).volver || '#/mapa';
    const opts = (vals, ph) => `<option value="">${ph}</option>${vals.map((x) => `<option value="${x}">${x.replace('.', ',')}</option>`).join('')}`;
    pintar(`${cabecera({ volver, textoVolver: id ? 'Ficha' : 'Corralina', titulo: tipo === 'lechero' ? 'Control lechero' : 'Condición corporal y FAMACHA', sub: lista.length === 1 ? esc(nombreA(lista[0])) : `${lista.length} animales` })}
      <main class="cuerpo"><div id="msg"></div>
        ${tipo === 'condicion' ? '<div class="suave">Condición corporal de 1 (muy delgada) a 5 (muy grasa). FAMACHA de 1 (mucosa roja, sana) a 5 (blanca, anemia grave): con 4 o 5, valorar desparasitar. Deja en blanco lo que no se mire.</div>' : '<div class="suave">Litros de cada cabra en el ordeño del día. Deja en blanco las que no se midan.</div>'}
        <form class="formu" id="f-seg" novalidate>
          <div class="campo"><label for="fecha">Fecha</label><input id="fecha" name="fecha" type="date" value="${hoy()}" max="${hoy()}"></div>
          <div class="lista">${lista.map((a) => `<div class="animal-fila seg"><div><strong>${esc(nombreA(a))}</strong><div class="suave peq">${esc(catNombre(a.categoria))}</div></div>
            ${tipo === 'condicion' ? `<select name="cc-${a.id}" aria-label="Condición corporal de ${esc(nombreA(a))}">${opts(CC_VALORES, 'CC')}</select><select name="fa-${a.id}" aria-label="FAMACHA de ${esc(nombreA(a))}">${opts(['1', '2', '3', '4', '5'], 'FAM.')}</select>`
              : `<input name="l-${a.id}" type="number" step="0.1" min="0" max="10" inputmode="decimal" placeholder="litros" aria-label="Litros de ${esc(nombreA(a))}">`}</div>`).join('')}</div>
          <div class="campo"><label for="obs">Observaciones (opcional)</label><textarea id="obs" name="obs"></textarea></div>
          <button class="btn" type="submit">Guardar</button></form>
      </main>${navegacion('mapa')}`);
    document.getElementById('f-seg').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const x = new FormData(ev.target); const fecha = String(x.get('fecha')); const obs = String(x.get('obs') || '').trim();
      const num = (k) => { const v = x.get(k); return v === null || v === '' ? null : Number(String(v).replace(',', '.')); };
      const filas = lista.map((a) => {
        if (tipo === 'condicion') { const cc = num(`cc-${a.id}`), fa = num(`fa-${a.id}`); if (cc === null && fa === null) return null; return { animal_id: a.id, tipo, fecha, datos: { ...(cc !== null ? { cc } : {}), ...(fa !== null ? { famacha: fa } : {}), ...(obs ? { obs } : {}) } }; }
        const l = num(`l-${a.id}`); if (l === null) return null; return { animal_id: a.id, tipo, fecha, datos: { litros: l, ...(obs ? { obs } : {}) } };
      }).filter(Boolean);
      if (!filas.length) { document.getElementById('msg').innerHTML = errorCaja('Anota al menos un valor.'); return; }
      if (tipo === 'lechero' && filas.some((r) => !(r.datos.litros >= 0 && r.datos.litros <= 10))) { document.getElementById('msg').innerHTML = errorCaja('Revisa los litros (entre 0 y 10).'); return; }
      ev.target.querySelector('button').disabled = true;
      const { error } = await sb.from('rum_eventos').insert(filas);
      if (error) { ev.target.querySelector('button').disabled = false; document.getElementById('msg').innerHTML = errorCaja(traducirError(error)); return; }
      S.borrador.grupo = null; toast(`${filas.length} ${filas.length === 1 ? 'registro guardado' : 'registros guardados'}`); await refrescar(); location.hash = volver;
    });
  }

  function vistaManejo() {
    const dias = [...new Set(S.manejo.map((m) => m.fecha))].slice(0, 14);
    const tarj = (m) => { const puede = true; // cualquiera corrige; borrar, lo suyo (en el formulario)
      return `<${puede ? `a href="#/manejo/editar/${m.id}"` : 'div'} class="evento ${puede ? 'enlace' : ''}"><div class="entre"><strong>${m.tareas.map((t) => esc(L.TAREAS[t] || t)).join(' · ')}</strong><span class="suave peq">${esc(m.corralinas.map((c) => nombreCorrCorto(c)).join(', ') || 'Toda la granja')}</span></div>
        ${m.detalle ? `<div>${esc(m.detalle)}</div>` : ''}<div class="suave peq">${m.participantes && !esVet() ? `${esc(m.participantes)} · ` : ''}anotado por ${esc(quienEs(m.autor, m.autor_alias, m.curso))}${esVet() ? '' : ` (${curso(m.curso)})`}</div></${puede ? 'a' : 'div'}>`; };
    pintar(`${cabecera()}
      <main class="cuerpo">${S.faltaSQL4 && esProf() ? '<div class="aviso-caja"><strong>Para usar el manejo diario</strong>, vuelve a ejecutar en Supabase <code>sql/01_rumiantes.sql</code>.</div>' : ''}
        <h1 style="font-size:22px">Manejo diario</h1>
        <a class="btn" href="#/manejo/nuevo">${ICONOS.mas}Anotar manejo</a>
        ${dias.map((d) => `<section class="tarjeta"><h2>${d === hoy() ? 'Hoy' : `${DIAS_SEM[new Date(`${d}T12:00:00`).getDay()]} ${corta(d)}`}</h2>${S.manejo.filter((m) => m.fecha === d).map(tarj).join('')}</section>`).join('') || '<div class="vacio">Todavía no hay manejo anotado.</div>'}
      </main>${navegacion('mas')}`);
  }

  function vistaManejoForm(id) {
    const m = id ? S.manejo.find((x) => x.id === id) : null;
    if (id && !m) return vistaNoEncontrado();
    const v = m || { fecha: hoy(), corralinas: [], tareas: [], participantes: yo() };
    const naves = [...new Set(S.corralinas.map((c) => c.nave))];
    pintar(`${cabecera({ volver: '#/manejo', textoVolver: 'Manejo', titulo: m ? 'Corregir manejo' : 'Anotar manejo' })}
      <main class="cuerpo">${avisoAjeno(m)}<div id="msg"></div>
        <form class="formu" id="f-man" novalidate>
          <div class="campo"><label for="fecha">Fecha</label><input id="fecha" name="fecha" type="date" value="${v.fecha}" max="${hoy()}"></div>
          <fieldset><legend>Qué se ha hecho</legend><div class="opciones">${Object.entries(L.TAREAS).map(([k, t]) => `<label><input type="checkbox" name="tarea" value="${k}" ${v.tareas.includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}</div></fieldset>
          <fieldset><legend>Dónde</legend>${naves.map((nv) => `<div class="suave peq" style="font-weight:700">${esc(nv.toUpperCase())}</div><div class="opciones">${S.corralinas.filter((c) => c.nave === nv && c.activa).sort((x, y) => x.numero - y.numero).map((c) => `<label><input type="checkbox" name="corr" value="${c.id}" ${v.corralinas.includes(c.id) ? 'checked' : ''}> ${c.numero}${c.uso ? ` · ${esc(c.uso)}` : ''}</label>`).join('')}</div>`).join('')}
            <span class="ayuda">Sin marcar ninguna = toda la granja.</span></fieldset>
          <div class="campo"><label for="detalle">Detalle (ración, incidencias…)</label><textarea id="detalle" name="detalle" placeholder="Ej.: 1,5 kg de pienso por cabra + paja a voluntad">${esc(v.detalle || '')}</textarea></div>
          ${esVet() && m ? '' : '<div class="campo">'}<label for="participantes" ${esVet() && m ? 'hidden' : ''}>Quiénes lo han hecho</label><input id="participantes" name="participantes" type="${esVet() && m ? 'hidden' : 'text'}" value="${esc(v.participantes || '')}">${esVet() && m ? '' : '</div>'}
          <button class="btn" type="submit">Guardar</button></form>
        ${m && (esProf() || (m.autor === uid() && Date.now() - new Date(m.creado).getTime() < 864e5)) ? '<button class="btn peligro" type="button" id="b-borrar-man">Borrar</button>' : ''}
      </main>${navegacion('mas')}`);
    document.getElementById('f-man').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const x = new FormData(ev.target);
      const fila = { fecha: String(x.get('fecha')), tareas: x.getAll('tarea'), corralinas: x.getAll('corr').map(Number), detalle: String(x.get('detalle') || '').trim() || null, participantes: String(x.get('participantes') || '').trim() || null };
      if (!fila.tareas.length) { document.getElementById('msg').innerHTML = errorCaja('Marca al menos una tarea.'); return; }
      ev.target.querySelector('button').disabled = true;
      const { error } = m ? await sb.from('rum_manejo').update(fila).eq('id', m.id) : await sb.from('rum_manejo').insert(fila);
      if (error) { ev.target.querySelector('button').disabled = false; document.getElementById('msg').innerHTML = errorCaja(traducirError(error)); return; }
      toast('Manejo guardado'); await refrescar(); location.hash = '#/manejo';
    });
    const bb = document.getElementById('b-borrar-man');
    if (bb) bb.addEventListener('click', async () => {
      if (bb.dataset.confirmar !== '1') { bb.dataset.confirmar = '1'; bb.textContent = '¿Seguro? Pulsa otra vez'; return; }
      const { error } = await sb.from('rum_manejo').delete().eq('id', m.id); if (error) return toast(traducirError(error));
      toast('Borrado'); await refrescar(); location.hash = '#/manejo';
    });
  }

  // Actividad por alumno (para evaluar): todo lo que ha registrado cada uno en CIFEARUMI.
  // Registros de porcino (granja real) con su autor, para sumarlos a la actividad.
  const TIPOS_PORC = { ia: 'Inseminación', eco: 'Ecografía', paridera: 'Entrada en paridera', parto: 'Parto', aborto: 'Aborto', adopcion: 'Adopción', baja_lechones: 'Baja de lechones', destete: 'Destete', traslado: 'Traslado', nota: 'Nota' };
  const SAN_PORC = { vacunacion: 'Vacunación', desparasitacion: 'Desparasitación', tratamiento: 'Tratamiento', hierro: 'Hierro y colmillos', colmillos: 'Corte de colmillos', raboteo: 'Raboteo', castracion: 'Castración', analitica: 'Control analítico', limpieza: 'Limpieza', desinfeccion: 'Desinfección', desinsectacion: 'Desinsectación', desratizacion: 'Desratización', otro: 'Otro' };
  async function cargarPorcino() {
    const g = C.granjaPorcino; const todas = async (t, conGranja) => {
      const out = [];
      for (let d = 0; ; d += 1000) { let q = sb.from(t).select('*'); if (conGranja) q = q.eq('granja_id', g); const r = await q.order('creado').range(d, d + 999); if (r.error) throw r.error; out.push(...r.data); if (r.data.length < 1000) break; }
      return out; };
    const opc = async (t, cg) => { try { return await todas(t, cg); } catch (_) { return []; } };
    const [ev, cer, ver, san, ext, rec, mov, cen] = await Promise.all([opc('eventos', true), opc('cerdas'), opc('verracos'), opc('sanidad', true), opc('extracciones', true), opc('recuentos', true), opc('mov_grupos', true), opc('censo_mov')]);
    const crotal = {}; for (const x of cer.concat(ver)) crotal[x.id] = x.crotal;
    const out = [];
    for (const e of ev) { if (e.datos && e.datos.origen === 'historico') continue; out.push({ granja: 'porc', autor: e.autor, alias: e.autor_alias, fecha: e.fecha, clase: TIPOS_PORC[e.tipo] || e.tipo, que: `Cerda ${crotal[e.cerda_id] || '?'}${e.datos && e.datos.obs ? ` · ${e.datos.obs}` : ''}`, enlace: `porc/#/cerda/${e.cerda_id}` }); }
    for (const r of san) {
      const que = `${r.producto || ''}${r.zona ? ` · ${r.zona}` : ''}${r.cerda_id ? ` · cerda ${crotal[r.cerda_id] || '?'}` : ''}${r.verraco_id ? ` · verraco ${crotal[r.verraco_id] || '?'}` : ''}`;
      if (r.estado === 'realizado') out.push({ granja: 'porc', alias: r.realizado_por || r.autor_alias, fecha: r.fecha, clase: `Sanidad: ${SAN_PORC[r.tipo] || r.tipo}`, que, enlace: 'porc/#/sanidad/registro' });
      if (r.estado === 'cancelado' && r.cancelado_por) out.push({ granja: 'porc', alias: r.cancelado_por, fecha: r.cancelado_fecha || r.fecha, clase: 'Sanidad cancelada', que: `${SAN_PORC[r.tipo] || r.tipo} · ${que}`, enlace: 'porc/#/sanidad' });
      if (r.estado === 'previsto' || (r.realizado_por && r.realizado_por !== r.autor_alias)) out.push({ granja: 'porc', alias: r.autor_alias, fecha: String(r.creado).slice(0, 10), clase: 'Sanidad programada', que: `${SAN_PORC[r.tipo] || r.tipo} · ${que}`, enlace: 'porc/#/sanidad' });
    }
    for (const x of ext) out.push({ granja: 'porc', alias: x.autor_alias, fecha: x.fecha, clase: 'Extracción de semen', que: `Verraco ${crotal[x.verraco_id] || '?'} · ${x.n_dosis} dosis`, enlace: `porc/#/verraco/${x.verraco_id}` });
    for (const x of rec) out.push({ granja: 'porc', alias: x.autor_alias, fecha: x.fecha, clase: 'Recuento', que: `${x.estancia}: ${x.n}`, enlace: 'porc/#/plano' });
    for (const x of mov) out.push({ granja: 'porc', alias: x.autor_alias, fecha: x.fecha, clase: `Lechoneras y cebo: ${x.tipo}`, que: `${x.n} · ${[x.origen, x.destino].filter(Boolean).join(' → ')}`, enlace: 'porc/#/plano' });
    for (const x of cen) if (x.autor_alias) out.push({ granja: 'porc', alias: x.autor_alias, curso: x.granja_id, fecha: x.fecha, clase: x.mov === 'alta' ? 'Alta' : x.mov === 'baja' ? 'Baja' : 'Baja anulada', que: `${x.animal === 'cerda' ? 'Cerda' : 'Verraco'} ${x.crotal}${x.causa ? ` · ${x.causa}` : ''}`, enlace: 'porc/#/censo/historial' });
    return out;
  }

  function registrosDe() {
    const out = [];
    const auto = ['alta', 'baja', 'baja_anulada', 'datos'];
    for (const e of S.eventos) {
      if (e.datos && e.datos.importado) continue;
      if (auto.includes(e.tipo) && !['alta', 'baja'].includes(e.tipo)) continue;
      out.push({ autor: e.autor, alias: e.autor_alias, curso: e.curso, fecha: e.fecha, clase: TIPOS[e.tipo] || e.tipo, que: `${nombreA(animal(e.animal_id))}: ${resumenEvento(e).replace(/<[^>]+>/g, '')}`, enlace: `#/animal/${e.animal_id}` });
    }
    for (const r of S.sanidad) {
      if (r.estado === 'realizado') out.push({ autor: r.realizado_por === r.autor_alias ? r.autor : null, alias: r.realizado_por || r.autor_alias, curso: r.realizado_por === r.autor_alias ? r.curso : null, fecha: r.fecha, clase: 'Sanidad', que: `${L.TIPOS_SAN[r.tipo]} · ${r.producto || ''} · ${destinoSan(r)}`, enlace: `#/sanidad/editar/${r.id}` });
      if (r.estado === 'cancelado' && r.cancelado_por) out.push({ alias: r.cancelado_por, fecha: r.cancelado_fecha || r.fecha, clase: 'Sanidad cancelada', que: `${L.TIPOS_SAN[r.tipo]} · ${L.MOTIVOS_CANCEL[r.cancelado_motivo] || ''}`, enlace: `#/sanidad/cancelar/${r.id}` });
      if (r.estado === 'previsto' || r.realizado_por !== r.autor_alias) out.push({ autor: r.autor, alias: r.autor_alias, curso: r.curso, fecha: String(r.creado).slice(0, 10), clase: 'Sanidad programada', que: `${L.TIPOS_SAN[r.tipo]} · ${r.producto || ''}`, enlace: `#/sanidad/editar/${r.id}` });
    }
    for (const l of S.lotes) out.push({ autor: l.autor, alias: l.autor_alias, curso: l.curso, fecha: l.fecha_entrada, clase: 'Lote de cubrición', que: l.nombre, enlace: `#/lote/${l.id}` });
    for (const m of S.manejo) out.push({ autor: m.autor, alias: m.autor_alias, curso: m.curso, fecha: m.fecha, clase: 'Manejo diario', que: `${m.tareas.map((t) => L.TAREAS[t] || t).join(', ')}${m.detalle ? ` · ${m.detalle}` : ''}`, enlace: '#/manejo' });
    for (const x of out) x.granja = 'rumi';
    out.push(...(S.porcAct || []));
    // El curso de cada registro es el del perfil de quien lo hizo (se busca por su alias).
    const cursoAlias = {}; for (const p of Object.values(S.nombres)) if (p.alias && p.granja_id) cursoAlias[p.alias] = p.granja_id;
    for (const x of out) if (x.alias && cursoAlias[x.alias]) x.curso = cursoAlias[x.alias];
    for (const x of out) if (!x.curso && x.alias && cursoAlias[x.alias]) x.curso = cursoAlias[x.alias];
    return out;
  }
  async function vistaActividad(alias) {
    if (S.perfil.rol === 'veterinario') return vistaNoEncontrado('La actividad de los alumnos la ve el profesor.');
    if (!S.porcAct || !S.porcActCargado || Date.now() - S.porcActCargado > 60000) {
      pintar(`${cabecera()}<main class="cuerpo"><div class="ok-caja">Reuniendo la actividad de las dos granjas…</div></main>${navegacion('mas')}`);
      try { S.porcAct = await cargarPorcino(); S.porcActCargado = Date.now(); } catch (e) { S.porcAct = []; toast(`No se pudo leer porcino: ${traducirError(e)}`); }
    }
    return pintarActividad(alias);
  }
  function pintarActividad(alias) {
    const desde = S.borrador.actDesde || `${hoy().slice(0, 7)}-01`; const hasta = S.borrador.actHasta || hoy(); const cursoF = S.borrador.actCurso || ''; const granjaF = S.borrador.actGranja || '';
    const GR = { rumi: 'Rumiantes', porc: 'Porcino' };
    const profes = new Set(Object.values(S.nombres).filter((p) => p.rol === 'profesor').map((p) => p.alias));
    let regs = registrosDe().filter((x) => x.fecha >= desde && x.fecha <= hasta && x.alias && !profes.has(x.alias) && (!granjaF || x.granja === granjaF));
    if (!esProf()) regs = regs.filter((x) => x.alias === S.perfil.alias);
    else if (cursoF) regs = regs.filter((x) => String(x.curso || '') === cursoF);
    const sel = esProf() ? alias && decodeURIComponent(alias) : S.perfil.alias;
    const filtros = `<div class="dos"><div class="campo"><label for="a-desde">Desde</label><input id="a-desde" type="date" value="${desde}"></div><div class="campo"><label for="a-hasta">Hasta</label><input id="a-hasta" type="date" value="${hasta}"></div></div>
      <div class="pestanas">${[['', 'Las dos granjas'], ['rumi', 'Rumiantes'], ['porc', 'Porcino']].map(([k, t]) => `<button type="button" data-granja="${k}" class="${granjaF === k ? 'activo' : ''}">${t}</button>`).join('')}</div>
      ${esProf() ? `<div class="pestanas">${[['', 'Todos'], ['1', '1.º'], ['2', '2.º']].map(([k, t]) => `<button type="button" data-curso="${k}" class="${cursoF === k ? 'activo' : ''}">${t}</button>`).join('')}</div>` : ''}`;
    let cuerpo;
    if (sel) {
      const mios = regs.filter((x) => x.alias === sel).sort((x, y) => y.fecha.localeCompare(x.fecha));
      const nombre = Object.values(S.nombres).find((p) => p.alias === sel);
      cuerpo = `<h2>${esc(nombre && nombre.nombre ? `${nombre.nombre} (${sel})` : sel)} · ${mios.length} registros</h2>
        ${mios.map((x) => `<a class="evento enlace" href="${x.enlace}"><div class="entre"><strong><span class="chip ${x.granja === 'porc' ? 'gris' : ''}">${GR[x.granja]}</span> ${esc(x.clase)}</strong><span class="suave">${fmt(x.fecha)}</span></div><div class="suave peq">${esc(x.que)}</div></a>`).join('') || '<div class="vacio">Sin registros en esas fechas.</div>'}`;
    } else {
      const por = {}; for (const x of regs) { const k = x.alias; (por[k] = por[k] || { curso: x.curso, n: 0, tipos: {}, rumi: 0, porc: 0 }); por[k].n++; por[k][x.granja]++; por[k].tipos[x.clase] = (por[k].tipos[x.clase] || 0) + 1; }
      const filas = Object.entries(por).sort((a, b) => String(a[1].curso || 9).localeCompare(String(b[1].curso || 9)) || a[0].localeCompare(b[0], 'es', { numeric: true }));
      cuerpo = `<div class="suave">Cuenta lo que cada uno ha registrado en CIFEARUMI y en CIFEAPORC (sin los datos importados). Toca un alumno para ver el detalle.</div>
        <div class="lista">${filas.map(([al, o]) => { const nm = Object.values(S.nombres).find((p) => p.alias === al); return `<a class="animal-fila" href="#/actividad/${encodeURIComponent(al)}"><div><strong>${esc(nm && nm.nombre ? `${nm.nombre} (${al})` : al)}</strong><div class="suave peq">${o.curso ? `${o.curso}.º · ` : ''}<strong>rumiantes ${o.rumi} · porcino ${o.porc}</strong></div><div class="suave peq">${Object.entries(o.tipos).map(([t, n]) => `${esc(t)} ${n}`).join(' · ')}</div></div><span class="chip">${o.n}</span></a>`; }).join('') || '<div class="vacio">Sin registros en esas fechas.</div>'}</div>
        <button class="btn sec" type="button" id="b-act-excel">Descargar en Excel</button><div id="estado-act"></div>`;
    }
    pintar(`${cabecera(sel && esProf() ? { volver: '#/actividad', textoVolver: 'Actividad', titulo: 'Actividad' } : {})}
      <main class="cuerpo"><h1 style="font-size:22px">${esProf() ? 'Actividad de los alumnos' : 'Mi actividad'}</h1>${filtros}${cuerpo}</main>${navegacion('mas')}`);
    const cambio = () => { S.borrador.actDesde = document.getElementById('a-desde').value || desde; S.borrador.actHasta = document.getElementById('a-hasta').value || hasta; pintarActividad(alias); };
    $app.querySelectorAll('[data-granja]').forEach((b) => b.addEventListener('click', () => { S.borrador.actGranja = b.dataset.granja; pintarActividad(alias); }));
    document.getElementById('a-desde').addEventListener('change', cambio); document.getElementById('a-hasta').addEventListener('change', cambio);
    $app.querySelectorAll('[data-curso]').forEach((b) => b.addEventListener('click', () => { S.borrador.actCurso = b.dataset.curso; pintarActividad(alias); }));
    const bx = document.getElementById('b-act-excel');
    if (bx) bx.addEventListener('click', async () => {
      try { await cargarXLSX(); const X = window.XLSX; const libro = X.utils.book_new();
        const col = (x) => `${GR[x.granja]}: ${x.clase}`;
        const tipos = [...new Set(regs.map(col))].sort();
        const por = {}; for (const x of regs) { (por[x.alias] = por[x.alias] || { Alias: x.alias, Nombre: (Object.values(S.nombres).find((p) => p.alias === x.alias) || {}).nombre || '', Curso: x.curso ? `${x.curso}.º` : '', Total: 0, Rumiantes: 0, Porcino: 0 }); por[x.alias].Total++; por[x.alias][GR[x.granja]]++; por[x.alias][col(x)] = (por[x.alias][col(x)] || 0) + 1; }
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(Object.values(por).map((o) => { for (const t of tipos) o[t] = o[t] || 0; return o; })), 'Resumen');
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(regs.sort((x, y) => x.alias.localeCompare(y.alias) || x.fecha.localeCompare(y.fecha)).map((x) => ({ Alias: x.alias, Curso: x.curso ? `${x.curso}.º` : '', Granja: GR[x.granja], Fecha: x.fecha, Registro: x.clase, Detalle: x.que }))), 'Detalle');
        X.writeFile(libro, `CIFEAFARM_actividad_${desde}_${hasta}.xlsx`);
      } catch (e) { document.getElementById('estado-act').innerHTML = errorCaja(traducirError(e)); }
    });
  }

  // ---------------------------------------------------------------- censo
  function vistaCenso() {
    const f = S.borrador.fechaCenso || hoy();
    const vivos = S.animales.filter((a) => L.vivoEn(a, f));
    const en = (a) => L.ubicacion(a, S.porAnimal[a.id], f) || 0;
    const fila = (esp) => Object.entries(L.CAT).filter(([, x]) => x.especie === esp).map(([k, x]) => { const n = vivos.filter((a) => a.categoria === k).length; return `<tr><td>${x.plural}</td><td class="num">${n}</td></tr>`; }).join('');
    const tot = (esp) => vivos.filter((a) => a.especie === esp).length;
    const desde = S.borrador.desdeMov || `${hoy().slice(0, 4)}-01-01`;
    const movs = S.eventos.filter((e) => ['alta', 'baja', 'baja_anulada'].includes(e.tipo) && e.fecha >= desde && !(e.datos && e.datos.importado)).sort(L.porFecha).reverse();
    pintar(`${cabecera()}
      <main class="cuerpo">${faltaSQLCaja()}
        <h1 style="font-size:22px">Censo</h1>
        <div class="campo"><label for="f-fecha">A fecha de</label><input id="f-fecha" type="date" value="${f}" max="${hoy()}"></div>
        <div class="dos">
          <section class="tarjeta"><h2>Caprino · ${tot('caprino')}</h2><table class="tabla"><tbody>${fila('caprino')}</tbody></table></section>
          <section class="tarjeta"><h2>Ovino · ${tot('ovino')}</h2><table class="tabla"><tbody>${fila('ovino')}</tbody></table></section></div>
        <section class="tarjeta"><h2>Por corralina</h2><table class="tabla"><thead><tr><th>Corralina</th><th class="num">Caprino</th><th class="num">Ovino</th></tr></thead><tbody>
          ${S.corralinas.slice().sort((x, y) => x.nave.localeCompare(y.nave) || x.numero - y.numero).map((c) => { const l = vivos.filter((a) => en(a) === c.id); return l.length ? `<tr><td>${esc(c.nave)} · ${c.numero}</td><td class="num">${l.filter((a) => a.especie === 'caprino').length}</td><td class="num">${l.filter((a) => a.especie === 'ovino').length}</td></tr>` : ''; }).join('')}
          ${(() => { const l = vivos.filter((a) => !en(a)); return l.length ? `<tr><td>Sin ubicar</td><td class="num">${l.filter((a) => a.especie === 'caprino').length}</td><td class="num">${l.filter((a) => a.especie === 'ovino').length}</td></tr>` : ''; })()}
        </tbody></table></section>
        <button class="btn sec" type="button" id="b-excel">Descargar el censo en Excel</button><div id="estado-excel"></div>
        <section class="tarjeta"><div class="entre"><h2>Altas y bajas</h2><input id="f-desde" type="date" value="${desde}" aria-label="Desde" style="max-width:170px"></div>
          ${movs.map((e) => { const a = animal(e.animal_id); return `<a class="evento enlace" href="#/animal/${e.animal_id}"><div class="entre"><strong>${esc(nombreEvento(e))} · ${esc(nombreA(a))}</strong><span class="suave">${fmt(e.fecha)}</span></div><div class="suave peq">${esc(a ? catNombre(a.categoria) : '')} · ${resumenEvento(e)} · ${esc(quienEs(e.autor, e.autor_alias))}</div></a>`; }).join('') || '<div class="suave">Sin altas ni bajas desde esa fecha (no cuenta el censo importado).</div>'}</section>
      </main>${navegacion('censo')}`);
    document.getElementById('f-fecha').addEventListener('change', (ev) => { S.borrador.fechaCenso = ev.target.value || hoy(); vistaCenso(); });
    document.getElementById('f-desde').addEventListener('change', (ev) => { S.borrador.desdeMov = ev.target.value; vistaCenso(); });
    document.getElementById('b-excel').addEventListener('click', async (ev) => {
      const est = document.getElementById('estado-excel'); ev.target.disabled = true;
      try {
        await cargarXLSX(); const X = window.XLSX; const libro = X.utils.book_new();
        const filas = vivos.slice().sort((x, y) => x.especie.localeCompare(y.especie) || L.ordenNatural(x, y)).map((a) => filaExcel(a, en(a)));
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(filas.length ? filas : [{ '': 'Sin animales' }]), 'Censo');
        const res = []; for (const [k, x] of Object.entries(L.CAT)) res.push({ Especie: L.ESPECIES[x.especie].nombre, Categoría: x.plural, Animales: vivos.filter((a) => a.categoria === k).length });
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(res), 'Resumen');
        X.writeFile(libro, `CIFEARUMI_censo_${f}.xlsx`);
        est.innerHTML = '<div class="ok-caja" role="status">Excel descargado. Búscalo en Descargas.</div>';
      } catch (e) { est.innerHTML = errorCaja(traducirError(e)); }
      ev.target.disabled = false;
    });
  }
  const filaExcel = (a, u) => ({ Especie: L.ESPECIES[a.especie].nombre, Raza: raza(a), 'Nº manejo': a.manejo || '', 'Código cría': a.codigo_cria || '', Crotal: a.crotal || '', Categoría: catNombre(a.categoria), Sexo: a.sexo || '', Capa: a.capa ? L.CAPAS[a.capa] : '', Nacimiento: a.fecha_nacimiento || a.anio_nacimiento || '', Madre: a.madre_id ? nombreA(animal(a.madre_id)) : a.madre_txt || '', Padre: a.padre_id ? nombreA(animal(a.padre_id)) : a.padre_txt || '', Origen: a.origen ? L.ORIGENES[a.origen] : '', Corralina: u ? nombreCorr(u) : '', Alta: a.fecha_alta, Baja: a.fecha_baja || '', 'Causa baja': a.causa_baja || '', Observaciones: a.obs || '' });
  const cargarScript = (src) => new Promise((ok, mal) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = () => mal(new Error('No se pudo cargar el lector de Excel. Revisa la conexión.')); document.head.appendChild(sc); });
  const cargarXLSX = async () => { if (!window.XLSX) await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'); };
  function descargar(nombre, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const x = document.createElement('a'); x.href = url; x.download = nombre; document.body.appendChild(x); x.click(); x.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ---------------------------------------------------------------- gestión (profesor)
  function vistaGestion() {
    if (!esProf()) return vistaCuenta();
    const imp = S.importacion;
    const buenas = imp ? imp.filas.filter((r) => !r.errores.length && !r.repetido) : [];
    pintar(`${cabecera()}
      <main class="cuerpo">${faltaSQLCaja()}
        <h1 style="font-size:22px">Gestión</h1>
        <section class="tarjeta"><h2>Importar el censo desde Excel</h2>
          <div class="suave">Usa la plantilla <strong>CIFEARUMI_censo</strong> (hoja «Censo»). Los animales cuyo crotal ya esté en la app se saltan, así que puedes importar el mismo archivo dos veces sin duplicar.</div>
          <input type="file" id="archivo" accept=".xlsx,.xls" aria-label="Elegir archivo Excel">
          <div id="estado-imp">${imp ? `<div class="${buenas.length ? 'ok-caja' : 'aviso-caja'}">${esc(imp.nombre)}: <strong>${buenas.length}</strong> animales listos para importar${imp.filas.length - buenas.length ? ` · ${imp.filas.length - buenas.length} se saltan` : ''}.</div>` : ''}</div>
          ${imp ? `${(() => { const malas = imp.filas.filter((r) => r.errores.length || r.repetido); return malas.length ? `<div class="aviso-caja"><strong>Se saltan ${malas.length} filas:</strong><ul class="saltan">${malas.map((r) => `<li>Fila ${r.n}${r.fila.manejo ? ` (${esc(r.fila.manejo)})` : ''}: ${esc(r.repetido ? 'ya está en la app' : r.errores.join('; '))}</li>`).join('')}</ul>Corrígelas en el Excel y vuelve a importarlo, o dalas de alta a mano.</div>` : ''; })()}
            <div class="campo"><label for="fecha-imp">Fecha de alta en el censo</label><input id="fecha-imp" type="date" value="${hoy()}" max="${hoy()}"><span class="ayuda">La fecha desde la que estos animales cuentan en el censo de la app.</span></div>
            <div class="botones"><button class="btn" type="button" id="b-importar" ${buenas.length ? '' : 'disabled'}>Importar ${buenas.length} animales</button><button class="btn sec" type="button" id="b-cancelar-imp">Cancelar</button></div>
            <details><summary class="suave" style="min-height:44px;display:flex;align-items:center">Ver todas las filas (${imp.filas.length})</summary><div class="tabla-scroll"><table class="tabla ancha"><thead><tr><th>Fila</th><th>Especie</th><th>Collar</th><th>Crotal</th><th>Categoría</th><th>Corralina</th><th>Estado</th></tr></thead><tbody>
            ${imp.filas.map((r) => `<tr class="${r.errores.length || r.repetido ? 'mal' : ''}"><td>${r.n}</td><td>${esc(r.fila.especie || '—')}</td><td>${esc(r.fila.manejo || (r.fila.madre ? `cría de ${r.fila.madre}` : '—'))}</td><td>${esc(r.fila.crotal || '—')}</td><td>${esc(r.fila.categoria ? catNombre(r.fila.categoria) : '—')}</td><td>${esc(r.fila.corralina_id ? nombreCorrCorto(r.fila.corralina_id) : '—')}</td>
              <td>${r.repetido ? 'Ya está en la app' : r.errores.length ? `<span class="rojo">${esc(r.errores.join('; '))}</span>` : `OK${r.avisos.length ? ` · <span class="suave">${esc(r.avisos.join('; '))}</span>` : ''}`}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
        </section>
        <section class="tarjeta"><h2>Copia de seguridad</h2>
          <div class="suave">El plan gratuito de Supabase no hace copias automáticas. Descarga una cada mes: el Excel sirve para consultar y el archivo .json para restaurar.</div>
          <div class="botones"><button class="btn sec" type="button" data-copia="xlsx">Excel</button>${esAdmin() ? '<button class="btn sec" type="button" data-copia="json">Archivo .json</button>' : ''}</div>${esAdmin() ? '' : '<div class="suave peq">En tu copia, los alumnos aparecen sin alias. El archivo para restaurar lo descarga el profesor.</div>'}<div id="estado-copia"></div></section>
        <section class="tarjeta"><h2>Corralinas</h2><div class="suave">El uso de cada corralina se cambia desde el <a href="#/mapa">Mapa</a>, tocando la corralina.</div></section>
        ${esAdmin() ? `<section class="tarjeta"><h2>Acceso por curso</h2>
          ${(S.cursos || []).length && S.cursos[0].acceso === undefined ? '<div class="aviso-caja">Para usar este interruptor, ejecuta en Supabase el archivo <code>sql/04_acceso_por_curso.sql</code>.</div>' : `
          <div class="suave">Con el acceso cerrado, los alumnos de ese curso no pueden entrar en ninguna granja. Sus cuentas no se tocan: al abrirlo, siguen como estaban.</div>
          ${(S.cursos || []).map((g) => `<div class="entre curso-acceso"><div><strong>${g.id}.º curso</strong><div class="suave peq">${(() => { const n = Object.values(S.nombres).filter((p) => p.rol === 'alumno' && p.granja_id === g.id).length; return `${n} ${n === 1 ? 'alumno' : 'alumnos'}`; })()}</div></div>
            <button class="btn ${g.acceso ? 'sec' : ''} peq" type="button" data-acceso="${g.id}" data-abrir="${g.acceso ? '0' : '1'}">${g.acceso ? 'Abierto · cerrar' : 'Cerrado · abrir'}</button></div>`).join('')}`}</section>` : ''}
        ${esAdmin() ? seccionVeterinaria() : ''}
        ${esAdmin() ? `<section class="tarjeta"><h2>Alumnos</h2><div class="suave">Las cuentas (alias, PIN y nombres) sirven para las dos granjas. Se crean y gestionan en una sola pantalla.</div><a class="btn sec" href="porc/#/admin/alumnos">Gestionar alumnos</a></section>` : ''}
        <a class="btn sec" href="#/cuenta">${ICONOS.cuenta}Tu cuenta</a>
      </main>${navegacion('gestion')}`);
    document.getElementById('archivo').addEventListener('change', (ev) => leerExcel(ev.target.files[0]));
    const bi = document.getElementById('b-importar'); if (bi) bi.addEventListener('click', () => importar(buenas));
    const bc = document.getElementById('b-cancelar-imp'); if (bc) bc.addEventListener('click', () => { S.importacion = null; vistaGestion(); });
    $app.querySelectorAll('[data-copia]').forEach((b) => b.addEventListener('click', () => descargarCopia(b.dataset.copia, b)));
    enlazarVeterinaria();
    $app.querySelectorAll('[data-acceso]').forEach((b) => b.addEventListener('click', async () => {
      const abrir = b.dataset.abrir === '1';
      if (!abrir && b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = `¿Cerrar ${b.dataset.acceso}.º? Pulsa otra vez`; return; }
      const { error } = await sb.from('granjas').update({ acceso: abrir }).eq('id', Number(b.dataset.acceso));
      if (error) return toast(traducirError(error));
      toast(`${b.dataset.acceso}.º curso: acceso ${abrir ? 'abierto' : 'cerrado'}`); await refrescar(); vistaGestion();
    }));
  }
  // ---- Veterinaria: alta con alias y PIN (sin correo), nuevo PIN y desactivar. Solo el profesor.
  const pinAzar = () => String(Math.floor(100000 + Math.random() * 900000));
  function seccionVeterinaria() {
    if (!S.vets) { sb.from('perfiles').select('*').eq('rol', 'veterinario').order('creado').then((r) => { S.vets = r.error ? [] : r.data; if (location.hash.startsWith('#/gestion')) vistaGestion(); }); return '<section class="tarjeta"><h2>Veterinaria</h2><div class="suave">Cargando…</div></section>'; }
    const res = S.borrador.vetCreada;
    return `<section class="tarjeta"><h2>Veterinaria</h2>
      <div class="suave">Entra con la pestaña <strong>Veterinaria</strong>, su alias y su PIN. Trabaja con los animales y la granja (registros, datos de los animales, productos, censo y copias). No tiene nada que ver con los alumnos: no los ve, no los gestiona ni abre o cierra el acceso de un curso.</div>
      ${res ? `<div class="ok-caja" role="status"><strong>Anota y entrégale estos datos:</strong> alias <strong>${esc(res.alias)}</strong> · PIN <strong>${esc(res.pin)}</strong>. El PIN no se vuelve a mostrar.</div>` : ''}
      ${S.vets.map((v) => `<div class="entre curso-acceso"><div><strong>${esc(v.alias)}</strong><div class="suave peq">${v.activo ? 'Activa' : 'Desactivada'}</div></div>
        <div class="botones" style="flex:none"><button class="btn sec peq" type="button" data-vet-pin="${v.user_id}" data-alias="${esc(v.alias)}">Nuevo PIN</button><button class="btn sec peq" type="button" data-vet-activo="${v.user_id}" data-valor="${v.activo ? '0' : '1'}">${v.activo ? 'Desactivar' : 'Activar'}</button></div></div>`).join('')}
      <form class="formu" id="f-vet" novalidate><div class="dos"><div class="campo"><label for="vet-alias">Alias</label><input id="vet-alias" name="alias" type="text" maxlength="10" autocapitalize="characters" placeholder="VET1"></div>
        <div class="campo"><label for="vet-pin">PIN</label><input id="vet-pin" name="pin" type="text" inputmode="numeric" maxlength="6" value="${pinAzar()}"></div></div>
        <button class="btn sec" type="submit">Dar de alta</button></form><div id="msg-vet"></div></section>`;
  }
  function enlazarVeterinaria() {
    const f = document.getElementById('f-vet'); if (!f) return;
    const msg = (t) => { document.getElementById('msg-vet').innerHTML = errorCaja(t); };
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const x = new FormData(f); const alias = String(x.get('alias') || '').trim().toUpperCase(); const pin = String(x.get('pin') || '').trim();
      if (!/^[A-Z0-9]{1,10}$/.test(alias)) return msg('El alias solo puede tener letras y números (máximo 10), sin espacios.');
      if (!/^\d{6}$/.test(pin)) return msg('El PIN debe tener 6 cifras.');
      f.querySelector('button').disabled = true;
      // Cliente aparte para no cerrar la sesión del profesor.
      const sb2 = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'farm-alta' } });
      const { data, error } = await sb2.auth.signUp({ email: `${alias.toLowerCase()}.vet@${C.dominioAlumnos}`, password: pin });
      if (error || !data.user || (data.user.identities && !data.user.identities.length)) { f.querySelector('button').disabled = false; return msg(error ? traducirError(error) : 'Ese alias ya existe.'); }
      const r = await sb.from('perfiles').insert({ user_id: data.user.id, alias, rol: 'veterinario', granja_id: null });
      if (r.error) { f.querySelector('button').disabled = false; return msg(/check/i.test(r.error.message) ? 'Falta ejecutar en Supabase sql/05_veterinaria.sql.' : traducirError(r.error)); }
      S.borrador.vetCreada = { alias, pin }; S.vets = null; await refrescar(); vistaGestion();
    });
    $app.querySelectorAll('[data-vet-pin]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.confirmar !== '1') { b.dataset.confirmar = '1'; b.textContent = '¿Seguro?'; return; }
      const pin = pinAzar(); const { error } = await sb.rpc('restablecer_pin', { p_user: b.dataset.vetPin, p_pin: pin });
      if (error) return toast(traducirError(error));
      S.borrador.vetCreada = { alias: b.dataset.alias, pin }; vistaGestion();
    }));
    $app.querySelectorAll('[data-vet-activo]').forEach((b) => b.addEventListener('click', async () => {
      const { error } = await sb.from('perfiles').update({ activo: b.dataset.valor === '1' }).eq('user_id', b.dataset.vetActivo);
      if (error) return toast(traducirError(error));
      S.vets = null; toast(b.dataset.valor === '1' ? 'Activada' : 'Desactivada'); vistaGestion();
    }));
  }
  async function leerExcel(file) {
    const est = document.getElementById('estado-imp');
    if (!file) return;
    est.innerHTML = '<div class="ok-caja">Leyendo el archivo…</div>';
    try {
      await cargarXLSX();
      const libro = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const hoja = libro.Sheets.Censo || libro.Sheets[libro.SheetNames.find((n) => /censo/i.test(n)) || libro.SheetNames[0]];
      const tabla = window.XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' });
      const col = L.mapaColumnas(tabla[0] || []);
      if (col.especie === undefined || col.categoria === undefined) throw new Error('No encuentro las columnas «Especie» y «Categoría». ¿Es la plantilla del censo?');
      const crotales = new Set(S.animales.map((a) => a.crotal).filter(Boolean)); const vistos = new Set(); const collares = new Set();
      const vivosCollar = new Set(activos().filter((a) => a.manejo).map((a) => `${a.especie}|${a.manejo}`));
      const filas = [];
      tabla.slice(1).forEach((celdas, i) => {
        const vals = Object.values(col).map((k) => celdas[k]);
        if (!vals.some((x) => x !== '' && x !== null && x !== undefined)) return;
        const r = L.normalizarFila(celdas, col, S.corralinas); r.n = i + 2;
        if (r.fila.crotal && crotales.has(r.fila.crotal)) r.repetido = true;
        if (r.fila.crotal) { if (vistos.has(r.fila.crotal)) r.errores.push('Crotal repetido en el archivo'); vistos.add(r.fila.crotal); }
        if (r.fila.manejo && !r.repetido) {
          const k = `${r.fila.especie}|${r.fila.manejo}`;
          if (collares.has(k)) r.errores.push('Collar repetido en el archivo');
          if (vivosCollar.has(k)) r.errores.push('Ese collar ya lo lleva otro animal en la app');
          collares.add(k);
        }
        filas.push(r);
      });
      S.importacion = { nombre: file.name, filas };
      vistaGestion();
    } catch (e) { est.innerHTML = errorCaja(traducirError(e)); }
  }
  async function importar(buenas) {
    const b = document.getElementById('b-importar'); b.disabled = true; b.textContent = 'Importando…';
    const fecha = document.getElementById('fecha-imp').value || hoy();
    const { data, error } = await sb.rpc('rum_importar', { filas: buenas.map((r) => ({ ...r.fila, fecha_alta: fecha })) });
    if (error) { document.getElementById('estado-imp').innerHTML = errorCaja(traducirError(error)); b.disabled = false; b.textContent = 'Reintentar'; return; }
    S.importacion = null; toast(`${data} animales importados`); await refrescar(); location.hash = '#/mapa';
  }
  async function descargarCopia(formato, boton) {
    const estado = document.getElementById('estado-copia');
    boton.disabled = true; estado.innerHTML = '<div class="ok-caja">Preparando la copia…</div>';
    try {
      await cargarDatos();
      const sello = new Date(); const fichero = `CIFEARUMI_copia_${sello.getFullYear()}-${dos(sello.getMonth() + 1)}-${dos(sello.getDate())}_${dos(sello.getHours())}${dos(sello.getMinutes())}`;
      if (formato === 'json') {
        descargar(`${fichero}.json`, JSON.stringify({ app: 'CIFEAFARM', granja: 'CIFEARUMI', version: C.version, fecha: sello.toISOString(), rum_corralinas: S.corralinas, rum_animales: S.animales, rum_eventos: S.eventos, rum_lotes: S.lotes, rum_sanidad: S.sanidad, rum_manejo: S.manejo }, null, 1), 'application/json');
      } else {
        await cargarXLSX(); const X = window.XLSX; const libro = X.utils.book_new();
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(S.animales.slice().sort((x, y) => x.especie.localeCompare(y.especie) || L.ordenNatural(x, y)).map((a) => filaExcel(a, a.fecha_baja ? null : ubic(a)))), 'Animales');
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(S.eventos.map((e) => { const a = animal(e.animal_id); return { Fecha: e.fecha, Animal: nombreA(a), Crotal: a ? a.crotal || '' : '', Registro: nombreEvento(e), Detalle: resumenEvento(e).replace(/<[^>]+>/g, ''), Observaciones: (e.datos && e.datos.obs) || '', Curso: curso(e.curso), 'Registrado por': quienEs(e.autor, e.autor_alias), 'Registrado el': String(e.creado || '').slice(0, 16).replace('T', ' '), 'Datos completos': JSON.stringify(esVet() ? { ...(e.datos || {}), asistentes: undefined } : (e.datos || {})) }; }).concat([]) || [{}]), 'Historial');
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(S.medicamentos.length ? S.medicamentos.map((m) => ({ Producto: m.nombre, 'Materia activa': m.materia_activa || '', Clase: (m.clases || []).map(L.nombreClase).join(', '), 'Posología cabras': posologiaDe(m, 'caprino'), 'Posología ovejas': posologiaDe(m, 'ovino'), 'Posología cerdos': posologiaDe(m, 'porcino'), Vía: m.via || '', 'Espera leche rumiantes (d)': m.espera_leche_rum ?? '', 'Espera carne rumiantes (d)': m.espera_carne_rum ?? '', 'Espera carne cerdo (d)': m.supresion_dias ?? '', 'En uso': m.activo !== false ? 'Sí' : 'No' })) : [{ '': 'Sin productos' }]), 'Productos');
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(S.sanidad.length ? S.sanidad.map((r) => ({ Estado: { previsto: 'Previsto', realizado: 'Realizado', cancelado: 'Cancelado' }[r.estado], Fecha: r.fecha, Qué: L.TIPOS_SAN[r.tipo], 'Cancelado el': r.cancelado_fecha || '', 'Motivo de cancelación': L.MOTIVOS_CANCEL[r.cancelado_motivo] || '', 'Detalle de cancelación': r.cancelado_detalle || '', 'Cancelado por': verAlias(r.cancelado_por) || '', Carácter: L.CARACTER[r.caracter] || '', Análisis: r.analisis || '', Muestra: r.muestra || '', Laboratorio: r.laboratorio || '', Resultado: L.RESULTADOS[r.resultado] || '', 'Detalle del resultado': r.resultado_nota || '', Destino: destinoSan(r), Animales: (r.animales || []).map((x) => nombreA(animal(x))).join(', '), Producto: r.producto || '', Dosis: r.dosis || '', Vía: r.via || '', 'Días de tratamiento': r.duracion_dias, Lote: r.lote || '', Caducidad: r.caducidad || '', 'Espera carne (días)': r.espera_carne ?? '', 'Espera leche (días)': r.espera_leche ?? '', 'Carne no apta hasta': r.carne_hasta || '', 'Leche no apta hasta': r.leche_hasta || '', Motivo: r.motivo || '', Veterinario: r.veterinario || '', Observaciones: r.obs || '', 'Registrado por': verAlias(r.autor_alias, r.curso) || '', 'Realizado por': verAlias(r.realizado_por) || '' })) : [{ '': 'Sin registros' }]), 'Sanidad');
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(S.lotes.length ? S.lotes.map((l) => ({ Lote: l.nombre, Especie: L.ESPECIES[l.especie].nombre, Corralina: nombreCorr(l.corralina_id), Machos: l.machos.map((x) => nombreA(animal(x))).join(', '), Hembras: l.hembras.map((x) => nombreA(animal(x))).join(', '), 'Entrada del macho': l.fecha_entrada, 'Salida del macho': l.fecha_salida || '', 'Registrado por': verAlias(l.autor_alias, l.curso) || '' })) : [{ '': 'Sin lotes' }]), 'Lotes');
        X.utils.book_append_sheet(libro, X.utils.json_to_sheet(S.corralinas.map((c) => ({ Nave: c.nave, Corralina: c.numero, Uso: c.uso || '', Activa: c.activa ? 'Sí' : 'No' }))), 'Corralinas');
        X.writeFile(libro, `${fichero}.xlsx`);
      }
      S.ultimaCopia = sello; try { localStorage.setItem('farm-ultima-copia', sello.toISOString()); } catch (_) { /* sin almacenamiento */ }
      estado.innerHTML = `<div class="ok-caja" role="status">Copia descargada: ${S.animales.length} animales y ${S.eventos.length} registros. Búscala en Descargas.</div>`;
    } catch (e) { estado.innerHTML = errorCaja(traducirError(e)); }
    boton.disabled = false;
  }

  // ---------------------------------------------------------------- cuenta
  function vistaCuenta(mensaje) {
    pintar(`${cabecera()}
      <main class="cuerpo">
        <h1 style="font-size:22px">Tu cuenta</h1>
        <section class="tarjeta"><div class="filas">
          ${S.perfil.nombre ? `<div><span>Nombre</span><span>${esc(S.perfil.nombre)}</span></div>` : ''}
          <div><span>Alias</span><span>${esc(S.perfil.alias)}</span></div>
          <div><span>Rol</span><span>${rolNombre()}</span></div>
          ${esProf() ? '' : `<div><span>Curso</span><span>${curso(S.perfil.granja_id)}</span></div>`}</div></section>
        ${mensaje || ''}
        <form class="formu tarjeta" id="f-clave" novalidate>
          <h2>${esProf() ? 'Cambiar contraseña' : 'Cambiar PIN'}</h2>
          <div class="suave peq">Sirve para las dos granjas.</div>
          <div class="campo"><label for="n1">${esProf() ? 'Nueva contraseña (mínimo 8 caracteres)' : 'Nuevo PIN (6 cifras)'}</label>
            <input id="n1" name="n1" type="password" ${esProf() ? '' : 'inputmode="numeric" maxlength="6"'} autocomplete="new-password"></div>
          <div class="campo"><label for="n2">Repítelo</label>
            <input id="n2" name="n2" type="password" ${esProf() ? '' : 'inputmode="numeric" maxlength="6"'} autocomplete="new-password"></div>
          <button class="btn" type="submit">Guardar</button></form>
        <section class="tarjeta"><h2>Instalar en el móvil</h2>
          <div class="suave">Android: en Chrome, menú ⋮ → <strong>Instalar aplicación</strong>.<br>iPhone: en Safari, botón Compartir → <strong>Añadir a pantalla de inicio</strong>.</div></section>
        <a class="btn sec" href="#/granjas">Granjas del centro</a>
        <button class="btn sec" type="button" data-accion="salir">Salir</button>
        <div class="suave peq" style="text-align:center">CIFEAFARM · versión ${esc(C.version)}</div>
      </main>${navegacion('mas')}`);
    document.getElementById('f-clave').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target); const x = String(f.get('n1')); const y = String(f.get('n2'));
      const ok = esProf() ? x.length >= 8 : /^\d{6}$/.test(x);
      const err = (t) => vistaCuenta(errorCaja(t));
      if (!ok) return err(esProf() ? 'La contraseña debe tener al menos 8 caracteres.' : 'El PIN debe tener 6 cifras.');
      if (x !== y) return err('No coinciden.');
      const { error } = await sb.auth.updateUser({ password: x });
      if (error) return err(traducirError(error));
      vistaCuenta(`<div class="ok-caja" role="status">${esProf() ? 'Contraseña cambiada.' : 'PIN cambiado.'}</div>`);
    });
  }

  function vistaNoEncontrado(texto) {
    pintar(`${cabecera()}<main class="cuerpo"><div class="vacio">${esc(texto || 'No se ha encontrado lo que buscabas.')}</div>
      <a class="btn sec" href="#/inicio">Volver a Hoy</a></main>${navegacion('')}`);
  }

  // ---------------------------------------------------------------- enrutado
  function render() {
    if (!S.sesion) return vistaAcceso();
    if (!S.perfil) return vistaSinPerfil();
    const [ruta, a, b] = location.hash.replace(/^#\/?/, '').split('/');
    switch (ruta || 'inicio') {
      case 'granjas': return vistaGranjas();
      case 'inicio': return vistaInicio();
      case 'mapa': return vistaMapa();
      case 'corralina': return vistaCorralina(a);
      case 'animales': return vistaAnimales(a);
      case 'animal': return vistaFicha(a);
      case 'trasladar': return vistaTrasladar(a);
      case 'nota': return vistaNota(a, b);
      case 'corregir': return vistaCorregirEv(a, b);
      case 'correcciones': return vistaCorrecciones(a || 'pendientes');
      case 'baja': return vistaBaja(a);
      case 'alta': return vistaFormAnimal(null);
      case 'editar': return vistaFormAnimal(a);
      case 'censo': return vistaCenso();
      case 'reproduccion': return vistaRepro(a || 'lotes');
      case 'lote': return a === 'nuevo' ? vistaLoteNuevo() : vistaLote(a);
      case 'sacar': return vistaSacar(a);
      case 'eco': return vistaEco(a, b);
      case 'parto': return vistaParto(a);
      case 'registro': return vistaRegistro(a, b);
      case 'acrotalar': return vistaAcrotalar(a);
      case 'sanidad':
        if (['nuevo', 'programar'].includes(a)) return vistaSanForm(a, null, b, location.hash.split('/')[4]);
        if (['realizar', 'editar'].includes(a)) return vistaSanForm(a, b);
        if (a === 'cancelar') return vistaSanCancelar(b);
        return vistaSanidad(a || 'calendario');
      case 'medicamento': return vistaMedicamento(a, b);
      case 'mas': return vistaMas();
      case 'manejo': return a === 'nuevo' ? vistaManejoForm(null) : a === 'editar' ? vistaManejoForm(b) : vistaManejo();
      case 'seguimiento': return vistaSeguimiento(a, b);
      case 'actividad': return vistaActividad(a);
      case 'gestion': return vistaGestion();
      case 'cuenta': return vistaCuenta();
      default: return vistaNoEncontrado();
    }
  }

  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-accion]');
    if (!b) return;
    if (b.dataset.accion === 'refrescar') refrescar(true);
    if (b.dataset.accion === 'salir') {
      await sb.auth.signOut();
      Object.assign(S, { sesion: null, perfil: null, animales: [], eventos: [], porAnimal: {}, borrador: {}, importacion: null });
      location.hash = ''; vistaAcceso();
    }
  });
  window.addEventListener('hashchange', () => {
    const r = location.hash.replace(/^#\/?/, '').split('/')[0];
    if (!['alta', 'editar'].includes(r)) S.borrador.formAnimal = null;
    if (r !== 'lote') S.borrador.loteNuevo = null;
    if (r !== 'gestion') S.borrador.vetCreada = null;
    render();
  });
  setInterval(() => { const h = document.getElementById('hora-consulta'); if (h) h.textContent = fechaHora(new Date()); }, 20000);
  const escribiendo = () => /^#\/(alta|editar|trasladar|nota|baja|lote\/nuevo|sacar|eco|parto|registro|acrotalar|sanidad\/(nuevo|programar|realizar|editar|cancelar)|medicamento|manejo\/|seguimiento)/.test(location.hash);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.perfil && (!S.cargado || Date.now() - S.cargado > 120000) && !escribiendo()) refrescar();
  });

  async function iniciar() {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
      let recargado = !navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!recargado && !escribiendo()) { recargado = true; location.reload(); } });
    }
    try {
      const { data } = await sb.auth.getSession();
      S.sesion = data.session;
      if (S.sesion) await cargarTodo();
    } catch (e) {
      if (S.sesion) { pintar(`<main class="acceso"><div class="error-caja" role="alert">${esc(traducirError(e))}</div><button class="btn" type="button" onclick="location.reload()">Reintentar</button></main>`); return; }
    }
    sb.auth.onAuthStateChange((evento, sesion) => { S.sesion = sesion; if (evento === 'SIGNED_OUT') { S.perfil = null; render(); } });
    render();
  }
  iniciar();
})();
