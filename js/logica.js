// CIFEAFARM · lógica sin pantallas: categorías, ubicación, censo e importación.
(function () {
  'use strict';

  const ESPECIES = {
    caprino: { nombre: 'Caprino', raza: 'Murciano-granadina', plural: 'cabras' },
    ovino: { nombre: 'Ovino', raza: 'Segureña', plural: 'ovejas' },
  };

  // Orden = orden de presentación en listas y censos.
  const CAT = {
    cabra: { nombre: 'Cabra', plural: 'Cabras', especie: 'caprino', sexo: 'hembra' },
    chiva: { nombre: 'Chiva de reposición', plural: 'Chivas de reposición', especie: 'caprino', sexo: 'hembra' },
    macho_cabrio: { nombre: 'Macho cabrío', plural: 'Machos cabríos', especie: 'caprino', sexo: 'macho' },
    cabrito: { nombre: 'Cabrito', plural: 'Cabritos', especie: 'caprino', cria: true },
    oveja: { nombre: 'Oveja', plural: 'Ovejas', especie: 'ovino', sexo: 'hembra' },
    cordera: { nombre: 'Cordera de reposición', plural: 'Corderas de reposición', especie: 'ovino', sexo: 'hembra' },
    morueco: { nombre: 'Morueco', plural: 'Moruecos', especie: 'ovino', sexo: 'macho' },
    cordero: { nombre: 'Cordero', plural: 'Corderos', especie: 'ovino', cria: true },
  };
  const CAPAS = { negra: 'Negra', caoba: 'Caoba', bicolor: 'Bicolor' };
  const ORIGENES = { centro: 'Nacido en el centro', compra: 'Comprado', desconocido: 'Desconocido' };
  const CAUSAS_BAJA = ['Venta', 'Muerte', 'Sacrificio / desvieje', 'Otra'];

  const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const esCria = (a) => !!(CAT[a.categoria] && CAT[a.categoria].cria);

  // Nombre corto con el que se reconoce al animal en pantalla.
  const nombreAnimal = (a) => a.manejo || a.codigo_cria || (a.crotal ? `…${a.crotal.slice(-5)}` : '¿?');

  // Orden natural: A2 antes que A10; los que no tienen collar, al final.
  function ordenNatural(x, y) {
    const a = nombreAnimal(x), b = nombreAnimal(y);
    const pa = !x.manejo, pb = !y.manejo;
    if (pa !== pb) return pa ? 1 : -1;
    return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
  }

  // Eventos de traslado realizados, del más reciente al más antiguo.
  const porFecha = (e1, e2) => (e1.fecha === e2.fecha ? String(e1.creado).localeCompare(String(e2.creado)) : e1.fecha.localeCompare(e2.fecha));

  // Corralina de un animal en una fecha (por defecto, hoy): el último traslado
  // hasta esa fecha; si no hay, la corralina en la que entró.
  function ubicacion(animal, eventos, fecha) {
    let id = animal.corralina_id || null;
    for (const e of (eventos || []).slice().sort(porFecha)) {
      if (e.tipo !== 'traslado' || e.estado === 'previsto') continue;
      if (fecha && e.fecha > fecha) break;
      if (e.datos && e.datos.a != null) id = Number(e.datos.a);
    }
    return id;
  }

  const vivoEn = (a, fecha) => a.fecha_alta <= fecha && (!a.fecha_baja || a.fecha_baja > fecha);

  // Edad en texto ("3 años", "5 meses", "12 días").
  function edad(a, hoy) {
    if (a.fecha_nacimiento) {
      const d = dias(a.fecha_nacimiento, hoy);
      if (d < 0) return '—';
      if (d < 60) return `${d} ${d === 1 ? 'día' : 'días'}`;
      const m = Math.floor(d / 30.44);
      if (m < 24) return `${m} meses`;
      return `${Math.floor(m / 12)} años`;
    }
    if (a.anio_nacimiento) { const x = Number(hoy.slice(0, 4)) - a.anio_nacimiento; return `≈ ${x} ${x === 1 ? 'año' : 'años'}`; }
    return '—';
  }

  // Datos que el profesor debería revisar.
  function revisar(a) {
    const r = [];
    if (a.crotal && /^\d+$/.test(a.crotal) && a.crotal.length !== 15) r.push(`Crotal de ${a.crotal.length} cifras (¿falta el 7 inicial?)`);
    if (!esCria(a) && !a.manejo) r.push('Sin nº de manejo (collar)');
    if (!esCria(a) && !a.crotal) r.push('Sin crotal');
    if (a.especie === 'caprino' && !esCria(a) && !a.capa) r.push('Capa sin anotar');
    return r;
  }

  // ---------- Importación del Excel (plantilla CIFEARUMI_censo) ----------
  const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const COLUMNAS = [
    ['especie', /^especie/], ['crotal', /^crotal/], ['manejo', /manejo/], ['sexo', /^sexo/],
    ['categoria', /^categoria/], ['capa', /^capa/], ['fecha_nacimiento', /^fecha nac/], ['anio_nacimiento', /^ano nac/],
    ['madre', /^madre/], ['padre', /^padre/], ['origen', /^origen/], ['nave', /^nave/], ['corralina', /^corralina/],
    ['obs', /^observ/],
  ];
  function mapaColumnas(cabecera) {
    const m = {};
    cabecera.forEach((h, i) => {
      const t = sinAcentos(h);
      if (/madre/.test(t)) { if (m.madre === undefined) m.madre = i; return; }
      if (/padre/.test(t)) { if (m.padre === undefined) m.padre = i; return; }
      for (const [k, re] of COLUMNAS) if (m[k] === undefined && re.test(t)) { m[k] = i; break; }
    });
    return m;
  }
  const CAT_TEXTO = {
    cabra: 'cabra', 'chiva de reposicion': 'chiva', chiva: 'chiva', 'macho cabrio': 'macho_cabrio', macho: 'macho_cabrio',
    cabrito: 'cabrito', oveja: 'oveja', 'cordera de reposicion': 'cordera', cordera: 'cordera', morueco: 'morueco', cordero: 'cordero',
  };
  const ORIGEN_TEXTO = { 'nacido en el centro': 'centro', centro: 'centro', comprado: 'compra', compra: 'compra', desconocido: 'desconocido' };

  function fechaISO(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date && !isNaN(v)) { const d = new Date(v); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
    if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
    const t = String(v).trim();
    let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : 'mal';
  }

  // Convierte una fila del Excel en un animal listo para guardar; devuelve {fila, errores, avisos}.
  function normalizarFila(celdas, col, corralinas) {
    const v = (k) => (col[k] === undefined ? '' : celdas[col[k]]);
    const txt = (k) => { const x = v(k); return x === null || x === undefined ? '' : String(x).trim(); };
    const errores = [], avisos = [];
    const especie = { caprino: 'caprino', ovino: 'ovino' }[sinAcentos(txt('especie'))] || null;
    const categoria = CAT_TEXTO[sinAcentos(txt('categoria'))] || null;
    const sexo = { hembra: 'hembra', macho: 'macho' }[sinAcentos(txt('sexo'))] || null;
    const capa = { negra: 'negra', caoba: 'caoba', bicolor: 'bicolor' }[sinAcentos(txt('capa'))] || null;
    let crotal = txt('crotal').replace(/\s/g, '').toUpperCase(); if (/^\d+\.0+$/.test(crotal)) crotal = crotal.replace(/\.0+$/, '');
    const manejo = txt('manejo').toUpperCase();
    const fn = fechaISO(v('fecha_nacimiento'));
    const anio = txt('anio_nacimiento') ? Number(txt('anio_nacimiento')) : null;
    const nave = sinAcentos(txt('nave')); const num = Number(txt('corralina')) || null;
    const corr = num ? corralinas.find((c) => sinAcentos(c.nave) === nave && c.numero === num) : null;
    const origen = ORIGEN_TEXTO[sinAcentos(txt('origen'))] || null;
    if (!especie) errores.push('Falta la especie');
    if (!categoria) errores.push('Falta la categoría');
    else if (especie && CAT[categoria].especie !== especie) errores.push('La categoría no es de esa especie');
    const cria = categoria && CAT[categoria].cria;
    if (categoria && !cria && !crotal && !manejo) errores.push('Sin crotal ni nº de manejo');
    if (cria && !txt('madre')) errores.push('Cría sin madre');
    if (sexo && categoria && CAT[categoria].sexo && CAT[categoria].sexo !== sexo) errores.push('El sexo no cuadra con la categoría');
    if (capa && especie === 'ovino') errores.push('La capa solo se anota en caprino');
    if (fn === 'mal') errores.push('Fecha de nacimiento no válida');
    if (anio !== null && !(anio >= 1990 && anio <= 2100)) errores.push('Año de nacimiento no válido');
    if (num && !corr) errores.push('Corralina no encontrada');
    if (!num) avisos.push('Sin corralina');
    if (crotal && /^\d+$/.test(crotal) && crotal.length !== 15) avisos.push(`Crotal de ${crotal.length} cifras`);
    const fila = {
      especie, categoria, sexo: sexo || (categoria && CAT[categoria].sexo) || null, crotal: crotal || null, manejo: manejo || null, capa,
      fecha_nacimiento: fn && fn !== 'mal' ? fn : null, anio_nacimiento: anio, madre: txt('madre').toUpperCase() || null,
      padre: txt('padre').toUpperCase() || null, origen, corralina_id: corr ? corr.id : null, obs: txt('obs') || null,
    };
    return { fila, errores, avisos };
  }

  // =====================================================================
  // V2 · Reproducción
  // =====================================================================
  const REF = {
    gestacion: { caprino: 150, ovino: 147 }, // días (confirmados por Luis)
    ecoTrasSalida: 45,                       // ecografía a partir de 45 días de sacar el macho
    ordenoTrasParto: 1,                      // se ordeña desde el 2.º día (el 1.º, encalostrado)
    secadoDesde: '05-20', secadoHasta: '06-30', // secado natural a finales de mayo o principios de junio
  };
  const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const HEMBRAS = ['cabra', 'chiva', 'oveja', 'cordera'];
  const MACHOS = ['macho_cabrio', 'morueco'];
  const ESTADOS = {
    vacia: { nombre: 'Vacía' }, lote: { nombre: 'Con macho' }, cubierta: { nombre: 'Cubierta, sin ecografía' },
    gestante: { nombre: 'Gestante' }, lactacion: { nombre: 'En lactación' }, criando: { nombre: 'Criando' }, seca: { nombre: 'Seca' },
  };
  const ORDEN_TIPO = { lote: 0, eco: 1, parto: 2, inicio_ordeno: 3, destete: 4, secado: 5 };

  // Estado reproductivo de una hembra a partir de sus lotes y sus registros.
  // ctx = { eventos(id) → registros del animal, animal(id) → animal }
  function estadoRepro(h, lotes, ctx, hoy) {
    const it = [];
    for (const l of lotes) if ((l.hembras || []).includes(h.id)) it.push({ f: l.fecha_entrada, t: 'lote', l });
    for (const e of ctx.eventos(h.id)) if (['eco', 'parto', 'inicio_ordeno', 'secado'].includes(e.tipo) && e.estado !== 'previsto') it.push({ f: e.fecha, t: e.tipo, e });
    it.sort((a, b) => (a.f === b.f ? ORDEN_TIPO[a.t] - ORDEN_TIPO[b.t] : a.f.localeCompare(b.f)));
    const r = { estado: 'vacia', desde: null, lote: null, eco: null, parto: null, ordeno: null, partos: [] };
    for (const x of it) {
      if (x.t === 'lote') { r.estado = x.l.fecha_salida && x.l.fecha_salida <= hoy ? 'cubierta' : 'lote'; r.lote = x.l; r.eco = null; r.desde = x.f; }
      else if (x.t === 'eco') { r.eco = x.e; r.estado = x.e.datos && x.e.datos.resultado === 'vacia' ? 'vacia' : 'gestante'; r.desde = x.f; }
      else if (x.t === 'parto') { r.parto = x.e; r.partos.push(x.e); r.ordeno = null; r.estado = h.especie === 'caprino' ? 'lactacion' : 'criando'; r.desde = x.f; }
      else if (x.t === 'inicio_ordeno') { if (r.estado === 'lactacion') r.ordeno = x.e; }
      else if (x.t === 'secado') { if (r.estado === 'lactacion') { r.estado = 'seca'; r.desde = x.f; } }
    }
    // Ovejas: al destetar (o vender) todas las crías del último parto, vuelven a vacías.
    if (r.estado === 'criando' && r.parto) {
      const crias = (r.parto.datos.crias || []).map(ctx.animal).filter(Boolean);
      const destetada = (c) => c.fecha_baja || ctx.eventos(c.id).some((e) => e.tipo === 'destete');
      if (crias.length && crias.every(destetada)) r.estado = 'vacia';
    }
    if (['lote', 'cubierta', 'gestante'].includes(r.estado) && r.lote) {
      const g = REF.gestacion[h.especie];
      r.ventana = { desde: sumarDias(r.lote.fecha_entrada, g), hasta: sumarDias(r.lote.fecha_salida || hoy, g) };
      if (r.lote.fecha_salida) r.ecoDesde = sumarDias(r.lote.fecha_salida, REF.ecoTrasSalida);
    }
    if (r.parto) r.diasParto = dias(r.parto.fecha, hoy);
    return r;
  }

  // Avisos de reproducción para la pantalla Hoy.
  function avisosRepro(animales, lotes, ctx, hoy) {
    const out = [];
    const vivos = animales.filter((a) => !a.fecha_baja);
    const hembras = vivos.filter((a) => HEMBRAS.includes(a.categoria));
    const est = new Map(hembras.map((h) => [h.id, estadoRepro(h, lotes, ctx, hoy)]));
    for (const l of lotes.filter((x) => !x.fecha_salida)) {
      out.push({ nivel: 'info', fecha: l.fecha_entrada, enlace: `#/lote/${l.id}`, titulo: `Machos en ${l.nombre}`, detalle: `Desde el ${l.fecha_entrada.split('-').reverse().join('/')} · ${dias(l.fecha_entrada, hoy)} días · ${(l.hembras || []).length} hembras` });
    }
    for (const l of lotes.filter((x) => x.fecha_salida)) {
      const sin = hembras.filter((h) => { const e = est.get(h.id); return e.lote && e.lote.id === l.id && e.estado === 'cubierta'; });
      if (!sin.length) continue;
      const desde = sumarDias(l.fecha_salida, REF.ecoTrasSalida); const falta = dias(hoy, desde);
      if (falta <= 7) out.push({ nivel: falta <= 0 ? 'urgente' : 'proximo', fecha: desde, enlace: `#/lote/${l.id}`, titulo: `Ecografía de ${l.nombre}`, detalle: `${sin.length} ${sin.length === 1 ? 'hembra' : 'hembras'} sin ecografía · ${falta <= 0 ? 'ya se puede hacer' : `a partir del ${desde.split('-').reverse().join('/')}`}` });
    }
    const porLote = new Map();
    for (const h of hembras) {
      const e = est.get(h.id);
      if (!e.ventana || !['gestante', 'cubierta'].includes(e.estado)) continue;
      if (dias(hoy, e.ventana.desde) > 10) continue;
      const k = e.lote.id; if (!porLote.has(k)) porLote.set(k, { l: e.lote, v: e.ventana, n: 0, tarde: 0 }); const g = porLote.get(k); g.n++;
      if (hoy > sumarDias(e.ventana.hasta, 7)) g.tarde++;
    }
    for (const g of porLote.values()) {
      const f = (x) => x.split('-').reverse().join('/');
      out.push({ nivel: hoy >= g.v.desde ? 'urgente' : 'proximo', fecha: g.v.desde, enlace: `#/lote/${g.l.id}`, titulo: g.tarde ? `Partos sin registrar en ${g.l.nombre}` : `Partos de ${g.l.nombre}`, detalle: `${g.n} ${g.n === 1 ? 'hembra pendiente' : 'hembras pendientes'} · ventana del ${f(g.v.desde)} al ${f(g.v.hasta)}${g.tarde ? ` · ${g.tarde} pasadas de fecha: ¿parto sin anotar o vacías?` : ''}` });
    }
    for (const c of vivos.filter((a) => esCria(a) && a.fecha_nacimiento && dias(a.fecha_nacimiento, hoy) <= 2)) {
      if (!ctx.eventos(c.id).some((e) => e.tipo === 'encalostrado')) out.push({ nivel: 'urgente', fecha: c.fecha_nacimiento, enlace: `#/animal/${c.id}`, titulo: `Encalostrado de ${nombreAnimal(c)}`, detalle: `Nació el ${c.fecha_nacimiento.split('-').reverse().join('/')}: comprueba que ha tomado calostro` });
    }
    for (const h of hembras.filter((x) => x.especie === 'caprino')) {
      const e = est.get(h.id);
      if (e.estado === 'lactacion' && !e.ordeno && e.diasParto >= REF.ordenoTrasParto) out.push({ nivel: 'urgente', fecha: sumarDias(e.parto.fecha, REF.ordenoTrasParto), enlace: `#/animal/${h.id}`, titulo: `Empezar el ordeño de ${nombreAnimal(h)}`, detalle: `Parió el ${e.parto.fecha.split('-').reverse().join('/')}` });
    }
    const md = hoy.slice(5);
    if (md >= REF.secadoDesde && md <= REF.secadoHasta) {
      const n = hembras.filter((h) => est.get(h.id).estado === 'lactacion').length;
      if (n) out.push({ nivel: 'proximo', fecha: hoy, enlace: '#/reproduccion/hembras', titulo: 'Época de secado', detalle: `${n} ${n === 1 ? 'cabra en lactación' : 'cabras en lactación'}: secado natural espaciando ordeños y bajando la ración` });
    }
    const peso = { urgente: 0, proximo: 1, info: 2 };
    return out.sort((a, b) => peso[a.nivel] - peso[b.nivel] || String(a.fecha).localeCompare(String(b.fecha)));
  }

  // Resumen de una paridera (partos entre dos fechas).
  function resumenParidera(partos) {
    const vivas = partos.reduce((s, e) => s + (+e.datos.vivas || 0), 0), muertas = partos.reduce((s, e) => s + (+e.datos.muertas || 0), 0);
    const tipos = {}; for (const e of partos) { const t = e.datos.tipo || 'normal'; tipos[t] = (tipos[t] || 0) + 1; }
    return { partos: partos.length, vivas, muertas, prolificidad: partos.length ? (vivas + muertas) / partos.length : null, mortalidad: vivas + muertas ? muertas / (vivas + muertas) : null, tipos };
  }

  window.Logica = { ESPECIES, CAT, CAPAS, ORIGENES, CAUSAS_BAJA, hoyISO, dias, esCria, nombreAnimal, ordenNatural, porFecha, ubicacion, vivoEn, edad, revisar, mapaColumnas, normalizarFila, fechaISO,
    REF, sumarDias, HEMBRAS, MACHOS, ESTADOS, estadoRepro, avisosRepro, resumenParidera };
})();
