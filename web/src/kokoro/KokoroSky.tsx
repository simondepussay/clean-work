import { useId } from "react";
import type { MoodWeather } from "../api";

/**
 * Le ciel de l'onglet « こころ », à la manière d'une estampe (浮世絵), aux trois quarts :
 *  - ぼかし : le dégradé de couleur en haut du ciel, comme sur les estampes ;
 *  - すやり霞 : les longues bandes de brume en escalier, à la place des nuages ronds ;
 *  - le soleil : un disque vermillon, plat ;
 *  - la pluie : de longs traits d'encre fins et droits, comme l'« Averse sur le pont Shin-Ōhashi » d'Hiroshige ;
 *  - en bas, une bande de 青海波 (vagues concentriques), qui rappelle les vagues de la marque ;
 *  - un grain de papier washi, et un petit sceau rouge 「心」.
 */

type Palette = { top: string; mid: string; bottom: string; band: string; bandLine: string };
const PALETTES: Record<MoodWeather | "none", Palette> = {
  none: { top: "#b9cbe0", mid: "#e4e6e0", bottom: "#f4ecdc", band: "#f7f0e2", bandLine: "#7d93b2" },
  sunny: { top: "#e48f5c", mid: "#f3d3a6", bottom: "#f6ecd8", band: "#ecc77c", bandLine: "#b07d35" },
  cloudy: { top: "#8fa4bd", mid: "#d6dad6", bottom: "#efe8d8", band: "#f6f1e5", bandLine: "#6e86a6" },
  rainy: { top: "#6c7684", mid: "#a9aca6", bottom: "#d9d2c1", band: "#8a909a", bandLine: "#4b5361" },
};

/** Une bande de すやり霞 : un long trait arrondi, avec une marche plus courte au-dessus. */
function band(x: number, y: number, w: number, h = 16) {
  const r = h / 2;
  const a = x + w * 0.28;
  const b = x + w * 0.82;
  const t = h * 0.75;
  const rt = t / 2;
  return `M${x + r},${y} H${a} V${y - t + rt} A${rt},${rt} 0 0 1 ${a + rt},${y - t} H${b - rt} A${rt},${rt} 0 0 1 ${b},${y - t + rt} V${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
}

const BANDS: Record<MoodWeather | "none", [number, number, number][]> = {
  none: [[40, 70, 190], [470, 120, 180]],
  sunny: [[30, 112, 210], [420, 150, 230]],
  cloudy: [[-30, 58, 260], [380, 86, 300], [120, 140, 240], [520, 170, 220]],
  rainy: [[-40, 46, 300], [360, 70, 360], [200, 118, 220]],
};

/** Traits de pluie : positions fixes (pas de hasard d'un affichage à l'autre). */
const RAIN = Array.from({ length: 64 }, (_, i) => {
  const x = ((i * 53) % 760) - 40;
  const dash = 60 + ((i * 37) % 90);
  const gap = 120 + ((i * 29) % 140);
  return { x, dash, gap, delay: -((i * 0.17) % 1.4), width: i % 5 === 0 ? 1.6 : 1 };
});

export function KokoroSky({ weather }: { weather?: MoodWeather }) {
  const id = useId().replace(/:/g, "");
  const key = weather ?? "none";
  const p = PALETTES[key];
  return (
    <div className={`kokoro-sky ${key}`} aria-hidden="true">
      <svg viewBox="0 0 700 340" preserveAspectRatio="xMidYMid slice" className="sky-print">
        <defs>
          <linearGradient id={`${id}-bokashi`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={p.top} />
            <stop offset="0.45" stopColor={p.mid} />
            <stop offset="1" stopColor={p.bottom} />
          </linearGradient>
          {/* 青海波 : trois cercles concentriques par écaille, rangées décalées. */}
          <pattern id={`${id}-seigaiha`} width="40" height="20" patternUnits="userSpaceOnUse">
            {[[0, 10], [40, 10], [20, 20]].map(([cx, cy]) => (
              <g key={`${cx}-${cy}`}>
                {[19, 14, 9, 4].map((r) => <circle key={r} cx={cx} cy={cy} r={r} fill="#f4ecdc" stroke="#2f4c7a" strokeWidth="1.3" />)}
              </g>
            ))}
          </pattern>
          <filter id={`${id}-washi`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer><feFuncA type="table" tableValues="0 0.10" /></feComponentTransfer>
          </filter>
        </defs>

        <rect width="700" height="340" fill={`url(#${id}-bokashi)`} />

        {key === "sunny" && (
          <g className="sky-sun">
            <circle cx="560" cy="86" r="40" fill="#c8432f" />
            <circle cx="560" cy="86" r="48" fill="none" stroke="#c8432f" strokeWidth="1" opacity="0.5" />
          </g>
        )}

        <g className="sky-bands">
          {BANDS[key].map(([x, y, w], i) => (
            <path key={i} d={band(x, y, w)} fill={p.band} stroke={p.bandLine} strokeWidth="1.2" strokeLinejoin="round" opacity={key === "rainy" ? 0.85 : 0.95} />
          ))}
        </g>

        {key === "rainy" && (
          <g className="sky-rain" stroke="#2c3443" strokeLinecap="round">
            {RAIN.map((r, i) => (
              <line key={i} x1={r.x} y1="-20" x2={r.x - 58} y2="300" strokeWidth={r.width} opacity="0.55"
                strokeDasharray={`${r.dash} ${r.gap}`} style={{ animationDelay: `${r.delay}s` }} />
            ))}
          </g>
        )}

        {/* La bande de vagues, posée sur une ligne de vague comme le bas d'une estampe. */}
        <path d="M0 300 C90 286 170 286 250 298 S420 312 520 298 S640 286 700 296 V340 H0 Z" fill={`url(#${id}-seigaiha)`} />
        <path d="M0 300 C90 286 170 286 250 298 S420 312 520 298 S640 286 700 296" fill="none" stroke="#2f4c7a" strokeWidth="2" />

        {/* Sceau 「心」. */}
        <g transform="translate(628 238)">
          <rect width="34" height="34" rx="3" fill="#a3252c" />
          <text x="17" y="25" textAnchor="middle" fontSize="22" fill="#f6ecd8" fontFamily="'Hiragino Mincho ProN','Yu Mincho',serif" fontWeight="700">心</text>
        </g>

        <rect width="700" height="340" filter={`url(#${id}-washi)`} />
      </svg>
    </div>
  );
}
