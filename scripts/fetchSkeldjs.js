// Clones and builds SkeldJS from git into ./skeldjs, where package.json link: deps resolve it.
// Usage: node ./scripts/fetchSkeldjs.js [repoUrl] [branchOrTag]
// Env: SKELDJS_REPO, SKELDJS_REF (used by the Docker build to override the source).
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repo = process.env.SKELDJS_REPO || process.argv[2] || "https://github.com/SkeldJS/SkeldJS.git";
const ref = process.env.SKELDJS_REF || process.argv[3] || "master";
const targetDir = path.resolve(__dirname, "..", "skeldjs");

function run(cmd, args, cwd) {
    console.log(`> ${cmd} ${args.join(" ")}`);
    execFileSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
}

if (fs.existsSync(path.join(targetDir, ".git"))) {
    run("git", ["fetch", "--depth", "1", "origin", ref], targetDir);
    run("git", ["checkout", "-f", "FETCH_HEAD"], targetDir);
    run("git", ["submodule", "update", "--init", "--depth", "1", "--recursive"], targetDir);
} else {
    run("git", ["clone", "--depth", "1", "--branch", ref, "--recurse-submodules", "--shallow-submodules", repo, targetDir]);
}

run("yarn", ["install"], targetDir);
run("yarn", ["build-all"], targetDir);
console.log("[fetchSkeldjs] SkeldJS is ready at ./skeldjs");
