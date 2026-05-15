// C API entry point for Flutter's auto-generated Windows registrant.
// Delegates to the legacy RatexFlutterPluginRegisterWithRegistrar so both
// the current ("*CApi*") and legacy name variants resolve to the same body.

#include "include/ratex_flutter/ratex_flutter_plugin_c_api.h"
#include "include/ratex_flutter/ratex_flutter_plugin.h"

void RatexFlutterPluginCApiRegisterWithRegistrar(
    FlutterDesktopPluginRegistrarRef registrar) {
  RatexFlutterPluginRegisterWithRegistrar(registrar);
}
