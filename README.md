# Cleo × Longchamp

## Application partagée

L’application utilise des connexions individuelles et des suivis communs. La connexion se fait par code à usage unique envoyé par e-mail, sans mot de passe fixe. Les domaines exacts `cleolabs.co` et `longchamp.co` sont autorisés : le compte et son appartenance Longchamp sont créés automatiquement à la première demande de code. La boîte e-mail doit ensuite être vérifiée avant tout accès aux suivis. Les sous-domaines et domaines ressemblants ne sont pas autorisés automatiquement.

- Hébergement : projet Vercel `cleo-longchamp-demo`, équipe `cleo-academys-projects`.
- Base : Supabase `tuzjcmvlclpfuroqnuis`, tables dédiées `longchamp_members` et `longchamp_watch_state`. Aucun accès aux tables des autres clients n’est nécessaire.
- Authentification : adresse + code temporaire reçu par e-mail, cookies HttpOnly/Secure, contrôle d’appartenance à chaque requête, protection des mutations par origine. Inscription automatique limitée aux domaines autorisés, sans mot de passe fixe ni modification du mot de passe d’un compte existant. Les invitations nominatives existantes sont conservées. Une session approuvée par le code est toujours exigée pour les données.
- Les mutations sont atomiques et comparent la révision attendue. Un conflit affiche la nouvelle version et conserve le formulaire pour une nouvelle validation. Un échec restaure l’état précédent.
- La collecte de veille reste manuelle. Chaque nouveau suivi ajouté à « Ma veille » notifie naomie@cleolabs.co. Une file privée conserve les envois et une tâche protégée les reprend toutes les dix minutes en cas d’échec. CRON_SECRET protège cette tâche ; les reprises sont arrêtées après 23 heures pour éviter un doublon hors de la fenêtre d’idempotence du fournisseur. L’assistant authentifié utilise l’API Cleo Chat.
- Les anciens suivis navigateur peuvent être importés explicitement depuis Mes suivis. Ils ne sont jamais publiés automatiquement dans l’espace commun.

Préparation locale : copier `.env.example` vers `.env.local`, fournir la clé publique du projet, puis `npm run build` et `npm run dev` (Node 22 ou plus). Les secrets serveur `SUPABASE_SERVICE_ROLE_KEY` et `RESEND_API_KEY`, ainsi que `RESEND_FROM_EMAIL`, sont nécessaires pour générer et envoyer les codes uniquement aux membres Longchamp. Ils ne sont jamais exposés au navigateur. La clé Resend dédiée est réservée à l’envoi ; les réglages SMTP et modèles des autres applications ne sont pas modifiés. Le répertoire public ne contient que la connexion, les scripts d’interface et les photos ; l’application, les sources documentaires et les suivis sont servis après authentification.

À l’ouverture du lien, la page vérifie la session existante avant d’afficher le formulaire. Une session OTP encore valide ouvre directement `/app`, en conservant le fragment de destination. Le cookie de renouvellement peut remplacer silencieusement un jeton d’accès expiré ; il ne recrée ni ne prolonge l’approbation OTP. Un nouveau code est demandé après expiration, perte des cookies ou déconnexion. En cas de panne temporaire ou de délai réseau dépassé, les cookies sont conservés et la page propose de réessayer sans réclamer une nouvelle connexion. Vérifications : `tests/session-resume.test.cjs`, `node tests/session-resume-browser.mjs` et `node tests/session-resume-live.cjs --apply-test` (identité temporaire supprimée, transport e-mail intercepté, aucune modification des suivis). Ajouter `--base-url https://cleo-longchamp-demo.vercel.app` pour sonder la production.

Migrations additives : `supabase/migrations/20261103090000_longchamp_shared.sql` puis `20261103170000_longchamp_email_codes.sql` et `20261103183000_longchamp_domain_access.sql`. Le code expire après dix minutes, est utilisable une seule fois et exige le navigateur ayant demandé l’envoi. Le stockage privé des demandes applique un délai de soixante secondes entre envois et une limite de cinq essais ; aucun code en clair n’est stocké. Le code est généré et vérifié par Supabase, envoyé par Resend depuis le domaine Cleo vérifié. Les erreurs d’envoi sont signalées. Les adresses hors des domaines autorisés et sans invitation existante reçoivent une réponse générique sans envoi de mail ni création de compte. La recherche du compte existant utilise une fonction privée, sans parcours de la liste de tous les membres. Vérification indépendante des droits : `tests/shared-rls.sql`, à exécuter sur la base liée ; toutes ses identités et écritures de test sont annulées. Tests API : `npm test`. Test navigateur à deux sessions et panne d’écriture : `node tests/shared-browser.mjs` (utilise le navigateur local et un fournisseur d’authentification de test, distinct de la vérification RLS réelle).

Pour ces domaines, aucune invitation préalable n’est nécessaire. Le script historique reste disponible pour des invitations nominatives explicites, en dry-run par défaut :

```sh
node scripts/add-members.cjs --emails personne1@entreprise.fr,personne2@entreprise.fr
```

Après avoir vérifié les adresses réelles, exécuter le même script avec `--apply` et la clé opérateur dans l’environnement. Le script n’envoie aucun e-mail et ne crée aucun mot de passe fixe. Il réutilise les comptes existants, puis autorise les deux personnes. Elles demandent leur code depuis la page de connexion. Si un accès existe déjà pour une autre personne, le script s’arrête sans le remplacer.

Actualisation de veille : conserver le processus de recherche/relecture/tri existant ci-dessous, reconstruire les pages sources, puis `npm run build`, aperçu et validation avant publication. Aucun changement automatique des suivis n’est fait lors d’une actualisation.

## Assistant Cleo Chat

Le panneau « Demander à Cleo » utilise le même moteur que `chat.cleolabs.co` via l’API signée `/api/v1/conversation`, version `2026-10-28`. `CLEO_CHAT_CONSUMER_SECRET` et `CLEO_CHAT_ORGANIZATION_ID` sont configurés uniquement sur le serveur Longchamp. La clé correspond à `CONVERSATION_API_LONGCHAMP_SECRET` côté Chat ; les clés existantes des autres consommateurs restent inchangées. Aucun secret, identifiant interne Chat ou contournement d’authentification n’est transmis au navigateur.

Migration additive `20261104130000_longchamp_chat.sql` : fils privés par utilisateur OTP et réservation atomique d’un tour par personne. Organisation, auteur et fil sont résolus côté serveur ; le contexte de la fiche ou du produit est relu dans le catalogue généré, jamais traité comme une preuve juridique. Seule une réponse finale `complete` avec `controlesMenes=true` est affichée, avec les citations renvoyées par le service. HTML brut et images distantes du modèle ne sont pas exécutés/chargés. Arrêt, timeout et déconnexion annulent la lecture ; aucune réponse du moteur local de démonstration ne prend le relais si l’API ou un script échoue.

Le fil affiché reste dans la page ; « Nouvelle conversation » ou un rechargement commence un nouveau fil. Le service Chat conserve ses transcriptions et faits d’entreprise dans un espace isolé `longchamp` + organisation, avec fils séparés par acteur. Aucun ancien historique ni préférence personnelle n’est migré. Le contrat v1 ne synchronise pas automatiquement suppression/export entre produits. La recherche externe automatique est désactivée par ce contrat ; le corpus Cleo et Bedrock restent disponibles. Ce raccordement ne garantit pas la justesse juridique générale de chaque réponse.

Contrôles : `npm test`, `node tests/cleo-chat-browser.mjs` et `tests/cleo-chat-rls.sql` (transactions annulées). Le build produit le catalogue serveur `.generated/chat-context.json` et le rendu Markdown public depuis la dépendance verrouillée.

## Favoris et avis sur les articles

Les commandes Favori, J’aime, Je n’aime pas et Noter et commenter apparaissent uniquement dans l’article ouvert. Les favoris sont personnels et accessibles depuis « Mes favoris », dans la navigation ou le fil de veille. Ils sont sauvegardés en base et disponibles après reconnexion, y compris sur un autre appareil. L’étoile est indépendante des suivis CAS communs.

Chaque personne peut enregistrer, modifier ou retirer son avis sur un article : J’aime / Je n’aime pas, une note facultative sur 5 et un commentaire expliquant son appréciation. Les avis et commentaires sont partagés dans l’espace Longchamp avec leur auteur ; chacun modifie uniquement le sien. Les conflits entre onglets demandent un rechargement explicite, sans effacer le brouillon sur erreur. Les textes de commentaire sont affichés comme du texte, jamais comme du HTML.

Migration additive : `supabase/migrations/20261103190000_longchamp_article_feedback.sql`, après les migrations de connexion. Tables dédiées `longchamp_article_favorites` et `longchamp_article_reviews`, lecture RLS et écritures uniquement par RPC avec session OTP approuvée. Les favoris des autres personnes ne sont jamais renvoyés. Aucune clé opérateur n’est nécessaire pour les lectures ou écritures d’avis de l’application. Les articles sont identifiés par leur clé documentaire stable `raw` ; `npm run build` génère la liste des clés admises par l’API à partir de la page publiée. Conserver ces clés lors d’une actualisation de veille.

Vérifications : `npm test`, `node tests/article-browser.mjs`, `tests/article-feedback-rls.sql` (transactions annulées) et `node tests/article-feedback-live.cjs --apply-test`. Ce dernier utilise des identités temporaires supprimées en fin de test, intercepte les e-mails et ne touche pas aux suivis communs. `--base-url https://cleo-longchamp-demo.vercel.app` vérifie les mêmes mutations sur le déploiement effectif. Ne jamais utiliser une vraie adresse cliente pour ces tests.

## Démo et sources documentaires

Démo de veille réglementaire, design LVMH et visuels fournis par Naomie. Revue initiale du 30 août au 28 octobre 2026, complétée par les événements du 29 octobre au 2 novembre. Dates d’événement, de publication et d’application distinctes. Le référentiel de fond conserve sa date de revue initiale.

Le référentiel sourcé et le fil récent sont séparés de l’inventaire historique Insight, qui n’est pas juridiquement revalidé et ne constitue pas un total de réglementations applicables. Les projets, normes volontaires, avis scientifiques et rappels de tiers sont explicitement qualifiés.

`sources.html` contient la méthode, la requête, les sources officielles, le journal des recherches, les exclusions et les lacunes de couverture. Aucune exhaustivité ni conformité produit n’est garantie. L’applicabilité exacte dépend des données produit et des marchés confirmés ; le Moyen-Orient reste à préciser.

Versions publiques : https://demo.cleolabs.co/longchamp/ et https://cleo-longchamp-demo.vercel.app/.

Actualisation : `python3 update-veille.py ~/veille/longchamp 2026-11-02`, après le tri par `veille-trie.mjs`. Les cartes retenues, preuves de relecture et assertions sont conservées dans `watch/`. Si la revue initiale est régénérée par `review60/refresh.py`, réappliquer ensuite ce complément. La copie statique garde son moteur documentaire local ; l’application authentifiée le remplace par Cleo Chat.


Suivis par substance : après `update-veille.py`, exécuter `python3 build-follows.py ~/veille/longchamp-pfhxa`. Le moteur utilise des liens de source documentés, et non une recherche de mots pour déduire l’identité chimique. Recherche ciblée et limites dans `watch/substances/`. L’ajout accepte un nom connu ou un CAS avec clé valide ; un CAS sans correspondance documentée reste « Recherche à compléter ». Les suivis sont communs à l’espace authentifié, modifiables, suspendables et exportables. La collecte reste manuelle ; un ajout de suivi notifie Naomie.

Vérifications : `node tests/follow-core.test.cjs` et `node tests/follows-browser.mjs`. Le second lance un navigateur local et teste la persistance, les témoins négatifs CAS/marché/produit, les parcours famille/texte et le rendu mobile.


Déploiement : le projet Vercel `cleo-longchamp-demo`, équipe `cleo-academys-projects`, est relié au dépôt `Cleo-Labs-IA/cleo-longchamp-demo`. La branche `main` est la cible de production ; une branche de travail produit un aperçu à vérifier avant fusion. `vercel.json` déclare le site statique et l’en-tête noindex. Après déploiement, contrôler les parcours CAS, les sources, l’export et le rendu mobile sur le domaine public. Le hub `demo.cleolabs.co/longchamp/` reste une copie gérée dans le dépôt `cleo-demos` : son contenu doit rester identique aux pages source publiées.
