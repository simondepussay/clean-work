# À tester de mon côté

Ce que Simon doit essayer lui-même quand il a du temps. Les tests automatiques passent déjà :
ici, il s'agit de vérifier l'expérience réelle (affichage, formulations, notifications sur un vrai iPhone).
Cocher `[x]` quand c'est fait, et noter ce qui ne va pas sous la ligne.

Site : https://blue-rock-008b52800.2.azurestaticapps.net

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

## Surveillance (S21, jour 9)

- [ ] Vérifier que l'email d'Azure « ajouté au groupe d'actions » est bien arrivé sur depussay.simon@icloud.com (sinon les alertes n'arriveront pas).
- [ ] GitHub : vérifier que les emails « workflow failed » sont activés (Settings → Notifications → Actions).

## Avant l'App Store (activité L)

- [ ] Ajouter l'icône de l'app : l'archive a été refusée le 23/10 faute d'icône 120×120 (`CFBundleIconName`).
