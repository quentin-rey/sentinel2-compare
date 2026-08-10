import { useLocalStorageState } from "./useLocalStorageState";

const ONBOARDING_KEY = "s2compare-onboarding-seen";

// Whether the first-launch guided tour (issue #31) has already been shown
// — persisted so it only auto-starts once per browser, ever, not once per
// session (see App.tsx, which starts it on mount unless this is true).
export function useOnboarding() {
  const [seen, setSeen] = useLocalStorageState(ONBOARDING_KEY, "0");
  return {
    hasSeenOnboarding: seen === "1",
    markOnboardingSeen: () => setSeen("1"),
  };
}
