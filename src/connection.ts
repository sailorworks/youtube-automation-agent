import { ComposioClient } from "./composio";
import { AuthConfigManager } from "./authConfig";
import chalk from "chalk";

export class ConnectionManager {
  private composioClient: ComposioClient;
  private authConfigManager: AuthConfigManager;

  constructor(
    composioClient: ComposioClient,
    authConfigManager: AuthConfigManager
  ) {
    this.composioClient = composioClient;
    this.authConfigManager = authConfigManager;
  }

  // ----------------------------
  // Old method: Check connections
  // ----------------------------
  public async checkConnections(): Promise<boolean> {
    console.log("🔍 Checking all service connections...");

    const connections = await this.composioClient.getConnections();
    console.log(`Found ${connections.length} connections`);

    if (connections.length === 0) {
      console.log(
        "❌ No connections found. Please authenticate your services first."
      );
      return false;
    }

    let allConnected = true;
    const workflowConfig = this.authConfigManager.getWorkflowConfig(); // Get config for user IDs

    for (const connection of connections) {
      const toolkit = connection.toolkitSlug?.toLowerCase();

      try {
        switch (toolkit) {
          case "notion":
            await this.composioClient.executeAction(
              "NOTION_LIST_DATABASES",
              {},
              connection.userId
            );
            console.log("✅ Notion: Connected");
            break;

          /* CHANGE: Commented out Google Calendar block
          case "googlecalendar":
            await this.composioClient.executeAction(
              "GOOGLECALENDAR_LIST_CALENDARS",
              {},
              connection.userId
            );
            console.log("✅ Google Calendar: Connected");
            break;
          */

          case "openai":
            await this.composioClient.executeAction(
              "OPENAI_LIST_MODELS",
              {},
              connection.userId
            );
            console.log("✅ OpenAI: Connected");
            break;

          // CHANGE: Added Instagram connection test
          case "instagram":
            await this.composioClient.executeAction(
              "INSTAGRAM_GET_USER_MEDIA",
              { ig_user_id: workflowConfig.instagramUserId, limit: 1 },
              connection.id,
              true
            );
            console.log("✅ Instagram: Connected");
            break;

          case "youtube":
            await this.composioClient.executeAction(
              "YOUTUBE_LIST_CHANNELS",
              { part: "id", mine: true },
              connection.userId
            );
            console.log("✅ YouTube: Connected");
            break;

          default:
            console.log(`⚠️ Unknown toolkit: ${toolkit}`);
        }
      } catch (error) {
        console.log(`❌ ${toolkit}: Connection failed - ${error}`);
        allConnected = false;
      }
    }

    if (allConnected) {
      console.log("🎉 All services connected successfully!");
    } else {
      console.log(
        "⚠️ Some services are not connected. Please check your connections in your Composio dashboard."
      );
    }

    return allConnected;
  }

  // ----------------------------
  // Debugger methods
  // ----------------------------
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

      for (const conn of activeConnections) {
        const toolkit = conn.toolkit?.slug;
        console.log(chalk.cyan(`\nTesting ${toolkit} connection: ${conn.id}`));

        try {
          const composio = this.composioClient.getComposioInstance();
          const workflowConfig = this.authConfigManager.getWorkflowConfig();
          let result;

          switch (toolkit) {
            case "notion":
              result = await composio.tools.execute("NOTION_QUERY_DATABASE", {
                connectedAccountId: conn.id,
                arguments: {
                  database_id: workflowConfig.notionDatabaseId,
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

            /* CHANGE: Commented out Google Calendar block
            case "googlecalendar":
              result = await composio.tools.execute(
                "GOOGLECALENDAR_LIST_CALENDARS",
                {
                  connectedAccountId: conn.id,
                  arguments: {},
                }
              );
              break;
            */

            // CHANGE: Added Instagram connection test case
            case "instagram":
              result = await composio.tools.execute(
                "INSTAGRAM_GET_USER_MEDIA",
                {
                  connectedAccountId: conn.id,
                  arguments: {
                    ig_user_id: workflowConfig.instagramUserId,
                    limit: 1,
                  },
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
