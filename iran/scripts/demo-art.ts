/**
 * Illustrated dish photos for the demo restaurant: a top-down plate on a tabletop, drawn per
 * recipe (kebab on saffron rice, stew in a bowl, tea in a glass…). SVG, rasterised by the seed
 * through the same pipeline as real uploads. Deterministic: the same name gives the same picture.
 */

const W = 1200;
const H = 900;
const CX = 600;
const CY = 450;

/** Small seeded PRNG so every dish gets its own (stable) arrangement. */
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
type Rand = ReturnType<typeof rng>;
const between = (r: Rand, a: number, b: number) => a + (b - a) * r();
const f = (n: number) => n.toFixed(1);

const leaf = (x: number, y: number, s: number, rot: number, fill = "#4f8a3a") =>
  `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${s})"><path d="M0,-30 C19,-19 19,19 0,30 C-19,19 -19,-19 0,-30Z" fill="${fill}"/><path d="M0,-26 L0,26" stroke="rgba(255,255,255,.35)" stroke-width="2"/></g>`;

/** Scattered bits (herbs, grains, spices) inside a circle. */
function scatter(
  r: Rand,
  n: number,
  cx: number,
  cy: number,
  radius: number,
  draw: (x: number, y: number, i: number) => string,
) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * radius;
    out += draw(cx + Math.cos(a) * d, cy + Math.sin(a) * d, i);
  }
  return out;
}

const DEFS = `<defs>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
  <radialGradient id="vignette" cx="50%" cy="45%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".22"/></radialGradient>
  <radialGradient id="plate" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ece7de"/></radialGradient>
  <radialGradient id="shine" cx="35%" cy="30%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>`;

function table(bg: string, r: Rand) {
  // Linen tabletop with soft weave lines and a few scattered herbs at the edges.
  let weave = "";
  for (let y = 0; y < H; y += 18)
    weave += `<path d="M0 ${y} H${W}" stroke="rgba(0,0,0,.025)" stroke-width="2"/>`;
  const herbs = [
    [110, 160],
    [1080, 740],
    [150, 760],
    [1070, 150],
  ]
    .map(([x, y]) => leaf(x!, y!, between(r, 0.9, 1.3), r() * 360, "#5d8f45"))
    .join("");
  return `<rect width="${W}" height="${H}" fill="${bg}"/>${weave}<g opacity=".75">${herbs}</g>`;
}

function plate(radius = 330, cx = CX, cy = CY) {
  return `<ellipse cx="${cx + 18}" cy="${cy + 34}" rx="${radius}" ry="${radius * 0.96}" fill="rgba(60,35,10,.32)" filter="url(#shadow)"/>
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#plate)"/>
  <circle cx="${cx}" cy="${cy}" r="${radius * 0.76}" fill="#f6f2ea" stroke="rgba(0,0,0,.05)" stroke-width="3"/>`;
}

function bowl(radius: number, cx: number, cy: number, fill: string) {
  return `<ellipse cx="${cx + 14}" cy="${cy + 26}" rx="${radius}" ry="${radius * 0.95}" fill="rgba(60,35,10,.3)" filter="url(#shadow)"/>
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#plate)"/>
  <circle cx="${cx}" cy="${cy}" r="${radius * 0.82}" fill="${fill}"/>
  <circle cx="${cx}" cy="${cy}" r="${radius * 0.82}" fill="url(#shine)" opacity=".5"/>`;
}

/** Saffron rice mound: white grains with a golden cap. */
function rice(r: Rand, cx: number, cy: number, radius: number, extra = "") {
  const grains = scatter(
    r,
    140,
    cx,
    cy,
    radius * 0.92,
    (x, y) =>
      `<ellipse cx="${f(x)}" cy="${f(y)}" rx="9" ry="3.5" fill="#fffdf6" stroke="rgba(0,0,0,.05)" transform="rotate(${f(r() * 180)} ${f(x)} ${f(y)})"/>`,
  );
  const cap = scatter(
    r,
    45,
    cx - radius * 0.25,
    cy - radius * 0.25,
    radius * 0.45,
    (x, y) =>
      `<ellipse cx="${f(x)}" cy="${f(y)}" rx="9" ry="3.5" fill="#f1a92a" transform="rotate(${f(r() * 180)} ${f(x)} ${f(y)})"/>`,
  );
  return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#fbf4e4"/>${grains}${cap}${extra}`;
}

function skewer(x: number, y: number, len: number, w: number, rot: number, color: string, mark: string) {
  let marks = "";
  for (let i = -len / 2 + 30; i < len / 2 - 20; i += 46)
    marks += `<path d="M${i} ${-w / 2 + 6} l18 ${w - 12}" stroke="${mark}" stroke-width="9" stroke-linecap="round" opacity=".7"/>`;
  return `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="${-len / 2}" y="${-w / 2}" width="${len}" height="${w}" rx="${w / 2}" fill="${color}"/>
  <rect x="${-len / 2 + 10}" y="${-w / 2 + 6}" width="${len - 20}" height="${w * 0.28}" rx="${w * 0.14}" fill="rgba(255,255,255,.14)"/>${marks}</g>`;
}

function tomato(x: number, y: number, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><circle r="52" fill="#c8361f"/><circle r="52" fill="url(#shine)"/>
  <path d="M-30,-8 q30,-30 60,0" stroke="#8f1f10" stroke-width="5" fill="none" opacity=".5"/><path d="M0,-50 l-8,-14 m8,14 l10,-12" stroke="#3f6b2a" stroke-width="7" stroke-linecap="round"/></g>`;
}

/** Spoonful of thick dip (kashk-e bademjan, mirza ghasemi, yogurt…) with a swirl and garnish. */
function dip(r: Rand, base: string, swirl: string, garnish: (x: number, y: number) => string) {
  let spiral = "M600 450";
  for (let a = 0; a < Math.PI * 7; a += 0.25) {
    const d = 12 + a * 13;
    spiral += ` L${f(600 + Math.cos(a) * d)} ${f(450 + Math.sin(a) * d)}`;
  }
  return `${plate()}<circle cx="600" cy="450" r="215" fill="${base}"/><circle cx="600" cy="450" r="215" fill="url(#shine)" opacity=".6"/>
  <path d="${spiral}" stroke="${swirl}" stroke-width="16" fill="none" stroke-linecap="round" opacity=".85"/>
  ${scatter(r, 12, 600, 450, 170, garnish)}`;
}

const mint = (r: Rand) => (x: number, y: number) => leaf(x, y, 0.8, r() * 360, "#3f7d35");
const onion = (r: Rand) => (x: number, y: number) =>
  `<path d="M${f(x)} ${f(y)} q14 -10 26 4" stroke="#7a3d12" stroke-width="7" fill="none" stroke-linecap="round" transform="rotate(${f(r() * 360)} ${f(x)} ${f(y)})"/>`;
const walnut = (x: number, y: number) =>
  `<ellipse cx="${f(x)}" cy="${f(y)}" rx="14" ry="11" fill="#8b5a2b"/><path d="M${f(x - 10)} ${f(y)} h20" stroke="#5e3a17" stroke-width="3"/>`;

function stew(r: Rand, sauce: string, bits: (x: number, y: number, i: number) => string, riceSide = true) {
  return `${plate()}${riceSide ? rice(r, 470, 470, 170) : ""}${bowl(165, riceSide ? 745 : 600, riceSide ? 420 : 450, sauce)}
  ${scatter(r, 22, riceSide ? 745 : 600, riceSide ? 420 : 450, 115, bits)}`;
}

function soup(r: Rand, base: string, kashk: boolean) {
  const swirl = kashk
    ? `<path d="M520 430 q40 -60 90 -10 t90 0" stroke="#f7f0de" stroke-width="22" fill="none" stroke-linecap="round"/><path d="M540 500 q60 30 120 -10" stroke="#2f5a22" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>`
    : `<circle cx="600" cy="450" r="60" fill="rgba(255,255,255,.18)"/>`;
  return `${bowl(300, 600, 450, base)}${scatter(r, 34, 600, 450, 210, (x, y, i) =>
    i % 3 === 0
      ? `<rect x="${f(x)}" y="${f(y)}" width="16" height="16" rx="4" fill="#e07a2e" transform="rotate(${f(r() * 90)} ${f(x)} ${f(y)})"/>`
      : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(between(r, 4, 8))}" fill="${i % 2 ? "#3d6e2c" : "#c9a36a"}"/>`,
  )}${swirl}${kashk ? scatter(r, 9, 600, 450, 160, onion(r)) : ""}`;
}

function salad(r: Rand, caesar: boolean) {
  const pieces = caesar
    ? scatter(r, 26, 600, 450, 230, (x, y, i) =>
        i % 4 === 0
          ? `<rect x="${f(x)}" y="${f(y)}" width="34" height="30" rx="7" fill="#e3b56a" transform="rotate(${f(r() * 90)} ${f(x)} ${f(y)})"/>`
          : leaf(x, y, between(r, 1.6, 2.4), r() * 360, i % 2 ? "#6fa543" : "#8cbf55"),
      ) +
      scatter(r, 10, 600, 450, 200, (x, y) => `<path d="M${f(x)} ${f(y)} l30 -6 l-4 14 z" fill="#f4ecd2"/>`)
    : scatter(r, 70, 600, 450, 230, (x, y, i) => {
        const c = ["#d33b2a", "#7bb04a", "#f2eee0", "#5f9a3a"][i % 4];
        return `<rect x="${f(x)}" y="${f(y)}" width="26" height="26" rx="6" fill="${c}" transform="rotate(${f(r() * 90)} ${f(x)} ${f(y)})"/>`;
      }) + scatter(r, 8, 600, 450, 200, mint(r));
  return `${bowl(310, 600, 450, caesar ? "#eef3e2" : "#f3efe2")}${pieces}`;
}

function kebab(r: Rand, kind: "koobideh" | "joojeh" | "barg") {
  let meat = "";
  if (kind === "koobideh") {
    meat =
      skewer(730, 380, 420, 74, -28, "#8a4524", "#4e2511") +
      skewer(770, 500, 420, 74, -28, "#93502b", "#4e2511");
  } else if (kind === "barg") {
    meat = skewer(745, 445, 440, 150, -28, "#9b5a33", "#5a2c12");
  } else {
    meat = scatter(
      r,
      9,
      760,
      440,
      110,
      (x, y) =>
        `<rect x="${f(x - 32)}" y="${f(y - 30)}" width="64" height="58" rx="16" fill="#e0862c" transform="rotate(${f(r() * 60)} ${f(x)} ${f(y)})"/><path d="M${f(x - 18)} ${f(y - 8)} l30 14" stroke="#9c4a12" stroke-width="7" stroke-linecap="round"/>`,
    );
  }
  return `${plate()}${rice(r, 455, 470, 175)}${meat}${tomato(560, 650, 0.9)}${leaf(830, 640, 1.1, 30)}${leaf(870, 610, 0.9, -20)}`;
}

function dessert(r: Rand, kind: "bastani" | "faloodeh" | "sholeh") {
  if (kind === "bastani")
    return `${bowl(290, 600, 450, "#f6efe2")}${[
      [530, 400],
      [680, 420],
      [600, 540],
    ]
      .map(
        ([x, y]) =>
          `<circle cx="${x}" cy="${y}" r="108" fill="#f2c94c"/><circle cx="${x}" cy="${y}" r="108" fill="url(#shine)"/>`,
      )
      .join(
        "",
      )}${scatter(r, 40, 600, 460, 170, (x, y) => `<rect x="${f(x)}" y="${f(y)}" width="10" height="6" rx="2" fill="#7fa83a"/>`)}`;
  if (kind === "faloodeh") {
    let noodles = "";
    for (let i = 0; i < 26; i++)
      noodles += `<path d="M${f(between(r, 430, 700))} ${f(between(r, 320, 560))} q40 ${f(between(r, -40, 40))} 80 0 t80 0" stroke="#fbf8f0" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    return `${bowl(290, 600, 450, "#f1e7da")}<path d="M520 470 q80 -70 170 0 q-30 70 -110 60 z" fill="#c2273a" opacity=".85"/>${noodles}<circle cx="730" cy="360" r="40" fill="#f6e27a"/><circle cx="730" cy="360" r="30" fill="#fbf0a8"/>`;
  }
  let pattern = "";
  for (let i = -2; i <= 2; i++)
    pattern += `<path d="M${520 + i * 40} 340 v220 M480 ${450 + i * 40} h240" stroke="#8b4a1e" stroke-width="8" opacity=".7" stroke-linecap="round"/>`;
  return `${bowl(290, 600, 450, "#f0b62f")}${pattern}${scatter(r, 14, 600, 450, 190, (x, y) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="13" ry="5" fill="#f7e9c8" transform="rotate(${f(r() * 180)} ${f(x)} ${f(y)})"/>`)}`;
}

function teaGlass(liquid: string, garnish = "") {
  return `<ellipse cx="620" cy="485" rx="250" ry="240" fill="rgba(60,35,10,.3)" filter="url(#shadow)"/>
  <circle cx="600" cy="450" r="250" fill="url(#plate)"/><circle cx="600" cy="450" r="185" fill="#f3eee4"/>
  <circle cx="600" cy="450" r="150" fill="#f6e7bf" stroke="#d9a63a" stroke-width="12"/>
  <circle cx="600" cy="450" r="132" fill="${liquid}"/><circle cx="600" cy="450" r="132" fill="url(#shine)" opacity=".7"/>
  <g fill="#fbf6ea" stroke="rgba(0,0,0,.06)"><rect x="840" y="560" width="48" height="48" rx="8"/><rect x="890" y="600" width="44" height="44" rx="8" transform="rotate(14 912 622)"/></g>${garnish}`;
}

function cup(liquid: string) {
  return `<ellipse cx="620" cy="485" rx="240" ry="232" fill="rgba(60,35,10,.3)" filter="url(#shadow)"/>
  <circle cx="600" cy="450" r="240" fill="url(#plate)"/><circle cx="600" cy="450" r="150" fill="#fff" stroke="#e8e2d7" stroke-width="6"/>
  <path d="M748 430 q70 0 70 40 q0 40 -70 40" stroke="#fff" stroke-width="26" fill="none"/>
  <circle cx="600" cy="450" r="120" fill="${liquid}"/><circle cx="600" cy="450" r="96" fill="none" stroke="#a5703f" stroke-width="10" opacity=".7"/>
  <circle cx="600" cy="450" r="120" fill="url(#shine)" opacity=".5"/>`;
}

function glass(r: Rand, liquid: string, garnish: "mint" | "lemon" | "cucumber" | "none") {
  const ice = scatter(
    r,
    5,
    600,
    450,
    90,
    (x, y) =>
      `<rect x="${f(x - 32)}" y="${f(y - 32)}" width="64" height="64" rx="14" fill="rgba(255,255,255,.45)" stroke="rgba(255,255,255,.7)" stroke-width="3" transform="rotate(${f(r() * 90)} ${f(x)} ${f(y)})"/>`,
  );
  const g =
    garnish === "mint"
      ? leaf(650, 380, 1.4, 30, "#3f7d35") + leaf(610, 360, 1.2, -40, "#4f8a3a")
      : garnish === "lemon"
        ? `<circle cx="660" cy="390" r="62" fill="#f4d23c"/><circle cx="660" cy="390" r="50" fill="#fbe98a"/><path d="M660 340 v100 M610 390 h100 M625 355 l70 70 M695 355 l-70 70" stroke="#f4d23c" stroke-width="5"/>`
        : garnish === "cucumber"
          ? `<circle cx="650" cy="390" r="55" fill="#4f8a3a"/><circle cx="650" cy="390" r="44" fill="#cfe6a8"/>`
          : "";
  return `<ellipse cx="620" cy="485" rx="215" ry="208" fill="rgba(60,35,10,.28)" filter="url(#shadow)"/>
  <circle cx="600" cy="450" r="210" fill="rgba(255,255,255,.75)" stroke="rgba(255,255,255,.95)" stroke-width="10"/>
  <circle cx="600" cy="450" r="185" fill="${liquid}"/>${ice}${g}<circle cx="600" cy="450" r="185" fill="url(#shine)" opacity=".8"/>`;
}

const BG: Record<string, string> = {
  starters: "#efe1cf",
  soups: "#e8d6c0",
  salads: "#e2ead6",
  meat: "#efdcc6",
  mains: "#ecdfca",
  desserts: "#f4e2e3",
  tea: "#e9d9c4",
  soft_drinks: "#d9e8ec",
};

/** Picks the drawing from the dish name (Persian demo menu), else from its category. */
function draw(name: string, key: string, r: Rand) {
  const has = (...w: string[]) => w.some((x) => name.includes(x));
  if (has("کشک بادمجان"))
    return dip(r, "#b98a5c", "#f4ead2", (x, y) => (r() > 0.5 ? walnut(x, y) : onion(r)(x, y)));
  if (has("میرزا")) return dip(r, "#d77a3c", "#f3d27a", mint(r));
  if (has("ماست")) return dip(r, "#f7f4ec", "#c9d9b5", mint(r));
  if (has("آش")) return soup(r, "#a8a457", true);
  if (has("سوپ")) return soup(r, "#e8c48a", false);
  if (has("سزار")) return salad(r, true);
  if (has("سالاد")) return salad(r, false);
  if (has("کوبیده")) return kebab(r, "koobideh");
  if (has("جوجه")) return kebab(r, "joojeh");
  if (has("برگ")) return kebab(r, "barg");
  if (has("قورمه"))
    return stew(r, "#3f4f1f", (x, y, i) =>
      i % 3
        ? `<ellipse cx="${f(x)}" cy="${f(y)}" rx="12" ry="8" fill="#5a1d17"/>`
        : `<rect x="${f(x)}" y="${f(y)}" width="20" height="18" rx="5" fill="#6b3a22"/>`,
    );
  if (has("قیمه"))
    return stew(r, "#b8441f", (x, y, i) =>
      i % 2
        ? `<rect x="${f(x)}" y="${f(y)}" width="38" height="9" rx="4" fill="#f2c45a" transform="rotate(${f(r() * 180)} ${f(x)} ${f(y)})"/>`
        : `<circle cx="${f(x)}" cy="${f(y)}" r="9" fill="#e3b24f"/>`,
    );
  if (has("زرشک"))
    return `${plate()}${rice(
      r,
      540,
      460,
      220,
      scatter(r, 40, 520, 430, 120, (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="7" fill="#b3152b"/>`),
    )}
    <path d="M700 520 q90 -80 150 20 q-40 90 -150 40 z" fill="#d98a3a"/><path d="M720 540 q60 -40 110 10" stroke="#a85a1c" stroke-width="10" fill="none"/>`;
  if (has("باقالی"))
    return `${plate()}${rice(r, 500, 450, 220, scatter(r, 70, 500, 450, 200, (x, y) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="9" ry="6" fill="#8fb34a"/>`) + scatter(r, 30, 500, 450, 200, (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="3" fill="#3f6b2a"/>`))}
    <ellipse cx="760" cy="470" rx="105" ry="140" fill="#7a3b1f" transform="rotate(-20 760 470)"/><rect x="800" y="300" width="22" height="90" rx="11" fill="#f2e6d0" transform="rotate(-20 811 345)"/>`;
  if (has("بستنی")) return dessert(r, "bastani");
  if (has("فالوده")) return dessert(r, "faloodeh");
  if (has("شله")) return dessert(r, "sholeh");
  if (has("قهوه")) return cup("#3b2416");
  if (has("دمنوش"))
    return teaGlass("#7b4a9e", `<circle cx="690" cy="380" r="34" fill="#e8c24a" opacity=".9"/>`);
  if (has("چای"))
    return teaGlass(
      "#9c3412",
      `<rect x="800" y="330" width="26" height="170" rx="13" fill="#e9b949" transform="rotate(25 813 415)"/>`,
    );
  if (has("دوغ")) return glass(r, "#f4f6f0", "mint");
  if (has("سکنجبین")) return glass(r, "#cfe3a1", "cucumber");
  if (has("نوشابه")) return glass(r, "#3a1d12", "lemon");
  if (has("آب")) return glass(r, "#d8ecf3", "lemon");
  // Generic by category
  if (key === "soft_drinks") return glass(r, "#f4b04c", "lemon");
  if (key === "tea" || key === "coffee") return cup("#4a2b18");
  if (key === "desserts") return dessert(r, "bastani");
  if (key === "salads") return salad(r, false);
  if (key === "soups") return soup(r, "#e8c48a", false);
  if (key === "meat" || key === "steak") return kebab(r, "koobideh");
  if (key === "starters") return dip(r, "#e7d2a8", "#c99a5a", mint(r));
  return stew(r, "#a4532a", (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="9" fill="#6b3a22"/>`);
}

export function dishSvg(name: string, key: string) {
  const r = rng(name + key);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS}
  ${table(BG[key] ?? "#ece2d4", r)}
  <g transform="translate(${CX} ${CY}) scale(1.22) translate(${-CX} ${-CY})">${draw(name, key, r)}</g>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/></svg>`;
}
