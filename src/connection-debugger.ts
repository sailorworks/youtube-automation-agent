import { ComposioClient } from "./composio";
import { AuthConfigManager } from "./authConfig"; // Import AuthConfigManager
import chalk from "chalk";

export class ConnectionDebugger {
  private composioClient: ComposioClient;
  private authConfigManager: AuthConfigManager; // Add this

  constructor(
    composioClient: ComposioClient,
    authConfigManager: AuthConfigManager // Modify constructor
  ) {
    this.composioClient = composioClient;
    this.authConfigManager = authConfigManager; // Add this
  }

  public async debugConnections(): Promise<void> {
    console.log(chalk.blue("🔍 Debugging connections..."));

    try {
      const connections = await this.composioClient.getConnections();
      console.log(
        chalk.yellow(`Found ${connections.length} total connections`)
      );

      connections.forEach((conn, index) => {
        console.log(chalk.cyan(`\n--- Connection ${index + 1} ---`));
        console.log(`ID: ${conn.id}`);
        console.log(`Status: ${conn.status}`);
        console.log(`Toolkit: ${JSON.stringify(conn.toolkit, null, 2)}`);
        console.log(`User ID: ${conn.userId}`);
        console.log(`Auth Config: ${JSON.stringify(conn.authConfig, null, 2)}`);
        console.log(`Full object:`, JSON.stringify(conn, null, 2));
      });

      // Try to find active connections only
      const activeConnections = connections.filter(
        (conn) => conn.status === "ACTIVE"
      );
      console.log(
        chalk.green(`\nActive connections: ${activeConnections.length}`)
      );

      if (activeConnections.length === 0) {
        console.log(
          chalk.red("❌ No ACTIVE connections found. This is likely the issue.")
        );
        console.log(
          chalk.yellow(
            "💡 Go to your Composio dashboard and ensure your connections are active."
          )
        );
      }
    } catch (error: any) {
      console.error(
        chalk.red("❌ Failed to debug connections:"),
        error.message
      );
    }
  }

  public async testSpecificConnection(): Promise<void> {
    console.log(chalk.blue("🧪 Testing with specific connection IDs..."));

    try {
      const connections = await this.composioClient.getConnections();
      const activeConnections = connections.filter(
        (conn) => conn.status === "ACTIVE"
      );

      if (activeConnections.length === 0) {
        console.log(chalk.red("No active connections to test"));
        return;
      }

      // Test each connection with the appropriate action for its toolkit
      for (const conn of activeConnections) {
        const toolkit = conn.toolkit?.slug;
        console.log(chalk.cyan(`\nTesting ${toolkit} connection: ${conn.id}`));

        try {
          const composio = this.composioClient.getComposioInstance();
          const workflowConfig = this.authConfigManager.getWorkflowConfig(); // Get workflow config
          let result;

          switch (toolkit) {
            case "notion":
              // --- THIS IS THE FIX ---
              // The old tool NOTION_LIST_DATABASES is unreliable with the new API.
              // We now test by querying the specific database from our config, which is a better real-world test.
              result = await composio.tools.execute("NOTION_QUERY_DATABASE", {
                connectedAccountId: conn.id,
                arguments: {
                  database_id: workflowConfig.notionDatabaseId,
                  // We add a page_size limit to make the test fast and efficient
                  page_size: 1,
                },
              });
              break;

            case "openai":
              result = await composio.tools.execute("OPENAI_LIST_MODELS", {
                connectedAccountId: conn.id,
                arguments: {},
              });
              break;

            case "googlecalendar":
              result = await composio.tools.execute(
                "GOOGLECALENDAR_LIST_CALENDARS",
                {
                  connectedAccountId: conn.id,
                  arguments: {},
                }
              );
              break;

            case "youtube":
              result = await composio.tools.execute(
                "YOUTUBE_LIST_USER_SUBSCRIPTIONS",
                {
                  connectedAccountId: conn.id,
                  arguments: { part: "id", mine: true },
                }
              );
              break;

            case "googledrive":
              result = await composio.tools.execute("GOOGLEDRIVE_LIST_FILES", {
                connectedAccountId: conn.id,
                arguments: { maxResults: 1 },
              });
              break;

            default:
              console.log(chalk.yellow(`⚠️ Unknown toolkit: ${toolkit}`));
              continue;
          }

          console.log(
            chalk.green(`✅ ${toolkit} connection ${conn.id} works!`)
          );
          console.log(
            chalk.gray(
              `   Result: ${JSON.stringify(result).substring(0, 100)}...`
            )
          );
        } catch (error: any) {
          console.log(
            chalk.red(
              `❌ ${toolkit} connection ${conn.id} failed: ${error.message}`
            )
          );
        }
      }
    } catch (error: any) {
      console.error(chalk.red("❌ Failed to test connections:"), error.message);
    }
  }
}
