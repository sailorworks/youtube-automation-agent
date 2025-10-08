import { Composio } from "@composio/core";
import chalk from "chalk";
import { config } from "dotenv"; // CHANGE: Added dotenv to read environment variables
config(); // CHANGE: Load .env file

export class ToolChecker {
  private composio: Composio;
  // CHANGE: Updated userId to reflect the Instagram agent's purpose
  private userId: string = "instagram-automation-user";

  constructor(apiKey: string) {
    this.composio = new Composio({ apiKey });
  }

  public async checkAvailableTools(): Promise<void> {
    try {
      console.log(chalk.blue("🔍 Checking available tools..."));

      // CHANGE: Updated toolkits to match the agent's requirements
      const toolkits = ["NOTION", "OPENAI", "INSTAGRAM", "GOOGLEDRIVE"];

      for (const toolkit of toolkits) {
        try {
          const tools = await this.composio.tools.get(this.userId, {
            toolkits: [toolkit],
          });

          console.log(
            chalk.green(`\n✅ ${toolkit} Tools (${tools.length} available):`)
          );
          tools.forEach((tool: any) => {
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

    // CHANGE: Added this line to get the Instagram User ID for the test
    const instagramUserId = process.env.INSTAGRAM_USER_ID;

    const testActions = [
      { toolkit: "NOTION", action: "NOTION_LIST_DATABASES", params: {} },
      // Google Calendar remains commented out
      // {
      //   toolkit: "GOOGLECALENDAR",
      //   action: "GOOGLECALENDAR_LIST_CALENDARS",
      //   params: {},
      // },
      { toolkit: "OPENAI", action: "OPENAI_LIST_MODELS", params: {} },
      // CHANGE: Replaced YOUTUBE test with an INSTAGRAM test
      {
        toolkit: "INSTAGRAM",
        action: "INSTAGRAM_GET_USER_MEDIA",
        params: { ig_user_id: instagramUserId, limit: 1 },
      },
      // CHANGE: Added a test for GOOGLEDRIVE
      {
        toolkit: "GOOGLEDRIVE",
        action: "GOOGLEDRIVE_LIST_FILES",
        params: { maxResults: 1 },
      },
    ];

    for (const test of testActions) {
      // A small check to skip Instagram test if the ID is missing in .env
      if (test.toolkit === "INSTAGRAM" && !instagramUserId) {
        console.log(
          chalk.yellow(
            "⚠️ INSTAGRAM test skipped: INSTAGRAM_USER_ID not found in .env file."
          )
        );
        continue;
      }

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
