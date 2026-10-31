# 就活パイロット（仮）/ Shukatsu Pilot

日本で就職活動をする留学生のための、応募管理・履歴書作成・ESレビュー・面接練習アプリ（iOS + Web）。

> Une app iOS + web pour les étudiants étrangers qui cherchent un emploi au Japon : suivi des candidatures,
> 履歴書 au format JIS, relecture d'ES par IA (keigo, structure), entraînement aux entretiens à l'oral.

## Où en est le projet

**Sprint 1 en cours** (développement commencé le 16 octobre 2026). Objectif : MVP publiée avant le 31 mars 2027, date où ouvrent les candidatures aux stages d'été.

- Site : https://cleanwork.simondepussay.com (adresse d’origine d’Azure, toujours active : https://blue-rock-008b52800.2.azurestaticapps.net)

## Contenu

```
web/                      ← app web : Vite + React + TypeScript
api/                      ← API : Azure Functions v4 en TypeScript (intégrée à Static Web Apps)
ios/                      ← app iPhone : SwiftUI + MSAL (projet généré : `cd ios && xcodegen generate`)
infra/main.bicep          ← infrastructure Azure en code (Cosmos DB, Static Web Apps)
infra/identity.mjs        ← annuaire External ID (apps, parcours, app de suppression et son secret)
infra/settings.mjs        ← réglages de l'API, ajoutés sans écraser le secret
infra/restore-account.mjs ← corbeille (--list) et restauration d'un compte supprimé depuis moins de 30 jours
.github/workflows/        ← tests, déploiement, vérification de la version en ligne
tools/otf2ttf.py          ← convertit la police du 履歴書 en TrueType (voir api/assets/fonts/README.md)
web/public/privacy.html   ← politique de confidentialité et conditions d'utilisation (terms.html), JA + EN
planning/plan.json        ← source unique : stories, points, dépendances
tools/build_plan.py       ← calcule PERT, chemin critique, planning 1 dev, sprints
docs/plan.html            ← plan complet en japonais (généré) — à ouvrir dans un navigateur
docs/plan.en.html         ← la même chose en anglais (généré)
docs/backlog.md           ← backlog lisible sur GitHub, japonais (généré)
docs/backlog.en.md        ← backlog en anglais (généré)
docs/diagrams/*.mmd       ← flowcharts Mermaid japonais : user flow, architecture, séquence, E-R
docs/diagrams/en/*.mmd    ← les mêmes en anglais
```

Les traductions anglaises des stories et des tâches sont dans `plan.json`, dans les champs `*_en`.

## Lancer en local

```bash
cd api && npm install && npm start      # API sur http://localhost:7071 (données en mémoire sans COSMOS_ENDPOINT)
cd web && npm install && npm run dev    # app sur http://localhost:5173, /api redirigé vers l'API
```

Tests : `npm test` dans `api/` et dans `web/`.

## Azure

Régions imposées par la politique de l'abonnement (le Japon est interdit) : Cosmos DB en **Corée Centre**, Static Web Apps en **Asie de l'Est**. Groupe de ressources : `rg-shukatsu-pilot`.

```bash
az deployment group create -g rg-shukatsu-pilot -f infra/main.bicep   # ressources
node infra/settings.mjs                                                # réglages de l'API
```

L'annuaire External ID (`shukatsupilot`) est dans un autre tenant : `node infra/identity.mjs <tenant>` s'exécute connecté à ce tenant.

## Régénérer le plan

Après avoir modifié `planning/plan.json` (une story, des points, une dépendance) :

```bash
python3 tools/build_plan.py
```

## Comment l'estimation est construite

1. **Backlog Scrum** : user stories, points en Fibonacci (1, 2, 3, 5, 8, 13), priorité MoSCoW.
2. **Vélocité** : 10 SP par sprint de 2 semaines (je suis seul, à temps partiel, en parallèle des cours), donc 1 SP ≈ 1,4 jour.
3. **PERT (アローダイアグラム)** : les stories sont regroupées en tâches, et la durée de chaque tâche est convertie en jours. Le script calcule les 最早/最遅結合点時刻, les marges (全余裕) et la クリティカルパス.
4. **山崩し** : comme je suis le seul développeur, je ne peux faire qu'une tâche de dev à la fois. Le script réordonne donc les tâches (en commençant par celles qui ont le moins de marge), ce qui donne le Gantt réel.
5. **Sprints** : chaque story compte dans la sprint où elle se **termine**, ce qui donne la charge par sprint.

C'est aussi une révision pour le **基本情報技術者試験**. La section 6 de `plan.html` fait le lien avec les notions de l'examen et contient des exercices tirés de ce planning.
