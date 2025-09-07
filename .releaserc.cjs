module.exports = {
  branches: ["main"],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",

    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],

    // Bump versions in both files (no npm publish required)
    [
      "semantic-release-version-file",
      {
        files: [
          { path: "package.json", type: "json" },
          { path: "manifest.json", type: "json" },
        ],
      },
    ],

    // Commit the bumped files + changelog and tag the release
    [
      "@semantic-release/git",
      {
        assets: ["package.json", "manifest.json", "CHANGELOG.md"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
  ],
};
