import { query, createSdkMcpServer, type SDKResultMessage, type SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk";
import { journalTools } from "./tools.ts";
import type { AnalysisResult } from "../services/analysis.ts";
import type { Tag } from "../services/db.ts";

// Create the MCP server with journal tools
const journalServer = createSdkMcpServer({
  name: "journal",
  version: "1.0.0",
  tools: journalTools,
});

// System prompt for the analysis agent
const ANALYSIS_SYSTEM_PROMPT = `You are a journal analysis assistant. Your job is to analyze new journal entries by:

1. First understanding the content, themes, and emotions in the new entry
2. Using the available tools to search for and fetch related past entries
3. Identifying patterns, connections, and recurring themes across entries
4. Providing structured analysis that helps the user understand their journaling patterns

You have access to these tools:
- search_entries: Search for entries by keyword
- get_entry: Get full details of a specific entry
- list_recent_entries: See recent entries
- get_entries_by_tag: Find entries with specific tags
- get_all_tags: See all existing tags for reuse

IMPORTANT: After exploring related entries, you MUST respond with a JSON analysis in exactly this format:
{
  "title": "A brief, descriptive title for this entry",
  "summary": "2-3 sentence summary of the main content",
  "themes": ["major themes discussed"],
  "tags": ["suggested tags - reuse existing ones when appropriate"],
  "mood": "overall emotional tone if discernible",
  "people_mentioned": ["names of people mentioned"],
  "places_mentioned": ["locations mentioned"],
  "time_references": [{"description": "what was referenced", "approximate_date": "if determinable"}],
  "key_insights": ["notable thoughts, realizations, or ideas expressed"],
  "potential_links": [{"reason": "why this might connect to other entries", "keywords": ["search terms"]}],
  "follow_up_questions": ["thoughtful questions for deeper reflection"],
  "related_entries": [{"id": "entry-id", "reason": "why it's related"}]
}

The JSON must be valid and complete. Do not include any text before or after the JSON.`;

export interface AgentAnalysisResult extends AnalysisResult {
  related_entries: Array<{ id: string; reason: string }>;
}

/**
 * Analyze a journal entry using the agent with multi-step discovery.
 * The agent will search and fetch related entries before providing analysis.
 */
export async function analyzeEntryWithAgent(
  transcript: string,
  existingTags: Tag[] = []
): Promise<AgentAnalysisResult> {
  const tagList = existingTags.map(t => t.name).join(", ");

  const prompt = `Please analyze this new journal entry. First, use the tools to explore related past entries and existing tags, then provide your analysis.

${tagList ? `Existing tags in the journal: ${tagList}` : "This is a new journal with no existing tags yet."}

New entry transcript:
---
${transcript}
---

Remember: After exploring with tools, respond with ONLY the JSON analysis object.`;

  let finalResult: string | null = null;

  const response = query({
    prompt,
    options: {
      mcpServers: {
        journal: journalServer,
      },
      model: "claude-opus-4-5-20251101",
      maxTurns: 10,
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: ANALYSIS_SYSTEM_PROMPT,
      },
      // Auto-allow the journal tools
      allowedTools: [
        "mcp__journal__search_entries",
        "mcp__journal__get_entry",
        "mcp__journal__list_recent_entries",
        "mcp__journal__get_entries_by_tag",
        "mcp__journal__get_all_tags",
      ],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      // Disable all built-in tools - we only want our custom journal tools
      tools: [],
    },
  });

  for await (const message of response) {
    if (message.type === "result") {
      if (message.subtype === "success") {
        finalResult = message.result;
        console.log(`Agent analysis completed in ${message.num_turns} turns, cost: $${message.total_cost_usd.toFixed(4)}`);
      } else {
        const errorMsg = "errors" in message ? message.errors.join(", ") : "Unknown error";
        throw new Error(`Agent analysis failed: ${errorMsg}`);
      }
    }
  }

  if (!finalResult) {
    throw new Error("Agent did not return a result");
  }

  // Parse the JSON response
  const jsonMatch = finalResult.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not parse JSON from agent response");
  }

  const analysis = JSON.parse(jsonMatch[0]) as AgentAnalysisResult;

  // Ensure all required fields have defaults
  return {
    title: analysis.title || "Untitled Entry",
    summary: analysis.summary || "",
    themes: analysis.themes || [],
    tags: analysis.tags || [],
    mood: analysis.mood,
    people_mentioned: analysis.people_mentioned || [],
    places_mentioned: analysis.places_mentioned || [],
    time_references: analysis.time_references || [],
    key_insights: analysis.key_insights || [],
    potential_links: analysis.potential_links || [],
    follow_up_questions: analysis.follow_up_questions || [],
    related_entries: analysis.related_entries || [],
  };
}
