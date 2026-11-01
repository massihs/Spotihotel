# Spotifood Iran — déploiement sur Liara

Édition `iran` : persan par défaut, rial, Zarinpal, serveurs en Iran. Voir aussi [README.md](./README.md).

## 1. Créer les ressources dans le panel Liara

1. **Application** : plateforme **Docker**, nom `spotifood` (sinon modifiez `"app"` dans `iran/liara.json`), au moins 1 Go de RAM.
2. **Base de données PostgreSQL** (version 16 ou plus).
3. **Disque** nommé exactement `uploads` (1 Go suffit pour commencer), pour les photos : il est monté sur `/app/.storage` par `liara.json`. **Sans ce disque, le déploiement échoue.** Plus tard, vous pourrez passer au stockage objet de Liara (compatible S3) : voir `deploy/.env.production.example`.
4. **Domaine** : rattachez votre domaine `.ir` à l'application et activez le SSL.
5. _(Facultatif)_ **Serveur mail** pour les emails (factures, invitations).

## 2. Variables d'environnement

Dans l'application → Paramètres → Variables d'environnement, renseignez celles de [`deploy/.env.production.example`](./deploy/.env.production.example). Les variables indispensables :

- `APP_URL` : l'adresse publique exacte (`https://votre-domaine.ir`). Les QR codes et les retours de paiement l'utilisent.
- `APP_SECRET` : `openssl rand -base64 48`. **Ne jamais la changer ensuite** : elle signe les sessions et les cookies des clients.
- `DATABASE_URL` et `DATABASE_URL_DIRECT` : l'adresse de la base Liara.
- `ZARINPAL_MERCHANT_ID` : le code marchand de votre panel Zarinpal.
- `SEED_SUPERADMIN_EMAIL` et `SEED_SUPERADMIN_PASSWORD` : le compte super admin, créé au premier démarrage.

## 3. Déployer

### Option A — depuis GitHub (recommandé)

Le dépôt contient un `liara.json` **à la racine**, prévu pour ce cas : Liara construit l'image Iran à partir du dossier `iran/` (`iran/Dockerfile`, argument `APP_DIR=iran`). Le dossier `global/` n'est jamais envoyé (voir `.dockerignore` à la racine).

1. Dans Liara : votre application → **استقرار جدید / New deployment** → onglet **GitHub**.
2. Dépôt `Spotifood`, branche **`main`**.
3. Mode : « استقرار خودکار » (à chaque push) ou « استقرار در صورت CI موفق » (seulement si les tests GitHub passent ; **recommandé**).
4. Cliquez sur « اتصال به برنامه », puis une première fois sur « استقرار دستی ».

> Chaque push sur `main` redéploie l'Iran, y compris quand seul `global/` a changé. C'est sans risque : l'image ne contient que `iran/`.

### Option B — en ligne de commande, depuis le dossier `iran/` (il contient son propre `liara.json`) :

```bash
npm i -g @liara/cli
liara login
liara deploy
```

Ou depuis GitHub Actions : onglet **Actions → « Deploy — Iran (Liara) » → Run workflow**. Ajoutez d'abord le secret `LIARA_API_TOKEN` (panel Liara → API) dans les réglages du dépôt.

### Au démarrage

À chaque démarrage, le conteneur :

1. applique les migrations de la base ;
2. crée ou met à jour les données de la plateforme (offres, modèles de catégories, super admin s'il n'existe pas) ;
3. démarre le serveur sur le port 3000.

`liara.json` construit l'image dans le datacenter **Allemagne** de Liara (`"build": {"location": "germany"}`) : Docker Hub et une partie du registre npm sont souvent inaccessibles depuis l'Iran. L'application, elle, **tourne en Iran**.

## 4. Zarinpal

- Dans le panel Zarinpal, l'adresse du site doit correspondre au domaine de `APP_URL`.
- Adresse de retour utilisée automatiquement : `https://votre-domaine.ir/api/v1/payments/return/zarinpal`. Rien à configurer côté Zarinpal.
- Tests : `ZARINPAL_SANDBOX=true` utilise `sandbox.zarinpal.com`. Le bac à sable de Zarinpal est parfois indisponible : faites un premier vrai paiement de petit montant pour valider.
- Pour chaque restaurant : **Paramètres → Paiements → Paiement en ligne → Zarinpal**.
- Si la vérification échoue (réseau coupé au retour du client), le paiement reste « en cours » puis expire, et les commandes redeviennent à payer. Selon Zarinpal, une transaction jamais vérifiée est restituée automatiquement au client. À confirmer avec leur support pour votre contrat.

## 5. Vérifier

- `https://votre-domaine.ir/api/health` doit répondre `{"ok":true,"edition":"iran"}`.
- Connectez-vous en super admin, créez un restaurant, imprimez un QR, scannez-le avec un téléphone.

Testé avant livraison : l'image Iran a été construite et lancée en local (migrations, seed, persan en RTL, `/fr` en 404, prix en rials, aucune requête externe). Le déploiement réel sur Liara et l'appel réel à Zarinpal n'ont pas pu être faits d'ici (pas de compte).

## Recommended: deploy a ready-made image (GitHub Actions → ghcr.io → Liara)

Liara's builder is slow (15-minute build limit, frequent queueing). The workflow
**Deploy — Iran via ready image** (`.github/workflows/deploy-iran-image.yml`) builds the full
image on GitHub, pushes it to `ghcr.io/massihs/spotifood-iran:<commit>` and asks Liara to run
it: nothing is built on Liara, a release takes ~4 minutes. The ghcr.io package must stay
**public** (it contains no secret: all credentials are Liara environment variables).
Runtime logs: workflow **Liara — app logs (Iran)**.

## SMS « commande prête » (food courts)

Les établissements de type **فودکورت / food court** envoient un SMS au client quand sa commande passe à
« prête ». Le numéro est demandé au client au moment de commander.

Variables Liara à ajouter :

| Variable                 | Valeur                                                            |
| ------------------------ | ----------------------------------------------------------------- |
| `SMS_PROVIDER`           | `kavenegar` (`console` = journal uniquement)                      |
| `KAVENEGAR_API_KEY`      | clé API du panneau Kavenegar (Compte → Paramètres → API Key)      |
| `KAVENEGAR_SENDER`       | facultatif : numéro de ligne d'envoi                              |
| `KAVENEGAR_OTP_TEMPLATE` | facultatif : nom du modèle « Verify » pour les codes de connexion |

**Codes de connexion (comptes clients).** Avec `KAVENEGAR_OTP_TEMPLATE`, le code est envoyé par le
service Verify de Kavenegar (ligne rapide, texte du modèle) au lieu d'un SMS simple. Dans le panneau
Kavenegar : Verify (اعتبارسنجی) → ajouter un modèle, par exemple nommé `spotifood-login`, avec le
texte `کد ورود اسپاتیفود: %token%` puis attendre sa validation. Ce modèle est propre à Spotifood :
celui de Padel Time reste distinct même avec le même compte et la même clé API.

Sans clé, rien n'est envoyé : le message apparaît seulement dans les journaux (`[sms:console]`).
