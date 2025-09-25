import { ComposioClient } from "./composio";
import { AuthConfigManager } from "./authConfig";

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

  public async checkConnections(): Promise<boolean> {
    console.log("🔍 Checking all service connections...");

    // First, get all connected accounts
    const connections = await this.composioClient.getConnections();
    console.log(`Found ${connections.length} connections`);

    if (connections.length === 0) {
      console.log(
        "❌ No connections found. Please authenticate your services first."
      );
      return false;
    }

    let allConnected = true;

    // Test each connection by checking available tools
    for (const connection of connections) {
      const toolkit = connection.toolkitSlug?.toLowerCase();

      try {
        switch (toolkit) {
          case "notion":
            await this.testNotionConnection(connection);
            console.log("✅ Notion: Connected");
            break;

          case "googlecalendar":
            await this.testGoogleCalendarConnection(connection);
            console.log("✅ Google Calendar: Connected");
            break;

          case "openai":
            await this.testOpenAIConnection(connection);
            console.log("✅ OpenAI: Connected");
            break;

          case "youtube":
            await this.testYouTubeConnection(connection);
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

  private async testNotionConnection(connection: any) {
    // Use a simple action that doesn't require specific parameters
    await this.composioClient.executeAction(
      "NOTION_LIST_DATABASES",
      {},
      connection.userId
    );
  }

  private async testGoogleCalendarConnection(connection: any) {
    await this.composioClient.executeAction(
      "GOOGLECALENDAR_LIST_CALENDARS",
      {},
      connection.userId
    );
  }

  private async testOpenAIConnection(connection: any) {
    await this.composioClient.executeAction(
      "OPENAI_LIST_MODELS",
      {},
      connection.userId
    );
  }

  private async testYouTubeConnection(connection: any) {
    await this.composioClient.executeAction(
      "YOUTUBE_LIST_CHANNELS",
      { part: "id", mine: true },
      connection.userId
    );
  }

  // Helper method to get connections by toolkit
  public async getConnectionByToolkit(toolkit: string): Promise<any | null> {
    const connections = await this.composioClient.getConnections();
    return (
      connections.find(
        (conn) => conn.toolkitSlug?.toLowerCase() === toolkit.toLowerCase()
      ) || null
    );
  }
}
