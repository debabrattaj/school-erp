import Constants from "expo-constants";
import { buildCommit, buildLabel, buildVersion } from "../buildInfo";

jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: null } }));

const mocked = Constants as unknown as { expoConfig: unknown };

function withConfig(config: unknown) {
  mocked.expoConfig = config;
}

describe("buildInfo", () => {
  it("reads the version and the stamped commit", () => {
    withConfig({ version: "1.0.0", extra: { commit: "9078b8b" } });
    expect(buildVersion()).toBe("1.0.0");
    expect(buildCommit()).toBe("9078b8b");
    expect(buildLabel()).toBe("v1.0.0 (9078b8b)");
  });

  it("says dev when nothing stamped a commit", () => {
    // A build off a working tree: no CI, no EAS, so no sha to report.
    withConfig({ version: "1.0.0", extra: {} });
    expect(buildLabel()).toBe("v1.0.0 (dev)");
  });

  it("survives a missing config rather than crashing the login screen", () => {
    withConfig(null);
    expect(buildLabel()).toBe("(dev)");
  });
});
