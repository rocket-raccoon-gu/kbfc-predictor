/** Qatar mobile numbers only. The country code is locked to +974, and the national number is 8 digits. */
export function normalizePhone(raw: string, countryCode?: string): string | null {
  const explicit = countryCode !== undefined && countryCode.trim() !== "";
  if (explicit && countryCode.replace(/\D/g, "") !== "974") return null;

  let digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return null;
  if (digits.startsWith("974") && digits.length === 11) digits = digits.slice(3);
  if (!/^\d{8}$/.test(digits)) return null;
  return "974" + digits;
}

export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) return null;
  if (!/^[\p{L} .'-]+$/u.test(name)) return null;
  return name;
}

export function parseScore(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 20) return raw;
  if (typeof raw === "string" && /^\d{1,2}$/.test(raw.trim())) {
    const n = Number(raw.trim());
    if (n >= 0 && n <= 20) return n;
  }
  return null;
}

export function maskPhone(phone: string): string {
  return `•••• ${phone.slice(-4)}`;
}
