/**
 * Route colours.
 *
 * The twelve curated entries come first — they were picked against this map's
 * green ground and read better than anything generated. Beyond twelve the list
 * extends itself rather than wrapping around, which is what previously gave two
 * tours the same colour.
 */
const CURATED = [
  '#E8331B',
  '#7B1FA2',
  '#0F6FA8',
  '#C2185B',
  '#D4681A',
  '#4E342E',
  '#00838F',
  '#5E35B1',
  '#AD1457',
  '#283593',
  '#00695C',
  '#263238'
];

/**
 * Hues to skip when generating: the map's ground runs green, so a green route
 * disappears into it however saturated it is.
 */
const AVOID: Array<[number, number]> = [[68, 160]];

const avoided = (hue: number): boolean =>
  AVOID.some(([from, to]) => hue >= from && hue <= to);

/**
 * Build `count` distinct route colours.
 *
 * Generated entries walk the hue circle by the golden angle, which spreads them
 * without ever landing on a previous one, and skip the green band.
 */
export function routeColours(count: number): string[] {
  const out = CURATED.slice(0, Math.min(count, CURATED.length));
  let hue = 20;
  let guard = 0;
  while (out.length < count && guard < 400) {
    guard += 1;
    hue = (hue + 137.508) % 360;
    if (avoided(hue)) {
      continue;
    }
    // alternate lightness so neighbours in the sequence stay apart
    const light = out.length % 2 === 0 ? 38 : 27;
    out.push(hslToHex(hue, 72, light));
  }
  return out;
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number): number =>
    lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const byte = (v: number): string =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(f(0))}${byte(f(8))}${byte(f(4))}`.toUpperCase();
}
