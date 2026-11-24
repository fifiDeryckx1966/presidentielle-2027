#!/usr/bin/env node
/*
 * Recopie donnees/propositions.json dans donnees/propositions.js,
 * pour que l'appli marche aussi en double-cliquant index.html (file://),
 * où les navigateurs refusent de lire un fichier JSON local.
 * Vérifie au passage que chaque proposition pointe vers un candidat, un thème et une source.
 *
 * Usage : node outils/construire.js
 */
const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..');
const source = path.join(racine, 'donnees', 'propositions.json');
const cible = path.join(racine, 'donnees', 'propositions.js');

const d = JSON.parse(fs.readFileSync(source, 'utf8'));
const candidats = new Set(d.candidats.map(c => c.id));
const themes = new Set(d.themes.map(t => t.id));
const ids = new Set();
const erreurs = [];

d.propositions.forEach((p, i) => {
  const ou = `proposition n°${i + 1} (${p.id || 'sans id'})`;
  if (!p.id) erreurs.push(`${ou} : id manquant`);
  else if (ids.has(p.id)) erreurs.push(`${ou} : id en double`);
  ids.add(p.id);
  if (!candidats.has(p.candidat)) erreurs.push(`${ou} : candidat inconnu « ${p.candidat} »`);
  if (!themes.has(p.theme)) erreurs.push(`${ou} : thème inconnu « ${p.theme} »`);
  if (!p.texte) erreurs.push(`${ou} : texte vide`);
  if (!p.source || !/^https:\/\//.test(p.source.url || '')) erreurs.push(`${ou} : source sans lien https`);
});

if (erreurs.length) {
  console.error('Données invalides :\n- ' + erreurs.join('\n- '));
  process.exit(1);
}

const entete = '/* Fichier généré par outils/construire.js à partir de propositions.json. Ne pas modifier à la main. */\n';
fs.writeFileSync(cible, entete + 'window.DONNEES_2027 = ' + JSON.stringify(d, null, 1) + ';\n');
console.log(`OK : ${d.propositions.length} propositions, ${d.candidats.length} candidats, ${d.themes.length} thèmes → donnees/propositions.js`);
