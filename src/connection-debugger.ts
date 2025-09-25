import { ComposioClient } from "./composio";
import { AuthConfigManager } from "./authConfig";
import chalk from "chalk";

export class ConnectionDebugger {
  private composioClient: ComposioClient;

  constructor(composioClient: ComposioClient) {
    this.composioClient = composioClient;
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
          let result;

          switch (toolkit) {
            case "notion":
              result = await composio.tools.execute("NOTION_LIST_DATABASES", {
                connectedAccountId: conn.id,
                arguments: {},
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
              result = await composio.tools.execute("YOUTUBE_LIST_CHANNELS", {
                connectedAccountId: conn.id,
                arguments: { part: "id", mine: true },
              });
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
