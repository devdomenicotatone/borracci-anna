import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Font del brand (Poppins) per le card social generate con ImageResponse/Satori,
// che NON sintetizza il grassetto: serve il file del peso giusto. Caricati da
// assets/fonts (process.cwd() = root del progetto Next), una volta per immagine.
export async function fontOg() {
  const dir = join(process.cwd(), "assets", "fonts");
  const [bold, semibold] = await Promise.all([
    readFile(join(dir, "Poppins-Bold.ttf")),
    readFile(join(dir, "Poppins-SemiBold.ttf")),
  ]);
  return [
    { name: "Poppins", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Poppins", data: semibold, weight: 600 as const, style: "normal" as const },
  ];
}
