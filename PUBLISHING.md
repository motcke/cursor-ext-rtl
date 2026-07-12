# Publishing to Open VSX

Open VSX publishing runs automatically, using the latest `ovsx` CLI from a clean CI environment:

- The "Create Release Tag" workflow ([create-release-tag.yml](.github/workflows/create-release-tag.yml))
  publishes directly after creating the GitHub release. (It must — the tag it pushes uses
  `GITHUB_TOKEN`, which never triggers other workflows.)
- Manually pushed `v*` tags are handled by the `publish-openvsx` job in
  [build-vsix.yml](.github/workflows/build-vsix.yml).

Before the first publish, a few **one-time manual steps** are required
(per the [Open VSX publishing guide](https://github.com/EclipseFdn/open-vsx.org/wiki/Publishing-Extensions)):

## One-time setup

1. **Log in to open-vsx.org** with the GitHub account `motcke`.

2. **Create an Eclipse account** at [accounts.eclipse.org](https://accounts.eclipse.org)
   and set its "GitHub Username" field to exactly `motcke` (must match the GitHub login —
   a mismatch is the most common cause of agreement-signing failures).

3. **Sign the Eclipse Publisher Agreement** from your
   [open-vsx.org profile page](https://open-vsx.org/user-settings/profile)
   ("Log in with Eclipse" → sign the agreement).

4. **Generate an access token** at
   [open-vsx.org/user-settings/tokens](https://open-vsx.org/user-settings/tokens).

5. **Create the namespace** (it does not exist yet — verified via the API):

   ```sh
   npx --yes ovsx@latest create-namespace motcke -p <token>
   ```

6. **Add the token as a repo secret** named `OVSX_PAT`:
   GitHub repo → Settings → Secrets and variables → Actions → New repository secret.

After that, every `v*` tag publishes to Open VSX automatically.
If `OVSX_PAT` is missing, the job skips with a warning instead of failing.

## Manual publish (fallback)

```sh
npm run package
npx --yes ovsx@latest publish cursor-rtl-<version>.vsix -p <token>
```

Always use `ovsx@latest`. A stale `ovsx` (or a proxy that rewrites the
`Content-Type`/`Accept` headers) is what causes the registry to answer with a bare
**HTTP 406 Not Acceptable** — the server rejects any request whose MIME headers are malformed.
Real content problems (missing license, version already published, unknown namespace)
come back as **400** with a JSON error message instead.
