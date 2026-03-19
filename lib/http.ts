const lastRequestByKey = new Map<string, number>();

function getUserAgent(): string {
  return process.env.SCRAPER_USER_AGENT?.trim() || "BookPricingDashboard/1.0 (+https://local.dev)";
}

async function throttle(key: string, delayMs = 750): Promise<void> {
  const now = Date.now();
  const last = lastRequestByKey.get(key) ?? 0;
  const wait = Math.max(0, delayMs - (now - last));

  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  lastRequestByKey.set(key, Date.now());
}

export async function fetchText(url: string, key: string): Promise<string> {
  await throttle(key);

  const response = await fetch(url, {
    headers: {
      "user-agent": getUserAgent(),
      "accept-language": "en-IN,en;q=0.9",
    },
    cache: "no-store",
  });

  if (response.status === 403 || response.status === 429) {
    throw new Error(`blocked:${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`fetch_failed:${response.status}`);
  }

  return response.text();
}

export async function fetchJson<T>(url: string, key: string, retries = 2): Promise<T> {
  await throttle(key);

  const response = await fetch(url, {
    headers: {
      "user-agent": getUserAgent(),
      "accept-language": "en-IN,en;q=0.9",
    },
    cache: "no-store",
  });

  if (response.status === 429 && retries > 0) {
    const retryAfter = Number(response.headers.get("Retry-After") ?? 2);
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return fetchJson<T>(url, key, retries - 1);
  }

  if (!response.ok) {
    throw new Error(`fetch_failed:${response.status}`);
  }

  return (await response.json()) as T;
}
