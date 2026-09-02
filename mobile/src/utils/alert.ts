import { Alert, Platform } from "react-native";

export interface AlertButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

/**
 * Alerts and confirmations that work on every target.
 *
 * `react-native-web`'s Alert is a literal no-op (`static alert() {}`), so on the
 * web build every one of this app's alerts was invisible and each of its
 * confirm dialogs — delete a record, remove an enrolment, delete a device,
 * rotate a token — was a dead button: the prompt never appeared, so the
 * onPress that does the work never ran. Native keeps the real Alert; web falls
 * back to the browser's own dialogs.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }

  const body = [title, message].filter(Boolean).join("\n\n");
  const confirmer = globalThis as unknown as {
    alert?: (m: string) => void;
    confirm?: (m: string) => boolean;
  };

  if (!buttons || buttons.length <= 1) {
    confirmer.alert?.(body);
    buttons?.[0]?.onPress?.();
    return;
  }

  // A two-button alert is a confirmation: the button that is not "cancel"
  // carries the action.
  const action = buttons.find((b) => b.style !== "cancel") ?? buttons[buttons.length - 1];
  const cancel = buttons.find((b) => b.style === "cancel");
  if (confirmer.confirm?.(body)) action.onPress?.();
  else cancel?.onPress?.();
}
