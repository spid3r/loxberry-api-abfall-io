/** Lowercase + strip diacritics so e.g. "wurzbur" matches "Würzburg" in list search. */
export function foldForSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    /* prefer bracket form over \p{M} for older Node on some LoxBerry images */
    .replace(/[\u0300-\u036f]/g, "");
}
