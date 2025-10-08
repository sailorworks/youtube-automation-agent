import { config } from "dotenv";
config(); // Load environment variables from .env file

export interface AuthConfig {
  composioApiKey: string;
  notionConnectionId: string;
  // googleCalendarConnectionId: string; // CHANGE: Commented out
  openaiConnectionId: string;
  instagramConnectionId: string;
  googleDriveConnectionId: string;
}

export interface WorkflowConfig {
  notionDatabaseId: string;
  pollingIntervalMs: number;
  // defaultVideoDurationHours: number; // CHANGE: Commented out
  instagramUserId: string;
  // defaultPublishTime: string; // CHANGE: Commented out
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
      // "GOOGLE_CALENDAR_CONNECTION_ID", // CHANGE: Commented out
      "OPENAI_CONNECTION_ID",
      "INSTAGRAM_CONNECTION_ID",
      "GOOGLE_DRIVE_CONNECTION_ID",
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    return {
      composioApiKey: process.env.COMPOSIO_API_KEY!,
      notionConnectionId: process.env.NOTION_CONNECTION_ID!,
      // googleCalendarConnectionId: process.env.GOOGLE_CALENDAR_CONNECTION_ID!, // CHANGE: Commented out
      openaiConnectionId: process.env.OPENAI_CONNECTION_ID!,
      instagramConnectionId: process.env.INSTAGRAM_CONNECTION_ID!,
      googleDriveConnectionId: process.env.GOOGLE_DRIVE_CONNECTION_ID!,
    };
  }

  private loadWorkflowConfig(): WorkflowConfig {
    return {
      notionDatabaseId: process.env.NOTION_DATABASE_ID || "",
      pollingIntervalMs: parseInt(process.env.POLLING_INTERVAL_MS || "30000"),
      // defaultVideoDurationHours: parseInt( // CHANGE: Commented out
      //   process.env.DEFAULT_VIDEO_DURATION_HOURS || "1"
      // ),
      instagramUserId: process.env.INSTAGRAM_USER_ID || "",
      // defaultPublishTime: process.env.DEFAULT_PUBLISH_TIME || "12:00", // CHANGE: Commented out
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
    if (!this.workflowConfig.instagramUserId) {
      console.error("❌ Instagram User ID is missing in .env file");
      return false;
    }
    console.log("✅ Configuration validated successfully");
    return true;
  }

  public printConfig(): void {
    console.log("\n📋 Current Configuration:");
    console.log(
      ` - Notion Database ID: ${this.workflowConfig.notionDatabaseId}`
    );
    console.log(
      ` - Polling Interval: ${this.workflowConfig.pollingIntervalMs}ms`
    );
    console.log(` - Instagram User ID: ${this.workflowConfig.instagramUserId}`);
  }
}
