/** AsyncStorage — an in-memory Map. Persisted preferences (theme, language,
 *  the History view choice) resolve to "nothing stored yet", which is the state
 *  a first render has to survive anyway. */
const memory = new Map<string, string>();

export default {
  getItem: async (k: string) => memory.get(k) ?? null,
  setItem: async (k: string, v: string) => {
    memory.set(k, v);
  },
  removeItem: async (k: string) => {
    memory.delete(k);
  },
  multiGet: async (ks: string[]) => ks.map((k) => [k, memory.get(k) ?? null] as [string, string | null]),
  clear: async () => memory.clear(),
};
