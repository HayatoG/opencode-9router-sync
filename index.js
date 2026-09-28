// Sincroniza os modelos do provider "9router" com o /v1/models do 9router
// sempre que o opencode carrega a config. Só altera a config em memória;
// o opencode.jsonc não é reescrito. Se o 9router estiver fora do ar,
// mantém a lista estática do opencode.jsonc.
// Sem provider "9router" na config, cria um a partir de NINEROUTER_BASE_URL
// e NINEROUTER_API_KEY (ou do endereço padrão), desde que o 9router responda.
const PREFIX = { combo: "Combo", cc: "CC", ocg: "OCG", openrouter: "OpenRouter" };

const toEntry = (m) => {
  const c = m.capabilities || {};
  const owner = m.owned_by || m.id.split("/")[0];
  const input = ["text"];
  if (c.vision) input.push("image");
  if (c.pdf) input.push("pdf");
  if (c.audioInput) input.push("audio");
  if (c.videoInput) input.push("video");
  const output = ["text"];
  if (c.imageOutput) output.push("image");
  if (c.audioOutput) output.push("audio");
  return {
    name: `${PREFIX[owner] ?? owner.toUpperCase()} · ${m.id.startsWith(owner + "/") ? m.id.slice(owner.length + 1) : m.id}`,
    tool_call: !!c.tools,
    reasoning: !!c.reasoning,
    attachment: input.length > 1,
    modalities: { input, output },
    limit: {
      context: c.contextWindow ?? m.context_length ?? 128000,
      output: c.maxOutput ?? m.max_completion_tokens ?? 32000,
    },
  };
};

export const sync9Router = async () => ({
  config: async (cfg) => {
    const existing = cfg.provider?.["9router"];
    const baseURL = (
      existing?.options?.baseURL ||
      process.env.NINEROUTER_BASE_URL ||
      "http://localhost:20128/v1"
    ).replace(/\/$/, "");
    const apiKey = existing?.options?.apiKey ?? process.env.NINEROUTER_API_KEY;
    try {
      const res = await fetch(`${baseURL}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        // Sem provider configurado, não vale segurar a inicialização por muito tempo.
        signal: AbortSignal.timeout(existing ? 3000 : 1500),
      });
      if (!res.ok) return;
      const { data } = await res.json();
      if (!Array.isArray(data) || data.length === 0) return;
      const provider = existing ?? {
        name: "9Router",
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL, ...(apiKey && { apiKey }) },
      };
      const current = provider.models || {};
      const models = {};
      // Entradas geradas a partir do servidor; o que estiver definido à mão
      // no opencode.jsonc sobrescreve campo a campo.
      for (const m of data) models[m.id] = { ...toEntry(m), ...current[m.id] };
      provider.models = models;
      cfg.provider = { ...cfg.provider, "9router": provider };
    } catch {}
  },
});
