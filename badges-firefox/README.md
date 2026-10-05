# Badges — sélection par liste et AffichApp · 1.2.1

Mise à jour de l’extension IDCapt 1.0.0 préparée pour Mozilla. L’identifiant reste `selection-badges@local.invalid` pour permettre la mise à jour de la version existante.

## Installation et utilisation

1. Pour un essai temporaire, ouvrez `about:debugging` dans Firefox, puis **Ce Firefox → Charger un module complémentaire temporaire** et choisissez `extension/manifest.json`.
2. Ouvrez les préférences de l’extension depuis `about:addons`, ou cliquez sur **Réglages et connexion** dans le panneau IDCapt.
3. Enregistrez l’origine HTTPS d’AffichApp et autorisez son accès. Un serveur local peut utiliser `http://localhost:3000` ou `http://127.0.0.1:3000`. Les serveurs HTTP distants ne sont pas acceptés.
4. Cliquez sur **Se connecter à AffichApp**. Connectez-vous sur la page AffichApp puis autorisez l’extension. Un compte `admin` ou `appel` permet la lecture de toutes les cartes, le changement des statuts et l’ajout de noms ; un compte `requester` ne peut que lire ses propres cartes.
5. Ouvrez votre page IDCapt `/Activation_badge`, puis cliquez sur l’icône de l’extension.
6. Cliquez sur **Récupérer les cartes**. Par défaut, les cartes `demande` et `impression` sont affichées. Les filtres permettent de choisir un statut et un type de carte.
7. Cochez les demandes voulues puis **Utiliser les noms sélectionnés**. Les noms identiques sont regroupés pour l’analyse, mais les identifiants des cartes restent distincts pour les statuts.
8. Cliquez sur **Analyser la liste**, puis **Cocher les correspondances**. Les noms absents ou ambigus ne sont pas cochés. Les cases déjà cochées sont conservées et la sélection est vérifiée après pagination. L’impression et l’encodage restent manuels.

Le bouton **Envoyer le statut à AffichApp** effectue une mise à jour explicite des demandes choisies, après confirmation. Il ne déduit pas un statut de l’impression ou du cochage IDCapt. Les erreurs sont affichées carte par carte. Un changement de serveur oblige à recharger les cartes avant de modifier leurs statuts.

Les réglages contiennent également un formulaire d’ajout de nom dans la présaisie AffichApp. Cet ajout ne crée pas de demande.

## Données et confidentialité

Le serveur reçoit les codes et jetons OAuth ainsi que les noms ajoutés et les changements de statut explicitement demandés. L’extension récupère les noms des demandes pour les rechercher dans IDCapt. Le mot de passe est saisi uniquement sur la page du serveur, sans être accessible à l’extension. Aucun outil d’analyse ou de publicité n’est utilisé et aucun code distant n’est chargé.

Les jetons OAuth sont conservés dans le stockage local privé de l’extension, jamais transmis au script IDCapt, et effacés à la déconnexion ou lors d’un changement de serveur. La déconnexion locale ne révoque pas les jetons côté serveur ; ils expirent selon les durées AffichApp. Les listes TXT/CSV importées ne sont pas envoyées à AffichApp. Le manifeste déclare les catégories `authenticationInfo` et `personallyIdentifyingInfo`, car l’intégration échange ces données avec le serveur configuré.

## Vérifications et packaging

```powershell
node badges-firefox/test-integration.cjs
./badges-firefox/build.ps1
```

Le test utilise un serveur AffichApp réel isolé dans un dossier temporaire avec des données fictives : OAuth PKCE, retour `state`, lecture des cartes, rapprochement des noms et homonymes, renouvellement concurrent, statuts, présaisie, restrictions des messages, permissions et déconnexion.

Le build valide les sources avec `web-ext lint` puis crée `dist/badges-affichapp-1.2.0.zip`, avec `manifest.json` à la racine. Les fichiers sont directement lisibles, sans minification ni compilation. Le ZIP est à envoyer comme nouvelle version de l’extension existante dans le [Developer Hub Mozilla](https://addons.mozilla.org/developers/), en distribution non listée si vous la distribuez sur votre parc. Mozilla fournit ensuite le XPI signé. Firefox 140 ou ultérieur est requis pour le consentement intégré aux catégories de données.

Voir [les règles de consentement Firefox](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) et [la connexion OAuth des extensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity).

## Notes de version pour Mozilla

Version 1.2.0 : intégration de l’API OAuth AffichApp avec PKCE S256 ; ajout des réglages du serveur et de la connexion ; récupération et filtrage des cartes par statut et type ; sélection des demandes pour alimenter l’analyse IDCapt ; mise à jour manuelle et confirmée des statuts ; ajout de noms à la présaisie ; icônes intégrées de 16 à 128 pixels. Le moteur de rapprochement conserve le traitement des homonymes, la pagination et la vérification des cases cochées. L’extension ne lance ni impression ni encodage.

## Notes pour les réviseurs

Deux services sont nécessaires pour tester le parcours complet : une instance AffichApp avec compte de test (`admin` ou `appel`) et une instance IDCapt accessible sur `/Activation_badge`. Fournir leurs adresses et un compte dédié avec des noms fictifs dans les notes privées de soumission Mozilla ; aucun identifiant n’est embarqué dans le ZIP.

Parcours : enregistrer le serveur AffichApp dans les préférences ; se connecter par OAuth ; ouvrir IDCapt ; récupérer les cartes ; sélectionner une demande fictive ; utiliser ses noms ; analyser et cocher les correspondances ; vérifier le bilan. Essayer ensuite la modification manuelle du statut et l’ajout d’un nom à la présaisie. Le test automatisé ne remplace pas l’essai sur votre version réelle d’IDCapt.

## Enrichissement automatique · version 1.2.1

Dans les réglages, cochez **Ajouter les noms absents lors de l’analyse IDCapt** et enregistrez. Cette option est désactivée par défaut. Chaque analyse terminée des tableaux enrichit alors la présaisie AffichApp avec tous les noms lus dans les pages parcourues (selon les filtres IDCapt), pas seulement les demandes sélectionnées. Décocher et enregistrer désactive les prochains imports automatiques ; les noms déjà ajoutés restent en base.

Classe **prof** → `enseignants` ; **personnel** et **prof_personnel** → `personnels` ; autre nom de classe non vide → `etudiants`. Une classe vide n’est jamais importée. Les lignes sans prénom et les noms présentant des catégories contradictoires sont ignorés. Le réglage de la catégorie mixte permet aussi un autre choix si nécessaire, mais son défaut est bien Personnel.

Seuls les noms absents sont ajoutés ; les noms déjà présents conservent leur type et leur compteur. La recherche tient compte des accents, de la casse, des espaces et des deux ordres nom/prénom. Le bilan indique les ajouts, les noms connus, les lignes ignorées et les erreurs. Une erreur d’enrichissement ne bloque pas la sélection des badges.

**Mettre aussi à jour le serveur AffichApp** avec les changements de cette version (`GET /api/integration/capabilities` et `POST /api/integration/names` avec `onlyIfMissing`). Sans ce support, l’extension bloque l’import automatique avant toute écriture. Une connexion existante disposant du scope `names:write` suffit.

Notes de version 1.2.1 : enrichissement facultatif et automatique des noms lors de l’analyse IDCapt ; catégorisation selon la classe ; `prof_personnel` classé en personnel ; exclusion des classes vides ; conservation des noms déjà connus et prévention des doublons ; bilan de synchronisation et vérification de la compatibilité du serveur avant import.
