# À tester de mon côté

Ce que Simon doit essayer lui-même quand il a du temps. Les tests automatiques passent déjà :
ici, il s'agit de vérifier l'expérience réelle (affichage, formulations, notifications sur un vrai iPhone).
Cocher `[x]` quand c'est fait, et noter ce qui ne va pas sous la ligne.

Site : https://blue-rock-008b52800.2.azurestaticapps.net

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

## Avant l'App Store (activité L)

- [ ] Ajouter l'icône de l'app : l'archive a été refusée le 23/10 faute d'icône 120×120 (`CFBundleIconName`).
