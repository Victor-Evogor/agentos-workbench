# Release Process

Releases for `@framers/sql-storage-adapter` are handled automatically by the GitHub Actions workflow in `.github/workflows/release.yml`. Whenever a change is merged into `master` and the package version changes, the pipeline will:

- install dependencies, run the test suite, and build the package;
- publish the new version to npm (if it has not already been published);
- tag the commit as `vX.Y.Z` and create or update the matching GitHub Release using the changelog entry.

## Required secrets

Add the following secret under **Settings > Secrets and variables > Actions**:

- `NPM_TOKEN` - npm automation token with `publish` scope for `@framers/sql-storage-adapter`.

The workflow uses the built-in `GITHUB_TOKEN` for tagging and creating releases.

## Cutting a release

1. Update the version (use `--no-git-tag-version` so the workflow owns the tag):

   ```bash
   npm version --no-git-tag-version patch  # or minor / major
   ```

2. Update `CHANGELOG.md` with notes for the new version.

3. Commit and push the changes to `master` (or merge a PR targeting `master`). The workflow will publish to npm and create the GitHub release.

Monitor progress in the **Actions** tab and verify that the npm package and GitHub release have been created once the workflow succeeds.

## Manual fallback

If automated publishing ever needs to be bypassed:

```bash
npm run build
npm run test
npm publish --access public
```

Then create the Git tag and corresponding GitHub release manually.
