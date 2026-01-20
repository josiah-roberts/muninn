import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { config } from "../config.ts";
import { getUserProfilePath } from "../services/storage.ts";

const ENTRIES_DIR = resolve(config.entriesDir);
const USER_PROFILE_PATH = getUserProfilePath();

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

  server.tool(
    "write_user_profile",
    "Write the complete user profile document. Use this to create the initial profile or when you need to completely restructure it. For smaller updates, prefer edit_user_profile instead.",
    { content: z.string().describe("The complete content for the user profile document. Should be concise markdown.") },
    async ({ content }) => {
      try {
        writeFileSync(USER_PROFILE_PATH, content, "utf-8");
        return { content: [{ type: "text", text: "User profile written successfully." }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error writing user profile: ${err}` }] };
      }
    }
  );

  server.tool(
    "edit_user_profile",
    "Edit the user profile document by replacing a specific string with new content. Works like a surgical find-and-replace. The old_string must match exactly (including whitespace/indentation). Use this for incremental updates; use write_user_profile for complete rewrites or initial creation.",
    {
      old_string: z.string().describe("The exact text to find and replace in the profile"),
      new_string: z.string().describe("The text to replace it with"),
    },
    async ({ old_string, new_string }) => {
      try {
        // Read current content
        if (!existsSync(USER_PROFILE_PATH)) {
          return { content: [{ type: "text", text: "Error: User profile does not exist yet. Use write_user_profile to create it first." }] };
        }

        const current = readFileSync(USER_PROFILE_PATH, "utf-8");

        // Check if old_string exists
        if (!current.includes(old_string)) {
          return { content: [{ type: "text", text: `Error: Could not find the specified text in the profile. Make sure old_string matches exactly, including whitespace.` }] };
        }

        // Check for uniqueness (like the real Edit tool)
        const occurrences = current.split(old_string).length - 1;
        if (occurrences > 1) {
          return { content: [{ type: "text", text: `Error: Found ${occurrences} occurrences of the text. The old_string must be unique. Include more surrounding context to make it unique.` }] };
        }

        // Perform the replacement
        const updated = current.replace(old_string, new_string);
        writeFileSync(USER_PROFILE_PATH, updated, "utf-8");

        return { content: [{ type: "text", text: "User profile edited successfully." }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error editing user profile: ${err}` }] };
      }
    }
  );

  // Schema for conclude_analysis tool - matches AnalysisResult interface
  const timeReferenceSchema = z.object({
    description: z.string().describe("What time period or event was referenced"),
    approximate_date: z.string().optional().describe("ISO date if determinable, e.g. '2024-01-15' or '2024-01'"),
  });

  const potentialLinkSchema = z.object({
    reason: z.string().describe("Why this might connect to other entries"),
    keywords: z.array(z.string()).describe("Search terms to find related entries"),
  });

  const relatedEntrySchema = z.object({
    id: z.string().describe("The entry ID (filename without .md)"),
    reason: z.string().describe("Why this entry is related"),
  });

  server.tool(
    "conclude_analysis",
    "Submit the final analysis for this journal entry. You MUST call this tool to complete the analysis - do not just output JSON text. Call this after you have explored related entries and are ready to provide your structured analysis.",
    {
      title: z.string().describe("A brief, descriptive title for this entry (3-10 words)"),
      summary: z.string().describe("2-3 sentence summary of the main content"),
      themes: z.array(z.string()).describe("Major themes discussed in this entry"),
      tags: z.array(z.string()).describe("Suggested tags - reuse existing ones when appropriate"),
      mood: z.string().optional().describe("Overall emotional tone if discernible (e.g. 'reflective', 'anxious', 'hopeful')"),
      people_mentioned: z.array(z.string()).describe("Names of people mentioned in the entry"),
      places_mentioned: z.array(z.string()).describe("Locations mentioned in the entry"),
      time_references: z.array(timeReferenceSchema).describe("References to specific times or events"),
      key_insights: z.array(z.string()).describe("Notable thoughts, realizations, or ideas expressed"),
      potential_links: z.array(potentialLinkSchema).describe("Potential connections to other entries"),
      follow_up_questions: z.array(z.string()).describe("Thoughtful questions for deeper reflection"),
      related_entries: z.array(relatedEntrySchema).describe("Entries that are related to this one, based on your exploration"),
    },
    async (analysis) => {
      // This tool doesn't actually do anything - its input is captured by the analyzer
      // Return success so the agent knows the analysis was received
      return { content: [{ type: "text", text: "Analysis submitted successfully." }] };
    }
  );

  return { type: "sdk" as const, name: "journal-tools", instance: server };
}
