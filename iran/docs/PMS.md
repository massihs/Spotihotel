# Spotihotel — le PMS hôtelier

Ce document décrit le logiciel de gestion hôtelière (PMS) de l'édition Iran : ce qu'il fait, comment les écrans s'enchaînent, où se trouve le code, comment l'hôtel de démonstration fonctionne et comment le déployer.

- Démarrage local : [`../README.md`](../README.md)
- Architecture générale : [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Exploitation et déploiement : [`OPERATIONS.md`](OPERATIONS.md), [`../DEPLOY.md`](../DEPLOY.md)
- Feuille de route : [`ROADMAP.md`](ROADMAP.md)

---

## 1. En bref

Spotihotel réunit dans un seul logiciel web la réception, les réservations, le planning des chambres, le portail client par QR, les restaurants et cafés de l'hôtel, le spa, la comptabilité en partie double et la console de chaîne. Il est pensé pour les hôtels iraniens :

- calendrier persan (jalali) partout, montants en rial et affichés en toman ;
- fiche de police (Amaken) : code national vérifié par sa clé, nom du père, passeport pour les étrangers, liste des voyageurs exportable ;
- chèques Sayad, TVA, plateformes iraniennes (Snapptrip, Alibaba, Jabama, Eghamat24, Flytoday) avec leurs commissions ;
- interface en persan par défaut, anglais et arabe ; mode jour et mode nuit ;
- fonctionne dans le navigateur, sur l'ordinateur de la réception comme sur téléphone.

| Geste               | Ce qu'il faut                                                              |
| ------------------- | -------------------------------------------------------------------------- |
| Réserver            | un écran : dates, personnes, offre, client (≈ 30 s)                        |
| Check-in            | trois étapes guidées : identité, chambre, acompte (< 1 min)                |
| Déplacer un client  | glisser sa réservation sur une autre chambre du planning                   |
| Réservation directe | la page `/h/<slug>` de l'hôtel, sans commission                            |
| Retrouver un séjour | `Ctrl K` : nom, n° de réservation, n° de chambre, téléphone, code national |

---

## 2. Les écrans et les parcours

### 2.1 Tableau de bord (`/dashboard/<hôtel>`)

La page d'accueil du directeur et de la réception (`src/components/pms/hotel-home.tsx`, données `src/server/modules/pms/home.ts`) :

- occupation de la nuit, prix moyen (ADR), RevPAR, clients présents, les 14 prochaines nuits ;
- alertes : clôture de journée en retard, demandes des chambres, arrivées, départs, chambres à nettoyer, réservations de la semaine sans chambre ;
- arrivées du jour avec un bouton **Check-in** sur chaque client (ouvre le check-in guidé sans quitter la page) ; départs avec le solde à régler ;
- réservations prises aujourd'hui, par canal (le site de l'hôtel en vert), et lien vers la page de réservation en ligne ;
- chiffre d'affaires du jour par service, dernier jour clôturé, raccourcis, étapes de configuration restantes.

### 2.2 Réservation express (`/stays/new`)

`src/components/pms/booking-desk.tsx`, service `bookingOptions` dans `src/server/modules/pms/booking.ts`.

1. Dates (raccourcis « ce soir », « demain », « week-end », « une semaine »), nuits, adultes, enfants.
2. Tous les types de chambre s'affichent avec les chambres libres sur tout le séjour et le prix de chaque plan tarifaire : tarification dynamique, séjour minimum et jours fermés compris (`quoteStay`).
3. Un clic choisit l'offre ; le client est retrouvé par nom (dans les deux ordres), téléphone ou code national, chiffres persans acceptés, ou créé (iranien : code national vérifié ; étranger : passeport).
4. Options repliées : source, référence de plateforme, société, garantie, heure d'arrivée, notes, chambre précise.
5. **Réserver**, ou **Réserver et faire le check-in** pour un client au comptoir.

Le planning peut pré-remplir cet écran : `?type=&room=&arrival=&departure=&source=`.

### 2.3 Check-in guidé

`src/components/pms/check-in-wizard.tsx` (monté une fois par page dans le layout du tableau de bord), services `checkInContext` et `updateGuestIdentity`.

1. **Identité** pour la police : champs Amaken, code national contrôlé, bascule iranien / étranger.
2. **Chambre** : tuiles propres / à nettoyer / encore occupées, suggestion automatique, surclassement possible.
3. **Acompte** : rien, première nuit ou séjour complet ; carte, espèces, virement, en ligne.

Puis une carte de bienvenue : numéro de chambre, dates, Wi-Fi, lien vers la **fiche de police imprimable** (`/stays/<id>/registration`). Une arrivée « pré-enregistrée » a déjà rempli sa fiche en ligne.

Règle importante : une chambre dont le client n'est pas encore parti n'est jamais attribuée automatiquement (`suggestRoom`).

### 2.4 Planning des chambres (`/planning`)

`src/components/pms/planning-grid.tsx`.

- Chambres libres par type et par nuit, barres de réservation (option, confirmée, client présent).
- **Cliquer ou glisser** sur des nuits libres d'une chambre ouvre la réservation express pré-remplie.
- **Glisser une réservation** sur une autre chambre la déplace (client présent compris) ; vers un autre type, c'est un surclassement au même prix (`assignRoom`). Ligne verte (libre), orange (surclassement), rouge (prise).
- Les réservations sans chambre se glissent aussi sur la grille.
- **Attribution automatique** (`autoAssignRooms`) : chaque réservation de la période reçoit une chambre de son type, au plus serré (la chambre libérée le plus près de l'arrivée), jamais une chambre encore occupée pour une arrivée du jour ; les types sont verrouillés pendant l'opération.
- Filtres par type, recherche par numéro, bouton « Aujourd'hui ».

### 2.5 Réception, séjours et facturation

- Réception (`/frontdesk`) : arrivées, départs, clients présents, chiffres du jour, liste des voyageurs Amaken, lien vers la page de réservation en ligne.
- Fiche de séjour (`/stays/<id>`) : modification des dates et du type, notes de facturation (folios), charges, paiements (carte, espèces, virement, en ligne, chèque Sayad), report sur le compte d'une société, annulation avec frais, départ.
- Groupes et allotements (`blocks.ts`), comptes société (city ledger, `guests.ts`), clients et historique.
- Audit de nuit (`night-audit.ts`) : nuits facturées, non-présentés, rapport, passage au jour suivant.

### 2.6 Recherche partout (`Ctrl K`)

La palette de commande (`src/components/dashboard/command-palette.tsx`) trouve les pages et, dans un hôtel, les séjours pendant la frappe (`searchStays`) : clients présents d'abord, puis arrivées à venir ; un numéro tapé exactement passe avant les téléphones qui le contiennent. Entrée ouvre la fiche.

### 2.7 Réservation en ligne par le client (`/h/<slug>`)

Page publique (`src/app/[locale]/h/[slug]/page.tsx`, composant `online-booking.tsx`, service `src/server/modules/pms/online.ts`) :

- dates et personnes, chambres libres et prix des plans **vendus en ligne** (case `bookableOnline` sur chaque plan ; les tarifs société n'y apparaissent jamais) ;
- coordonnées (code national facultatif mais vérifié), heure d'arrivée, demande particulière, champ anti-robot ;
- réservation confirmée aussitôt (source « site web »), visible en direct à la réception ;
- SMS avec le numéro et le lien de **pré-enregistrement** (`/precheckin/<code>`) : fiche de police et signature avant l'arrivée ;
- sélecteur de langue ; limites de fréquence par adresse IP.

### 2.8 Le client dans sa chambre (QR)

Chaque chambre a son QR (`/dashboard/<hôtel>/…` « QR des chambres »). Le scan ouvre `/t/<jeton>` puis `/table` :

- accueil **« Votre chambre »** (`src/components/guest/room-concierge.tsx`) : jour et heure de départ, raccourcis room service, minibar, spa et piscine, ménage et demandes, ma note, Wi-Fi à copier ;
- carte du room service, commandes portées sur la note de la chambre ;
- bouton **Réception** pour les demandes (serviettes, ménage, réveil, taxi…), reçues en direct par l'équipe ;
- « Mon séjour » (`/table/stay`) : après vérification du nom de famille, réservation spa, déclaration du minibar, note détaillée.

### 2.9 Restaurants et cafés de l'hôtel

Points de vente (`src/server/modules/outlets`) : chaque restaurant, café ou bar a ses tables, sa carte, sa caisse et ses ventes ; création rapide depuis le tableau de bord ; un repas peut être porté sur une chambre. La comptabilité montre les ventes par point de vente.

### 2.10 Comptabilité et chaîne

- Partie double alimentée automatiquement (`src/server/modules/ledger`) : journal, grand livre, balance, états financiers, TVA, chèques, clients et fournisseurs, trésorerie, clôture.
- Console de groupe (`chain.ts`) : réservations centrales et chiffres consolidés de plusieurs hôtels.

---

## 3. Où est le code

```
iran/
├─ src/app/[locale]/
│  ├─ page.tsx                       page d'accueil publique
│  ├─ dashboard/[restaurantId]/      écrans de l'hôtel (frontdesk, planning, stays, ledger…)
│  │  └─ hotel-actions.ts            actions serveur du PMS
│  ├─ h/[slug]/ · h/actions.ts       réservation en ligne
│  ├─ precheckin/[code]/             pré-enregistrement
│  ├─ t/[token]/ · table/            portail client par QR
├─ src/components/pms/               écrans du PMS
├─ src/components/guest/             portail client
├─ src/server/modules/pms/           logique métier (voir ci-dessous)
├─ drizzle/                          migrations SQL
├─ scripts/seed-parsian.ts           hôtel de démonstration
└─ tests/integration/pms*.test.ts    tests sur une vraie base Postgres
```

| Module `pms/`    | Rôle                                                                              |
| ---------------- | --------------------------------------------------------------------------------- |
| `setup.ts`       | types de chambre, plans tarifaires, calendrier des prix, réglages PMS             |
| `stays.ts`       | devis, disponibilités, création, check-in/out, attribution, planning, réception   |
| `booking.ts`     | réservation express, chambres libres, check-in guidé, attribution auto, recherche |
| `online.ts`      | page de réservation publique                                                      |
| `folios.ts`      | notes, charges, paiements                                                         |
| `guests.ts`      | fiches clients, comptes société, contrôle du code national                        |
| `revenue.ts`     | règles de prix dynamiques, frais d'annulation, prévisions                         |
| `night-audit.ts` | clôture de journée                                                                |
| `home.ts`        | données du tableau de bord                                                        |
| `blocks.ts`      | groupes et allotements                                                            |
| `wellness.ts`    | spa, piscine, massages                                                            |
| `minibar.ts`     | minibar                                                                           |
| `precheckin.ts`  | pré-enregistrement en ligne                                                       |
| `portal*.ts`     | portail client                                                                    |
| `travellers.ts`  | liste des voyageurs (Amaken)                                                      |
| `chain.ts`       | console de chaîne                                                                 |

Conventions : chaque service reçoit un `RestaurantContext` et vérifie la permission (`assertCan`) ; l'identifiant de l'hôtel vient toujours du contexte, jamais de l'entrée. Les actions serveur passent par `runAction` et rafraîchissent la page (`done()`). Les montants sont des entiers en « cents » de rial ; les dates de séjour sont des chaînes `YYYY-MM-DD` du jour d'exploitation (`businessDate`).

---

## 4. L'hôtel de démonstration « Parsian »

`scripts/seed-parsian.ts` construit **هتل پارسیان (آزمایشی)** (slug `parsian-test`) : 300 chambres sur 15 étages, 5 types, 5 plans tarifaires, un mois d'activité joué jour par jour à travers les vrais services (réservations, plateformes, annulations, arrivées, minibar, spa, room service, 4 restaurants et cafés, dépenses, sociétés, chèques, audits de nuit).

- **Toujours à jour** : le conteneur lance le script au démarrage puis toutes les heures. Un hôtel existant rejoue les jours manquants (la journée laissée en cours est terminée, aujourd'hui s'arrête en milieu d'après-midi avec des arrivées et départs à faire), attribue les chambres des 10 prochains jours et crée de nouvelles réservations sur deux semaines. Sur un site sans hôtel de test, le script ne fait rien.
- **Construction** : seulement avec `SEED_PARSIAN=true` (ou si l'hôtel a plus de 30 jours de retard). `PARSIAN_DAYS` fixe la durée (30 par défaut).
- Tourne en arrière-plan, en basse priorité, sur trois connexions, un seul à la fois (verrou Postgres).

En local : `npm run db:seed-parsian`.

---

## 5. Déploiement (Liara)

Workflow manuel `.github/workflows/deploy-iran.yml` :

1. construction Next.js et des scripts sur GitHub Actions ;
2. envoi du build à Liara (`Dockerfile.prebuilt`, liste d'exclusion `deploy/prebuilt.ignore` : sans sources, sans source maps) ;
3. au démarrage du conteneur : migrations → données de plateforme → boucle de l'hôtel de démo → `next start` ;
4. capture des journaux de l'application après 4 minutes.

Variables principales : `DATABASE_URL`, `DATABASE_URL_DIRECT`, `APP_SECRET`, `APP_URL`, `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`, `SMS_PROVIDER=kavenegar` + `KAVENEGAR_API_KEY` pour de vrais SMS, `SEED_PARSIAN` (construction de l'hôtel de démo).

Les migrations s'appliquent seules ; la dernière liée au PMS est `0050_online_booking.sql` (case « vendu en ligne » des plans).

---

## 6. Tests et qualité

```bash
cd iran
npm run typecheck && npm run lint && npm run format:check
npm test                      # unitaires + intégration sur Postgres
```

Tests du PMS : `tests/integration/pms.test.ts`, `pms-home.test.ts`, `pms-chain.test.ts`, `pms-booking.test.ts` (offres, chambres libres, règles d'identité, suggestion de chambre, attribution automatique, recherche, réservation en ligne).

---

## 7. Ce qui reste à faire

| Sujet                          | État                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Channel manager bidirectionnel | à venir ; aujourd'hui la plateforme et sa référence sont saisies, commissions comptées |
| Acompte payé en ligne          | à venir sur la page de réservation (Zarinpal déjà utilisé côté restaurant)             |
| Envoi au سامانه مودیان         | à venir ; les données nécessaires sont enregistrées                                    |
| Transmission directe Amaken    | pas d'API publique ; liste des voyageurs exportable                                    |
| Serrures et standard           | selon le matériel de l'hôtel                                                           |
| SMS réels                      | prêt : renseigner la clé Kavenegar                                                     |
