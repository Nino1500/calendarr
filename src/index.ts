import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT ?? 3000);
const publicDirectory = join(__dirname, "public");

type ServiceName = "sonarr" | "radarr";

interface ServiceConfig {
  name?: string;
  url: string;
  apiKey: string;
}

interface CalendarResult {
  sourceLocation: { protocol: string; port: string; pathname: string };
  items: unknown[];
}

function parseInstances(
  serviceName: ServiceName,
  value: string | undefined,
): ServiceConfig[] {
  if (!value) return [];

  try {
    const instances: unknown = JSON.parse(value);
    if (!Array.isArray(instances)) throw new Error("must be a JSON array");

    return instances.map((instance, index) => {
      if (
        typeof instance !== "object" || instance === null ||
        !("url" in instance) || !("apiKey" in instance) ||
        typeof instance.url !== "string" || typeof instance.apiKey !== "string" ||
        ("name" in instance && instance.name !== undefined && typeof instance.name !== "string")
      ) {
        throw new Error(`entry ${index + 1} needs string values for url and apiKey`);
      }
      return { url: instance.url, apiKey: instance.apiKey, name: instance.name };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`Invalid ${serviceName.toUpperCase()}_INSTANCES: ${message}`);
  }
}

const services: Record<ServiceName, ServiceConfig[]> = {
  sonarr: parseInstances("sonarr", process.env.SONARR_INSTANCES),
  radarr: parseInstances("radarr", process.env.RADARR_INSTANCES),
};

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function proxyCalendar(
  requestUrl: URL,
  serviceName: ServiceName,
  response: ServerResponse,
): Promise<void> {
  const instances = services[serviceName];
  if (!instances.length) {
    json(response, 200, { configured: false, items: [] });
    return;
  }

  const results = await Promise.all(instances.map(async (service): Promise<CalendarResult | Error> => {
    try {
      const upstream = new URL("api/v3/calendar", service.url.endsWith("/") ? service.url : `${service.url}/`);
      upstream.searchParams.set("start", requestUrl.searchParams.get("start") ?? "");
      upstream.searchParams.set("end", requestUrl.searchParams.get("end") ?? "");
      upstream.searchParams.set("includeSeries", "true");
      upstream.searchParams.set("includeEpisodeFile", "true");
      upstream.searchParams.set("includeMovie", "true");

      const upstreamResponse = await fetch(upstream, {
        headers: { "X-Api-Key": service.apiKey },
        signal: AbortSignal.timeout(15_000),
      });
      if (!upstreamResponse.ok) {
        throw new Error(`${service.name ?? service.url} returned ${upstreamResponse.status}`);
      }

      const items: unknown = await upstreamResponse.json();
      if (!Array.isArray(items)) {
        throw new Error(`${service.name ?? service.url} returned an invalid calendar response`);
      }

      const serviceUrl = new URL(service.url);
      return {
        sourceLocation: {
          protocol: serviceUrl.protocol,
          port: serviceUrl.port,
          pathname: serviceUrl.pathname,
        },
        items,
      };
    } catch (error) {
      return error instanceof Error ? error : new Error(`Could not reach ${serviceName}`);
    }
  }));

  const successfulResults = results.filter((result): result is CalendarResult => !(result instanceof Error));
  if (!successfulResults.length) {
    json(response, 502, { error: results.map((result) => result instanceof Error ? result.message : "").filter(Boolean).join("; ") });
    return;
  }

  json(response, 200, {
    configured: true,
    sourceLocation: successfulResults[0].sourceLocation,
    items: successfulResults.flatMap((result) => result.items),
  });
}

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDirectory, safePath);

  try {
    const file = await readFile(filePath);
    const extension = extname(filePath);
    const shouldRevalidate = [".html", ".css", ".js"].includes(extension);
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] ?? "application/octet-stream",
      "Cache-Control": shouldRevalidate ? "no-cache" : "public, max-age=3600",
      "Content-Security-Policy": "frame-ancestors *",
    });
    response.end(file);
  } catch {
    json(response, 404, { error: "Not found" });
  }
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const calendarMatch = requestUrl.pathname.match(/^\/api\/(sonarr|radarr)\/calendar$/);

  if (calendarMatch) {
    await proxyCalendar(requestUrl, calendarMatch[1] as ServiceName, response);
    return;
  }

  if (requestUrl.pathname === "/api/health") {
    json(response, 200, { status: "ok" });
    return;
  }

  await serveStatic(requestUrl.pathname, response);
}

createServer((request, response) => {
  void handleRequest(request, response);
}).listen(port, "0.0.0.0", () => {
  console.log(`Calendarr is running on http://0.0.0.0:${port}`);
});
