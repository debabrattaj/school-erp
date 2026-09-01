// Expo reads app.json first and hands it here as `config`, so this file only
// adds what app.json cannot express: values that differ per build.
//
// The commit is stamped in so a tester can say which build is on their phone.
// Without it, "the app still shows the old field" is indistinguishable from a
// stale install, which has cost real debugging time.
const commit =
  process.env.EAS_BUILD_GIT_COMMIT_HASH ||
  process.env.GITHUB_SHA ||
  process.env.EXPO_PUBLIC_COMMIT ||
  "";

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    // Short sha; the full one is noise on a login screen.
    commit: commit ? commit.slice(0, 7) : "",
  },
});
