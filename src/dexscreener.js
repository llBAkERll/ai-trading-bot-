const DEXSCREENER_BASE = "https://api.dexscreener.com";

async function getJson(path) {
  const response = await fetch(`${DEXSCREENER_BASE}${path}`, {
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`DEX Screener request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function searchSolanaPairs(query) {
  const body = await getJson(`/latest/dex/search?q=${encodeURIComponent(query)}`);
  return (body.pairs || []).filter((pair) => pair.chainId === "solana");
}

export async function getPairsByTokenAddresses(addresses) {
  const unique = [...new Set(addresses.filter(Boolean))].slice(0, 90);
  const chunks = [];
  for (let index = 0; index < unique.length; index += 30) chunks.push(unique.slice(index, index + 30));
  const results = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const body = await getJson(`/latest/dex/tokens/${chunk.join(",")}`);
      return body.pairs || [];
    })
  );
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : [])).filter((pair) => pair.chainId === "solana");
}

async function latestTokenAddresses(path) {
  try {
    const body = await getJson(path);
    const rows = Array.isArray(body) ? body : body.tokens || body.profiles || [];
    return rows
      .filter((item) => item.chainId === "solana")
      .map((item) => item.tokenAddress || item.address)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function discoverSolanaPairs(config) {
  const searchResults = await Promise.allSettled(config.discoveryQueries.map((query) => searchSolanaPairs(query)));
  const profileAddresses = await latestTokenAddresses("/token-profiles/latest/v1");
  const boostedAddresses = await latestTokenAddresses("/token-boosts/latest/v1");
  const profilePairs = await getPairsByTokenAddresses([...profileAddresses, ...boostedAddresses]);
  const pairs = [
    ...searchResults.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
    ...profilePairs
  ];
  const byPair = new Map();
  for (const pair of pairs) {
    if (!pair?.pairAddress) continue;
    const existing = byPair.get(pair.pairAddress);
    if (!existing || Number(pair.volume?.h24 || 0) > Number(existing.volume?.h24 || 0)) byPair.set(pair.pairAddress, pair);
  }
  return [...byPair.values()];
}

export function normalizePair(pair) {
  return {
    chainId: pair.chainId,
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    url: pair.url,
    baseSymbol: pair.baseToken?.symbol || "UNKNOWN",
    baseName: pair.baseToken?.name || "Unknown",
    baseAddress: pair.baseToken?.address || "",
    quoteSymbol: pair.quoteToken?.symbol || "",
    priceUsd: Number(pair.priceUsd || 0),
    liquidityUsd: Number(pair.liquidity?.usd || 0),
    fdv: Number(pair.fdv || 0),
    marketCap: Number(pair.marketCap || 0),
    volume24h: Number(pair.volume?.h24 || 0),
    volume6h: Number(pair.volume?.h6 || 0),
    volume1h: Number(pair.volume?.h1 || 0),
    priceChange5m: Number(pair.priceChange?.m5 || 0),
    priceChange1h: Number(pair.priceChange?.h1 || 0),
    priceChange6h: Number(pair.priceChange?.h6 || 0),
    buys5m: Number(pair.txns?.m5?.buys || 0),
    sells5m: Number(pair.txns?.m5?.sells || 0),
    buys1h: Number(pair.txns?.h1?.buys || 0),
    sells1h: Number(pair.txns?.h1?.sells || 0),
    pairCreatedAt: Number(pair.pairCreatedAt || 0)
  };
}
