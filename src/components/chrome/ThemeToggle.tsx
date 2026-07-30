import { Button, I } from "@/components/primitives";
import { usePreferences } from "@/store/preferences";

export function ThemeToggle() {
  const theme = usePreferences((state) => state.theme);
  const toggleTheme = usePreferences((state) => state.toggleTheme);
  const destination = theme === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      className="od-mode-toggle"
      leadingIcon={theme === "dark" ? <I.sun size={14} /> : <I.moon size={14} />}
      onClick={toggleTheme}
      title={`Switch to ${destination} theme`}
      aria-label={`Switch to ${destination} theme`}
    >
      <span className="od-mode-label">Theme: {theme}</span>
    </Button>
  );
}
