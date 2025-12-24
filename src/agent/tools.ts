import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import { config } from "../config.ts";

const ENTRIES_DIR = resolve(config.entriesDir);

interface SearchResult {
  file: string;
  line: number;
  content: string;
}

/**
 * Search entries using grep, filtering out the current entry
 */
function searchEntries(query: string, excludeEntryId: string): SearchResult[] {
  try {
    // Use grep with line numbers, case insensitive
    const output = execSync(
      `grep -rni "${query.replace(/"/g, '\\"')}" "${ENTRIES_DIR}"`,
      { encoding: "utf-8", maxBuffer: 1024 * 1024 }
    );

    const results: SearchResult[] = [];
    for (const line of output.split("\n")) {
      if (!line.trim()) continue;

      // Skip results from current entry
      if (line.includes(excludeEntryId)) continue;

      // Parse grep output: file:line:content
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      if (match && match[1] && match[2] && match[3]) {
        results.push({
          file: match[1],
          line: parseInt(match[2], 10),
          content: match[3],
        });
      }
    }

    return results.slice(0, 50); // Limit results
  } catch (err) {
    // grep returns non-zero if no matches
    return [];
  }
}

/**
 * List all entry files, excluding current entry
 */
function listEntries(excludeEntryId: string): string[] {
  try {
    const output = execSync(`ls -1 "${ENTRIES_DIR}"/*.md 2>/dev/null`, {
      encoding: "utf-8",
    });
    return output
      .split("\n")
      .filter((f) => f.trim() && !f.includes(excludeEntryId));
  } catch {
    return [];
  }
}

/**
 * Create MCP server with journal-specific tools that filter out the current entry
 */
export function createJournalTools(currentEntryId: string) {
  const server = new McpServer({
    name: "journal-tools",
    version: "1.0.0",
  });

  server.tool(
    "search_entries",
    "Search journal entries for a keyword or phrase. Returns matching lines with file paths and line numbers. The current entry being analyzed is automatically excluded from results.",
    { query: z.string().describe("The search term or phrase to find in entries") },
    async ({ query }) => {
      const results = searchEntries(query, currentEntryId);

      if (results.length === 0) {
        return { content: [{ type: "text", text: "No matches found." }] };
      }

      const text = results
        .map((r) => `${r.file}:${r.line}: ${r.content}`)
        .join("\n");

      return { content: [{ type: "text", text }] };
    }
  );

  server.tool(
    "list_entries",
    "List all journal entry files. The current entry being analyzed is automatically excluded.",
    {},
    async () => {
      const files = listEntries(currentEntryId);

      if (files.length === 0) {
        return { content: [{ type: "text", text: "No other entries found." }] };
      }

      return { content: [{ type: "text", text: files.join("\n") }] };
    }
  );

  server.tool(
    "read_entry",
    "Read the full content of a journal entry file.",
    { path: z.string().describe("The file path to read") },
    async ({ path }) => {
      try {
        // Security: ensure path is within entries directory
        const resolved = resolve(path);
        if (!resolved.startsWith(ENTRIES_DIR)) {
          return { content: [{ type: "text", text: "Error: Path outside entries directory" }] };
        }

        const content = readFileSync(resolved, "utf-8");
        return { content: [{ type: "text", text: content }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error reading file: ${err}` }] };
      }
    }
  );

  return { type: "sdk" as const, name: "journal-tools", instance: server };
}
