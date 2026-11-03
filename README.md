# Cleo × Longchamp

Démo de veille réglementaire, design LVMH et visuels fournis par Naomie. Revue initiale du 30 août au 28 octobre 2026, complétée par les événements du 29 octobre au 2 novembre. Dates d’événement, de publication et d’application distinctes. Le référentiel de fond conserve sa date de revue initiale.

Le référentiel sourcé et le fil récent sont séparés de l’inventaire historique Insight, qui n’est pas juridiquement revalidé et ne constitue pas un total de réglementations applicables. Les projets, normes volontaires, avis scientifiques et rappels de tiers sont explicitement qualifiés.

`sources.html` contient la méthode, la requête, les sources officielles, le journal des recherches, les exclusions et les lacunes de couverture. Aucune exhaustivité ni conformité produit n’est garantie. L’applicabilité exacte dépend des données produit et des marchés confirmés ; le Moyen-Orient reste à préciser.

Versions publiques : https://demo.cleolabs.co/longchamp/ et https://cleo-longchamp-demo.vercel.app/.

Actualisation : `python3 update-veille.py ~/veille/longchamp 2026-11-02`, après le tri par `veille-trie.mjs`. Les cartes retenues, preuves de relecture et assertions sont conservées dans `watch/`. Si la revue initiale est régénérée par `review60/refresh.py`, réappliquer ensuite ce complément. Le chat de la démo utilise les fiches locales.


Suivis par substance : après `update-veille.py`, exécuter `python3 build-follows.py ~/veille/longchamp-pfhxa`. Le moteur utilise des liens de source documentés, et non une recherche de mots pour déduire l’identité chimique. Recherche ciblée et limites dans `watch/substances/`. L’ajout accepte un nom connu ou un CAS avec clé valide ; un CAS sans correspondance documentée reste « Recherche à compléter ». Les suivis sont stockés dans le navigateur, modifiables, suspendables et exportables. Pas de collecte ou notification automatique, ni de synchronisation entre comptes.

Vérifications : `node tests/follow-core.test.cjs` et `node tests/follows-browser.mjs`. Le second lance un navigateur local et teste la persistance, les témoins négatifs CAS/marché/produit, les parcours famille/texte et le rendu mobile.
