# dsh-tool-android

Android device tools for DeepSeek Harness, backed by `cordis-plugin-android`.

The publishable `dsh-tool-android` package is the
`packages/dsh-tool-android` workspace member.

## Development

```sh
pnpm install
pnpm run check
pnpm start
```

`pnpm start` launches the DSH Web profile with `android.cordis.yml`. That profile mounts the
Android bridge and tool plugin while disabling the local sandbox and PTY stack.

## Release

Bumping the member version in `packages/dsh-tool-android/package.json` on `main` creates an aarch64
deployment archive and publishes it as a GitHub release named `v<version>`.
