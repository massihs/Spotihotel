# Roadmap & avancement

Légende : ✅ fait · 🚧 en cours · ⏳ à venir

| Phase | Contenu                                                                                                                                                                                                                                                                       | État |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1     | Architecture, schéma DB complet + migration, auth (sessions DB, Argon2id), RBAC par permissions, isolation tenant, audit log, rate limit, i18n fr/en/fa/ar (RTL), design system, dashboard & super admin (restaurants, utilisateurs, stats, suspension), seed démo, tests, CI | ✅   |
| 2     | Paramètres restaurant, équipe & permissions, tables (CRUD, génération en masse), QR (SVG/PNG, régénération, désactivation, impression)                                                                                                                                        | ✅   |
| 3     | Catégories (modèles globaux + perso, drag & drop), produits, images (sharp + storage), options/modifiers                                                                                                                                                                      | ✅   |
| 4     | App client mobile : scan QR, session de table, participants, menu rapide, fiche produit, PWA                                                                                                                                                                                  | ✅   |
| 5     | Panier serveur, commandes (recalcul prix, snapshot), suivi, multi-client                                                                                                                                                                                                      | ✅   |
| 6     | Temps réel (Postgres LISTEN/NOTIFY + SSE, repli automatique), écran Cuisine (KDS), Salle live, notifications, clôture de table, suivi client instantané                                                                                                                       | ✅   |
| 7     | Paiements : abstraction `PaymentProvider`, espèces/terminal/plus tard, mock en ligne, Stripe, webhooks, idempotence                                                                                                                                                           | ✅   |
| 8     | Factures (numérotation, snapshot), PDF, email (outbox)                                                                                                                                                                                                                        | ⏳   |
| 9     | Avis, plaintes + photo                                                                                                                                                                                                                                                        | ⏳   |
| 10    | Analytics & historiques                                                                                                                                                                                                                                                       | ⏳   |
| 11    | Polish UX/UI, dark mode, accessibilité                                                                                                                                                                                                                                        | ⏳   |
| 12    | E2E Playwright, sécurité (CSP…), performance, OpenAPI                                                                                                                                                                                                                         | ⏳   |

## Notes Phase 1

- **Next.js 16 + Cache Components** : toute lecture de session est derrière `<Suspense>` et `connection()` ; les pages publiques (landing, login, signup) sont prérendues statiquement.
- Le proxy (`src/proxy.ts`) ne fait **aucune** autorisation : il négocie la locale et prolonge le cookie de session. L'autorisation est refaite côté serveur à chaque page/action (`requireRestaurant`, `requireSuperAdmin`).
- Un restaurant étranger ou inexistant renvoie **404** (jamais 403) pour ne pas révéler l'existence d'un autre tenant.
- Les produits de démo n'ont pas encore d'images : le pipeline d'upload (sharp + storage) arrive en Phase 3, avec des visuels placeholder.
- Les commandes de démo (multi-clients à une même table) seront ajoutées au seed en Phase 5, quand le service de commande existera — pour qu'elles passent par la même logique de calcul que la production.

## Notes Phase 2

- **Formulaires** : React 19 réinitialise un `<form action>` après chaque soumission, même en erreur. Les formulaires du dashboard passent par `useActionForm` / `<ActionForm>` (`src/components/ui/form.tsx`) qui conserve la saisie et ne réinitialise qu'en cas de succès si demandé.
- **Erreurs** : les actions renvoient des _codes_ (`label_taken`, `plan_limit_tables`…) traduits côté client (`errorCodes.*`), jamais des messages serveur bruts.
- **Quotas de plan** (`src/server/entitlements.ts`) : vérifiés dans la transaction, après un `SELECT … FOR UPDATE` sur le restaurant — deux créations concurrentes ne peuvent pas dépasser la limite (testé).
- **QR** : régénérer change le jeton → toutes les copies imprimées de l'ancien QR cessent de fonctionner immédiatement. Supprimer une table = soft delete + QR désactivé (l'historique des commandes reste intact). Suppression refusée si une session est ouverte.
- **Équipe** : un compte existant est simplement rattaché (son mot de passe n'est jamais touché) ; un nouveau compte reçoit un mot de passe initial choisi par le gérant (en attendant les invitations par email, Phase 8). Seuls les écarts aux permissions du rôle sont stockés, et personne ne peut accorder une permission qu'il n'a pas. Retirer un membre coupe ses sessions s'il n'a plus aucun restaurant.
- **Images** : format détecté sur les octets (jamais l'extension), SVG/GIF refusés, 8 Mo et ~40 Mpx max, orientation EXIF appliquée puis toutes les métadonnées supprimées (GPS…), ré-encodage WebP/PNG. Le même pipeline servira aux photos produits (Phase 3).
- **`/t/{token}`** : valide le QR et affiche restaurant + table. Il devient le menu client complet en Phase 4.
- La démo est sur l'offre **Professional** (le Free plafonne à 5 tables et 2 membres).

## Notes Phase 3

- **Réorganisation** : drag & drop via dnd-kit (souris, tactile avec appui long, clavier : Espace puis flèches). Mise à jour optimiste, annulée si le serveur refuse. Le serveur exige la liste _complète_ : si un autre gérant a modifié le menu entre-temps, il répond `reorder_mismatch` et la page se recharge, au lieu d'appliquer un ordre partiel.
- **Catégories prédéfinies** : 24 modèles (`templateKey`) nommés dans la _langue par défaut du restaurant_, pas dans celle du gérant. Un modèle déjà utilisé ne peut pas être ajouté deux fois ; les catégories personnalisées (« Spécialités iraniennes ») coexistent.
- **Suppression** : une catégorie qui contient des produits ne peut pas être supprimée. Un produit supprimé est masqué (soft delete), son historique de commandes est conservé.
- **Épuisé vs masqué** : le staff peut marquer un plat « épuisé » pendant le service ; seul un gestionnaire du menu peut le masquer ou le modifier.
- **Options** : les choix gardent leur identifiant quand on les modifie (les paniers en cours restent valides) ; un choix retiré est soft-deleted. Règles validées : min ≤ max, assez de choix disponibles pour le minimum, pas plus de choix par défaut que le maximum.
- **Isolation** : un produit ne peut référencer que la catégorie, le taux de TVA et les groupes d'options de _son_ restaurant (testé).
- **Cache** : chaque modification du menu appelle `updateTag(menu:{restaurantId})`. Le menu client (Phase 4) sera mis en cache sous ce tag et toujours à jour.
- **Bug corrigé** (phases 1 à 3) : dans un `select` mono-table, Drizzle n'écrit pas le nom de table des colonnes, donc une sous-requête corrélée `… where x = ${table.id}` comparait la mauvaise colonne. Les compteurs « commandes par restaurant » et « restaurants par utilisateur » du Super Admin étaient faux. Toutes les sous-requêtes sont maintenant qualifiées explicitement, avec des tests de régression (voir `src/server/db/README.md`).
- **Mobile** : tous les écrans du dashboard sont vérifiés sans défilement horizontal à 390 px.

## Notes Phase 4

- **Entrée QR** (`GET /t/{jeton}`, route handler) : résout la table, identifie l'appareil (`sf_guest`, signé HMAC, 1 an), ouvre ou rejoint la session de table, attribue un siège (`sf_seat`, signé, 12 h) puis redirige vers `/table`. Le jeton du QR ne reste jamais dans l'URL de l'app.
- **Participants** : un appareil = un participant par session (« Client N », prénom facultatif). Rescanner redonne le même siège. Un cookie de siège copié sur un autre appareil, ou modifié, est refusé (testé en navigateur).
- **Concurrence** : premier scan simultané de 8 téléphones → une seule session (index unique partiel + retry) et des numéros de siège uniques (testé).
- **Clôture automatique** : appliquée paresseusement au scan suivant si la session est inactive depuis plus que le délai configuré **et** qu'il ne reste rien à payer. La clôture manuelle par le staff arrive avec la vue tables live (Phase 6).
- **Menu public** : `use cache` + `cacheTag(menu:{id})` + `cacheLife('hours')`. Chaque modification du dashboard appelle `updateTag` : un plat marqué épuisé apparaît immédiatement côté client (testé). Mesuré en local : TTFB ≈ 35–240 ms, ≈ 170 Ko de JS, scan → menu affiché < 1 s.
- **Prix** : moteur pur (`src/server/modules/pricing`) partagé client/serveur. Le client l'utilise pour l'affichage, le serveur recalcule **toujours** depuis la base (prix, options, min/max, disponibilité). Le panier est re-pricé à chaque lecture : une hausse de prix ou un plat épuisé est signalé dans le panier au lieu d'être commandé à l'ancien prix.
- **TVA** : calculée par taux sur les montants cumulés (un arrondi par taux), comme sur une facture.
- **PWA** : manifest + icônes (dont maskable) — « Ajouter à l'écran d'accueil » sur iOS et Android. Pas de service worker hors-ligne : une commande nécessite de toute façon le réseau.
- Le bouton « Commander » arrive en Phase 5 (création de commande, envoi en cuisine).

## Notes Phase 5

- **Création de commande** (`placeOrder`) en une transaction : verrou sur le panier (un double appui ou deux onglets = une seule commande, testé en navigateur), session revérifiée, **tous les prix recalculés depuis la base**, copie figée des lignes (nom, prix unitaire, options, taux et montant de TVA, note), numéro atomique par restaurant (`D-1001`…), panier vidé, notification `order.created`, audit.
- **Statut initial** : `received`, ou `pending_payment` si le restaurant exige le paiement avant envoi en cuisine (réglage existant, utilisé en Phase 7).
- **Workflow** : reçue → acceptée → en préparation → prête → servie, uniquement vers l'avant (des étapes peuvent être sautées : une boisson passe directement à « servie »), annulation possible avant service avec motif (permission `orders.cancel`, auditée). Mises à jour conditionnelles : si deux équipiers tapent en même temps, un seul changement s'applique (testé). Les étapes sautées reçoivent un horodatage, pour que les durées restent cohérentes (analytics Phase 10).
- **Paiement** : suivi séparément (`payment_status`), car une commande payée sur place peut être servie avant d'être réglée. Toutes les commandes sont « Non payée » jusqu'à la Phase 7.
- **Vue Table** : total de la table, reste à encaisser et détail par client. Les commandes annulées ne comptent pas.
- **Confidentialité** : un client ne voit que ses propres commandes, pas celles des autres personnes de la table.
- **Fuseaux horaires** : toutes les heures sont formatées dans le fuseau du restaurant (jamais celui du serveur, UTC en production). Le « il y a 3 min » s'affiche sans écart d'hydratation (heure absolue au rendu serveur, relative après hydratation).
- **Rafraîchissement** : suivi client (8 s) et pages staff (10 s) se rafraîchissent automatiquement, uniquement quand l'onglet est visible. Remplacé par du temps réel (SSE) en Phase 6.
- **Seed** : 6 commandes de démo (table 8 avec 3 clients, tables 4 et 12) créées via le vrai parcours.

## Notes Phase 6

- **Bus** (`src/server/infra/realtime`) : interface `RealtimeBus`, implémentée avec Postgres `LISTEN/NOTIFY`. Les événements sont émis **dans la transaction métier** (`emit(tx, …)`) : Postgres ne les délivre qu'au commit, donc jamais d'événement pour une écriture annulée (testé). Une seule connexion `LISTEN` par instance, sur `DATABASE_URL_DIRECT` (un pooler en mode transaction ne supporte pas `LISTEN`), reconnexion avec backoff. Plusieurs instances : chacune écoute, aucun changement nécessaire. Redis pub/sub reste possible derrière la même interface.
- **Contenu des événements** : uniquement des identifiants et quelques faits (numéro, statut). Les écrans relisent ensuite les données via le chemin serveur habituel, donc avec les permissions. Aucune donnée sensible ne circule dans le flux.
- **SSE** : `GET /api/v1/realtime/restaurant/{id}` (staff, permission `restaurant.view`) et `GET /api/v1/realtime/guest` (cookies invité : ses propres commandes et la fermeture de sa table). Heartbeat toutes les 25 s, `retry: 3000`, nettoyage à la déconnexion, `X-Accel-Buffering: no` pour nginx.
- **Client** : une seule connexion par page (`LiveProvider`). Chaque écran choisit les événements qui le rafraîchissent (`LiveRefresh`, rafraîchissements regroupés), avec rattrapage à la reconnexion. Si le flux est bloqué, l'indicateur passe à « Reconnexion… » et l'écran se rafraîchit toutes les 15 s (testé avec SSE bloqué).
- **Latences mesurées en local** : commande client → écran Cuisine ≈ 0,3–0,5 s ; changement en cuisine → téléphone du client ≈ 0,8–1,2 s.
- **Écran Cuisine** : 5 colonnes (Nouvelles → Acceptées → En préparation → Prêtes → Servies 30 min), action en un tap, toast et son à chaque nouvelle commande (le son s'active d'un tap, car les navigateurs bloquent l'audio sans interaction), plein écran pour une tablette murale.
- **Salle** : 🟢 libre · 🟡 commande en cours en cuisine · 🔴 occupée (installés, rien en cuisine), avec personnes, durée depuis l'arrivée, consommé, reste à encaisser, commandes prêtes à servir et heure de la dernière commande.
- **Clôture de table** : refusée tant qu'une commande est en cours ou qu'il reste à encaisser. Un gérant (`restaurant.manage`) peut forcer après double confirmation, et c'est audité avec le montant. Les clients de la table voient « Session terminée » en direct ; les paniers restants sont supprimés.
- **Notifications** : cloche avec compteur en direct (nouvelle commande, commande prête). Les types plainte, paiement et erreur s'ajouteront avec leurs phases.
- **Bug corrigé** : l'événement de notification n'était pas émis à la création de commande (un remplacement scripté était resté sans effet). La cloche ne se mettait donc pas à jour. Couvert par un test. Les remplacements scriptés vérifient désormais leur cible avant d'écrire.

## Notes Phase 7

- **Abstraction** (`src/server/infra/payments`) : interface `PaymentProvider` (`createPayment`, `parseWebhook`, `refund`) et registre. Le code métier ne parle jamais directement à un prestataire. Fournisseurs : `cash` et `on_site_terminal` (enregistrés par l'équipe), `mock_online` (**simulé, développement uniquement**, refusé si `NODE_ENV=production`), `stripe` (Checkout via l'API REST, sans SDK). « Payer à table » (`pay_later`) prévient l'équipe.
- **Stripe — à valider avec vos clés** : le format des requêtes suit la documentation Stripe et la vérification de signature des webhooks est testée, mais l'appel réel à l'API Stripe n'a pas pu être exécuté ici (pas de clés). Activer : `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, webhook `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_failed` vers `/api/v1/payments/webhooks/stripe`.
- **⚠️ Décision à prendre — Stripe Connect** : aujourd'hui l'argent arriverait sur le compte Stripe de la plateforme. En SaaS multi-restaurants, chaque restaurant doit encaisser sur son propre compte (Stripe Connect), avec éventuellement une commission plateforme. L'abstraction transporte déjà `merchantAccount` (en-tête `Stripe-Account`) ; il reste l'onboarding Connect, à faire quand le compte Stripe et le modèle de commission seront choisis.
- **Montant toujours calculé par le serveur** : somme des commandes non payées du client (ou de la table), lues et **verrouillées** (`FOR UPDATE`) dans la transaction. Deux encaissements simultanés (client en ligne + serveur en espèces) ne peuvent pas couvrir la même commande (testé avec 3 encaissements concurrents → 1 seul). Le montant capturé annoncé par Stripe est comparé au nôtre ; en cas d'écart, rien n'est validé et l'équipe est alertée.
- **Idempotence** : clé unique par restaurant (double appui → même paiement / même checkout), clé transmise au prestataire, et validation par `UPDATE` conditionnel : un webhook reçu deux fois ne s'applique qu'une fois (testé).
- **Paiement en ligne** : les commandes passent « paiement en cours » pendant le checkout ; un checkout abandonné expire après 35 min (Stripe : 31 min) ou peut être annulé par le client ou l'équipe. Un succès tardif sur un checkout expiré est quand même pris en compte (l'argent a été pris) ; si une commande avait été réglée entre-temps, l'équipe est alertée pour rembourser.
- **Paiement avant cuisine** : avec ce réglage, la commande part en cuisine automatiquement dès qu'elle est payée (en ligne ou encaissée par l'équipe).
- **Encaissement par l'équipe** : sur la vue Table, par client ou pour toute la table, espèces (avec calcul de la monnaie) ou terminal CB. Le client voit son statut passer à « réglé » en direct.
- **Remboursements** partiels ou totaux (permission `payments.refund`, auditée) : le montant est réservé dans la transaction avant d'appeler le prestataire, donc deux remboursements simultanés ne peuvent pas dépasser le payé ; si le prestataire échoue, la réservation est annulée (testé).
- **Page de retour sécurisée** : le simulateur exige un lien signé (HMAC) et ne redirige que vers l'origine de l'application (pas de redirection ouverte).
- **Plans** : le paiement en ligne nécessite la fonctionnalité `online_payments` (Starter et plus).
- **Bugs corrigés** (Phase 6 et Phase 2) : next-intl interprète les points comme des niveaux d'imbrication, donc les libellés `order.created` de la cloche et ceux des permissions (`tables.view`…) s'affichaient en code brut. Les messages sont maintenant imbriqués. Les pages client avaient aussi un avertissement « navigation non instantanée » (cookie lu hors Suspense) : chaque page a maintenant sa propre frontière Suspense.
- **Correction** : une commande « remboursée en partie » était comptée comme restant à payer (clôture de table, salle, sessions). Seules les commandes « non payée » et « paiement en cours » comptent désormais.
