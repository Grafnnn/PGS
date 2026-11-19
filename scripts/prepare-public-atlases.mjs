import { execFileSync } from "node:child_process";

// Each independently sealed website keeps its own release and asset namespace.
for (const version of ["v12-18", "dou200-r1-27", "zagoryanka-1500-r1-0", "goluboe-vodovod-r1-2-up1-profile"]) {
  execFileSync(process.execPath, ["scripts/prepare-atlas-r25v5.mjs", version], { stdio: "inherit" });
}
