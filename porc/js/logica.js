// CIFEAPORC · lógica del ciclo reproductivo, avisos y comprobaciones.
// Sin dependencias: se usa en la app y en las pruebas.
(function (raiz) {
  'use strict';

  // Valores de referencia del centro (chato murciano).
  const REF = {
    ecoDesde: 19,        // días tras la IA a partir de los que se puede ecografiar
    ecoIdeal: 21,
    paridera: 109,       // entrada prevista en paridera: IA + 109
    gestacion: 114,      // parto probable: IA + 114
    lactacion: 30,
    idcMin: 4, idcMax: 6,          // intervalo destete-cubrición
    destetadosMin: 7, destetadosMax: 9,
    dosisAviso: 4, dosisCaduca: 5, // el día de extracción es el día 0
    sinEcoDias: 35,      // a partir de aquí, una IA sin ecografía se trata como posible gestación
  };

  // Causas de baja (lechones y animales del censo)
  const CAUSAS_BAJA = ['Aplastamiento', 'Diarrea', 'Raquítico', 'No viable', 'Patas abiertas', 'Meningitis', 'Cojo', 'Otros'];
  // Para cerdas, verracos y cerdos de cebo se añaden causas propias de adultos (Otros, al final)
  const CAUSAS_ADULTO = ['Desvieje', 'Problemas reproductivos', 'Venta', 'Muerte súbita', ...CAUSAS_BAJA];
  const CAUSAS_CEBO = ['Muerte súbita', ...CAUSAS_BAJA];

  const CAPACIDAD = { 'Vacías': 10, 'Gestación': 8, 'Implantación': 10, 'Partos': 1, 'Lechonera': 25 };

  const FASES = [
    { id: 'vacia', nombre: 'Vacía' },
    { id: 'inseminada', nombre: 'Inseminada' },
    { id: 'gestante', nombre: 'Gestante' },
    { id: 'paridera', nombre: 'Paridera' },
    { id: 'lactante', nombre: 'Lactante' },
    { id: 'destetada', nombre: 'Destetada' },
  ];

  // ---- Fechas (siempre 'AAAA-MM-DD', sin horas para evitar desfases) ----
  function aFecha(iso) { const [a, m, d] = iso.split('-').map(Number); return Date.UTC(a, m - 1, d); }
  function sumarDias(iso, n) { return new Date(aFecha(iso) + n * 864e5).toISOString().slice(0, 10); }
  function dias(desde, hasta) { return Math.round((aFecha(hasta) - aFecha(desde)) / 864e5); }
  function hoyISO(fecha) {
    const f = fecha || new Date();
    return new Date(f.getTime() - f.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  }
  const n = (v) => (Number.isFinite(+v) ? +v : 0);

  function ordenar(eventos) {
    return eventos.slice().sort((a, b) =>
      a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.creado || '') < (b.creado || '') ? -1 : 1);
  }

  // ---- Estado de una cerda a partir de sus eventos en una granja ----
  function estadoCerda(eventos) {
    const ciclos = [];
    let cur = null, fase = 'vacia', ubicacion = null, ultimoDestete = null, partos = 0;

    const nuevoCiclo = (ia) => ({
      ia, ecos: [], paridera: null, parto: null, aborto: null, adopciones: [], bajas: [], destete: null,
      cierre: null, numParto: null, destetePrevio: ultimoDestete,
    });

    for (const e of ordenar(eventos)) {
      const d = e.datos || {};
      switch (e.tipo) {
        case 'ia':
          if (cur && !cur.parto && !cur.cierre) cur.cierre = 'repeticion';
          cur = nuevoCiclo(e); ciclos.push(cur); fase = 'inseminada';
          break;
        case 'eco':
          if (!cur) break;
          cur.ecos.push(e);
          if (d.resultado === 'positiva') fase = 'gestante';
          else if (d.resultado === 'negativa') { cur.cierre = 'eco_negativa'; cur = null; fase = 'vacia'; }
          break;
        case 'paridera':
          if (cur) cur.paridera = e;
          fase = 'paridera';
          break;
        case 'parto':
          if (!cur) { cur = nuevoCiclo(null); ciclos.push(cur); }
          cur.parto = e; partos += 1; cur.numParto = partos; fase = 'lactante';
          break;
        case 'aborto':
          if (cur) { cur.aborto = e; cur.cierre = 'aborto'; }
          cur = null; fase = 'vacia';
          break;
        case 'adopcion':
          if (cur) cur.adopciones.push(e);
          break;
        case 'baja_lechones':
          if (cur) cur.bajas.push(e);
          break;
        case 'destete':
          if (cur) { cur.destete = e; cur.cierre = 'destete'; }
          ultimoDestete = e; cur = null; fase = 'destetada';
          break;
        default: break;
      }
      if (d.ubicacion) ubicacion = d.ubicacion;
    }
    const actual = cur || null;
    return { fase, ciclos, actual, ultimo: ciclos[ciclos.length - 1] || null, partos, ubicacion, ultimoDestete };
  }

  // ---- Camada ----
  function camada(ciclo) {
    if (!ciclo || !ciclo.parto) return null;
    const p = ciclo.parto.datos || {};
    const vivos = n(p.vivos_h) + n(p.vivos_m) + n(p.vivos_ss); // _ss: sin sexar (histórico)
    const muertos = n(p.muertos_h) + n(p.muertos_m) + n(p.muertos_ss);
    const momias = n(p.momificados);
    let entran = 0, salen = 0;
    for (const a of ciclo.adopciones) {
      if (a.datos.sentido === 'entra') entran += n(a.datos.numero); else salen += n(a.datos.numero);
    }
    const bajas = ciclo.bajas.reduce((s, b) => s + n(b.datos.numero), 0);
    const actuales = vivos + entran - salen - bajas;
    let destetados = null, bajasCalculadas = null;
    if (ciclo.destete) {
      const dd = ciclo.destete.datos || {};
      destetados = n(dd.destetados_h) + n(dd.destetados_m) + n(dd.destetados_ss);
      bajasCalculadas = vivos + entran - salen - destetados;
    }
    return { vivos, muertos, momias, totales: vivos + muertos + momias, entran, salen, bajas, actuales, destetados, bajasCalculadas };
  }

  // ---- Fechas clave e índices de un ciclo ----
  function fechasCiclo(ciclo) {
    if (!ciclo || !ciclo.ia) return {};
    const ia = ciclo.ia.fecha;
    return {
      ia,
      ecoDesde: sumarDias(ia, REF.ecoDesde),
      ecoIdeal: sumarDias(ia, REF.ecoIdeal),
      paridera: sumarDias(ia, REF.paridera),
      parto: sumarDias(ia, REF.gestacion),
    };
  }

  function indicesCiclo(ciclo) {
    const r = {};
    if (ciclo.ia && ciclo.parto) r.gestacion = dias(ciclo.ia.fecha, ciclo.parto.fecha);
    if (ciclo.parto && ciclo.destete) r.lactacion = dias(ciclo.parto.fecha, ciclo.destete.fecha);
    if (ciclo.ia && ciclo.destetePrevio) r.idc = dias(ciclo.destetePrevio.fecha, ciclo.ia.fecha);
    return r;
  }

  // ---- Avisos del día ----
  // Devuelve [{cerdaId, crotal, titulo, detalle, fecha, nivel}] nivel: 'urgente' | 'proximo'
  function avisos(cerdas, eventosPorCerda, hoy) {
    const out = [];
    for (const c of cerdas) {
      if (c.fecha_baja) continue;
      const est = estadoCerda(eventosPorCerda[c.id] || []);
      const cur = est.actual;
      const f = fechasCiclo(cur);
      const add = (titulo, detalle, fecha, nivel) =>
        out.push({ cerdaId: c.id, crotal: c.crotal, titulo, detalle, fecha, nivel });

      // IA de hace más de 35 días sin ninguna ecografía: se trata como posible gestación
      // (avisa de paridera y parto) y se pide confirmarla.
      const sinEco = est.fase === 'inseminada' && cur && cur.ia && cur.ecos.length === 0 && dias(cur.ia.fecha, hoy) >= REF.sinEcoDias;
      if (sinEco) add('Gestación sin ecografía registrada', `Día ${dias(cur.ia.fecha, hoy)} tras la IA · registra la ecografía o la repetición`, cur.ia.fecha, 'proximo');
      if (est.fase === 'inseminada' && cur && cur.ia && !sinEco) {
        const ultimaEco = cur.ecos[cur.ecos.length - 1];
        if (ultimaEco && ultimaEco.datos.resultado === 'dudosa') {
          const toca = sumarDias(ultimaEco.fecha, 1);
          if (hoy >= toca) add('Repetir ecografía', `Dudosa el ${ultimaEco.fecha.split('-').reverse().join('/')}`, toca, 'urgente');
        } else if (hoy >= f.ecoDesde) {
          const d = dias(cur.ia.fecha, hoy);
          add('Ecografía pendiente', `Día ${d} tras la IA (recomendado día ${REF.ecoIdeal})`, f.ecoDesde, d >= REF.ecoIdeal ? 'urgente' : 'proximo');
        }
      }
      if ((est.fase === 'gestante' || sinEco) && cur && cur.ia && !cur.paridera && dias(hoy, f.parto) >= 0) {
        const faltan = dias(hoy, f.paridera);
        if (faltan <= 3) add('Entrada en paridera', faltan < 0 ? `Prevista hace ${-faltan} ${-faltan === 1 ? 'día' : 'días'} · confirmar sala y paridera` : faltan === 0 ? 'Prevista hoy · confirmar sala y paridera' : faltan === 1 ? 'Prevista mañana' : `Prevista en ${faltan} días`, f.paridera, faltan <= 0 ? 'urgente' : 'proximo');
      }
      if ((est.fase === 'gestante' || est.fase === 'paridera' || sinEco) && cur && cur.ia) {
        const faltan = dias(hoy, f.parto);
        if (faltan <= 7) add('Parto previsto', faltan < 0 ? `Previsto hace ${-faltan} ${-faltan === 1 ? 'día' : 'días'}` : faltan === 0 ? 'Previsto hoy' : faltan === 1 ? 'Previsto mañana' : `En ${faltan} días`, f.parto, faltan <= 1 ? 'urgente' : 'proximo');
      }
      // Gestante que se ha dejado en implantación tras la ecografía positiva
      if (est.fase === 'gestante' && /^Implantación/.test(est.ubicacion || '')) {
        const pos = cur && cur.ecos.filter((e) => e.datos.resultado === 'positiva').pop();
        if (pos) add('Gestante en implantación', `Positiva el ${pos.fecha.split('-').reverse().join('/')} (hace ${dias(pos.fecha, hoy)} días) · pasar a gestación cuando toque`, pos.fecha, 'proximo');
      }
      if (est.fase === 'lactante' && cur && cur.parto) {
        const d = dias(cur.parto.fecha, hoy);
        if (d >= REF.lactacion - 3) {
          const fd = sumarDias(cur.parto.fecha, REF.lactacion);
          add('Destete previsto', `${d} días de lactación (referencia ${REF.lactacion})`, fd, d >= REF.lactacion ? 'urgente' : 'proximo');
        }
      }
      if (est.fase === 'destetada' && est.ultimoDestete) {
        const d = dias(est.ultimoDestete.fecha, hoy);
        if (d > REF.idcMax) add('Sin cubrir tras el destete', `${d} días (referencia ${REF.idcMin}–${REF.idcMax})`, est.ultimoDestete.fecha, 'urgente');
      }
    }
    const peso = { urgente: 0, proximo: 1 };
    return out.sort((a, b) => peso[a.nivel] - peso[b.nivel] || (a.fecha < b.fecha ? -1 : 1));
  }

  // ---- Ocupación por zona (para avisar de plazas llenas) ----
  function ocupacion(cerdas, eventosPorCerda) {
    const zonas = {};
    for (const c of cerdas) {
      if (c.fecha_baja) continue;
      const u = estadoCerda(eventosPorCerda[c.id] || []).ubicacion;
      if (!u) continue;
      (zonas[u] = zonas[u] || []).push(c);
    }
    return zonas;
  }
  // ---- Lechoneras y cebadero: último recuento + movimientos posteriores ----
  const ESTANCIAS = [...[1, 2, 3, 4].map((k) => `Lechonera ${k}`), ...Array.from({ length: 24 }, (_, i) => `Cebadero ${i + 1}`),
    ...[1, 2, 3].flatMap((s) => [1, 2, 3, 4, 5, 6].map((k) => `Paridera ${s}-${k}`))]; // destetados que se quedan en la paridera
  const despues = (m, r) => !r || m.fecha > r.fecha || (m.fecha === r.fecha && String(m.creado) > String(r.creado));
  function cuentaGrupos(recuentos, movs) {
    const res = {};
    for (const e of ESTANCIAS) res[e] = { n: 0, recuento: null, movs: [] };
    for (const r of recuentos || []) { const x = res[r.estancia]; if (x && despues(r, x.recuento)) x.recuento = r; }
    for (const e of ESTANCIAS) res[e].n = res[e].recuento ? res[e].recuento.n : 0;
    for (const m of movs || []) {
      for (const [lado, signo] of [['destino', 1], ['origen', -1]]) {
        const x = res[m[lado]]; if (!x) continue;
        x.movs.push(m);
        if (despues(m, x.recuento)) x.n += signo * (Number(m.n) || 0);
      }
    }
    return res;
  }
  function comprobarMovGrupo(v, actual, ctx) {
    const errores = [], avisos = [];
    if (!v.fecha) errores.push('Falta la fecha.'); else if (v.fecha > ctx.hoy) errores.push('La fecha no puede ser futura.');
    const n = parseInt(v.n, 10);
    if (!Number.isFinite(n) || n < 1) errores.push('Indica cuántos animales (1 o más).');
    if (v.tipo !== 'entrada' && !v.origen) errores.push('Indica de dónde salen.');
    if (['entrada', 'traslado'].includes(v.tipo) && !v.destino) errores.push('Indica a dónde van.');
    if (v.tipo === 'traslado' && v.origen && v.origen === v.destino) errores.push('El origen y el destino no pueden ser el mismo.');
    if (v.tipo === 'muerte' && !v.causa) errores.push('Indica la causa de la muerte.');
    if (v.tipo === 'muerte' && v.causa === 'Otros' && !String(v.causa_otra || '').trim()) errores.push('Escribe la causa.');
    if (v.tipo !== 'entrada' && v.origen && Number.isFinite(n) && n > (actual[v.origen] ? actual[v.origen].n : 0))
      avisos.push(`Según la app, en ${v.origen} hay ${actual[v.origen] ? actual[v.origen].n : 0} animales y salen ${n}. Revisa el número o haz un recuento.`);
    if (v.destino && v.destino.startsWith('Lechonera') && Number.isFinite(n) && (actual[v.destino] ? actual[v.destino].n : 0) + n > CAPACIDAD.Lechonera)
      avisos.push(`${v.destino} pasaría de ${CAPACIDAD.Lechonera} lechones.`);
    return { errores, avisos };
  }

  // Traduce la ubicación guardada en los registros a un sitio del plano
  function sitioPlano(u) {
    let m;
    if (!u) return null;
    if ((m = /^Implantación · jaula (\d+)/.exec(u))) return { zona: 'implantacion', n: +m[1] };
    if (u === 'Implantación') return { zona: 'implantacion', n: null };
    if ((m = /^Vacías · parque (\d+)/.exec(u))) return { zona: 'vacias', n: +m[1] };
    if ((m = /^Gestación · parque (\d+)/.exec(u))) return { zona: 'gestacion', n: +m[1] };
    if ((m = /^Partos · sala (\d+) · paridera (\d+)/.exec(u))) return { zona: 'partos', sala: +m[1], n: +m[2] };
    return null;
  }
  function capacidadDe(ubicacion) {
    if (!ubicacion) return null;
    if (/ · jaula \d+$/.test(ubicacion)) return 1; // una cerda por jaula de implantación
    const zona = ubicacion.split(' · ')[0];
    return CAPACIDAD[zona] ?? null;
  }

  // ---- Comprobaciones al registrar (errores bloquean, avisos no) ----
  function comprobar(tipo, v, est, ctx) {
    const errores = [], avisosF = [];
    const hoy = ctx.hoy;
    if (!v.fecha) errores.push('Falta la fecha.');
    else if (v.fecha > sumarDias(hoy, 1)) errores.push('La fecha no puede ser futura.');
    const cur = est.actual;
    const ia = cur && cur.ia ? cur.ia.fecha : null;

    if (tipo === 'ia') {
      if (!v.verraco) errores.push('Elige el verraco.');
      if (est.fase === 'gestante' || est.fase === 'paridera' || est.fase === 'lactante')
        avisosF.push(`La cerda figura como ${FASES.find((f) => f.id === est.fase).nombre.toLowerCase()}. ¿Seguro que es una nueva inseminación?`);
      if (est.ultimoDestete && v.fecha) {
        const idc = dias(est.ultimoDestete.fecha, v.fecha);
        if (est.fase === 'destetada' && (idc < REF.idcMin || idc > REF.idcMax))
          avisosF.push(`Intervalo destete-cubrición de ${idc} días (referencia ${REF.idcMin}–${REF.idcMax}).`);
      }
      const ds = v.extraccion && ctx.dosis ? ctx.dosis(v.extraccion) : null;
      if (ds && v.fecha) {
        if (v.fecha < ds.ext.fecha) errores.push('La inseminación no puede ser anterior a la extracción de la dosis.');
        else {
          const st = estadoDosis(ds.ext, ds.usadas, v.fecha);
          if (st.dia > REF.dosisCaduca) avisosF.push(`La dosis tiene ${st.dia} días: está caducada (válida hasta el día ${REF.dosisCaduca}).`);
          if (st.restantes < 2) avisosF.push(`De esa extracción quedan ${st.restantes} dosis y cada inseminación usa 2.`);
        }
      }
    }
    if (tipo === 'traslado') {
      if (['paridera', 'lactante'].includes(est.fase) && v.zona && v.zona !== 'Partos')
        avisosF.push(`La cerda figura como ${est.fase === 'lactante' ? 'lactante' : 'en paridera'}. ¿Seguro que sale de la sala de partos?${est.fase === 'lactante' ? ' Si se desteta, registra el destete.' : ''}`);
      if (v.zona === 'Partos' && !['gestante', 'paridera', 'lactante'].includes(est.fase))
        avisosF.push('La cerda no figura como gestante: ¿seguro que va a la sala de partos?');
    }
    if (tipo === 'eco') {
      if (!ia) errores.push('No hay una inseminación abierta para esta cerda.');
      else if (v.fecha && dias(ia, v.fecha) < REF.ecoDesde)
        avisosF.push(`Solo han pasado ${dias(ia, v.fecha)} días desde la IA; la ecografía es fiable a partir del día ${REF.ecoDesde}.`);
      if (!v.resultado) errores.push('Indica el resultado.');
    }
    if (tipo === 'paridera') {
      if (est.fase !== 'gestante') avisosF.push('La cerda no figura como gestante confirmada.');
      if (!v.sala || !v.plaza) errores.push('Indica la sala y la paridera.');
    }
    if (tipo === 'parto') {
      if (ia && v.fecha) {
        if (v.fecha < ia) errores.push('El parto no puede ser anterior a la inseminación.');
        else {
          const g = dias(ia, v.fecha);
          if (Math.abs(g - REF.gestacion) > 4) avisosF.push(`Gestación de ${g} días (referencia ${REF.gestacion}). Revisa las fechas.`);
        }
      }
      if (n(v.vivos_h) + n(v.vivos_m) + n(v.muertos_h) + n(v.muertos_m) + n(v.momificados) === 0)
        errores.push('Indica cuántos lechones han nacido.');
    }
    if (tipo === 'aborto') {
      if (!ia) errores.push('No hay una inseminación abierta para esta cerda.');
      else if (v.fecha && v.fecha < ia) errores.push('El aborto no puede ser anterior a la inseminación.');
    }
    if (tipo === 'destete' || tipo === 'adopcion' || tipo === 'baja_lechones') {
      if (!cur || !cur.parto) errores.push('No hay un parto abierto para esta cerda.');
    }
    if (tipo === 'destete' && cur && cur.parto) {
      const c = camada(cur);
      const dest = n(v.destetados_h) + n(v.destetados_m);
      if (dest > c.actuales) errores.push(`Destetas ${dest} lechones, pero la cerda tiene ${c.actuales} según los registros (vivos, adopciones y bajas).`);
      else if (dest < c.actuales) avisosF.push(`Faltan ${c.actuales - dest} lechones respecto a los registros. Anota sus bajas con fecha y causa.`);
      if (v.fecha) {
        const l = dias(cur.parto.fecha, v.fecha);
        if (Math.abs(l - REF.lactacion) > 5) avisosF.push(`Lactación de ${l} días (referencia ${REF.lactacion}).`);
      }
      if (dest && (dest < REF.destetadosMin || dest > REF.destetadosMax))
        avisosF.push(`${dest} destetados (referencia ${REF.destetadosMin}–${REF.destetadosMax} en chato murciano).`);
    }
    if (tipo === 'adopcion') {
      const recibe = n(v.recibe_num), cede = n(v.cede_num);
      if (!recibe && !cede) errores.push('Indica cuántos lechones recibe y/o cuántos cede.');
      if (recibe && !v.recibe_de) errores.push('Elige de qué cerda recibe los lechones.');
      if (cede && !v.cede_a) errores.push('Elige a qué cerda cede los lechones.');
      if (cede && cur && cur.parto && cede > camada(cur).actuales + recibe)
        errores.push('No puede ceder más lechones de los que tiene.');
      if (recibe && ctx.camadaDe && v.recibe_de && recibe > ctx.camadaDe(v.recibe_de))
        avisosF.push(`La cerda que cede solo tiene ${ctx.camadaDe(v.recibe_de)} lechones según los registros.`);
    }
    if (tipo === 'baja_lechones') {
      if (!n(v.numero)) errores.push('Indica cuántos lechones.');
      if (!v.causa) errores.push('Indica la causa.');
      else if (v.causa === 'Otros' && !String(v.causa_otra || '').trim()) errores.push('Escribe la causa.');
      if (cur && cur.parto && n(v.numero) > camada(cur).actuales) errores.push('Son más bajas que lechones tiene la cerda.');
    }
    // Ocupación de la plaza de destino
    if (ctx.destino) {
      const cap = capacidadDe(ctx.destino);
      const ocupan = (ctx.ocupacion[ctx.destino] || []).filter((c) => c.id !== ctx.cerdaId).length;
      if (cap !== null && ocupan >= cap)
        avisosF.push(cap === 1 ? `${ctx.destino} ya está ocupada.` : `${ctx.destino} ya tiene ${ocupan} cerdas (capacidad ${cap}).`);
    }
    return { errores, avisos: avisosF };
  }

  // ---- Sanidad ----
  // grupo: 'lechones' (manejos y hierro de la camada), 'medicamento', 'higiene'
  const SANIDAD = {
    vacunacion:     { nombre: 'Vacunación', grupo: 'medicamento' },
    desparasitacion:{ nombre: 'Desparasitación', grupo: 'medicamento' },
    tratamiento:    { nombre: 'Tratamiento con medicamento', grupo: 'medicamento', motivo: true },
    hierro:         { nombre: 'Hierro y corte de colmillos', grupo: 'lechones', producto: true }, // se hacen a la vez
    colmillos:      { nombre: 'Corte de colmillos', grupo: 'lechones', oculto: true },            // solo para registros antiguos
    raboteo:        { nombre: 'Raboteo', grupo: 'lechones', motivo: true },
    castracion:     { nombre: 'Castración', grupo: 'lechones', edad: true },
    limpieza:       { nombre: 'Limpieza', grupo: 'higiene' },
    desinfeccion:   { nombre: 'Desinfección', grupo: 'higiene', producto: true },
    desinsectacion: { nombre: 'Desinsectación', grupo: 'higiene', producto: true },
    desratizacion:  { nombre: 'Desratización', grupo: 'higiene', producto: true },
    otro:           { nombre: 'Otro', grupo: 'medicamento' },
  };
  const ZONAS = ['Parques de vacías', 'Sala de implantación', 'Parques de gestación', 'Sala de partos 1', 'Sala de partos 2', 'Sala de partos 3', 'Verraqueras', 'Lechoneras', 'Cebadero', 'Toda la nave', 'Exterior / almacén'];

  function usaProducto(tipo) { const t = SANIDAD[tipo]; return t && (t.grupo === 'medicamento' || t.producto); }

  function comprobarSanidad(v, ctx) {
    const errores = [], avisosF = [];
    const T = SANIDAD[v.tipo];
    if (!T) errores.push('Elige qué se hace.');
    if (!v.fecha) errores.push('Falta la fecha.');
    else if (v.estado === 'realizado' && v.fecha > sumarDias(ctx.hoy, 1)) errores.push('Un tratamiento realizado no puede tener fecha futura. Si es para más adelante, márcalo como previsto.');
    else if (v.estado === 'previsto' && v.fecha < ctx.hoy) avisosF.push('La fecha prevista ya ha pasado.');
    if ((v.ambito === 'cerda' || v.ambito === 'camada') && !v.cerda_id) errores.push('Elige la cerda.');
    if (v.ambito === 'verraco' && !v.verraco_id) errores.push('Elige el verraco.');
    if (v.ambito === 'zona' && !v.zona) errores.push('Elige la zona.');
    if (T && T.motivo && v.estado === 'realizado' && !String(v.motivo || '').trim())
      errores.push(v.tipo === 'tratamiento' ? 'Indica el motivo del tratamiento.' : v.tipo === 'raboteo' ? 'Indica el motivo (caudofagia detectada).' : 'Indica el motivo (lesiones observadas).');
    if (T && usaProducto(v.tipo) && v.estado === 'realizado' && !v.medicamento_id && !String(v.producto || '').trim())
      errores.push('Indica el producto utilizado.');
    if (v.caducidad && v.fecha && v.caducidad < v.fecha) avisosF.push(`El producto está caducado (caducidad ${v.caducidad.split('-').reverse().join('/')}).`);
    if (v.tipo === 'castracion' && v.edad && Number(v.edad) > 7) avisosF.push('Lechones de más de 7 días: revisa los requisitos legales (anestesia, analgesia y veterinario).');
    if (v.repetir_dias && !(Number(v.repetir_dias) > 0)) errores.push('«Repetir cada» debe ser un número de días mayor que 0.');
    return { errores, avisos: avisosF };
  }

  // Avisos de sanidad: previstos vencidos, de hoy o de los próximos 3 días
  function avisosSanidad(registros, hoy, nombreDe) {
    const out = [];
    for (const r of registros) {
      if (r.estado !== 'previsto') continue;
      const d = dias(hoy, r.fecha);
      if (d > 3) continue;
      out.push({ sanidadId: r.id, titulo: `${(SANIDAD[r.tipo] || {}).nombre || r.tipo} prevista`, detalle: `${nombreDe(r)}${d < 0 ? ` · retrasada ${-d} ${d === -1 ? 'día' : 'días'}` : d === 0 ? ' · hoy' : d === 1 ? ' · mañana' : ` · en ${d} días`}`, fecha: r.fecha, nivel: d <= 0 ? 'urgente' : 'proximo' });
    }
    return out;
  }

  // ---- Dosis de semen: extracción = día 0; aviso el día 4; caducada tras el día 5.
  // Cada inseminación registrada usa 2 dosis (la 2.ª al día siguiente).
  function estadoDosis(ext, iasUsadas, hoy) {
    const dia = dias(ext.fecha, hoy);
    const restantes = Math.max(0, (Number(ext.n_dosis) || 0) - 2 * iasUsadas);
    let estado = 'valida';
    if (dia > REF.dosisCaduca) estado = 'caducada';
    else if (restantes === 0) estado = 'agotada';
    else if (dia >= REF.dosisAviso) estado = 'usar';
    return { dia, restantes, estado };
  }

  const api = { REF, CAUSAS_BAJA, CAUSAS_ADULTO, CAUSAS_CEBO, CAPACIDAD, SANIDAD, ZONAS, usaProducto, comprobarSanidad, avisosSanidad, estadoDosis, FASES, sumarDias, dias, hoyISO, ordenar, estadoCerda, camada, fechasCiclo, indicesCiclo, avisos, ocupacion, capacidadDe, sitioPlano, ESTANCIAS, cuentaGrupos, comprobarMovGrupo, comprobar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Logica = api;
})(typeof window !== 'undefined' ? window : globalThis);
