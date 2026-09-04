/**
 * cabin-any-fallback.v1.js
 * Inyectado por configuración de agencia (agency.scripts[]).
 *
 * 1. En /flights/availability/... si la búsqueda termina sin resultados y el
 *    segmento :cabin no es "any", reenvía la búsqueda con cabin=any por
 *    navegación SPA (replaceState + popstate). Sin recargar.
 *    Ocurre siempre que se dé esa condición, también tras una recarga.
 * 2. Si esa segunda búsqueda trae resultados, muestra el aviso debajo de
 *    .availability-resume-actions. Si tampoco trae, no hay tercera búsqueda
 *    ni mensaje: el DOM queda intacto.
 * 3. No hay bucle posible: el reintento siempre deja la cabina en "any", y con
 *    "any" el script no vuelve a buscar.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') { return; }
  if (window.__slCabinFallback) { return; }
  window.__slCabinFallback = true;

  var CABIN_ANY = 'any';
  var BANNER_ID = 'sl-cabin-fallback-banner';
  var NAV_TIMEOUT_MS = 6000;

  var EMPTY_STATE = '[data-testid="availability.flights.live-reactive.empty-state.container"]';
  var RECOMMENDATIONS = '[data-testid="availability.flights.live-reactive.recommendations.container"]';
  var SLOT = '[data-testid="availability.flights.live-reactive.results.content"]';
  var ACTIONS = '.availability-resume-actions';

  var MESSAGE = 'No encontramos resultados en la cabina que seleccionaste. Te mostramos otras opciones de vuelo disponibles.';

  var noticeFor = null;   // firma que merece aviso; solo en memoria
  var navigating = false;
  var frame = null;

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

  // Prioriza el bloque de acciones dentro de la columna de resultados;
  // si no está, el primero del documento.
  function findAnchor() {
    var slot = document.querySelector(SLOT);
    return (slot && slot.querySelector(ACTIONS)) || document.querySelector(ACTIONS);
  }

  function showBanner() {
    if (document.getElementById(BANNER_ID)) { return; }

    var anchor = findAnchor();
    if (!anchor || !anchor.parentNode) { return; }

    var banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.setAttribute('role', 'status');
    banner.setAttribute('data-testid', 'availability.flights.cabin-fallback.notice');
    banner.textContent = MESSAGE;
    banner.setAttribute('style', 'box-sizing:border-box;width:100%;margin:12px 0 16px;padding:12px 16px;' +
      'border:1px solid var(--color-secondary);border-radius:8px;background:transparent;' +
      'color:var(--color-secondary);font-size:14px;line-height:1.45;text-align:left');

    anchor.parentNode.insertBefore(banner, anchor.nextSibling);
  }

  /* ---------- navegación SPA ---------- */

  function retryWithAnyCabin(parsed, emptyStateNode) {
    noticeFor = parsed.signature;
    navigating = true;

    // El Router lee la URL del navegador, no el evento: primero la URL, después el popstate.
    var nextState = Object.assign({}, window.history.state);
    delete nextState.navigationId;          // si no, lo trata como restauración de historial
    delete nextState['ɵrouterPageId'];

    window.history.replaceState(nextState, '', parsed.anyUrl);
    window.dispatchEvent(new PopStateEvent('popstate', { state: nextState }));

    // Red de seguridad: si el Router no tomó la navegación, el empty-state original
    // sigue en el DOM. La URL ya está reescrita, así que recargar rinde cabin=any.
    window.setTimeout(function () {
      navigating = false;
      if (document.contains(emptyStateNode)) {
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

      if (emptyState && !navigating) {
        retryWithAnyCabin(parsed, emptyState);
      }
      return;
    }

    // Con cabin=any no hay más búsquedas. Solo el aviso, y únicamente si este
    // script hizo el reintento en esta misma carga y hay resultados a la vista.
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
})();
