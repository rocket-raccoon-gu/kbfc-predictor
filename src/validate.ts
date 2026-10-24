export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return digits;
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
