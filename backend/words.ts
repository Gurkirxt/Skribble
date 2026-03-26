import wordList from "./words.json";

export { wordList };

export function getRandomWords(count: number): string[] {
  const pool = [...wordList];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    result.push(pool[i]!);
  }
  return result;
}
