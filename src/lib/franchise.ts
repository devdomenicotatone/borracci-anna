// Dizionario dei FRANCHISE/TEMI (saga/serie/brand) e riconoscimento dal NOME.
//
// Dalla migration 20260707150000 il tema vive nella colonna `prodotti.tema`
// (lo slug di questo dizionario): filtro e conteggi dei chip passano da li,
// esatti e lato DB (vedi lib/vetrina). Questo dizionario resta:
//   - il CLASSIFICATORE in scrittura: suggerisce il tema dal nome nel form
//     prodotto del gestore e classifica i prodotti creati da import/AI
//     (franchiseDiNome), oltre al backfill una-tantum della migration;
//   - il catalogo di slug/etichette dei temi (select nel form, chip);
//   - il FALLBACK in lettura (contaFranchise/appartieneAlChip sui nomi, come
//     prima della colonna) finche la migration non e applicata.
// I conteggi sono per-categoria: lo stesso dizionario vale ovunque, ma in "Film"
// emergono Harry Potter/Marvel, in "Anime" One Piece/Naruto, in "Gaming" Call of
// Duty... — quelli con zero match semplicemente non compaiono.
//
// INVARIANTE (chip = partizione): i chip di una categoria, incluso "Altro",
// coprono TUTTI i prodotti una volta sola. Somma dei numeri = totale prodotti:
// niente prodotti "spariti" tra un chip e l'altro.
//
// REGOLA per le `parole`: preferire termini UNIVOCI del franchise (nomi propri,
// titoli) ed evitare parole comuni/ambigue. Meglio contare 14 invece di 15 che
// infilare un prodotto sbagliato in un chip. Tutte in minuscolo: il match e
// `nome.toLowerCase().includes(parola)`.

import type { FranchiseConteggio } from "@/lib/filtri-catalogo";

/**
 * Slug riservato del chip "Altro": prodotti senza tema (colonna `tema` NULL)
 * PIU quelli di temi sotto soglia (senza chip proprio). Non e nel dizionario:
 * e il complemento dei chip visibili, cosi i numeri sommano al totale della
 * categoria.
 */
export const FRANCHISE_ALTRO = "altro";
const ETICHETTA_ALTRO = "Altro";

export interface Franchise {
  /** Slug per l'URL (?franchise=harry-potter). */
  slug: string;
  /** Etichetta mostrata sul chip. */
  etichetta: string;
  /** Parole-chiave univoche: se una compare nel nome, il prodotto e del franchise. */
  parole: string[];
}

// L'ordine conta solo per i (rari) nomi che matchano piu franchise: vince il
// primo. Raggruppati per mondo, ma il conteggio e sempre per categoria.
export const FRANCHISE: Franchise[] = [
  // — Film & Serie TV —
  { slug: "harry-potter", etichetta: "Harry Potter", parole: ["harry potter", "hogwarts", "hermione", "voldemort", "grifondoro", "serpeverde", "corvonero", "tassorosso", "silente", "animali fantastici", "fantastic beasts"] },
  { slug: "star-wars", etichetta: "Star Wars", parole: ["star wars", "guerre stellari", "darth vader", "yoda", "mandalorian", "grogu", "stormtrooper", "skywalker", "boba fett", "jedi"] },
  { slug: "marvel", etichetta: "Marvel", parole: ["marvel", "avengers", "spider-man", "spiderman", "iron man", "capitan america", "captain america", "deadpool", "wolverine", "venom", "hulk", "thor", "loki", "black panther", "punisher"] },
  { slug: "dc", etichetta: "DC Comics", parole: ["batman", "superman", "joker", "wonder woman", "aquaman", "harley quinn"] },
  { slug: "stranger-things", etichetta: "Stranger Things", parole: ["stranger things", "demogorgon", "hellfire", "hawkins"] },
  { slug: "squid-game", etichetta: "Squid Game", parole: ["squid game"] },
  { slug: "casa-di-carta", etichetta: "La Casa di Carta", parole: ["casa di carta", "money heist"] },
  { slug: "rick-morty", etichetta: "Rick & Morty", parole: ["rick and morty", "rick & morty", "rick e morty", "rick morty"] },
  { slug: "simpsons", etichetta: "I Simpson", parole: ["simpson"] },
  { slug: "lupin", etichetta: "Lupin III", parole: ["lupin"] },
  { slug: "diabolik", etichetta: "Diabolik", parole: ["diabolik"] },
  { slug: "jurassic-park", etichetta: "Jurassic Park", parole: ["jurassic"] },
  { slug: "top-gun", etichetta: "Top Gun", parole: ["top gun", "maverick"] },
  { slug: "nightmare-christmas", etichetta: "Nightmare Before Christmas", parole: ["nightmare before christmas", "jack skellington"] },
  { slug: "witcher", etichetta: "The Witcher", parole: ["witcher", "geralt"] },
  { slug: "predator", etichetta: "Predator", parole: ["predator"] },
  { slug: "scooby-doo", etichetta: "Scooby-Doo", parole: ["scooby"] },
  // — Anime & Manga —
  { slug: "one-piece", etichetta: "One Piece", parole: ["one piece", "luffy", "rufy", "zoro"] },
  { slug: "naruto", etichetta: "Naruto", parole: ["naruto", "sasuke", "uzumaki", "akatsuki"] },
  { slug: "holly-benji", etichetta: "Holly & Benji", parole: ["holly benji", "holly e benji", "captain tsubasa", "tsubasa"] },
  { slug: "attack-on-titan", etichetta: "Attack on Titan", parole: ["attack on titan", "shingeki", "eren", "mikasa"] },
  { slug: "bleach", etichetta: "Bleach", parole: ["bleach", "kurosaki", "soul reaper", "soulreaper"] },
  { slug: "my-hero-academia", etichetta: "My Hero Academia", parole: ["my hero academia", "boku no hero", "deku"] },
  { slug: "death-note", etichetta: "Death Note", parole: ["death note"] },
  { slug: "junji-ito", etichetta: "Junji Ito", parole: ["junji ito"] },
  { slug: "sakamoto-days", etichetta: "Sakamoto Days", parole: ["sakamoto days"] },
  { slug: "dragon-ball", etichetta: "Dragon Ball", parole: ["dragon ball", "goku", "vegeta", "saiyan"] },
  { slug: "demon-slayer", etichetta: "Demon Slayer", parole: ["demon slayer", "kimetsu", "tanjiro", "nezuko"] },
  { slug: "pokemon", etichetta: "Pokémon", parole: ["pokemon", "pokémon", "pikachu"] },
  // — Gaming —
  { slug: "call-of-duty", etichetta: "Call of Duty", parole: ["call of duty", "warzone"] },
  { slug: "assassins-creed", etichetta: "Assassin's Creed", parole: ["assassin"] },
  { slug: "super-mario", etichetta: "Super Mario", parole: ["super mario", "mario bros", "nintendo"] },
  { slug: "among-us", etichetta: "Among Us", parole: ["among us"] },
  { slug: "fortnite", etichetta: "Fortnite", parole: ["fortnite"] },
  { slug: "minecraft", etichetta: "Minecraft", parole: ["minecraft"] },
  { slug: "space-invaders", etichetta: "Space Invaders", parole: ["space invaders"] },
  { slug: "zelda", etichetta: "Zelda", parole: ["zelda", "hyrule"] },
  { slug: "sonic", etichetta: "Sonic", parole: ["sonic"] },
  { slug: "pac-man", etichetta: "Pac-Man", parole: ["pac-man", "pacman"] },
  // — Calcio (squadre) —
  { slug: "juventus", etichetta: "Juventus", parole: ["juventus", "juve"] },
  { slug: "milan", etichetta: "Milan", parole: ["milan"] },
  { slug: "inter", etichetta: "Inter", parole: ["inter"] },
  { slug: "napoli", etichetta: "Napoli", parole: ["napoli"] },
  { slug: "lazio", etichetta: "Lazio", parole: ["lazio"] },
  { slug: "fiorentina", etichetta: "Fiorentina", parole: ["fiorentina"] },
  { slug: "roma", etichetta: "Roma", parole: ["as roma"] },
  { slug: "real-madrid", etichetta: "Real Madrid", parole: ["real madrid"] },
  { slug: "barcellona", etichetta: "Barcellona", parole: ["barcellona", "barcelona"] },
  { slug: "atletico-madrid", etichetta: "Atlético Madrid", parole: ["atletico madrid", "atletico"] },
  { slug: "liverpool", etichetta: "Liverpool", parole: ["liverpool"] },
  { slug: "arsenal", etichetta: "Arsenal", parole: ["arsenal"] },
  { slug: "chelsea", etichetta: "Chelsea", parole: ["chelsea"] },
  { slug: "manchester-city", etichetta: "Manchester City", parole: ["manchester city", "man city"] },
  { slug: "manchester-united", etichetta: "Manchester United", parole: ["manchester united", "man united", "man utd"] },
  { slug: "bayern", etichetta: "Bayern Monaco", parole: ["bayern"] },
  { slug: "psg", etichetta: "Paris Saint-Germain", parole: ["paris saint", "psg"] },
  { slug: "maradona", etichetta: "Maradona", parole: ["maradona"] },
  // — Motorsport —
  { slug: "ferrari", etichetta: "Ferrari", parole: ["ferrari"] },
  { slug: "mercedes", etichetta: "Mercedes", parole: ["mercedes amg", "mercedes"] },
  { slug: "red-bull", etichetta: "Red Bull Racing", parole: ["red bull"] },
  { slug: "mclaren", etichetta: "McLaren", parole: ["mclaren"] },
  { slug: "formula-1", etichetta: "Formula 1", parole: ["formula 1", "formula1"] },
  { slug: "motogp", etichetta: "MotoGP", parole: ["motogp", "moto gp"] },
  { slug: "valentino-rossi", etichetta: "Valentino Rossi", parole: ["valentino rossi", "vr46"] },
  // — Musica (band/artisti) —
  { slug: "iron-maiden", etichetta: "Iron Maiden", parole: ["iron maiden"] },
  { slug: "ac-dc", etichetta: "AC/DC", parole: ["ac/dc", "ac dc", "acdc"] },
  { slug: "metallica", etichetta: "Metallica", parole: ["metallica"] },
  { slug: "linkin-park", etichetta: "Linkin Park", parole: ["linkin park"] },
  { slug: "led-zeppelin", etichetta: "Led Zeppelin", parole: ["led zeppelin"] },
  { slug: "black-sabbath", etichetta: "Black Sabbath", parole: ["black sabbath"] },
  { slug: "guns-n-roses", etichetta: "Guns N' Roses", parole: ["guns n"] },
  { slug: "pink-floyd", etichetta: "Pink Floyd", parole: ["pink floyd"] },
  { slug: "foo-fighters", etichetta: "Foo Fighters", parole: ["foo fighters"] },
  { slug: "sex-pistols", etichetta: "Sex Pistols", parole: ["sex pistols"] },
  { slug: "nirvana", etichetta: "Nirvana", parole: ["nirvana"] },
  { slug: "queen", etichetta: "Queen", parole: ["queen"] },
  { slug: "beatles", etichetta: "The Beatles", parole: ["beatles"] },
  { slug: "rolling-stones", etichetta: "Rolling Stones", parole: ["rolling stones"] },
  { slug: "ramones", etichetta: "Ramones", parole: ["ramones"] },
  { slug: "slipknot", etichetta: "Slipknot", parole: ["slipknot"] },
  { slug: "rammstein", etichetta: "Rammstein", parole: ["rammstein"] },
  { slug: "aerosmith", etichetta: "Aerosmith", parole: ["aerosmith"] },
  { slug: "avenged-sevenfold", etichetta: "Avenged Sevenfold", parole: ["avenged sevenfold"] },
  { slug: "bring-me-horizon", etichetta: "Bring Me the Horizon", parole: ["bring me the horizon"] },
  { slug: "billie-eilish", etichetta: "Billie Eilish", parole: ["billie eilish"] },
];

/** "Versione" del dizionario+logica, per bustare la cache delle facette quando
 *  cambiano: il prefisso `vN` copre i cambi di LOGICA di conteggio (v2 =
 *  introduzione del chip "Altro", v3 = conteggi dalla colonna `tema`), la
 *  parte numerica i cambi di DIZIONARIO (franchise + parole). Cosi ogni
 *  modifica aggiorna subito i conteggi invece di aspettare la revalidate. */
export const VERSIONE_FRANCHISE = `v3:${
  FRANCHISE.length + FRANCHISE.reduce((n, f) => n + f.parole.length, 0)
}`;

/** Indice slug -> franchise, per lookup O(1). */
const PER_SLUG = new Map(FRANCHISE.map((f) => [f.slug, f]));

/**
 * Il franchise a cui appartiene un nome (il PRIMO che matcha nell'ordine del
 * dizionario), o null se nessuno. Usato per i conteggi.
 */
export function franchiseDiNome(nome: string): Franchise | null {
  const n = nome.toLowerCase();
  for (const f of FRANCHISE) {
    if (f.parole.some((p) => n.includes(p))) return f;
  }
  return null;
}

/** Etichetta di un franchise dato lo slug (riconosce anche "altro"). */
export function etichettaFranchise(slug: string): string | null {
  if (slug === FRANCHISE_ALTRO) return ETICHETTA_ALTRO;
  return PER_SLUG.get(slug)?.etichetta ?? null;
}

/**
 * Conta i franchise presenti in un elenco di nomi (una categoria), ordinati per
 * numerosita decrescente. Un chip proprio solo con almeno `min` prodotti: sotto
 * soglia e rumore. Ogni prodotto conta per un solo franchise (il primo match).
 *
 * Se emerge almeno un chip, in coda si aggiunge "Altro" col resto (prodotti
 * senza franchise + franchise sotto soglia): i numeri dei chip sommano SEMPRE
 * a nomi.length, cosi il totale della categoria torna a colpo d'occhio.
 */
export function contaFranchise(nomi: string[], min = 3): FranchiseConteggio[] {
  const conteggi = new Map<string, number>();
  for (const nome of nomi) {
    const f = franchiseDiNome(nome);
    if (f) conteggi.set(f.slug, (conteggi.get(f.slug) ?? 0) + 1);
  }
  const chips = FRANCHISE.filter((f) => (conteggi.get(f.slug) ?? 0) >= min)
    .map((f) => ({
      slug: f.slug,
      etichetta: f.etichetta,
      count: conteggi.get(f.slug)!,
    }))
    .sort((a, b) => b.count - a.count);
  if (chips.length === 0) return []; // nessun tema: niente riga chip

  const inChip = chips.reduce((n, f) => n + f.count, 0);
  const altro = nomi.length - inChip;
  if (altro > 0) {
    chips.push({ slug: FRANCHISE_ALTRO, etichetta: ETICHETTA_ALTRO, count: altro });
  }
  return chips;
}

/**
 * Il prodotto `nome` appartiene al chip `slug`? Stessa semantica del conteggio
 * (primo match del dizionario), cosi filtro e numero sul chip coincidono.
 * Per "altro" serve l'insieme dei chip visibili nella categoria (`chipVisibili`,
 * gli slug di contaFranchise): altro = niente franchise O franchise senza chip.
 */
export function appartieneAlChip(
  nome: string,
  slug: string,
  chipVisibili: ReadonlySet<string>,
): boolean {
  const f = franchiseDiNome(nome);
  if (slug === FRANCHISE_ALTRO) return f == null || !chipVisibili.has(f.slug);
  return f?.slug === slug;
}
