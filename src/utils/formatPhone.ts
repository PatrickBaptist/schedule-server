export function formatPhone(phone?: string | null): string | null {
  if (!phone) return null;

  let digits = phone.replace(/\D/g, "");

  if (!digits) return null;

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  }

  throw new Error("Telefone inválido. Use 11 dígitos, com ou sem DDI 55.");
}
