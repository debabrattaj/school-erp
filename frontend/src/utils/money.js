import { useSchoolSettings } from "../SettingsContext";

// A reasonable locale per currency so grouping/symbol placement look right.
const LOCALE_BY_CURRENCY = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
  AED: "en-AE",
  SGD: "en-SG",
  AUD: "en-AU",
  CAD: "en-CA",
  JPY: "ja-JP",
};

export function formatMoney(amount, currency = "INR") {
  const code = (currency || "INR").toUpperCase();
  const value = Number(amount || 0);
  try {
    return new Intl.NumberFormat(LOCALE_BY_CURRENCY[code], {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Unknown/invalid currency code — fall back to a plain formatted number.
    return `${code} ${value.toLocaleString()}`;
  }
}

// Hook that formats using the school's configured currency.
export function useMoney() {
  const ctx = useSchoolSettings();
  const currency = ctx?.settings?.currency || "INR";
  return (amount) => formatMoney(amount, currency);
}
