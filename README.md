# dsh-tool-android

Android device tools for DeepSeek Harness, backed by `cordis-plugin-android`.

## Development

```sh
npm install
npm run check
npm start
```

`npm start` launches the DSH headless profile with `android.cordis.yml`. That profile mounts the
Android bridge and tool plugin while disabling the local sandbox and PTY stack.

## Release

Bumping the workspace version in `package.json` on `main` creates an aarch64
deployment archive and publishes it as a GitHub release named `v<version>`.
