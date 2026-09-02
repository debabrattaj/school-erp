import Constants from "expo-constants";

/**
 * What build is this?
 *
 * `version` comes from app.json and changes when someone bumps it by hand.
 * `commit` is stamped in at build time by app.config.js and is the part that
 * actually identifies the bundle -- a dev build from a working tree has none,
 * which is itself the answer ("this is not a released build").
 */
export function buildVersion(): string {
  return String(Constants.expoConfig?.version || "").trim();
}

export function buildCommit(): string {
  const extra = Constants.expoConfig?.extra as { commit?: string } | undefined;
  return String(extra?.commit || "").trim();
}

/** "v1.0.0 (9078b8b)", or "v1.0.0 (dev)" when nothing stamped it. */
export function buildLabel(): string {
  const version = buildVersion();
  const commit = buildCommit();
  const left = version ? `v${version}` : "";
  const right = commit || "dev";
  return left ? `${left} (${right})` : `(${right})`;
}
