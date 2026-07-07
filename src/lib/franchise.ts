// Riconoscimento del FRANCHISE (saga/serie/brand) dal NOME del prodotto.
//
// I prodotti non hanno un campo "franchise" in DB: l'unico segnale e il nome
// (es. "T-Shirt Squid Game Logo"). Qui un dizionario curato mappa parole-chiave
// univoche -> franchise, cosi possiamo:
//   - CONTARE quanti prodotti di ogni franchise ci sono in una categoria
//     (per mostrare i chip solo dove servono, con il numero);
//   - FILTRARE il catalogo per franchise (le stesse parole diventano un OR ilike
//     sul nome, lato DB).
// I conteggi sono per-categoria: lo stesso dizionario vale ovunque, ma in "Film"
// emergono Harry Potter/Marvel, in "Anime" One Piece/Naruto, in "Gaming" Call of
// Duty... — quelli con zero match semplicemente non compaiono.
//
// REGOLA per le `parole`: preferire termini UNIVOCI del franchise (nomi propri,
// titoli) ed evitare parole comuni/ambigue. Meglio contare 14 invece di 15 che
// infilare un prodotto sbagliato in un chip. Tutte in minuscolo: il match e
// `nome.toLowerCase().includes(parola)`.

import type { FranchiseConteggio } from "@/lib/filtri-catalogo";

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
  { slug: "marvel", etichetta: "Marvel", parole: ["marvel", "avengers", "spider-man", "spiderman", "iron man", "capitan america", "captain america", "deadpool", "wolverine", "venom", "hulk", "thor", "loki", "black panther"] },
  { slug: "dc", etichetta: "DC Comics", parole: ["batman", "superman", "joker", "wonder woman", "aquaman", "harley quinn"] },
  { slug: "stranger-things", etichetta: "Stranger Things", parole: ["stranger things", "demogorgon", "hellfire", "hawkins"] },
  { slug: "squid-game", etichetta: "Squid Game", parole: ["squid game"] },
  { slug: "casa-di-carta", etichetta: "La Casa di Carta", parole: ["casa di carta", "money heist"] },
  { slug: "rick-morty", etichetta: "Rick & Morty", parole: ["rick and morty", "rick & morty", "rick e morty", "rick morty"] },
  { slug: "simpsons", etichetta: "I Simpson", parole: ["simpson"] },
  { slug: "lupin", etichetta: "Lupin III", parole: ["lupin"] },
  { slug: "diabolik", etichetta: "Diabolik", parole: ["diabolik"] },
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
];

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

/** Parole-chiave di un franchise dato lo slug (per costruire il filtro DB). */
export function paroleFranchise(slug: string): string[] | null {
  return PER_SLUG.get(slug)?.parole ?? null;
}

/** Etichetta di un franchise dato lo slug (per il chip del filtro attivo). */
export function etichettaFranchise(slug: string): string | null {
  return PER_SLUG.get(slug)?.etichetta ?? null;
}

/**
 * Conta i franchise presenti in un elenco di nomi (una categoria), ordinati per
 * numerosita decrescente. Solo quelli con almeno `min` prodotti: sotto soglia
 * un chip e rumore. Ogni prodotto conta per un solo franchise (il primo match).
 */
export function contaFranchise(nomi: string[], min = 3): FranchiseConteggio[] {
  const conteggi = new Map<string, number>();
  for (const nome of nomi) {
    const f = franchiseDiNome(nome);
    if (f) conteggi.set(f.slug, (conteggi.get(f.slug) ?? 0) + 1);
  }
  return FRANCHISE.filter((f) => (conteggi.get(f.slug) ?? 0) >= min)
    .map((f) => ({
      slug: f.slug,
      etichetta: f.etichetta,
      count: conteggi.get(f.slug)!,
    }))
    .sort((a, b) => b.count - a.count);
}
