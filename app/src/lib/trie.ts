/**
 * Prefix tree for @name autocomplete. Built once from the phonebook's names; each keystroke is
 * O(prefix length + results) with no network call.
 * ponytail: whole name list ships to the client — fine to ~10k names; move suggest() server-side past that.
 */
type Node = { kids: Map<string, Node>; word?: string };

export class Trie {
  private root: Node = { kids: new Map() };

  constructor(words: Iterable<string> = []) {
    for (const w of words) this.insert(w);
  }

  insert(word: string) {
    let n = this.root;
    for (const ch of word) {
      let next = n.kids.get(ch);
      if (!next) n.kids.set(ch, (next = { kids: new Map() }));
      n = next;
    }
    n.word = word;
  }

  /** Up to `limit` words starting with `prefix`: shortest first, then alphabetical (BFS). */
  suggest(prefix: string, limit = 5): string[] {
    let n: Node | undefined = this.root;
    for (const ch of prefix) if (!(n = n.kids.get(ch))) return [];
    const out: string[] = [];
    const queue: Node[] = [n];
    while (queue.length && out.length < limit) {
      const cur = queue.shift()!;
      if (cur.word) out.push(cur.word);
      for (const k of [...cur.kids.keys()].sort()) queue.push(cur.kids.get(k)!);
    }
    return out;
  }
}
