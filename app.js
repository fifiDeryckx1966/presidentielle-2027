/* ==========================================================
   Propositions 2027 — logique de l'appli
   Architecture IIFE, état centralisé, exposée via window.App.
   Les données viennent de donnees/propositions.js (window.DONNEES_2027),
   copie conforme de donnees/propositions.json.
   ========================================================== */
(function () {
  'use strict';

  var CLE_STOCKAGE = 'fifi.propositions2027.v1';
  var MAX_COMPARAISON = 4;

  /* ---------- Outils ---------- */
  function $(id) { return document.getElementById(id); }

  // Crée un élément sans jamais passer par innerHTML (aucun risque d'injection)
  function el(balise, attributs, enfants) {
    var n = document.createElement(balise);
    if (attributs) {
      Object.keys(attributs).forEach(function (k) {
        var v = attributs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'texte') n.textContent = v;
        else if (k === 'classe') n.className = v;
        else if (k === 'style') Object.keys(v).forEach(function (p) { n.style.setProperty(p, v[p]); });
        else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      });
    }
    (enfants || []).forEach(function (e) {
      if (e === null || e === undefined) return;
      n.appendChild(typeof e === 'string' ? document.createTextNode(e) : e);
    });
    return n;
  }

  // Recherche insensible aux accents et à la casse
  function normaliser(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function dateLisible(iso, court) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('fr-FR', court ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function initiales(nom) {
    var mots = nom.replace(/^(.+?)\s+(de\s+)?/i, function (m) { return m; }).split(/\s+/).filter(function (m) { return !/^(de|du|la|le)$/i.test(m); });
    return ((mots[0] || '')[0] + (mots[mots.length - 1] || '')[0]).toUpperCase();
  }

  function pluriel(n, mot, motPluriel) { return n + ' ' + (n > 1 ? (motPluriel || mot + 's') : mot); }

  function debounce(fn, ms) {
    var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); };
  }

  /* ---------- Persistance (préférences et favoris) ---------- */
  function lireStockage() {
    try { return JSON.parse(localStorage.getItem(CLE_STOCKAGE) || '{}') || {}; } catch (e) { return {}; }
  }
  function ecrireStockage() {
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify({
        vue: etat.vue, favoris: Object.keys(etat.favoris),
        candidats: etat.candidats, themes: etat.themes,
        cmpCandidats: etat.cmpCandidats, cmpTheme: etat.cmpTheme
      }));
    } catch (e) { /* stockage indisponible : l'appli marche quand même */ }
  }

  /* ---------- État ---------- */
  var D = null;              // données
  var parCandidat = {};      // id -> candidat
  var parTheme = {};         // id -> thème
  var etat = {
    vue: 'liste',
    recherche: '',
    candidats: [],           // ids sélectionnés (vide = tous)
    themes: [],              // ids sélectionnés (vide = tous)
    seulementFavoris: false,
    favoris: {},
    cmpCandidats: [],
    cmpTheme: ''
  };

  function charger() {
    D = window.DONNEES_2027;
    if (!D || !Array.isArray(D.propositions)) throw new Error('les données des propositions sont introuvables');
    D.candidats.forEach(function (c) { parCandidat[c.id] = c; c.nb = 0; });
    D.themes.forEach(function (t) { parTheme[t.id] = t; t.nb = 0; });
    D.propositions.forEach(function (p) {
      if (parCandidat[p.candidat]) parCandidat[p.candidat].nb++;
      if (parTheme[p.theme]) parTheme[p.theme].nb++;
      p._recherche = normaliser([p.texte, parCandidat[p.candidat] && parCandidat[p.candidat].nom, parTheme[p.theme] && parTheme[p.theme].nom, p.source && p.source.nom].join(' '));
    });

    var s = lireStockage();
    var existeC = function (id) { return !!parCandidat[id]; };
    var existeT = function (id) { return !!parTheme[id]; };
    if (['liste', 'comparer', 'candidats'].indexOf(s.vue) >= 0) etat.vue = s.vue;
    if (Array.isArray(s.favoris)) s.favoris.forEach(function (id) { etat.favoris[id] = true; });
    if (Array.isArray(s.candidats)) etat.candidats = s.candidats.filter(existeC);
    if (Array.isArray(s.themes)) etat.themes = s.themes.filter(existeT);
    if (Array.isArray(s.cmpCandidats)) etat.cmpCandidats = s.cmpCandidats.filter(existeC).slice(0, MAX_COMPARAISON);
    if (s.cmpTheme === '' || existeT(s.cmpTheme)) etat.cmpTheme = s.cmpTheme || '';

    // Par défaut, on compare les deux candidats ayant le plus de propositions
    if (etat.cmpCandidats.length === 0) {
      etat.cmpCandidats = candidatsTries().filter(function (c) { return c.nb > 0; }).slice(0, 2).map(function (c) { return c.id; });
    }
  }

  function candidatsTries() {
    return D.candidats.slice().sort(function (a, b) { return (b.nb - a.nb) || a.nom.localeCompare(b.nom, 'fr'); });
  }

  /* ---------- Filtrage ---------- */
  function propositionsFiltrees() {
    var mots = normaliser(etat.recherche).split(/\s+/).filter(Boolean);
    return D.propositions.filter(function (p) {
      if (etat.candidats.length && etat.candidats.indexOf(p.candidat) < 0) return false;
      if (etat.themes.length && etat.themes.indexOf(p.theme) < 0) return false;
      if (etat.seulementFavoris && !etat.favoris[p.id]) return false;
      for (var i = 0; i < mots.length; i++) if (p._recherche.indexOf(mots[i]) < 0) return false;
      return true;
    });
  }

  // Surligne les mots recherchés dans le texte, en nœuds DOM sûrs
  function texteSurligne(texte) {
    var mots = normaliser(etat.recherche).split(/\s+/).filter(function (m) { return m.length > 1; });
    var frag = document.createDocumentFragment();
    if (!mots.length) { frag.appendChild(document.createTextNode(texte)); return frag; }
    var norm = normaliser(texte);  // même longueur que le texte (accents retirés un à un)
    var marques = new Array(texte.length).fill(false);
    mots.forEach(function (m) {
      var i = norm.indexOf(m);
      while (i >= 0) { for (var k = i; k < i + m.length; k++) marques[k] = true; i = norm.indexOf(m, i + m.length); }
    });
    var debut = 0;
    for (var j = 1; j <= texte.length; j++) {
      if (j === texte.length || marques[j] !== marques[debut]) {
        var morceau = texte.slice(debut, j);
        frag.appendChild(marques[debut] ? el('mark', { texte: morceau }) : document.createTextNode(morceau));
        debut = j;
      }
    }
    return frag;
  }

  /* ---------- Rendu : composants ---------- */
  function avatar(c) {
    return el('span', { classe: 'avatar', 'aria-hidden': 'true', style: { '--couleur': c.couleur } , texte: initiales(c.nom) });
  }

  function lienSource(src, court) {
    if (!src || !src.url) return el('span', { texte: 'Source non renseignée' });
    var libelle = (court ? '' : 'Source : ') + src.nom + (src.date ? ' · ' + dateLisible(src.date, true) : '');
    return el('a', { classe: 'source', href: src.url, target: '_blank', rel: 'noopener noreferrer', title: 'Ouvrir la source dans un nouvel onglet' }, [libelle, el('span', { 'aria-hidden': 'true', texte: ' ↗' })]);
  }

  function carteProposition(p) {
    var c = parCandidat[p.candidat], t = parTheme[p.theme];
    var estFavori = !!etat.favoris[p.id];
    return el('article', { classe: 'carte', style: { '--couleur': c.couleur } }, [
      el('div', { classe: 'carte__haut' }, [
        el('span', { classe: 'carte__candidat' }, [avatar(c), el('span', {}, [c.nom, ' ', el('small', { texte: c.parti_court || '' })])]),
        el('button', {
          type: 'button', classe: 'favori', 'aria-pressed': String(estFavori), 'data-favori': p.id,
          'aria-label': estFavori ? 'Retirer des favoris' : 'Ajouter aux favoris', texte: estFavori ? '★' : '☆'
        })
      ]),
      el('p', { classe: 'carte__texte' }, [texteSurligne(p.texte)]),
      el('div', { classe: 'carte__pied' }, [
        el('span', { classe: 'etiquette' }, [t.icone + ' ' + t.nom]),
        lienSource(p.source, true)
      ])
    ]);
  }

  function puce(libelle, actif, attributs, pastille, nb) {
    var a = Object.assign({ type: 'button', classe: 'puce', 'aria-pressed': String(actif) }, attributs || {});
    return el('button', a, [
      pastille ? el('span', { classe: 'puce__pastille', style: { background: pastille }, 'aria-hidden': 'true' }) : null,
      libelle,
      nb !== undefined ? el('span', { classe: 'puce__nb', texte: String(nb) }) : null
    ]);
  }

  function vide(titre, texte, action) {
    return el('div', { classe: 'vide' }, [
      el('strong', { texte: titre }), texte,
      action ? el('div', {}, [el('button', { type: 'button', classe: 'bouton', onclick: action.fn, texte: action.libelle })]) : null
    ]);
  }

  /* ---------- Rendu : vue liste ---------- */
  function rendrePucesFiltres() {
    var zc = $('puces-candidats'); zc.replaceChildren();
    candidatsTries().forEach(function (c) {
      if (!c.nb) return;
      zc.appendChild(puce(c.nom, etat.candidats.indexOf(c.id) >= 0, { 'data-candidat': c.id }, c.couleur, c.nb));
    });
    var zt = $('puces-themes'); zt.replaceChildren();
    D.themes.forEach(function (t) {
      if (!t.nb) return;
      zt.appendChild(puce(t.icone + ' ' + t.nom, etat.themes.indexOf(t.id) >= 0, { 'data-theme': t.id }, null, t.nb));
    });
    $('tous-candidats').hidden = etat.candidats.length === 0;
    $('tous-themes').hidden = etat.themes.length === 0;
  }

  function rendreListe() {
    var liste = $('liste'); liste.replaceChildren();
    var res = propositionsFiltrees();
    var nbCand = {}; res.forEach(function (p) { nbCand[p.candidat] = 1; });
    $('resultat').textContent = res.length
      ? pluriel(res.length, 'proposition') + ' · ' + pluriel(Object.keys(nbCand).length, 'candidat')
      : 'Aucune proposition';
    $('effacer-recherche').hidden = !etat.recherche;

    if (!res.length) {
      var filtresActifs = etat.recherche || etat.candidats.length || etat.themes.length || etat.seulementFavoris;
      liste.appendChild(etat.seulementFavoris && !Object.keys(etat.favoris).length
        ? vide('Pas encore de favoris', 'Touche l’étoile ☆ d’une proposition pour la retrouver ici.', { libelle: 'Voir toutes les propositions', fn: reinitialiser })
        : vide('Rien ne correspond', 'Essaie un autre mot ou élargis les filtres.', filtresActifs ? { libelle: 'Effacer les filtres', fn: reinitialiser } : null));
      return;
    }

    // Regroupement par thème, dans l'ordre des thèmes
    D.themes.forEach(function (t) {
      var items = res.filter(function (p) { return p.theme === t.id; });
      if (!items.length) return;
      items.sort(function (a, b) { return parCandidat[a.candidat].nom.localeCompare(parCandidat[b.candidat].nom, 'fr'); });
      liste.appendChild(el('section', { classe: 'groupe', 'aria-label': t.nom }, [
        el('h3', { classe: 'groupe__titre' }, [
          el('span', { classe: 'groupe__icone', 'aria-hidden': 'true', texte: t.icone }), t.nom,
          el('span', { classe: 'groupe__nb', texte: String(items.length) })
        ]),
        el('div', { classe: 'cartes' }, items.map(carteProposition))
      ]));
    });
  }

  function reinitialiser() {
    etat.recherche = ''; $('recherche').value = '';
    etat.candidats = []; etat.themes = []; etat.seulementFavoris = false; $('seulement-favoris').checked = false;
    ecrireStockage(); rendrePucesFiltres(); rendreListe();
  }

  /* ---------- Rendu : vue comparer ---------- */
  function rendreComparer() {
    var zc = $('cmp-candidats'); zc.replaceChildren();
    var plein = etat.cmpCandidats.length >= MAX_COMPARAISON;
    candidatsTries().forEach(function (c) {
      if (!c.nb) return;
      var actif = etat.cmpCandidats.indexOf(c.id) >= 0;
      zc.appendChild(puce(c.nom, actif, { 'data-cmp': c.id, disabled: plein && !actif ? true : null }, c.couleur));
    });
    $('cmp-compteur').textContent = '(' + etat.cmpCandidats.length + '/' + MAX_COMPARAISON + ')';

    var sel = $('cmp-theme');
    if (!sel.options.length) {
      sel.appendChild(el('option', { value: '', texte: 'Tous les thèmes' }));
      D.themes.forEach(function (t) { if (t.nb) sel.appendChild(el('option', { value: t.id, texte: t.icone + ' ' + t.nom })); });
    }
    sel.value = etat.cmpTheme;

    var zone = $('comparaison'); zone.replaceChildren();
    if (etat.cmpCandidats.length < 2) {
      zone.appendChild(vide('Choisis au moins deux candidats', 'Touche leurs noms ci-dessus pour les mettre côte à côte.'));
      return;
    }
    var themes = etat.cmpTheme ? [parTheme[etat.cmpTheme]] : D.themes;
    var choisis = etat.cmpCandidats.map(function (id) { return parCandidat[id]; });
    var affiches = 0;
    themes.forEach(function (t) {
      var parC = choisis.map(function (c) {
        return D.propositions.filter(function (p) { return p.candidat === c.id && p.theme === t.id; });
      });
      // Sans filtre de thème, on masque les thèmes où aucun des candidats choisis ne s'est prononcé
      if (!etat.cmpTheme && parC.every(function (l) { return !l.length; })) return;
      affiches++;
      zone.appendChild(el('section', { classe: 'cmp-theme', 'aria-label': t.nom }, [
        el('h3', { classe: 'groupe__titre' }, [el('span', { classe: 'groupe__icone', 'aria-hidden': 'true', texte: t.icone }), t.nom]),
        el('div', { classe: 'cmp-colonnes', style: { '--nb': String(choisis.length) } }, choisis.map(function (c, i) {
          return el('div', { classe: 'cmp-colonne', style: { '--couleur': c.couleur } }, [
            el('div', { classe: 'cmp-colonne__tete' }, [avatar(c), el('span', {}, [c.nom, el('small', { texte: c.parti })])]),
            parC[i].length
              ? el('div', {}, parC[i].map(function (p) {
                  return el('div', { classe: 'cmp-item' }, [el('p', { texte: p.texte }), lienSource(p.source, true)]);
                }))
              : el('p', { classe: 'cmp-rien', texte: 'Pas de proposition recensée sur ce thème pour l’instant.' })
          ]);
        }))
      ]));
    });
    if (!affiches) zone.appendChild(vide('Rien à comparer', 'Ces candidats n’ont pas encore de proposition recensée en commun.'));
  }

  /* ---------- Rendu : vue candidats ---------- */
  function rendreCandidats() {
    var g = $('grille-candidats'); g.replaceChildren();
    var avec = candidatsTries().filter(function (c) { return c.nb; });
    var sans = D.candidats.filter(function (c) { return !c.nb; }).sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr'); });
    $('aide-candidats').textContent = pluriel(D.candidats.length, 'candidat déclaré', 'candidats déclarés') +
      ' au ' + dateLisible(D.mise_a_jour) + '. Touche une fiche pour voir ses propositions.';

    avec.forEach(function (c) {
      g.appendChild(el('button', { type: 'button', classe: 'fiche', 'data-voir': c.id }, ficheContenu(c)));
    });
    sans.forEach(function (c) {
      g.appendChild(el('div', { classe: 'fiche fiche--sans' }, ficheContenu(c)));
    });
  }

  function ficheContenu(c) {
    var meta = [];
    if (c.declaration) meta.push('Candidature : ' + dateLisible(c.declaration));
    if (c.note) meta.push(c.note);
    return [
      el('span', { style: { '--couleur': c.couleur }, classe: 'avatar', 'aria-hidden': 'true', texte: initiales(c.nom) }),
      el('div', {}, [
        el('p', { classe: 'fiche__nom', texte: c.nom }),
        el('p', { classe: 'fiche__parti', texte: c.parti }),
        meta.length ? el('p', { classe: 'fiche__meta', texte: meta.join(' · ') }) : null
      ]),
      el('span', { classe: 'fiche__nb' }, [c.nb ? String(c.nb) : '–', el('small', { texte: c.nb ? (c.nb > 1 ? 'propositions' : 'proposition') : 'pas encore' })])
    ];
  }

  /* ---------- Navigation ---------- */
  function montrerVue(vue) {
    etat.vue = vue;
    ['liste', 'comparer', 'candidats'].forEach(function (v) {
      $('vue-' + v).hidden = v !== vue;
      document.querySelector('.onglet[data-vue="' + v + '"]').setAttribute('aria-pressed', String(v === vue));
    });
    if (vue === 'liste') { rendrePucesFiltres(); rendreListe(); }
    if (vue === 'comparer') rendreComparer();
    if (vue === 'candidats') rendreCandidats();
    ecrireStockage();
  }

  function basculer(liste, id) {
    var i = liste.indexOf(id);
    if (i >= 0) liste.splice(i, 1); else liste.push(id);
  }

  /* ---------- En-tête ---------- */
  function rendreEntete() {
    var e = D.election || {};
    $('sous-titre').textContent = pluriel(D.propositions.length, 'proposition') + ' · ' + pluriel(D.candidats.filter(function (c) { return c.nb; }).length, 'candidat');
    if (e.premier_tour) {
      var jours = Math.ceil((new Date(e.premier_tour + 'T08:00:00') - new Date()) / 86400000);
      var cr = $('compte-rebours'); cr.replaceChildren();
      if (jours > 0) {
        cr.appendChild(el('strong', { texte: 'J – ' + jours }));
        cr.appendChild(document.createTextNode('1er tour · ' + new Date(e.premier_tour + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })));
        cr.title = e.note || '';
      } else cr.hidden = true;
    }
    $('pied-maj').textContent = 'Données mises à jour le ' + dateLisible(D.mise_a_jour) + '. ' + (D.avertissement || '');
  }

  /* ---------- Événements (délégation) ---------- */
  function brancher() {
    document.querySelector('.onglets').addEventListener('click', function (e) {
      var b = e.target.closest('[data-vue]'); if (b) montrerVue(b.getAttribute('data-vue'));
    });

    var lancerRecherche = debounce(function () { rendreListe(); }, 150);
    $('recherche').addEventListener('input', function (e) { etat.recherche = e.target.value; lancerRecherche(); });
    $('effacer-recherche').addEventListener('click', function () {
      etat.recherche = ''; $('recherche').value = ''; rendreListe(); $('recherche').focus();
    });
    $('tous-candidats').addEventListener('click', function () { etat.candidats = []; ecrireStockage(); rendrePucesFiltres(); rendreListe(); });
    $('tous-themes').addEventListener('click', function () { etat.themes = []; ecrireStockage(); rendrePucesFiltres(); rendreListe(); });
    $('seulement-favoris').addEventListener('change', function (e) { etat.seulementFavoris = e.target.checked; rendreListe(); });

    $('vue-liste').addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-candidat]'))) { basculer(etat.candidats, b.getAttribute('data-candidat')); }
      else if ((b = e.target.closest('[data-theme]'))) { basculer(etat.themes, b.getAttribute('data-theme')); }
      else if ((b = e.target.closest('[data-favori]'))) {
        var id = b.getAttribute('data-favori');
        if (etat.favoris[id]) delete etat.favoris[id]; else etat.favoris[id] = true;
        var on = !!etat.favoris[id];
        b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '★' : '☆';
        b.setAttribute('aria-label', on ? 'Retirer des favoris' : 'Ajouter aux favoris');
        ecrireStockage();
        if (etat.seulementFavoris) rendreListe();
        return;
      } else return;
      ecrireStockage(); rendrePucesFiltres(); rendreListe();
    });

    $('vue-comparer').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cmp]'); if (!b || b.disabled) return;
      basculer(etat.cmpCandidats, b.getAttribute('data-cmp'));
      ecrireStockage(); rendreComparer();
    });
    $('cmp-theme').addEventListener('change', function (e) { etat.cmpTheme = e.target.value; ecrireStockage(); rendreComparer(); });

    $('grille-candidats').addEventListener('click', function (e) {
      var b = e.target.closest('[data-voir]'); if (!b) return;
      etat.candidats = [b.getAttribute('data-voir')]; etat.themes = []; etat.recherche = ''; $('recherche').value = '';
      etat.seulementFavoris = false; $('seulement-favoris').checked = false;
      montrerVue('liste'); window.scrollTo(0, 0);
    });

    // Raccourci clavier : « / » place le curseur dans la recherche
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
        e.preventDefault(); if (etat.vue !== 'liste') montrerVue('liste'); $('recherche').focus();
      }
    });
  }

  /* ---------- Démarrage ---------- */
  function demarrer() {
    try {
      charger();
      rendreEntete();
      brancher();
      montrerVue(etat.vue);
      window.App.pret = true;
    } catch (err) {
      var p = $('panne');
      p.hidden = false;
      p.textContent = 'L’appli n’a pas pu démarrer (' + err.message + '). Vérifie que le dossier « donnees » est bien à côté de index.html, puis recharge la page.';
    }
  }

  window.App = { etat: etat, pret: false, filtrer: propositionsFiltrees };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
