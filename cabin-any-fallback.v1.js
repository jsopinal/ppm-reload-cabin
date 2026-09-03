/**
 * cabin-any-fallback.v1.js
 * Inyectado por configuración de agencia (agency.scripts[]).
 *
 * 1. En /flights/availability/... si la búsqueda termina sin resultados y el
 *    segmento :cabin no es "any", reenvía la búsqueda con cabin=any por
 *    navegación SPA (replaceState + popstate). Sin recargar.
 * 2. Si esa segunda búsqueda SÍ trae resultados y la cabina original no era
 *    "any" ni "economy", muestra el aviso. Si tampoco trae, no toca el DOM.
 * 3. localStorage: un reintento por búsqueda, nunca un bucle.
 *    El aviso, en cambio, vive solo en memoria: pertenece al flujo, así que
 *    una recarga no lo revive.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') { return; }
  if (window.__slCabinFallback) { return; }
  window.__slCabinFallback = true;

  var CABIN_ANY = 'any';
  var SILENT_CABINS = [CABIN_ANY, 'economy'];   // reintentan, pero sin aviso
  var STORAGE_KEY = 'slCabinFallback';
  var BANNER_ID = 'sl-cabin-fallback-banner';
  var NAV_TIMEOUT_MS = 6000;
  var DEBUG = false;

  var EMPTY_STATE = '[data-testid="availability.flights.live-reactive.empty-state.container"]';
  var RECOMMENDATIONS = '[data-testid="availability.flights.live-reactive.recommendations.container"]';
  var SLOT = '[data-testid="availability.flights.live-reactive.results.content"]';

  var MESSAGE = 'No encontramos disponibilidad con las opciones que seleccionaste. Te mostramos más alternativas de vuelo.';

  var noticeFor = null;   // firma que merece aviso; solo en memoria, muere con la recarga
  var navigating = false;
  var frame = null;

  function log() {
    if (DEBUG && window.console) {
      console.info.apply(console, ['[cabin-fallback]'].concat([].slice.call(arguments)));
    }
  }

  /* ---------- anti-bucle: la firma de la última búsqueda reintentada ---------- */

  function readFlag() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;   // storage bloqueado: sin flag no hay bucle posible igual
    }
  }

  function writeFlag(signature) {
    try {
      window.localStorage.setItem(STORAGE_KEY, signature);
    } catch (e) { /* modo privado o cuota */ }
  }

  /* ---------- URL ---------- */

  /**
   * availability/:type/:schedules/:airline/:cabin/:legs/:route/:adults/:childs/:infants
   * Anclado en flights + availability: tolera prefijo de cultura (/es-CO/...)
   * y base-href (/travel/...). Si la URL no calza, el script no hace nada.
   */
  function parseLocation() {
    var segments = window.location.pathname.split('/').filter(Boolean);
    var anchor = segments.lastIndexOf('availability');
    var cabinIndex = anchor + 4;

    if (anchor < 1 || segments[anchor - 1] !== 'flights' || !segments[cabinIndex]) { return null; }

    var normalized = segments.slice();
    normalized[cabinIndex] = CABIN_ANY;

    return {
      cabin: segments[cabinIndex],
      anyUrl: '/' + normalized.join('/') + window.location.search + window.location.hash,
      signature: '/' + normalized.join('/')
    };
  }

  /* ---------- aviso ---------- */

  function showBanner() {
    if (document.getElementById(BANNER_ID)) { return; }

    var slot = document.querySelector(SLOT);
    if (!slot) { return; }

    var banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.setAttribute('role', 'status');
    banner.setAttribute('data-testid', 'availability.flights.cabin-fallback.notice');
    banner.textContent = MESSAGE;
    banner.style.cssText = 'box-sizing:border-box;width:100%;margin:0 0 16px;padding:12px 16px;' +
      'border:1px solid #FFD8A8;border-radius:8px;background:#FFF7ED;color:#7A4100;' +
      'font-size:14px;line-height:1.45;text-align:left';

    slot.insertBefore(banner, slot.firstChild);
    log('aviso insertado');
  }

  /* ---------- navegación SPA ---------- */

  function retryWithAnyCabin(parsed, emptyStateNode) {
    writeFlag(parsed.signature);
    noticeFor = SILENT_CABINS.indexOf(parsed.cabin) === -1 ? parsed.signature : null;
    navigating = true;

    // El Router lee la URL del navegador, no el evento: primero la URL, después el popstate.
    var nextState = Object.assign({}, window.history.state);
    delete nextState.navigationId;          // si no, lo trata como restauración de historial
    delete nextState['ɵrouterPageId'];

    window.history.replaceState(nextState, '', parsed.anyUrl);
    window.dispatchEvent(new PopStateEvent('popstate', { state: nextState }));
    log('reintento con cabin=any', parsed.anyUrl);

    // Red de seguridad: si el Router no tomó la navegación, el empty-state original
    // sigue en el DOM. La URL ya está reescrita, así que recargar rinde cabin=any.
    window.setTimeout(function () {
      navigating = false;
      if (document.contains(emptyStateNode)) {
        log('el Router no respondió, recargando');
        window.location.reload();
      }
    }, NAV_TIMEOUT_MS);
  }

  /* ---------- evaluación ---------- */

  function evaluate() {
    var parsed = parseLocation();
    if (!parsed) { return; }

    if (parsed.cabin !== CABIN_ANY) {
      var emptyState = document.querySelector(EMPTY_STATE);

      if (emptyState && !navigating && readFlag() !== parsed.signature) {
        retryWithAnyCabin(parsed, emptyState);
      }
      return;
    }

    // El aviso solo dentro del flujo que lo originó: reintento hecho por este
    // script, en esta misma carga de página, y con resultados a la vista.
    if (noticeFor !== parsed.signature) { return; }
    if (!document.querySelector(RECOMMENDATIONS)) { return; }

    showBanner();
  }

  function schedule() {
    if (frame) { return; }
    frame = window.requestAnimationFrame(function () {
      frame = null;
      evaluate();
    });
  }

  /* ---------- arranque ---------- */

  new MutationObserver(function (mutations) {
    for (var index = 0; index < mutations.length; index++) {
      if (mutations[index].target.id !== BANNER_ID) {   // ignora lo que causa el propio aviso
        schedule();
        return;
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('popstate', schedule, false);
  schedule();   // el script entra async+defer: la vista puede estar ya pintada
  log('instalado');
})();
