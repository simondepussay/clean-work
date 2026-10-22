# Présentation du projet

`Shukatsu-Pilot-FR.pptx` et `Shukatsu-Pilot-EN.pptx` : 12 diapositives (problème, solution,
relecture IA, architecture, méthode, journées, qualité, sécurité, leçons, suite).

Générées par un seul script, à partir des textes de `content.cjs` (français et anglais) :

```bash
cd presentation && npm install && node build.cjs
```

Les chiffres (tests, stories, points) sont dans `FACTS`, en haut de `content.cjs`.
`apply_theme.js` écrit les couleurs du thème (indigo 藍 et vermillon 朱) dans les fichiers.
