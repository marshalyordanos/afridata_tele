const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin for the local auto-accessibility native module. It:
 *   1. Registers the AutoAccessibilityService in AndroidManifest.xml.
 *   2. Makes autolinking scan ./modules (so this local module is included
 *      alongside node_modules modules like expo-modules-core).
 *   3. Pins a valid NDK version.
 */

const withServiceManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.service = app.service || [];
    const exists = app.service.find(
      (s) =>
        s.$["android:name"] ===
        "expo.modules.autoaccessibility.AutoAccessibilityService"
    );
    if (!exists) {
      app.service.push({
        $: {
          "android:name":
            "expo.modules.autoaccessibility.AutoAccessibilityService",
          "android:permission": "android.permission.BIND_ACCESSIBILITY_SERVICE",
          // Must be exported: the system server runs in another process and has to
          // bind this service. A non-exported one is never even resolved, so it
          // does not show up in Accessibility settings. Requiring
          // BIND_ACCESSIBILITY_SERVICE is what keeps other apps from binding it.
          "android:exported": "true",
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name":
                    "android.accessibilityservice.AccessibilityService",
                },
              },
            ],
          },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.accessibilityservice",
              "android:resource": "@xml/accessibility_service_config",
            },
          },
        ],
      });
    }
    return cfg;
  });

// The <service> in the app manifest references @xml/accessibility_service_config and
// @string/accessibility_service_description, which AAPT resolves from the APP's res
// folder. Write them there so resource linking succeeds after every prebuild.
const withAccessibilityResources = (config) =>
  withDangerousMod(config, [
    "android",
    (cfg) => {
      const resDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res"
      );
      const xmlDir = path.join(resDir, "xml");
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, "accessibility_service_config.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeAllMask"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault|flagReportViewIds|flagRetrieveInteractiveWindows"
    android:canRetrieveWindowContent="true"
    android:canPerformGestures="true"
    android:notificationTimeout="100"
    android:description="@string/accessibility_service_description" />
`
      );
      // Ensure the description string exists in the app strings.xml.
      const valuesDir = path.join(resDir, "values");
      fs.mkdirSync(valuesDir, { recursive: true });
      const stringsPath = path.join(valuesDir, "strings.xml");
      const desc =
        '<string name="accessibility_service_description">AutoPilot uses accessibility to read screen content and perform taps so it can automate and scrape other apps on your behalf.</string>';
      let strings = fs.existsSync(stringsPath)
        ? fs.readFileSync(stringsPath, "utf8")
        : '<resources>\n</resources>';
      if (!strings.includes("accessibility_service_description")) {
        strings = strings.replace("</resources>", "  " + desc + "\n</resources>");
        fs.writeFileSync(stringsPath, strings);
      }
      return cfg;
    },
  ]);

module.exports = (config) =>
  withAccessibilityResources(
    withServiceManifest(config)
  );
