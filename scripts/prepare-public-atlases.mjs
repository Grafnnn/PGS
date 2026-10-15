import { execFileSync } from "node:child_process";

// Both independently sealed websites are required; neither replaces the other.
for (const version of ["v12-13", "dou200-r1-27"]) {
  execFileSync(process.execPath, ["scripts/prepare-atlas-r25v5.mjs", version], { stdio: "inherit" });
}
