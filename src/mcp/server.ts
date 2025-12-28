import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  listEntries,
  getEntry,
  getEntryTags,
  getAllTags,
  searchEntries,
  getLinkedEntries,
} from "../services/storage.ts";
import type { Entry } from "../services/db.ts";

// Create MCP server
const server = new McpServer({
  name: "muninn",
  version: "1.0.0",
});

// Helper to format entry for display
function formatEntry(entry: Entry, includeTags = true): string {
  const tags = includeTags ? getEntryTags(entry.id) : [];
  const tagStr = tags.length > 0 ? `\nTags: ${tags.map(t => t.name).join(", ")}` : "";

  let analysis = null;
  if (entry.analysis_json) {
    try {
      analysis = JSON.parse(entry.analysis_json);
    } catch {}
  }

  return `# ${entry.title || "Untitled Entry"}
ID: ${entry.id}
Created: ${entry.created_at}
Status: ${entry.status}${tagStr}

## Transcript
${entry.transcript || "*No transcript*"}

${analysis ? `## Analysis
Summary: ${analysis.summary}
Themes: ${analysis.themes?.join(", ") || "none"}
Key Insights:
${analysis.key_insights?.map((i: string) => `- ${i}`).join("\n") || "none"}
` : ""}`;
}

// Resources - expose entries as readable resources
server.resource(
  "entries",
  "journal://entries",
  async (uri) => {
    const entries = listEntries({ limit: 100 });
    const content = entries.map(e => {
      const tags = getEntryTags(e.id);
      return `- [${e.id}] ${e.title || "Untitled"} (${e.created_at}) [${tags.map(t => t.name).join(", ")}]`;
    }).join("\n");

    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/plain",
        text: `# Muninn Entries\n\n${content}`,
      }],
    };
  }
);

server.resource(
  "entry",
  "journal://entries/{id}",
  async (uri) => {
    const id = uri.pathname.split("/").pop();
    if (!id) {
      return { contents: [{ uri: uri.href, mimeType: "text/plain", text: "Invalid entry ID" }] };
    }

    const entry = getEntry(id);
    if (!entry) {
      return { contents: [{ uri: uri.href, mimeType: "text/plain", text: "Entry not found" }] };
    }

    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/markdown",
        text: formatEntry(entry),
      }],
    };
  }
);

server.resource(
  "tags",
  "journal://tags",
  async (uri) => {
    const tags = getAllTags();
    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/plain",
        text: `# Tags\n\n${tags.map(t => `- ${t.name}`).join("\n")}`,
      }],
    };
  }
);

// Tools for querying the journal
server.tool(
  "list_entries",
  "List recent journal entries",
  {
    limit: z.number().optional().describe("Maximum number of entries to return (default 20)"),
    status: z.enum(["pending_transcription", "transcribed", "analyzed"]).optional()
      .describe("Filter by entry status"),
  },
  async ({ limit = 20, status }) => {
    const entries = listEntries({ limit, status });

    const formatted = entries.map(e => {
      const tags = getEntryTags(e.id);
      let summary = "";
      if (e.analysis_json) {
        try {
          const analysis = JSON.parse(e.analysis_json);
          summary = analysis.summary || "";
        } catch {}
      }
      return {
        id: e.id,
        title: e.title || "Untitled",
        created_at: e.created_at,
        status: e.status,
        tags: tags.map(t => t.name),
        summary: summary || (e.transcript?.slice(0, 200) + "..."),
      };
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify(formatted, null, 2),
      }],
    };
  }
);

server.tool(
  "get_entry",
  "Get a specific journal entry by ID",
  {
    id: z.string().describe("The entry ID"),
  },
  async ({ id }) => {
    const entry = getEntry(id);
    if (!entry) {
      return {
        content: [{ type: "text", text: "Entry not found" }],
        isError: true,
      };
    }

    const linked = getLinkedEntries(id);

    return {
      content: [{
        type: "text",
        text: formatEntry(entry) + (linked.length > 0 ? `\n\n## Related Entries\n${linked.map(l => `- [${l.id}] ${l.title} (${l.relationship})`).join("\n")}` : ""),
      }],
    };
  }
);

server.tool(
  "search_entries",
  "Search journal entries by keyword",
  {
    query: z.string().describe("Search query"),
    limit: z.number().optional().describe("Maximum results (default 10)"),
  },
  async ({ query, limit = 10 }) => {
    const entries = searchEntries(query, limit);

    if (entries.length === 0) {
      return {
        content: [{ type: "text", text: "No entries found matching your query." }],
      };
    }

    const results = entries.map(e => {
      const tags = getEntryTags(e.id);
      // Find the matching context
      const transcript = e.transcript || "";
      const lowerQuery = query.toLowerCase();
      const idx = transcript.toLowerCase().indexOf(lowerQuery);
      const context = idx >= 0
        ? "..." + transcript.slice(Math.max(0, idx - 50), idx + query.length + 100) + "..."
        : transcript.slice(0, 150) + "...";

      return `### ${e.title || "Untitled"} (${e.id})
Created: ${e.created_at}
Tags: ${tags.map(t => t.name).join(", ") || "none"}
Context: ${context}`;
    }).join("\n\n");

    return {
      content: [{ type: "text", text: `# Search Results for "${query}"\n\n${results}` }],
    };
  }
);

server.tool(
  "get_entries_by_tag",
  "Get all entries with a specific tag",
  {
    tag: z.string().describe("Tag name to filter by"),
  },
  async ({ tag }) => {
    const allEntries = listEntries({ limit: 100 });
    const filtered = allEntries.filter(e => {
      const tags = getEntryTags(e.id);
      return tags.some(t => t.name.toLowerCase() === tag.toLowerCase());
    });

    if (filtered.length === 0) {
      return {
        content: [{ type: "text", text: `No entries found with tag "${tag}"` }],
      };
    }

    const results = filtered.map(e => {
      let summary = "";
      if (e.analysis_json) {
        try {
          const analysis = JSON.parse(e.analysis_json);
          summary = analysis.summary || "";
        } catch {}
      }
      return `- [${e.id}] **${e.title || "Untitled"}** (${e.created_at})\n  ${summary || e.transcript?.slice(0, 100) + "..."}`;
    }).join("\n\n");

    return {
      content: [{ type: "text", text: `# Entries tagged "${tag}"\n\n${results}` }],
    };
  }
);

server.tool(
  "get_timeline",
  "Get entries from a specific time period",
  {
    start_date: z.string().optional().describe("Start date (ISO format, e.g., 2024-01-01)"),
    end_date: z.string().optional().describe("End date (ISO format)"),
    limit: z.number().optional().describe("Maximum entries (default 50)"),
  },
  async ({ start_date, end_date, limit = 50 }) => {
    let entries = listEntries({ limit: 200 });

    if (start_date) {
      entries = entries.filter(e => e.created_at >= start_date);
    }
    if (end_date) {
      entries = entries.filter(e => e.created_at <= end_date);
    }

    entries = entries.slice(0, limit);

    const timeline = entries.map(e => {
      const tags = getEntryTags(e.id);
      let summary = "";
      if (e.analysis_json) {
        try {
          const analysis = JSON.parse(e.analysis_json);
          summary = analysis.summary || "";
        } catch {}
      }
      return `## ${e.created_at.split("T")[0]} - ${e.title || "Untitled"}
ID: ${e.id}
Tags: ${tags.map(t => t.name).join(", ") || "none"}
${summary || e.transcript?.slice(0, 200) + "..."}`;
    }).join("\n\n---\n\n");

    return {
      content: [{
        type: "text",
        text: `# Muninn Timeline${start_date ? ` (from ${start_date})` : ""}${end_date ? ` (to ${end_date})` : ""}\n\n${timeline}`,
      }],
    };
  }
);

server.tool(
  "analyze_themes",
  "Analyze recurring themes across journal entries",
  {
    limit: z.number().optional().describe("Number of recent entries to analyze (default 50)"),
  },
  async ({ limit = 50 }) => {
    const entries = listEntries({ limit, status: "analyzed" });

    const themeCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();
    const peopleCounts = new Map<string, number>();

    for (const entry of entries) {
      const tags = getEntryTags(entry.id);
      for (const tag of tags) {
        tagCounts.set(tag.name, (tagCounts.get(tag.name) || 0) + 1);
      }

      if (entry.analysis_json) {
        try {
          const analysis = JSON.parse(entry.analysis_json);
          for (const theme of analysis.themes || []) {
            themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
          }
          for (const person of analysis.people_mentioned || []) {
            peopleCounts.set(person, (peopleCounts.get(person) || 0) + 1);
          }
        } catch {}
      }
    }

    const sortedThemes = [...themeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    const sortedPeople = [...peopleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

    return {
      content: [{
        type: "text",
        text: `# Theme Analysis (${entries.length} entries)

## Top Themes
${sortedThemes.map(([theme, count]) => `- ${theme}: ${count} mentions`).join("\n")}

## Most Used Tags
${sortedTags.map(([tag, count]) => `- ${tag}: ${count} entries`).join("\n")}

## People Mentioned
${sortedPeople.map(([person, count]) => `- ${person}: ${count} mentions`).join("\n")}`,
      }],
    };
  }
);

// Start the server
export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Muninn MCP server started");
}

// Run if executed directly
if (import.meta.main) {
  startMcpServer().catch(console.error);
}
