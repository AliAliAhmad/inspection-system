/**
 * A name short enough for the board, long enough to tell two men apart.
 *
 * Ali, 2026-09-24: "the job pool shows only the employee first name which make
 * me confuse, please add the first name and the family name letter, example
 * ali.k.a.a". A yard has several Alis; the first word alone does not say which.
 *
 * The first name whole, then the first letter of every other part of the name:
 *
 *   "Ali Kadhim Abbas Ahmed"  -> "Ali.K.A.A"
 *   "Hassan"                  -> "Hassan"
 *   "علي كاظم عباس"           -> "علي.ك.ع"
 *
 * Arabic has no capitals, so toUpperCase leaves it as it is.
 */
export function shortName(fullName: string | null | undefined): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const [first, ...rest] = parts;
  return [first, ...rest.map((p) => p.charAt(0).toUpperCase())].join('.');
}
