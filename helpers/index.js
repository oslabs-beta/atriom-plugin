function validateParams({
  federationRemoteEntry,
  topLevelPackage,
  metadata,
  modules,
}) {
  function objHasKeys(nestedObj, pathArr) {
    return pathArr.reduce(
      (obj, key) => (obj && obj[key] !== "undefined" ? obj[key] : undefined),
      nestedObj
    );
  }

  const hasLoc = federationRemoteEntry
    ? objHasKeys(federationRemoteEntry, ["origins", "0", "loc"])
    : federationRemoteEntry;

  const hasDependencies = objHasKeys(topLevelPackage, ["dependencies"]);
  const hasDevDependencies = objHasKeys(topLevelPackage, ["devDependencies"]);
  const hasOptionalDependencies = objHasKeys(topLevelPackage, [
    "optionalDependencies",
  ]);
  if (federationRemoteEntry) {
    if (
      typeof hasLoc === "undefined" ||
      federationRemoteEntry.origins[0].loc === ""
    ) {
      throw new Error(
        "federationRemoteEntry.origins[0].loc must be defined and have a value"
      );
    }
  }
  if ((modules && !modules.length) || typeof modules === "undefined") {
    throw new Error("Modules must be defined and have length");
  }

  if (typeof hasDependencies === "undefined") {
    throw new Error("topLevelPackage.dependencies must be defined");
  }

  if (typeof hasDevDependencies === "undefined") {
    throw new Error("topLevelPackage.devDependencies must be defined");
  }

  if (typeof hasOptionalDependencies === "undefined") {
    throw new Error("topLevelPackage.optionalDependencies must be defined");
  }

  for (let module of modules) {
    if (typeof module.identifier === "undefined") {
      throw new Error("module.identifier must be defined");
    }
    if (typeof module.reasons === "undefined") {
      throw new Error("module.reasons must be defined");
    }
    if (typeof module.issuerName === "undefined") {
      throw new Error("module.issuerName must be defined");
    }
  }
}

module.exports = { validateParams };
