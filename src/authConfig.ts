import { config } from "dotenv";

config(); // Load environment variables from .env file

export interface AuthConfig {
  composioApiKey: string;
  notionConnectionId: string;
  googleCalendarConnectionId: string;
  OPENAIConnectionId: string;
  youtubeConnectionId: string;
}

export interface WorkflowConfig {
  notionDatabaseId: string;
  pollingIntervalMs: number;
  defaultVideoDurationHours: number;
  youtubePrivacyStatus: "private" | "public" | "unlisted";
  defaultPublishTime: string; // <-- ADDED
}

export class AuthConfigManager {
  private authConfig: AuthConfig;
  private workflowConfig: WorkflowConfig;

  constructor() {
    this.authConfig = this.loadAuthConfig();
    this.workflowConfig = this.loadWorkflowConfig();
  }

  private loadAuthConfig(): AuthConfig {
    const requiredEnvVars = [
      "COMPOSIO_API_KEY",
      "NOTION_CONNECTION_ID",
      "GOOGLE_CALENDAR_CONNECTION_ID",
      "OPENAI_CONNECTION_ID",
      "YOUTUBE_CONNECTION_ID",
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    return {
      composioApiKey: process.env.COMPOSIO_API_KEY!,
      notionConnectionId: process.env.NOTION_CONNECTION_ID!,
      googleCalendarConnectionId: process.env.GOOGLE_CALENDAR_CONNECTION_ID!,
      OPENAIConnectionId: process.env.OPENAI_CONNECTION_ID!,
      youtubeConnectionId: process.env.YOUTUBE_CONNECTION_ID!,
    };
  }

  private loadWorkflowConfig(): WorkflowConfig {
    return {
      notionDatabaseId: process.env.NOTION_DATABASE_ID || "",
      pollingIntervalMs: parseInt(process.env.POLLING_INTERVAL_MS || "30000"),
      defaultVideoDurationHours: parseInt(
        process.env.DEFAULT_VIDEO_DURATION_HOURS || "1"
      ),
      youtubePrivacyStatus:
        (process.env.YOUTUBE_PRIVACY_STATUS as any) || "private",
      // ADDED: Loads default time from .env, falls back to "12:00"
      defaultPublishTime: process.env.DEFAULT_PUBLISH_TIME || "12:00",
    };
  }

  public getAuthConfig(): AuthConfig {
    return this.authConfig;
  }

  public getWorkflowConfig(): WorkflowConfig {
    return this.workflowConfig;
  }

  public validateConfig(): boolean {
    if (!this.workflowConfig.notionDatabaseId) {
      console.error("❌ Notion database ID is missing in .env file");
      return false;
    }
    console.log("✅ Configuration validated successfully");
    return true;
  }

  public printConfig(): void {
    console.log("\n📋 Current Configuration:");
    console.log(
      `  - Notion Database ID: ${this.workflowConfig.notionDatabaseId}`
    );
    console.log(
      `  - Polling Interval: ${this.workflowConfig.pollingIntervalMs}ms`
    );
  }
}
