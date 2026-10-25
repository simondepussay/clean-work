# À tester de mon côté

Ce que Simon doit essayer lui-même quand il a du temps. Les tests automatiques passent déjà :
ici, il s'agit de vérifier l'expérience réelle (affichage, formulations, notifications sur un vrai iPhone).
Cocher `[x]` quand c'est fait, et noter ce qui ne va pas sous la ligne.

Site : https://blue-rock-008b52800.2.azurestaticapps.net

## Import de CV, vitesse, rapport (24 octobre)

- [ ] Compte (icône en haut à droite) → « CVから入力 » : choisir un CV en PDF, puis « 読み込む ». Les champs se remplissent-ils bien ? Rien n'est écrasé ?
- [ ] Un mois signalé « 月を確認してください » : le corriger, puis enregistrer.
- [ ] Un CV scanné (image) : le message demande de coller le texte.
- [ ] Le site paraît-il plus rapide au 2e chargement et en passant d'un onglet à l'autre ?
- [ ] Email du rapport de la semaine reçu le lundi.

## Langue, calendrier et design (jour 9, soir)

- [ ] Globe en haut à droite : passer en 日本語, English, Français ; tout change sauf les intercalaires.
- [ ] Accueil : « Ajouter au calendrier » → Google Agenda : l'abonnement apparaît, avec tes entretiens et tes notes.
- [ ] Même chose avec le Calendrier Apple (iPhone ou Mac).
- [ ] Modifier une date dans 応募, puis vérifier quelques heures plus tard que Google ou Apple l'a mise à jour.
- [ ] Clic sur une date du calendrier : note rapide ; survol d'une date occupée : l'aperçu.
- [ ] 面接 : « Quel entretien ? » propose l'entretien prévu dans une candidature ; bouton « 練習する » sur un entretien du calendrier.
- [ ] Coller une vraie offre d'emploi dans les notes d'une candidature, puis faire un entraînement pour cette entreprise.

## Entraînement aux entretiens (S17–S19, jour 9) — nouveau

- [ ] Web, onglet 面接 : choisir une entreprise (avec 業界, type et 企業メモ remplis), puis 一次面接, et commencer.
- [ ] Les questions parlent-elles vraiment de l'entreprise, de ton profil et de ton ES ?
- [ ] Répondre au micro (Chrome ou Safari) : le texte reconnu est-il correct ? La question est-elle lue à voix haute ?
- [ ] Les avis sont-ils utiles et dans la bonne langue ? Une relance (深掘り) apparaît-elle ?
- [ ] Le bilan final, puis l'historique (これまでの練習).
- [ ] Depuis une candidature : bouton « 🎤 面接を練習する ».
- [ ] iPhone : Accueil → « 面接練習 », accepter micro et reconnaissance vocale, répondre à voix haute (le texte apparaît-il pendant que tu parles ?).

## Notifications push serveur (S26, jour 9) — le plus important

- [ ] Lancer la nouvelle version de l'app sur l'iPhone depuis Xcode (`ios/`, `xcodegen generate` puis Run).
- [ ] Se connecter, créer une candidature avec une échéance **aujourd'hui ou demain**, accepter les notifications.
- [ ] Dire à Claude « c'est prêt » : il relance la tâche du matin (workflow « Rappels des échéances »).
- [ ] Vérifier la notification « 今日締切があります / Due today » (texte, nombre de lignes).
- [ ] Se déconnecter, relancer la tâche : plus aucune notification ne doit arriver.

## Rappels et calendrier (S09, jour 8)

- [ ] iOS : avec le push serveur actif, il ne doit **pas** y avoir de rappels locaux en double.
- [ ] Web, onglet 応募 : encadré 近い締切 (rouge à 3 jours ou moins).
- [ ] Web : « カレンダーに追加 » → importer le .ics dans Google, Apple ou Outlook Calendar.

## ES et candidatures (jour 8)

- [ ] Écrire une ES pour une entreprise déjà dans 応募 : le lien se fait tout seul, la carte affiche « ES 1 ».
- [ ] Depuis une candidature : « このESを書く ».

## Suivi des candidatures (S07, S08, jour 7)

- [ ] Ajouter 2 ou 3 entreprises avec une étape datée, faire avancer les cartes (glisser et ◀ ▶).
- [ ] iPhone : balayer une ligne pour passer à l'étape suivante.

## Documents PDF (S11, S12, jour 6)

- [ ] 履歴書 : 西暦 puis 和暦, vérifier la mise en page et les formulations (statut 修了, 卒業見込み).
- [ ] 職務経歴書 : avec une expérience décrite et un 職務要約 de 2 ou 3 phrases.

## App iOS redessinée (Clean Work, oct. 2026)

- [ ] Globe en haut : passer en 日本語 / English / Français, vérifier que tous les écrans changent (sauf les intercalaires).
- [ ] Profil → « Remplir depuis un CV » : choisir un vrai CV en PDF, vérifier formations, diplômes, certifications et les dates signalées.
- [ ] Même chose en collant le texte du CV au lieu du PDF.
- [ ] iPad : parcourir les 5 onglets en portrait et en paysage.

## Notifications personnalisées (oct. 2026)

- [ ] iPhone : mettre une heure à un 一次面接 dans 1 h 10 → l'encouragement « あと1時間 » arrive 1 h avant, avec le nom de l'entreprise.
- [ ] Changer la langue avec le globe, rouvrir l'app → les notifications du serveur du lendemain matin arrivent dans cette langue.
- [ ] Ne rien toucher dans 応募 pendant 7 jours → relance « 最近どうですか？ » (une fois par semaine au plus).
- [ ] Quand JEES publie les dates 2027 : les ajouter dans api/content/jlpt.json (ou me le demander).

## Données ouvertes (oct. 2026)

- [ ] gBizINFO : demander le jeton (https://content.info.gbiz.go.jp/api/index.html → 利用申請), puis `node infra/gbiz-key.mjs` ; /api/health doit afficher gbiz: ok.
- [ ] Candidature → « 公式データで企業を探す » avec une vraie entreprise : vérifier les labels (くるみん…) et les chiffres.
- [ ] Profil : taper un vrai 〒 → l'adresse se remplit ; le 履歴書 PDF affiche le 〒.
- [ ] Accueil : météo du prochain entretien (moins de 15 jours) ; jours fériés en bordeaux.

## Surveillance (S21, jour 9)

- [ ] Vérifier que l'email d'Azure « ajouté au groupe d'actions » est bien arrivé sur depussay.simon@icloud.com (sinon les alertes n'arriveront pas).
- [ ] GitHub : vérifier que les emails « workflow failed » sont activés (Settings → Notifications → Actions).

## Avant l'App Store (activité L)

- [x] Ajouter l'icône de l'app : l'archive a été refusée le 23/10 faute d'icône 120×120 (`CFBundleIconName`). → icône ajoutée (refaire une archive pour confirmer).
