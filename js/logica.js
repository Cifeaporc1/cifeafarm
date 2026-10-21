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

  window.Logica = { ESPECIES, CAT, CAPAS, ORIGENES, CAUSAS_BAJA, hoyISO, dias, esCria, nombreAnimal, ordenNatural, porFecha, ubicacion, vivoEn, edad, revisar, mapaColumnas, normalizarFila, fechaISO };
})();
