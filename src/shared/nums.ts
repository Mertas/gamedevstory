// SER-26: человеческие числа — разделители разрядов по-русски (1 234 567).
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

/** Деньги в игре хранятся в тысячах — «5 047K». */
export function fmtK(n: number): string {
  return `${fmtInt(n)}K`;
}
