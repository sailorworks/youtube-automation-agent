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
    const authConfig = this.authConfigManager.getAuthConfig();
    let allConnected = true;

    try {
      await this.composioClient.executeAction(
        "notion_list_users",
        {},
        authConfig.notionConnectionId
      );
      console.log("✅ Notion: Connected");
    } catch (e) {
      console.log("❌ Notion: Connection failed");
      allConnected = false;
    }

    try {
      await this.composioClient.executeAction(
        "googlecalendar_list_events",
        { calendarId: "primary", maxResults: 1 },
        authConfig.googleCalendarConnectionId
      );
      console.log("✅ Google Calendar: Connected");
    } catch (e) {
      console.log("❌ Google Calendar: Connection failed");
      allConnected = false;
    }

    try {
      await this.composioClient.executeAction(
        "gemini_list_models",
        {},
        authConfig.geminiConnectionId
      );
      console.log("✅ Gemini: Connected");
    } catch (e) {
      console.log("❌ Gemini: Connection failed");
      allConnected = false;
    }

    try {
      await this.composioClient.executeAction(
        "youtube_list_channels",
        { part: "id", mine: true },
        authConfig.youtubeConnectionId
      );
      console.log("✅ YouTube: Connected");
    } catch (e) {
      console.log("❌ YouTube: Connection failed");
      allConnected = false;
    }

    if (allConnected) {
      console.log("🎉 All services connected successfully!");
    } else {
      console.log(
        "⚠️ Some services are not connected. Please check your Connection IDs in the .env file and in your Composio dashboard."
      );
    }

    return allConnected;
  }
}
