// SER-26: человеческие числа — разделители разрядов по-русски (1 234 567).
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

/** Деньги в игре хранятся в тысячах — «5 047K». */
export function fmtK(n: number): string {
  return `${fmtInt(n)}K`;
}

/** K с одной десятой (для разборов стоимости): 122 → «122K», 121.94 → «121,9K». */
export function fmtK1(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r)
    ? `${fmtInt(r)}K`
    : `${r.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`;
}
