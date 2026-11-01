# Spotifood — Analyse & Architecture

> Plateforme SaaS multi-tenant de commande en salle par QR code.
> Ce document est la référence technique du projet. Il est mis à jour à chaque décision structurante.

---

## 1. Analyse du cahier des charges

### 1.1 Cœur du produit

Le produit tient en une boucle :

```
Client : SCAN → MENU → PANIER → COMMANDE → PAIEMENT → SUIVI → FACTURE → AVIS
Resto  : CONFIG → TABLES/QR → MENU → COMMANDES LIVE → SERVICE → VENTES → FEEDBACK
```

Trois concepts structurent tout le reste et doivent être justes dès le départ :

1. **Tenant = Restaurant** (rattaché à une Organization pour le multi-établissement futur).
2. **Session de table** : un « passage » d'un groupe à une table. C'est l'unité qui relie participants, paniers, commandes et paiements.
3. **Participant** (client anonyme) : chaque téléphone qui scanne devient un participant de la session, avec son propre panier, ses commandes et ses paiements → paiement séparé natif.

### 1.2 Indispensable (MVP)

| Domaine     | Fonctionnalités                                                                                                                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client      | Scan QR, session de table, menu (catégories, recherche, photos, prix, ingrédients, allergènes, calories), options/modifiers, panier individuel, notes, commande, paiement (abstraction + espèces/sur place + provider en ligne), suivi temps réel, facture HTML + PDF, envoi email, avis 1–5, plainte + photo, recommander dans la même session         |
| Restaurant  | Login, rôles (Owner/Admin/Staff + permissions), tables CRUD + génération en masse, QR (télécharger/imprimer/régénérer/désactiver), menu (catégories, produits, options, drag & drop, disponibilité), KDS temps réel, vue tables live, dashboard du jour, historique filtrable, avis, plaintes avec statuts, notifications in-app, paramètres restaurant |
| Super Admin | Liste restaurants, création/suspension, utilisateurs, statistiques globales, plans SaaS (données + limites)                                                                                                                                                                                                                                             |

### 1.3 Peut attendre (V2 / V3)

**V2** — Stripe Billing pour l'abonnement SaaS, SMS/push, multi-langue des _contenus_ du menu (traductions produit), promotions/coupons, pourboires, appel serveur, impression cuisine (ESC/POS), export comptable CSV, RLS Postgres activé, analytics avancés (cohortes, heatmaps).
**V3** — Réservation, à emporter, livraison, fidélité/points, CRM, stocks/fournisseurs, intégration POS, WhatsApp, marketplace, franchises, IA d'analyse des ventes.

L'architecture ci-dessous ne ferme aucune de ces portes (voir §9).

### 1.4 Hypothèses prises (à valider)

- **Facturation fiscale** : la « facture » MVP est un justificatif numéroté séquentiellement par restaurant (sans trou), immuable une fois émise. La conformité NF525 / logiciel de caisse certifié (France) **n'est pas couverte** par le MVP — c'est un risque légal identifié (§8).
- **Prix TTC** : les prix saisis sont TTC (usage restauration en France/Europe). La TVA est _extraite_ du TTC par taux. Le mode HT est prévu dans le modèle (`pricesIncludeTax`).
- **Une devise par restaurant.**
- **Paiement en ligne** : le client paie _ses_ commandes. Le paiement « pour quelqu'un d'autre » / partage d'addition arrive en V2 (le modèle le permet : un paiement couvre N commandes).
- **Pas de compte client obligatoire** : identité anonyme par cookie signé, email facultatif.

---

## 2. Stack technique

| Couche     | Choix                                                                                                                   | Pourquoi                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Framework  | **Next.js 16 (App Router) + React 19 + TypeScript strict**                                                              | SSR/RSC pour un menu ultra-rapide, Server Actions, un seul déploiement                                 |
| UI         | **Tailwind CSS 4** + composants maison (Radix-like, accessibles)                                                        | Design system original, pas de dépendance lourde                                                       |
| DB         | **PostgreSQL 16**                                                                                                       | Relationnel, transactions, `LISTEN/NOTIFY`, RLS possible                                               |
| ORM        | **Drizzle ORM** + drizzle-kit                                                                                           | SQL-first, typé, sans moteur binaire (cold-start serverless), migrations SQL versionnées et relisibles |
| Validation | **Zod 4**                                                                                                               | Schémas partagés client/serveur, validation serveur systématique                                       |
| Auth       | **Sessions en base, implémentation interne** (Argon2id, cookie httpOnly, token haché SHA-256)                           | Révocation immédiate, aucun JWT à invalider, contrôle total du multi-tenant                            |
| Realtime   | **Server-Sent Events + Postgres LISTEN/NOTIFY** derrière une interface `RealtimeBus`                                    | Zéro service tiers, fonctionne partout ; remplaçable par Redis/Supabase/Ably sans toucher au métier    |
| Storage    | Interface `StorageDriver` : **local** (dev) / **S3-compatible** (prod : S3, R2, MinIO)                                  | Images compressées par **sharp** (WebP, 3 tailles)                                                     |
| Paiements  | Interface `PaymentProvider` : `cash`, `on_site_terminal`, `pay_later`, `stripe`, `mock_online` (dev, clairement marqué) | Multi-provider, activable par restaurant                                                               |
| Emails     | Interface `EmailProvider` : `console`/`outbox` (dev), SMTP, Resend                                                      | Outbox en base → envoi asynchrone et rejouable                                                         |
| PDF        | **pdfkit**                                                                                                              | Génération serveur fiable, sans navigateur headless                                                    |
| QR         | **qrcode**                                                                                                              | SVG/PNG, niveau de correction élevé (logo possible)                                                    |
| Charts     | **Recharts**                                                                                                            | Composable, SSR-safe                                                                                   |
| i18n       | **next-intl** (fr, en, fa, ar — RTL géré)                                                                               | Messages typés, pas de texte en dur                                                                    |
| Tests      | **Vitest** (unitaires + intégration sur vraie base Postgres) + Playwright (E2E, phase 12)                               |                                                                                                        |
| Qualité    | ESLint, Prettier, TypeScript strict, GitHub Actions CI                                                                  |                                                                                                        |

**Pourquoi pas Supabase ?** Excellent, mais il couple auth + realtime + storage à un fournisseur. Ici chaque brique est derrière une interface ; on peut déployer sur Supabase Postgres sans changer une ligne métier.

---

## 3. Architecture applicative

### 3.1 Vue d'ensemble

```
┌────────────────────────────── Next.js ──────────────────────────────┐
│  app/ (routes)        UI : RSC + Client Components                   │
│   ├─ (public)  landing, login, signup                                │
│   ├─ t/[token] client mobile (menu, panier, suivi, facture, avis)    │
│   ├─ dashboard/[restaurantId]/…   back-office restaurant             │
│   ├─ admin/…                      super admin                        │
│   └─ api/…    REST (v1) + SSE + webhooks paiement                    │
│                         │                                            │
│                         ▼                                            │
│  server/ ── couche métier (aucune dépendance à React)                │
│   ├─ auth/        sessions, hash, guards (requireUser, requirePerm)  │
│   ├─ tenancy/     contexte tenant, isolation                         │
│   ├─ modules/     restaurants, tables, menu, sessions, cart,         │
│   │               orders, payments, invoices, feedback, analytics…   │
│   │               chaque module = schemas (zod) + service + repo     │
│   └─ infra/       db, realtime, storage, email, payments, rate-limit │
│                         │                                            │
└─────────────────────────┼────────────────────────────────────────────┘
                          ▼
         PostgreSQL  ·  S3  ·  Email provider  ·  Payment providers
```

**Règle d'or** : les pages et les route handlers ne contiennent _pas_ de logique métier. Ils parsent l'entrée, appellent un service, rendent le résultat. Les services reçoivent toujours un **contexte** explicite (`ActorContext` : qui, quel restaurant, quelles permissions).

### 3.2 Multi-tenant

- **Modèle** : base partagée, schéma partagé, colonne `restaurant_id` sur toutes les tables tenant. Scalable à des milliers de restaurants sans gestion de N bases.
- **Isolation applicative** : chaque service métier prend `restaurantId` depuis le contexte authentifié (jamais depuis le body). Les requêtes filtrent toujours par `restaurant_id`. Les tests d'intégration vérifient qu'un utilisateur du restaurant A n'atteint aucune ressource de B.
- **Défense en profondeur (V2)** : Row Level Security Postgres avec `SET LOCAL app.restaurant_id` par transaction. Le schéma est déjà compatible (toutes les tables portent `restaurant_id`, y compris les tables enfants « dénormalisées » comme `order_items`).
- **Identifiants** : UUID v7 (triables chronologiquement, non devinables pour les ressources publiques) ; les QR utilisent un **token aléatoire distinct** (128 bits, base62) et régénérable.

### 3.3 Rôles & permissions

```
Plateforme : SUPER_ADMIN (flag sur users)
Restaurant : OWNER > ADMIN > STAFF   (restaurant_members.role)
             + permissions fines (restaurant_members.permissions[])
```

Les rôles définissent un **jeu de permissions par défaut** ; un membre Staff peut recevoir des permissions supplémentaires ou restreintes. Toute vérification se fait sur la **permission** (`orders.update_status`, `menu.manage`…), jamais sur le nom du rôle → ajout de rôles futurs (Manager, Cuisine, Caissier) sans refactor.

### 3.4 Identité client anonyme

1. Scan `https://app/t/{qrToken}` → résolution de la table (cache).
2. Le serveur récupère ou ouvre la `table_session` active de la table.
3. Un cookie signé `sf_guest` (httpOnly, 30 j) identifie l'appareil (`guest_id`).
4. `(table_session, guest_id)` → `session_participants` (créé au premier scan) : « Client 1 », « Client 2 »… (renommable).
5. Panier, commandes et paiements sont liés au participant. Le resto voit l'agrégat par session.

Re-scan, refresh, fermeture d'onglet : on retrouve le même participant. Session clôturée : le scan suivant ouvre une nouvelle session. L'ancienne facture reste consultable via un lien signé.

---

## 4. Schéma de base de données

Source de vérité : `src/server/db/schema/*.ts` (Drizzle) → migrations SQL dans `drizzle/`.
Conventions : `snake_case`, UUID v7, `created_at/updated_at` timestamptz, `deleted_at` (soft delete) sur les entités éditables par les utilisateurs, **montants en centimes `integer`** (bigint pour les agrégats), devise ISO 4217 par restaurant.

### 4.1 Plateforme & identité

| Table                       | Rôle                                     | Points clés                                                                                                   |
| --------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `users`                     | Comptes staff/owner/admin                | email unique (citext-like via index lower), `password_hash` argon2id, `is_super_admin`, `status`, soft delete |
| `auth_sessions`             | Sessions de connexion                    | `token_hash` unique (SHA-256), `expires_at`, `ip`, `user_agent`                                               |
| `organizations`             | Propriétaire juridique / groupe          | prépare multi-établissements & franchises                                                                     |
| `organization_members`      | user ↔ organization                      | rôle org (owner/billing)                                                                                      |
| `plans`                     | Free/Starter/Pro/Enterprise              | `limits` jsonb (max_tables, max_orders_month, features[])                                                     |
| `subscriptions`             | Abonnement d'une organisation            | `status`, `provider`, `current_period_end`                                                                    |
| `platform_settings`         | Clé/valeur globaux                       |                                                                                                               |
| `global_category_templates` | Catégories prédéfinies (Entrées, Pizza…) | clés i18n, icône                                                                                              |

### 4.2 Restaurant (tenant)

| Table                 | Rôle                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `restaurants`         | `organization_id`, `slug` unique, nom, logo, contact, adresse, `currency`, `timezone`, `default_locale`, `status` (active/suspended), soft delete |
| `restaurant_settings` | 1-1 : taxes, `prices_include_tax`, paiements activés, auto-clôture session (minutes), mentions légales, horaires (jsonb), préfixe commandes       |
| `restaurant_members`  | user ↔ restaurant : `role`, `permissions[]`, `status` — UNIQUE(restaurant_id, user_id)                                                            |
| `tax_rates`           | taux TVA nommés (10 %, 20 %) par restaurant                                                                                                       |
| `counters`            | séquences par restaurant (numéros de commande, factures) — incrément atomique `UPDATE … RETURNING`                                                |

### 4.3 Tables & sessions

| Table                  | Rôle                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dining_tables`        | `label` (« 12 », « Terrasse 3 »), `number`, `capacity`, `zone`, `qr_token` unique, `qr_enabled`, `sort_order`, soft delete                                    |
| `table_sessions`       | `table_id`, `status` (open/closed), `opened_at`, `closed_at`, `closed_by`, `last_activity_at` — **index unique partiel : une seule session `open` par table** |
| `guests`               | appareil anonyme (`id` = valeur du cookie), email facultatif, locale                                                                                          |
| `session_participants` | `table_session_id`, `guest_id`, `display_name`, `seq` (Client 1, 2…) — UNIQUE(session, guest)                                                                 |

### 4.4 Menu

| Table                   | Rôle                                                                                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `categories`            | nom, description, icône, `template_key` (si issue d'un modèle global), `sort_order`, `is_active`, soft delete                                                                                                                                       |
| `products`              | `category_id`, nom, description, `price_cents`, `compare_at_price_cents` (promo), `tax_rate_id`, ingrédients, `allergens[]` (14 allergènes UE), `calories_kcal`, `weight_grams`, `is_available`, `is_featured`, `tags[]`, `sort_order`, soft delete |
| `product_images`        | `storage_key`, variantes (`sm/md/lg` WebP), `width/height`, `blurhash`/placeholder, `sort_order`                                                                                                                                                    |
| `option_groups`         | « Cuisson », « Suppléments » : `min_select`, `max_select`, `is_required` — réutilisable entre produits                                                                                                                                              |
| `option_values`         | « Saignant », « Fromage +2 € » : `price_delta_cents`, `is_available`, `is_default`                                                                                                                                                                  |
| `product_option_groups` | N-N produit ↔ groupe, `sort_order`                                                                                                                                                                                                                  |

### 4.5 Panier, commandes, paiements

| Table                 | Rôle                                                                                                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `carts`               | 1 panier actif par participant                                                                                                                                                                                                                |
| `cart_items`          | `product_id`, `quantity`, `note`, `selected_option_value_ids` (jsonb) — **aucun prix stocké côté panier** : recalcul serveur                                                                                                                  |
| `orders`              | `number` (« B-1048 », unique par restaurant), `table_session_id`, `participant_id`, `table_id`, `status`, `subtotal/tax/discount/total_cents`, `currency`, `note`, horodatages de chaque étape (`accepted_at`, `ready_at`…), `payment_status` |
| `order_items`         | **snapshot** : nom produit, prix unitaire, options choisies (nom + delta) et taux de TVA _au moment de la commande_ — l'historique ne change pas si le menu change                                                                            |
| `order_status_events` | journal des transitions (qui, quand, de → vers)                                                                                                                                                                                               |
| `payments`            | `provider`, `provider_ref`, `status` (pending/succeeded/failed/refunded/partially_refunded), `amount_cents`, `idempotency_key` unique, `participant_id`                                                                                       |
| `payment_allocations` | paiement ↔ commandes (un paiement peut couvrir plusieurs commandes → partage d'addition V2)                                                                                                                                                   |
| `refunds`             | remboursements partiels/totaux                                                                                                                                                                                                                |
| `invoices`            | `number` séquentiel par restaurant, snapshot complet (jsonb) restaurant + lignes + taxes, `pdf_storage_key`, `public_token` pour lien de consultation                                                                                         |

### 4.6 Relation client & ops

| Table                   | Rôle                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `reviews`               | note 1–5, commentaire, `order_id?`, `participant_id`, `is_published`                                                                                   |
| `complaints`            | catégorie (plat froid, erreur, service, paiement, autre), sujet, message, note, `order_id?`, `status` (new/in_progress/resolved/closed), `assigned_to` |
| `complaint_attachments` | images validées et ré-encodées                                                                                                                         |
| `notifications`         | in-app : `restaurant_id`, `user_id?` (null = tout le resto), `type`, `payload`, `read_at`                                                              |
| `email_outbox`          | file d'envoi : destinataire, template, payload, `status`, `attempts`                                                                                   |
| `audit_logs`            | `actor_user_id`, `restaurant_id?`, `action`, `entity_type/id`, `metadata`, `ip`                                                                        |

### 4.7 Index & contraintes notables

- Toutes les FK tenant indexées ; index composites `(restaurant_id, created_at)` sur `orders`, `payments`, `reviews`, `complaints` pour les dashboards & historiques.
- `orders (restaurant_id, status)` pour le KDS ; `orders (table_session_id)`.
- Unicité : `(restaurant_id, number)` sur orders/invoices, `qr_token`, `slug`, `lower(email)`.
- Index partiels : `table_sessions (table_id) WHERE status='open'`, `… WHERE deleted_at IS NULL`.
- `CHECK` : montants ≥ 0, `quantity > 0`, `rating BETWEEN 1 AND 5`, `min_select <= max_select`.

---

## 5. Arborescence du projet

```
spotifood/
├─ docs/                     ARCHITECTURE.md, API.md, décisions (ADR)
├─ drizzle/                  migrations SQL générées (versionnées)
├─ messages/                 fr.json, en.json, fa.json, ar.json
├─ public/                   manifest PWA, icônes
├─ scripts/                  seed, maintenance
├─ src/
│  ├─ app/
│  │  ├─ [locale]/…          (si routing par locale — ici locale par cookie)
│  │  ├─ (marketing)/        landing publique (SEO)
│  │  ├─ (auth)/             login, signup
│  │  ├─ t/[token]/          expérience client (noindex)
│  │  ├─ dashboard/[restaurantId]/  back-office
│  │  ├─ admin/              super admin
│  │  └─ api/v1/…            REST, SSE, webhooks
│  ├─ components/
│  │  ├─ ui/                 design system (Button, Input, Card, Dialog…)
│  │  ├─ customer/           composants client mobile
│  │  └─ dashboard/          composants back-office
│  ├─ i18n/                  config next-intl, locales, direction RTL
│  ├─ lib/                   utilitaires purs (money, ids, dates, cn)
│  └─ server/
│     ├─ db/                 client + schema/*
│     ├─ auth/               password, session, guards, permissions
│     ├─ modules/<domaine>/  schemas.ts, service.ts, (queries.ts)
│     ├─ infra/              realtime, storage, email, payments, rate-limit
│     └─ errors.ts, context.ts, env.ts, audit.ts
├─ tests/                    helpers + tests d'intégration
├─ docker-compose.yml        postgres, minio, mailpit
└─ .github/workflows/ci.yml
```

---

## 6. Flux complet Client → Restaurant → Paiement

```
1. SCAN       GET /t/{qrToken}
              → table active & QR actif ? sinon page « QR désactivé »
              → session open de la table (sinon création, transaction + index partiel = pas de doublon)
              → cookie guest → participant (Client N)
2. MENU       RSC : menu mis en cache par restaurant (revalidation sur modification du menu)
3. PANIER     POST cart items {productId, qty, optionValueIds, note}
              → validation serveur : produit dispo, appartient au resto, options valides, min/max respectés
4. COMMANDE   POST /orders {cartId}
              → transaction : recalcul complet des prix depuis la base, snapshot order_items,
                numéro atomique via counters, statut initial selon mode de paiement :
                  - paiement en ligne requis → `pending_payment`
                  - paiement sur place/plus tard → `received`
              → NOTIFY 'restaurant:{id}' → KDS + vue tables + notification in-app
5. PAIEMENT   POST /payments {orderIds, provider}
              → montant recalculé serveur (somme des commandes non payées du participant)
              → provider.createIntent() → redirection / confirmation
              → webhook signé (ou confirmation synchrone pour cash/mock) → `succeeded`
              → commandes `paid` → `received` ; idempotence par idempotency_key + provider_ref
6. CUISINE    KDS : received → accepted → preparing → ready → served (machine d'états stricte)
              → chaque transition NOTIFY → le client voit son suivi en direct (SSE)
7. FACTURE    Générée à la confirmation du paiement (ou à la clôture pour paiement sur place)
              → numéro séquentiel, snapshot immuable, PDF à la demande, envoi email via outbox
8. AVIS       Note + commentaire ; plainte privée + photo → dashboard + notification
9. RECOMMANDE Le participant revient au menu, même session, nouveau panier
10. CLÔTURE   Staff « libérer la table » (refusé si impayés, sauf forçage audité)
              ou auto-clôture après N minutes d'inactivité si tout est payé
```

### Machine d'états commande

```
pending_payment ──paid──▶ received ──▶ accepted ──▶ preparing ──▶ ready ──▶ served
      │                     │            │             │
      └──────── cancelled ◀─┴────────────┴─────────────┘
paid/served ──▶ refunded (total) | partially_refunded
```

(« panier » n'est pas un statut de commande : c'est la table `carts`. « payée » est porté par `payment_status`, orthogonal au statut cuisine — une commande « sur place » peut être servie avant d'être payée.)

---

## 7. API

REST versionnée sous `/api/v1`, JSON, erreurs normalisées `{ error: { code, message, details? } }`.
Le back-office utilise majoritairement des **Server Actions** (même couche service, même validation). Les endpoints REST servent l'app client, les intégrations futures (POS, apps natives) et les webhooks. Documentation : `docs/API.md` (OpenAPI générée à partir des schémas Zod en phase 12).

Principaux endpoints (MVP) : `GET /api/v1/t/{token}` (contexte table) · `GET /api/v1/restaurants/{id}/menu` · `GET|POST|PATCH|DELETE /api/v1/cart/items` · `POST /api/v1/orders` · `GET /api/v1/orders/{id}` · `POST /api/v1/payments` · `POST /api/v1/payments/webhooks/{provider}` · `GET /api/v1/invoices/{id}` (+ `/pdf`, `/email`) · `POST /api/v1/reviews` · `POST /api/v1/complaints` · `GET /api/v1/realtime/restaurant/{id}` (SSE staff) · `GET /api/v1/realtime/session` (SSE client).

---

## 8. Risques techniques identifiés

| Risque                                                                 | Impact                                     | Mitigation                                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Conformité fiscale** (NF525 en France, TicketBAI en Espagne…)        | Légal, bloquant commercialement selon pays | Facture immuable + numérotation sans trou + audit log dès le MVP ; certification = chantier V2 dédié, ou délégation à un POS certifié via intégration |
| **Fuite inter-tenant**                                                 | Critique                                   | Contexte tenant obligatoire dans chaque service, tests d'isolation systématiques, RLS en V2                                                           |
| **Fraude au prix / quantité**                                          | Critique                                   | Aucun prix venant du client ; recalcul en transaction ; snapshot                                                                                      |
| **Double paiement / webhooks rejoués**                                 | Financier                                  | Idempotency keys, contrainte unique `provider_ref`, transitions d'état conditionnelles (`UPDATE … WHERE status = …`)                                  |
| **Course sur numéros de commande / sessions**                          | Données                                    | Compteur atomique, index unique partiel pour session ouverte                                                                                          |
| **QR scanné hors restaurant** (photo partagée)                         | Commandes fantômes                         | Token régénérable, désactivation, auto-clôture, option V2 : paiement préalable obligatoire / validation staff de la 1re commande / géofencing léger   |
| **SSE derrière proxies/serverless**                                    | Temps réel cassé                           | Heartbeat 25 s, reconnexion auto + rattrapage par requête ; bus remplaçable (Redis pub/sub) si multi-instance hors Postgres                           |
| **Postgres LISTEN avec connexion poolée (PgBouncer transaction mode)** | Notifications perdues                      | Connexion dédiée directe pour LISTEN (`DATABASE_URL_DIRECT`)                                                                                          |
| **Uploads malveillants**                                               | Sécurité                                   | Vérif. magic bytes, taille max, ré-encodage sharp (supprime EXIF/payloads), noms aléatoires, bucket sans exécution                                    |
| **Performance menu en 3G/4G**                                          | Conversion                                 | RSC + cache par restaurant, images WebP multi-tailles + lazy, JS client minimal, pas de lib UI lourde                                                 |
| **RTL (persan, arabe)**                                                | UX                                         | `dir` piloté par la locale, utilitaires Tailwind logiques (`ms-`, `me-`, `start-`) dès le départ                                                      |

---

## 9. Évolutivité — portes laissées ouvertes

- **Multi-établissements / franchises** : `organizations` au-dessus de `restaurants` dès maintenant.
- **À emporter / livraison** : `orders.channel` (`dine_in` aujourd'hui) ; `table_session_id` nullable au niveau du modèle métier futur.
- **Fidélité / CRM** : `guests` peut être rattaché à un `customer_account` plus tard ; email déjà capturé.
- **Coupons / promos** : `orders.discount_cents` + table `order_adjustments` ajoutable sans casser les totaux.
- **POS / imprimantes / KDS externes** : événements métier publiés sur le `RealtimeBus` → un worker d'intégration peut s'y abonner.
- **Stocks** : `order_items.product_id` conservé (en plus du snapshot) pour décrémenter un stock.
- **Plans SaaS** : `plans.limits` + service `entitlements.can(restaurant, feature)` appelé aux points de contrôle.

---

## 10. Plan de développement

| Phase  | Contenu                                                                                                                                                                                                             | Livrable vérifiable                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **1**  | Scaffold, conventions, env, schéma DB complet + migrations, auth (inscription restaurant, login, logout, sessions), RBAC, contexte tenant, audit log, i18n, design system de base, shells dashboard/admin, seed, CI | Inscription → dashboard ; tests auth/permissions/isolation verts |
| **2**  | Paramètres restaurant, membres/staff, tables CRUD + génération en masse, QR (SVG/PNG, régénération, désactivation), page d'impression                                                                               | Imprimer 50 QR depuis le dashboard                               |
| **3**  | Catégories (modèles globaux + perso, drag & drop), produits, images (upload + sharp + storage), options/modifiers                                                                                                   | Menu complet éditable                                            |
| **4**  | App client : résolution QR, session de table, participants, menu mobile rapide, fiche produit avec options, PWA                                                                                                     | Scanner un QR → menu                                             |
| **5**  | Panier serveur, création commande (recalcul prix + snapshot), suivi, multi-client                                                                                                                                   | 3 téléphones, 3 paniers, même table                              |
| **6**  | Bus realtime (LISTEN/NOTIFY + SSE), KDS, vue tables live, notifications in-app                                                                                                                                      | Commande visible en < 1 s en cuisine                             |
| **7**  | PaymentProvider (cash, sur place, plus tard, mock en ligne, Stripe), webhooks, idempotence                                                                                                                          | Paiement individuel par participant                              |
| **8**  | Factures (numérotation, snapshot), PDF, email (outbox + provider)                                                                                                                                                   | Facture PDF reçue par email (Mailpit)                            |
| **9**  | Avis, plaintes + photo, gestion des statuts                                                                                                                                                                         | Plainte avec photo traitée dans le dashboard                     |
| **10** | Analytics (périodes, KPIs, graphiques), historiques filtrables                                                                                                                                                      | Dashboard ventes                                                 |
| **11** | Polish UI/UX, dark mode, accessibilité, RTL                                                                                                                                                                         | Audit Lighthouse/axe                                             |
| **12** | E2E Playwright, durcissement sécurité (headers, CSP, rate limit), perf, OpenAPI                                                                                                                                     | CI complète                                                      |
