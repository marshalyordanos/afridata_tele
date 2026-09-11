const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
// Let Metro resolve the local native module by name.
config.watchFolders = [path.resolve(__dirname, "modules")];
config.resolver.extraNodeModules = {
  "auto-accessibility": path.resolve(__dirname, "modules/auto-accessibility"),
};
module.exports = config;
