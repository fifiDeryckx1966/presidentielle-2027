# Propositions 2027

Appli web qui liste les propositions des candidats déclarés à l'élection présidentielle française de 2027, classées par thème, avec recherche, filtres par candidat, favoris et vue comparative. Chaque proposition renvoie vers sa source.

## Utiliser l'appli

Double-clique sur `index.html` : elle s'ouvre dans le navigateur, sans installation ni serveur. Elle marche aussi publiée telle quelle (GitHub Pages, etc.) et s'adapte au téléphone.

- **Propositions** : recherche (insensible aux accents, raccourci `/`), filtres par candidat et par thème, étoile pour garder une proposition en favori.
- **Comparer** : jusqu'à 4 candidats côte à côte, sur un thème ou sur tous.
- **Candidats** : la liste des candidats déclarés, avec la date de candidature ; toucher une fiche affiche ses propositions.

Les filtres, la vue ouverte et les favoris sont retenus dans le navigateur.

## Les données

Tout est dans `donnees/propositions.json` :

- `candidats` : id, nom, parti, date de déclaration, couleur, note éventuelle ;
- `themes` : id, nom, icône ;
- `propositions` : id stable, candidat, thème, texte, et `source` (`nom`, `url`, `date`).

Pour ajouter ou corriger une proposition, modifie le JSON puis lance :

```
node outils/construire.js
```

Ce script vérifie les données (candidat et thème connus, source en https, id unique) et régénère `donnees/propositions.js`, la copie que l'appli charge. Cette copie en `.js` est nécessaire parce que les navigateurs refusent de lire un fichier JSON local quand on ouvre `index.html` par double-clic.

## Limites à connaître

- Données arrêtées au 24 novembre 2026. Plusieurs candidats n'ont pas encore publié de programme complet : leurs propositions viennent d'interviews, de livrets ou de contre-budgets.
- Certaines propositions renvoient à un comparateur (iFRAP, Votons 2027, Voter en 2027) plutôt qu'à la source d'origine. Elles sont marquées comme telles.
- Être déclaré ne garantit pas d'être sur le bulletin : il faut 500 parrainages d'élus, à réunir d'ici le 12 mars 2027. Les dates du scrutin (18 avril et 2 mai 2027) sont pressenties tant que le décret de convocation n'est pas paru.
