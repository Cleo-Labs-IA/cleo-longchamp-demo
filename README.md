# Cleo × Longchamp

## Application partagée

La branche `feat/longchamp-shared-app` ajoute les connexions individuelles et les suivis communs. Les adresses sont attendues ; aucun utilisateur client n’est encore créé. La production statique reste en place jusqu’à la bascule explicite de cette branche.

- Hébergement : projet Vercel `cleo-longchamp-demo`, équipe `cleo-academys-projects`.
- Base : Supabase `tuzjcmvlclpfuroqnuis`, tables dédiées `longchamp_members` et `longchamp_watch_state`. Aucun accès aux tables des autres clients n’est nécessaire.
- Authentification : adresse + mot de passe, cookies HttpOnly/Secure, contrôle d’appartenance à chaque requête, protection des mutations par origine. Pas d’inscription dans cette application. Un éventuel compte Supabase sans appartenance Longchamp est refusé.
- Les mutations sont atomiques et comparent la révision attendue. Un conflit affiche la nouvelle version et conserve le formulaire pour une nouvelle validation. Un échec restaure l’état précédent.
- La collecte de veille reste manuelle. Aucune tâche programmée ni notification n’est créée. L’assistant conserve son fonctionnement documentaire local.
- Les anciens suivis navigateur peuvent être importés explicitement depuis Mes suivis. Ils ne sont jamais publiés automatiquement dans l’espace commun.

Préparation locale : copier `.env.example` vers `.env.local`, fournir la clé publique du projet, puis `npm run build` et `npm run dev` (Node 22 ou plus). `SUPABASE_SERVICE_ROLE_KEY` n’est pas utilisée par le serveur. Le répertoire public ne contient que la connexion, les scripts d’interface et les photos ; l’application, les sources documentaires et les suivis sont servis après authentification.

Migration additive : `supabase/migrations/20261103_longchamp_shared.sql`. Vérification indépendante des droits : `tests/shared-rls.sql`, à exécuter sur la base liée ; toutes ses identités et écritures de test sont annulées. Tests API : `npm test`. Test navigateur à deux sessions et panne d’écriture : `node tests/shared-browser.mjs` (utilise le navigateur local et un fournisseur d’authentification de test, distinct de la vérification RLS réelle).

Quand Naomie fournit les deux adresses, prévisualiser l’opération :

```sh
node scripts/add-members.cjs --emails personne1@entreprise.fr,personne2@entreprise.fr
```

Après avoir vérifié les adresses réelles, exécuter le même script avec `--apply --credentials-file /chemin/prive/hors-du-depot/acces.json` et la clé opérateur dans l’environnement. Le script n’envoie aucun e-mail, réutilise les comptes existants sans changer leur mot de passe et conserve les nouveaux identifiants dans ce fichier privé. Ne jamais committer ce fichier. Si un accès existe déjà pour une autre personne, le script s’arrête sans le remplacer.

Actualisation de veille : conserver le processus de recherche/relecture/tri existant ci-dessous, reconstruire les pages sources, puis `npm run build`, aperçu et validation avant publication. Aucun changement automatique des suivis n’est fait lors d’une actualisation.

## Démo et sources documentaires

Démo de veille réglementaire, design LVMH et visuels fournis par Naomie. Revue initiale du 30 août au 28 octobre 2026, complétée par les événements du 29 octobre au 2 novembre. Dates d’événement, de publication et d’application distinctes. Le référentiel de fond conserve sa date de revue initiale.

Le référentiel sourcé et le fil récent sont séparés de l’inventaire historique Insight, qui n’est pas juridiquement revalidé et ne constitue pas un total de réglementations applicables. Les projets, normes volontaires, avis scientifiques et rappels de tiers sont explicitement qualifiés.

`sources.html` contient la méthode, la requête, les sources officielles, le journal des recherches, les exclusions et les lacunes de couverture. Aucune exhaustivité ni conformité produit n’est garantie. L’applicabilité exacte dépend des données produit et des marchés confirmés ; le Moyen-Orient reste à préciser.

Versions publiques : https://demo.cleolabs.co/longchamp/ et https://cleo-longchamp-demo.vercel.app/.

Actualisation : `python3 update-veille.py ~/veille/longchamp 2026-11-02`, après le tri par `veille-trie.mjs`. Les cartes retenues, preuves de relecture et assertions sont conservées dans `watch/`. Si la revue initiale est régénérée par `review60/refresh.py`, réappliquer ensuite ce complément. Le chat de la démo utilise les fiches locales.


Suivis par substance : après `update-veille.py`, exécuter `python3 build-follows.py ~/veille/longchamp-pfhxa`. Le moteur utilise des liens de source documentés, et non une recherche de mots pour déduire l’identité chimique. Recherche ciblée et limites dans `watch/substances/`. L’ajout accepte un nom connu ou un CAS avec clé valide ; un CAS sans correspondance documentée reste « Recherche à compléter ». Les suivis sont stockés dans le navigateur, modifiables, suspendables et exportables. Pas de collecte ou notification automatique, ni de synchronisation entre comptes.

Vérifications : `node tests/follow-core.test.cjs` et `node tests/follows-browser.mjs`. Le second lance un navigateur local et teste la persistance, les témoins négatifs CAS/marché/produit, les parcours famille/texte et le rendu mobile.


Déploiement : le projet Vercel `cleo-longchamp-demo`, équipe `cleo-academys-projects`, est relié au dépôt `Cleo-Labs-IA/cleo-longchamp-demo`. La branche `main` est la cible de production ; une branche de travail produit un aperçu à vérifier avant fusion. `vercel.json` déclare le site statique et l’en-tête noindex. Après déploiement, contrôler les parcours CAS, les sources, l’export et le rendu mobile sur le domaine public. Le hub `demo.cleolabs.co/longchamp/` reste une copie gérée dans le dépôt `cleo-demos` : son contenu doit rester identique aux pages source publiées.
