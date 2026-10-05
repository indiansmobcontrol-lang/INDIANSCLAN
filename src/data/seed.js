// The site starts completely empty. Players and weeks are created automatically
// when you import a CSV on the Data page (or loaded from public/data.json).
export function seed() {
  return { players: [], weeks: [], prScores: [], srScores: [] };
}
