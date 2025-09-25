import { Composio } from "@composio/core";
import chalk from "chalk";

export class ToolChecker {
  private composio: Composio;
  private userId: string = "youtube-automation-user";

  constructor(apiKey: string) {
    this.composio = new Composio({ apiKey });
  }

  public async checkAvailableTools(): Promise<void> {
    try {
      console.log(chalk.blue("🔍 Checking available tools..."));

      // Get tools for each toolkit
      const toolkits = ["NOTION", "GOOGLECALENDAR", "OPENAI", "YOUTUBE"];

      for (const toolkit of toolkits) {
        try {
          const tools = await this.composio.tools.get(this.userId, {
            toolkits: [toolkit],
          });

          console.log(
            chalk.green(`\n✅ ${toolkit} Tools (${tools.length} available):`)
          );
          tools.forEach((tool: any) => {
            // Note: The documentation shows tools may not have description/slug directly
            console.log(
              `  - ${tool.function?.name || tool.name || "Unknown"}: ${
                tool.function?.description || "No description"
              }`
            );
          });
        } catch (error) {
          console.log(
            chalk.red(`❌ ${toolkit}: No tools available or not connected`)
          );
        }
      }
    } catch (error: any) {
      console.error(chalk.red("❌ Failed to check tools:"), error.message);
    }
  }

  public async testBasicActions(): Promise<void> {
    console.log(chalk.blue("🧪 Testing basic actions..."));

    const testActions = [
      { toolkit: "NOTION", action: "NOTION_LIST_DATABASES", params: {} },
      {
        toolkit: "GOOGLECALENDAR",
        action: "GOOGLECALENDAR_LIST_CALENDARS",
        params: {},
      },
      { toolkit: "OPENAI", action: "OPENAI_LIST_MODELS", params: {} },
      {
        toolkit: "YOUTUBE",
        action: "YOUTUBE_LIST_CHANNELS",
        params: { part: "id", mine: true },
      },
    ];

    for (const test of testActions) {
      try {
        const result = await this.composio.tools.execute(test.action, {
          userId: this.userId,
          arguments: test.params,
        });
        console.log(chalk.green(`✅ ${test.action}: Working`));
      } catch (error: any) {
        console.log(chalk.red(`❌ ${test.action}: ${error.message}`));
      }
    }
  }
}
