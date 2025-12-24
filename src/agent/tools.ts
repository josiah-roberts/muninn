import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  searchEntries,
  getEntry,
  listEntries,
  getEntryTags,
  getAllTags,
} from "../services/storage.ts";
import type { AnalysisResult } from "../services/analysis.ts";

// Tool: Search entries by keyword
export const searchEntriesTool = tool(
  "search_entries",
  "Search journal entries by keyword or phrase. Returns matching entries with their IDs, titles, and content previews.",
  {
    query: z.string().describe("Search term or phrase to find in entries"),
    limit: z.number().optional().describe("Maximum number of results (default 10)"),
  },
  async (args) => {
    const results = searchEntries(args.query, args.limit ?? 10);

    if (results.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `No entries found matching "${args.query}"`,
        }],
      };
    }

    const formatted = results.map((entry) => {
      const tags = getEntryTags(entry.id);
      let analysis: AnalysisResult | null = null;
      if (entry.analysis_json) {
        try {
          analysis = JSON.parse(entry.analysis_json);
        } catch {}
      }
      return `ID: ${entry.id}
Title: ${entry.title || "Untitled"}
Date: ${entry.created_at}
Tags: ${tags.map(t => t.name).join(", ") || "none"}
Summary: ${analysis?.summary || entry.transcript?.slice(0, 200) || "No content"}`;
    }).join("\n---\n");

    return {
      content: [{
        type: "text" as const,
        text: `Found ${results.length} entries:\n\n${formatted}`,
      }],
    };
  }
);

// Tool: Get a specific entry by ID
export const getEntryTool = tool(
  "get_entry",
  "Get the full content of a journal entry by its ID. Returns complete transcript, analysis, and metadata.",
  {
    id: z.string().describe("The entry ID to fetch"),
  },
  async (args) => {
    const entry = getEntry(args.id);

    if (!entry) {
      return {
        content: [{
          type: "text" as const,
          text: `Entry not found with ID: ${args.id}`,
        }],
        isError: true,
      };
    }

    const tags = getEntryTags(entry.id);
    let analysis: AnalysisResult | null = null;
    if (entry.analysis_json) {
      try {
        analysis = JSON.parse(entry.analysis_json);
      } catch {}
    }

    return {
      content: [{
        type: "text" as const,
        text: `Entry ID: ${entry.id}
Title: ${entry.title || "Untitled"}
Date: ${entry.created_at}
Status: ${entry.status}
Tags: ${tags.map(t => t.name).join(", ") || "none"}

Transcript:
${entry.transcript || "No transcript"}

${analysis ? `Previous Analysis:
Summary: ${analysis.summary}
Themes: ${analysis.themes.join(", ")}
Key Insights: ${analysis.key_insights.join("; ")}
People: ${analysis.people_mentioned.join(", ") || "none"}
Places: ${analysis.places_mentioned.join(", ") || "none"}` : "No previous analysis"}`,
      }],
    };
  }
);

// Tool: List recent entries
export const listRecentEntriesTool = tool(
  "list_recent_entries",
  "List the most recent journal entries. Returns IDs, titles, dates, and tags for quick reference.",
  {
    limit: z.number().optional().describe("Maximum number of entries to return (default 10)"),
    status: z.enum(["pending_transcription", "transcribed", "analyzed"]).optional()
      .describe("Filter by entry status"),
  },
  async (args) => {
    const entries = listEntries({
      limit: args.limit ?? 10,
      status: args.status,
    });

    if (entries.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: "No entries found",
        }],
      };
    }

    const formatted = entries.map((entry) => {
      const tags = getEntryTags(entry.id);
      return `[${entry.id}] ${entry.created_at} - ${entry.title || "Untitled"} (${tags.map(t => t.name).join(", ") || "no tags"})`;
    }).join("\n");

    return {
      content: [{
        type: "text" as const,
        text: `Recent entries (${entries.length}):\n\n${formatted}`,
      }],
    };
  }
);

// Tool: Get entries by tag
export const getEntriesByTagTool = tool(
  "get_entries_by_tag",
  "Find journal entries that have a specific tag. Returns entries with matching tags.",
  {
    tag: z.string().describe("Tag name to filter by"),
    limit: z.number().optional().describe("Maximum number of entries (default 10)"),
  },
  async (args) => {
    // Get all entries and filter by tag
    const allEntries = listEntries({ limit: 100 });
    const matchingEntries = allEntries.filter((entry) => {
      const tags = getEntryTags(entry.id);
      return tags.some(t => t.name.toLowerCase().includes(args.tag.toLowerCase()));
    }).slice(0, args.limit ?? 10);

    if (matchingEntries.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `No entries found with tag: ${args.tag}`,
        }],
      };
    }

    const formatted = matchingEntries.map((entry) => {
      const tags = getEntryTags(entry.id);
      return `[${entry.id}] ${entry.created_at} - ${entry.title || "Untitled"} (${tags.map(t => t.name).join(", ")})`;
    }).join("\n");

    return {
      content: [{
        type: "text" as const,
        text: `Entries tagged "${args.tag}" (${matchingEntries.length}):\n\n${formatted}`,
      }],
    };
  }
);

// Tool: Get all existing tags
export const getAllTagsTool = tool(
  "get_all_tags",
  "List all tags that exist in the journal. Useful for understanding the categorization system and reusing existing tags.",
  {},
  async () => {
    const tags = getAllTags();

    if (tags.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: "No tags exist yet in the journal.",
        }],
      };
    }

    const tagNames = tags.map(t => t.name).sort();

    return {
      content: [{
        type: "text" as const,
        text: `Existing tags (${tags.length}):\n${tagNames.join(", ")}`,
      }],
    };
  }
);

// Export all tools as an array
export const journalTools = [
  searchEntriesTool,
  getEntryTool,
  listRecentEntriesTool,
  getEntriesByTagTool,
  getAllTagsTool,
];
