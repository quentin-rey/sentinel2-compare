# Notes pour Claude Code

## Workflow git

Règles générales dans `~/.claude/CLAUDE.md`. Pour ce dépôt, `main` est la branche de production : tout merge déclenche le déploiement GitHub Pages. Le dépôt est public et `main` est protégé (check `ci` requis, branche à jour avec `main`, règle valable aussi pour les admins) : seul le passage par une pull request est possible.

- Jamais de commit ni de push direct sur `main`, jamais de force-push.
- Une branche par sujet depuis `origin/main` à jour : `git switch -c <type>/<sujet> origin/main`.
- `git add <fichiers>` uniquement, jamais `git add -A` ni `git add .`. Un worktree par session si plusieurs sessions travaillent ici.
- Livraison par pull request (`gh pr create --base main`). Ne pas fusionner sans l'accord explicite de Quentin.
- Demander confirmation avant tout `git push`.
