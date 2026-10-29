# Clean Work に追加 — extension Chrome

Enregistre l'offre d'emploi de la page ouverte (リクナビ, マイナビ, LinkedIn, Daijob, CareerCross…)
dans Clean Work, en un clic sur l'icône ou avec **Alt+Maj+S**.

## Comment ça marche

1. `background.js` lance `extractJob` (dans `extract.js`) dans l'onglet ouvert, au moment du clic.
   La fonction lit les données `JobPosting` (schema.org) de la page, sinon quelques sites connus,
   sinon le titre ; le texte sélectionné devient le résumé de l'offre.
2. Elle ouvre `https://cleanwork.simondepussay.com/#add=…` : l'offre est dans l'adresse, après `#`
   (jamais envoyée à un serveur). Clean Work ouvre le formulaire de 応募 rempli ; l'utilisateur vérifie et enregistre.

L'extension ne voit jamais le compte, ne garde rien, et ne demande que `activeTab` (l'onglet où l'on clique,
au moment du clic) et `scripting`. `extract.js` sert aussi au bookmarklet du site (`web/src/apps/savedJob.ts`)
et est testé avec l'app web (`web/src/apps/extractJob.test.ts`).

## Tester sur son ordinateur

1. Chrome → `chrome://extensions` → activer **Mode développeur** (en haut à droite).
2. **Charger l'extension non empaquetée** → choisir ce dossier `extension/`.
3. Ouvrir une offre (par exemple sur Daijob ou LinkedIn) et cliquer sur l'icône Clean Work.

## Publier sur le Chrome Web Store

1. Créer un compte développeur : https://chrome.google.com/webstore/devconsole (5 $ une fois).
2. `./package.sh` → `clean-work-extension.zip`.
3. Dans la console : **Nouvel élément** → envoyer le zip, puis remplir la fiche :
   - catégorie : Productivité ; langues : japonais (principal), anglais ;
   - justification des autorisations : *activeTab* « lire l'offre de l'onglet où l'utilisateur clique »,
     *scripting* « lancer cette lecture dans l'onglet » ;
   - confidentialité : aucune donnée collectée ni transmise à un serveur ;
     politique : https://cleanwork.simondepussay.com/privacy.html
4. Captures d'écran (1280 × 800) : une page d'offre, puis le formulaire rempli dans Clean Work.
5. La vérification prend en général quelques jours.
