// Textes de la présentation, en français et en anglais. Les termes japonais restent en japonais.
// Les chiffres viennent du projet (tests, backlog, coûts mesurés) : les mettre à jour ici.

const FACTS = {
  tests: { api: 118, web: 59, ios: 36 },
  stories: 25,
  points: 105,
  activities: 13,
  days: 6,
};

module.exports = {
  FACTS,
  fr: {
    file: "Shukatsu-Pilot-FR.pptx",
    footer: "Shukatsu Pilot · 就活パイロット",
    title: {
      jp: "就活パイロット",
      name: "Shukatsu Pilot",
      tagline: "L'assistant de recherche d'emploi des étudiants étrangers au Japon",
      meta: "Simon Depussay · HAL Tokyo · octobre 2026",
      notes: "Présenter le projet en une phrase : une app iOS et web qui aide les étudiants étrangers à réussir leur 就活.",
    },
    problem: {
      title: "Trois obstacles pour un étudiant étranger",
      cards: [
        { icon: "doc", tag: "履歴書", head: "Un format strict", body: "Cases fixes, 西暦 ou 和暦, formulations codifiées (卒業見込み, 修了…). Une erreur de forme suffit à être écarté." },
        { icon: "edit", tag: "ES", head: "Des textes jugés sur la forme", body: "Keigo, 貴社 et non 御社, style écrit unifié, structure PREP / STAR, limite de caractères." },
        { icon: "calendar", tag: "面接", head: "Un calendrier serré", body: "ES → test d'aptitude → entretiens → 内定 : des dizaines d'entreprises et d'échéances en parallèle." },
      ],
      notes: "Trois obstacles concrets, que je vis moi-même en tant qu'étudiant étranger à HAL.",
    },
    solution: {
      title: "Une app iOS et web qui accompagne chaque étape",
      status: { done: "Disponible", doing: "En cours", later: "Version 1.1" },
      tiles: [
        { icon: "pdf", status: "done", head: "履歴書 et 職務経歴書 en PDF", body: "Le profil, rempli une fois, devient un 履歴書 au format du 厚生労働省." },
        { icon: "review", status: "done", head: "ES et relecture IA", body: "Guide d'écriture, exemples, relecture du keigo et de la structure, explications en FR, EN ou JA." },
        { icon: "kanban", status: "doing", head: "Suivi des candidatures", body: "Entreprises, étapes de sélection en tableau, rappels avant chaque échéance." },
        { icon: "mic", status: "later", head: "Entraînement aux entretiens", body: "Répondre à l'oral, recevoir un retour sur le contenu et le keigo." },
      ],
      notes: "Deux fonctions sont déjà utilisables en ligne ; le suivi des candidatures est la prochaine étape.",
    },
    ai: {
      title: "Relecture IA : règles écrites, citations vérifiées",
      steps: ["ES de l'étudiant", "Règles du 就活 dans les instructions", "gpt-5-mini (Azure OpenAI)", "Citations vérifiées dans le texte", "Explications dans sa langue"],
      stats: [
        { value: "~15 s", label: "par relecture" },
        { value: "~0,6 ¥", label: "par relecture" },
        { value: "10 / jour", label: "limite par utilisateur" },
        { value: "7 / 7", label: "types d'erreurs trouvés au test" },
      ],
      notes: "Sans les règles écrites, le modèle confondait 御社 et 貴社. Une citation absente du texte est écartée : l'IA peut inventer.",
    },
    architecture: {
      title: "Une architecture Azure simple, définie en code",
      clients: ["iPhone · SwiftUI", "Web · React + TypeScript"],
      auth: "Microsoft Entra External ID",
      authSub: "comptes et connexion",
      api: "API · Azure Functions",
      apiSub: "Static Web Apps (Hong Kong)",
      data: [
        { head: "Cosmos DB", sub: "Corée · données par utilisateur" },
        { head: "Azure OpenAI", sub: "relecture des ES" },
        { head: "PDF", sub: "pdf-lib · Noto Serif JP" },
      ],
      footer: "Infrastructure en Bicep · déploiement GitHub Actions avec vérification de la version en ligne",
      notes: "Régions imposées par l'abonnement étudiant : la Corée et Hong Kong, le Japon étant interdit.",
    },
    method: {
      title: "Une méthode Scrum, planifiée avec PERT",
      stats: [
        { value: String(FACTS.stories), label: "user stories" },
        { value: String(FACTS.points), label: "points d'effort" },
        { value: String(FACTS.activities), label: "tâches (A à M)" },
      ],
      pathLabel: "Chemin critique : les tâches qui décident de la date de fin",
      path: ["A", "B", "C", "G", "J", "K", "L", "M"],
      bullets: [
        "Un journal de développement chaque jour, en 日本語 et en English",
        "Révision du 基本情報 en pratique : PERT, クリティカルパス, 山崩し, E-R図, スクラム",
      ],
      notes: "Le planning PERT montre quelles tâches retardent tout le projet si elles prennent du retard.",
    },
    timeline: {
      title: "Six journées de développement",
      days: [
        { head: "Fondations", body: "Azure en code, API, CI/CD" },
        { head: "Connexion", body: "Entra External ID, web" },
        { head: "iPhone", body: "Connexion native, suppression de compte" },
        { head: "Profil", body: "Suppression avec 30 jours de grâce" },
        { head: "ES et IA", body: "Relecture, limites, guide" },
        { head: "Documents", body: "Confidentialité, 履歴書, 職務経歴書" },
      ],
      dayLabel: "Jour",
      notes: "Chaque journée est documentée dans le journal, avec les décisions et les erreurs.",
    },
    quality: {
      title: "La qualité, vérifiée à chaque modification",
      chartTitle: "Tests automatiques",
      categories: ["API", "Web", "iOS"],
      total: "tests automatiques",
      bullets: [
        "Chaque push : tests, déploiement, puis vérification que le bon commit est en ligne",
        "Chaque retour utilisateur devient un test : furigana en kana, 卒業見込み, caractères du PDF",
      ],
      notes: "Un test qui n'a jamais échoué ne prouve rien : pour le bug du PDF, j'ai vérifié que les tests échouaient avec l'ancienne police.",
    },
    security: {
      title: "Sécurité et vie privée dès la conception",
      rows: [
        { icon: "shield", head: "Jetons vérifiés", body: "Signature, émetteur, destinataire, expiration : 7 cas d'attaque testés." },
        { icon: "lock", head: "Données cloisonnées", body: "Chaque document est rangé par utilisateur : impossible de lire celles d'un autre." },
        { icon: "ai", head: "Le minimum envoyé à l'IA", body: "Question, réponse, limite et entreprise. Jamais le profil." },
        { icon: "trash", head: "Suppression en 30 jours", body: "Données masquées tout de suite, effacées par Cosmos DB, restaurables sur demande." },
      ],
      notes: "La politique de confidentialité a été rédigée à partir du code, pour dire exactement ce que fait l'app.",
    },
    lessons: {
      title: "Ce que le projet m'a appris",
      cards: [
        { icon: "timer", head: "Mesurer avant de corriger", body: "Les 7 secondes de démarrage iOS n'étaient pas un bug : 0,04 s mesurées." },
        { icon: "bug", head: "Tester des deux côtés d'une limite", body: "Le PDF cassait seulement avec peu de caractères." },
        { icon: "rule", head: "Une IA a besoin de règles écrites", body: "Sans elles, gpt-5-mini confondait 御社 et 貴社." },
        { icon: "people", head: "Les vrais utilisateurs voient ce que je ne vois pas", body: "« C'est quoi une ES ? » a donné le guide d'écriture." },
      ],
      notes: "Ces quatre leçons sont racontées en détail dans le journal de développement.",
    },
    next: {
      title: "Prochaines étapes vers l'App Store",
      steps: [
        { tag: "D", head: "Suivi des candidatures", body: "Entreprises et étapes en tableau" },
        { tag: "F", head: "Rappels d'échéance", body: "Notification la veille" },
        { tag: "J", head: "Tests d'intégration", body: "Surveillance en production" },
        { tag: "K", head: "Bêta à HAL", body: "10 étudiants étrangers" },
        { tag: "L", head: "App Store", body: "Publication" },
      ],
      goal: "Objectif : version 1 avant le 31 mars 2027, à l'ouverture des candidatures aux stages d'été",
      notes: "La bêta avec de vrais étudiants est l'étape la plus importante : chaque test utilisateur a déjà amélioré l'app.",
    },
    thanks: {
      title: "Merci",
      jp: "ありがとうございました",
      contact: "depussay.simon@icloud.com · simondepussay.com",
      notes: "Questions.",
    },
  },

  en: {
    file: "Shukatsu-Pilot-EN.pptx",
    footer: "Shukatsu Pilot · 就活パイロット",
    title: {
      jp: "就活パイロット",
      name: "Shukatsu Pilot",
      tagline: "A job-hunting assistant for international students in Japan",
      meta: "Simon Depussay · HAL Tokyo · October 2026",
      notes: "One-sentence pitch: an iOS and web app that helps international students succeed in Japanese job hunting (shukatsu).",
    },
    problem: {
      title: "Three obstacles for international students",
      cards: [
        { icon: "doc", tag: "履歴書", head: "A strict format", body: "Fixed boxes, Western or Japanese years, set phrases (卒業見込み, 修了…). One formatting mistake can be enough to be rejected." },
        { icon: "edit", tag: "ES", head: "Texts judged on form", body: "Keigo, 貴社 not 御社, consistent written style, PREP / STAR structure, character limits." },
        { icon: "calendar", tag: "面接", head: "A tight schedule", body: "ES → aptitude test → interviews → offer: dozens of companies and deadlines at the same time." },
      ],
      notes: "Three concrete obstacles that I face myself as an international student at HAL.",
    },
    solution: {
      title: "An iOS and web app for every step",
      status: { done: "Available", doing: "In progress", later: "Version 1.1" },
      tiles: [
        { icon: "pdf", status: "done", head: "Résumé and work history as PDF", body: "Fill in your profile once; get a résumé in the Ministry of Health, Labour and Welfare format." },
        { icon: "review", status: "done", head: "Entry sheets and AI review", body: "Writing guide, examples, keigo and structure review, explanations in EN, FR or JA." },
        { icon: "kanban", status: "doing", head: "Application tracking", body: "Companies, selection steps on a board, reminders before each deadline." },
        { icon: "mic", status: "later", head: "Interview practice", body: "Answer out loud, get feedback on content and keigo." },
      ],
      notes: "Two features are already live; application tracking comes next.",
    },
    ai: {
      title: "AI review: written rules, verified quotes",
      steps: ["Student's entry sheet", "Job-hunting rules in the prompt", "gpt-5-mini (Azure OpenAI)", "Quotes checked against the text", "Explanations in their language"],
      stats: [
        { value: "~15 s", label: "per review" },
        { value: "~¥0.6", label: "per review" },
        { value: "10 / day", label: "limit per user" },
        { value: "7 / 7", label: "error types found in testing" },
      ],
      notes: "Without written rules the model mixed up 御社 and 貴社. A quote that isn't in the text is dropped: the AI can make things up.",
    },
    architecture: {
      title: "A simple Azure architecture, defined as code",
      clients: ["iPhone · SwiftUI", "Web · React + TypeScript"],
      auth: "Microsoft Entra External ID",
      authSub: "accounts and sign-in",
      api: "API · Azure Functions",
      apiSub: "Static Web Apps (Hong Kong)",
      data: [
        { head: "Cosmos DB", sub: "Korea · data per user" },
        { head: "Azure OpenAI", sub: "entry-sheet review" },
        { head: "PDF", sub: "pdf-lib · Noto Serif JP" },
      ],
      footer: "Infrastructure in Bicep · GitHub Actions deployment that verifies the live version",
      notes: "Regions are set by the student subscription: Korea and Hong Kong, since Japan isn't allowed.",
    },
    method: {
      title: "Scrum, planned with PERT",
      stats: [
        { value: String(FACTS.stories), label: "user stories" },
        { value: String(FACTS.points), label: "story points" },
        { value: String(FACTS.activities), label: "activities (A to M)" },
      ],
      pathLabel: "Critical path: the activities that decide the end date",
      path: ["A", "B", "C", "G", "J", "K", "L", "M"],
      bullets: [
        "A development journal every day, in 日本語 and English",
        "Hands-on revision for the FE exam: PERT, critical path, resource levelling, E-R diagrams, Scrum",
      ],
      notes: "The PERT chart shows which activities delay the whole project if they slip.",
    },
    timeline: {
      title: "Six days of development",
      days: [
        { head: "Foundation", body: "Azure as code, API, CI/CD" },
        { head: "Sign-in", body: "Entra External ID, web" },
        { head: "iPhone", body: "Native sign-in, account deletion" },
        { head: "Profile", body: "Deletion with a 30-day grace period" },
        { head: "ES and AI", body: "Review, limits, guide" },
        { head: "Documents", body: "Privacy, résumé, work history" },
      ],
      dayLabel: "Day",
      notes: "Every day is documented in the journal, with decisions and mistakes.",
    },
    quality: {
      title: "Quality, checked on every change",
      chartTitle: "Automated tests",
      categories: ["API", "Web", "iOS"],
      total: "automated tests",
      bullets: [
        "Every push: tests, deployment, then a check that the right commit is live",
        "Every piece of user feedback becomes a test: kana furigana, 卒業見込み, PDF characters",
      ],
      notes: "A test that has never failed proves nothing: for the PDF bug, I checked the tests failed with the old font.",
    },
    security: {
      title: "Security and privacy by design",
      rows: [
        { icon: "shield", head: "Verified tokens", body: "Signature, issuer, audience, expiry: 7 attack cases tested." },
        { icon: "lock", head: "Isolated data", body: "Every document is stored per user: no way to read someone else's." },
        { icon: "ai", head: "Minimum data sent to the AI", body: "Question, answer, limit and company. Never the profile." },
        { icon: "trash", head: "Deletion within 30 days", body: "Hidden immediately, erased by Cosmos DB, restorable on request." },
      ],
      notes: "The privacy policy was written from the code, so it says exactly what the app does.",
    },
    lessons: {
      title: "What the project taught me",
      cards: [
        { icon: "timer", head: "Measure before fixing", body: "The 7-second iOS launch wasn't a bug: it measured 0.04 s." },
        { icon: "bug", head: "Test both sides of a boundary", body: "The PDF only broke when it had few characters." },
        { icon: "rule", head: "An AI needs written rules", body: "Without them, gpt-5-mini mixed up 御社 and 貴社." },
        { icon: "people", head: "Real users see what I don't", body: "“What is an ES, actually?” led to the writing guide." },
      ],
      notes: "All four lessons are told in detail in the development journal.",
    },
    next: {
      title: "Next steps to the App Store",
      steps: [
        { tag: "D", head: "Application tracking", body: "Companies and steps on a board" },
        { tag: "F", head: "Deadline reminders", body: "A notification the day before" },
        { tag: "J", head: "Integration tests", body: "Production monitoring" },
        { tag: "K", head: "Beta at HAL", body: "10 international students" },
        { tag: "L", head: "App Store", body: "Release" },
      ],
      goal: "Goal: version 1 before 31 March 2027, when summer-internship applications open",
      notes: "The beta with real students matters most: every user test has already improved the app.",
    },
    thanks: {
      title: "Thank you",
      jp: "ありがとうございました",
      contact: "depussay.simon@icloud.com · simondepussay.com",
      notes: "Questions.",
    },
  },
};
