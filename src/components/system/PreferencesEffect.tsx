import { useEffect } from "react";
import { usePreferences } from "@/store/preferences";

// Keep root attributes aligned with the pre-mount theme script. Applying them
// to <html> also covers portals rendered outside the application root.
export function PreferencesEffect() {
  const theme = usePreferences((s) => s.theme);
  const density = usePreferences((s) => s.density);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  return null;
}
