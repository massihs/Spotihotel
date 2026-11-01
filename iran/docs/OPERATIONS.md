# Exploitation : sauvegardes, alertes, surveillance

## Sauvegardes de la base

Trois niveaux, du plus simple au plus sûr :

1. **Sauvegardes Liara** : dans le panel Liara → base PostgreSQL → _Backups_, activer les
   sauvegardes automatiques quotidiennes (et en faire une à la main avant chaque grosse
   mise à jour). La restauration se fait depuis le même écran.
2. **Sauvegarde nocturne GitHub** (`.github/workflows/db-backup.yml`) : chaque nuit, la base
   est copiée, **restaurée dans une base de test pour vérifier que la copie fonctionne**,
   chiffrée puis gardée 14 jours dans GitHub Actions. À activer avec deux secrets du dépôt
   (_Settings → Secrets and variables → Actions_) :
   - `BACKUP_DATABASE_URL` : l'adresse publique de la base Liara (onglet _Connexion_), avec
     un utilisateur qui peut créer une base ;
   - `BACKUP_PASSPHRASE` : une longue phrase secrète, à garder aussi hors de GitHub.
3. **À la main**, depuis n'importe quel poste avec `pg_dump` :
   ```sh
   iran/scripts/backup-restore-test.sh "postgres://…" spotifood-$(date +%F).dump
   ```

### Restaurer

```sh
gpg -d spotifood.dump.gpg > spotifood.dump          # si chiffrée
createdb -h HOTE -U UTILISATEUR spotifood_restored
pg_restore --no-owner --no-privileges -d "postgres://…/spotifood_restored" spotifood.dump
```

Puis pointer `DATABASE_URL` de l'application vers la base restaurée (ou renommer les bases),
et redémarrer. `APP_SECRET` doit rester **le même** : sinon sessions, codes QR et
identifiants chiffrés deviennent illisibles.

**Photos et fichiers** : le disque `uploads` de Liara n'est pas dans la sauvegarde de la base.
Le copier de temps en temps depuis le panel (ou passer au stockage objet compatible S3, qui
a son propre versionnage).

### Test de restauration

La CI exécute `scripts/backup-restore-test.sh` à chaque modification : copie de la base de test,
restauration, et comparaison du nombre de lignes de chaque table. Une sauvegarde qu'on n'a
jamais restaurée n'est pas une sauvegarde.

## Alertes d'erreurs

- Chaque erreur serveur (page, API, action) est enregistrée et regroupée : **Admin → Erreurs**
  (`/admin/errors`), avec le nombre d'occurrences, la route et les détails techniques.
- Avec la variable `ALERT_PHONE` (numéro de l'administrateur, ex. `0912…`) et l'envoi de SMS
  Kavenegar configuré, un SMS part pour chaque nouvelle erreur, au plus une fois par heure
  par erreur et 5 par heure au total.

## Surveillance de disponibilité

`.github/workflows/uptime.yml` interroge `https://spotifood.ir/api/health` toutes les 10 minutes
(application + base de données, 3 essais). Si le site ne répond pas :

- l'exécution échoue et GitHub envoie un e-mail au propriétaire du dépôt ;
- avec les secrets `KAVENEGAR_API_KEY` et `ALERT_PHONE`, un SMS part quand le site tombe, et un
  autre quand il revient (pas toutes les 10 minutes).

## Abonnements payants (Zarinpal de Spotifood)

Tant que `BILLING_ZARINPAL_MERCHANT_ID` est vide, rien ne change : pas d'essai, pas de paiement,
chaque restaurant garde son forfait actuel. La page `/pricing` et **Admin → Forfaits** (noms, prix,
limites) fonctionnent déjà.

Quand Zarinpal confirme le compte marchand de Spotifood :

1. Mettre l'identifiant marchand dans `BILLING_ZARINPAL_MERCHANT_ID` (variables Liara), redémarrer.
2. Adresse de retour à déclarer si Zarinpal la demande : `https://spotifood.ir/api/v1/billing/return`.
3. Désormais : chaque **nouveau** restaurant démarre un essai de 14 jours du forfait Professional ;
   le propriétaire paie 1, 3 ou 12 mois (12 mois = prix de 10) dans **Tableau de bord → Abonnement** ;
   une facture numérotée `SF-1405-000001` est créée à chaque paiement.
4. À la fin d'une période (essai ou payée), le restaurant **continue de fonctionner** avec les
   limites du forfait Gratuit et voit un bandeau « Renouveler » : rien n'est supprimé.

L'admin peut aussi attribuer un forfait à la main (paiement par virement, geste commercial) :
**Admin → Restaurants → Attribuer un forfait** (avec durée et montant, facture créée).

## Démo publique (/demo)

Le bouton « Essayer la démo » de l'accueil place le visiteur à une table libre du restaurant de
démonstration (`restaurant-demo`), comme s'il avait scanné son QR. Pour l'activer en production,
ajouter `SEED_PUBLIC_DEMO=true` aux variables Liara et redémarrer : le restaurant de démo est créé
au démarrage (mots de passe aléatoires, personne ne peut s'y connecter), ses tables se libèrent
après 20 minutes d'inactivité. Sans cette variable, `/demo` mène à l'annuaire des restaurants.

## Satisfaction (SMS après le service)

Chaque restaurant l'active dans **Avis clients** : après le service (ou la livraison), une commande
avec un numéro de téléphone reçoit un lien de notation. Une note de 2 ou moins apparaît tout de suite
dans les notifications ; la roue de la chance (facultative) donne un coupon à usage unique.

Les SMS dus partent quand l'équipe utilise le tableau de bord. Pour qu'ils partent aussi la nuit ou
quand personne n'est connecté : choisir une longue valeur secrète, la mettre dans `CRON_SECRET`
(variables Liara) **et** dans le secret GitHub `CRON_SECRET` ; le workflow de surveillance appelle
alors `/api/v1/cron` toutes les 10 minutes.

## Notifications push

Les alertes push (nouvelle commande pour l'équipe, « commande prête » pour le client) marchent
même page fermée. Activation : générer une fois une paire de clés avec
`npx web-push generate-vapid-keys`, puis mettre `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY`
(variables Liara) — **ne jamais les changer ensuite**, sinon chaque appareil doit se réabonner.
L'équipe active les push depuis la cloche de notifications ; le client depuis le suivi de commande.

Attention : Chrome et Android passent par le service de Google (FCM), souvent filtré en Iran ;
quand il est injoignable, l'envoi échoue sans rien bloquer et les SMS / alertes du tableau de bord
restent la solution sûre.
