import { ComposioClient } from "./composio";
import { ConnectionManager } from "./connection";
import { AuthConfigManager, WorkflowConfig } from "./authConfig";
import chalk from "chalk";

interface VideoData {
  id: string;
  videoBrief: string;
  driveLink: string;
  publishDate: string;
}

interface NotionPage {
  id: string;
  properties: { [key: string]: any };
}

export class YouTubeAutomationAgent {
  private composioClient: ComposioClient;
  private connectionManager: ConnectionManager;
  private authConfigManager: AuthConfigManager;
  private workflowConfig: WorkflowConfig;
  private isRunning: boolean = false;
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor(
    composioClient: ComposioClient,
    connectionManager: ConnectionManager,
    authConfigManager: AuthConfigManager
  ) {
    this.composioClient = composioClient;
    this.connectionManager = connectionManager;
    this.authConfigManager = authConfigManager;
    this.workflowConfig = authConfigManager.getWorkflowConfig();
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log(chalk.yellow("Agent is already running."));
      return;
    }
    console.log(chalk.green("🚀 Starting YouTube Automation Agent..."));
    this.isRunning = true;
    this.pollNotion();
  }

  public stop(): void {
    if (!this.isRunning) {
      console.log(chalk.yellow("Agent is not running."));
      return;
    }
    console.log(chalk.red("🛑 Stopping YouTube Automation Agent..."));
    this.isRunning = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }

  private pollNotion(): void {
    console.log(
      chalk.blue(
        `👂 Monitoring Notion database every ${
          this.workflowConfig.pollingIntervalMs / 1000
        } seconds...`
      )
    );
    this.pollingInterval = setInterval(async () => {
      if (!this.isRunning) return;
      console.log(chalk.gray("Checking for new entries..."));
      await this.findAndProcessNewEntries();
    }, this.workflowConfig.pollingIntervalMs);
  }

  private async findAndProcessNewEntries(): Promise<void> {
    try {
      const auth = this.authConfigManager.getAuthConfig();
      const response: any = await this.composioClient.executeAction(
        "notion_query_database",
        {
          database_id: this.workflowConfig.notionDatabaseId,
          filter: { property: "Status", status: { equals: "Not started" } },
        },
        auth.notionConnectionId
      );

      const newPages = response.results || [];
      if (newPages.length > 0) {
        console.log(
          chalk.magenta(
            `📝 Found ${newPages.length} new video entries to process.`
          )
        );
        for (const page of newPages) {
          await this.processEntry(page);
        }
      }
    } catch (error) {
      console.error(chalk.red("❌ Error polling Notion database:"), error);
    }
  }

  private async processEntry(page: NotionPage): Promise<void> {
    const videoData = this.extractVideoData(page);
    console.log(
      chalk.cyan(`\n🔄 Processing entry for: "${videoData.videoBrief}"`)
    );

    try {
      await this.updateNotionStatus(videoData.id, "In progress");
      await this.scheduleEvent(videoData);
      const { title, description } = await this.generateMetadata(videoData);
      await this.updateNotionWithMetadata(videoData.id, title, description);
      const youtubeUrl = await this.uploadToYouTube({
        ...videoData,
        title,
        description,
      });
      await this.updateNotionWithYoutubeLink(videoData.id, youtubeUrl);
      await this.updateNotionStatus(videoData.id, "Done");
      console.log(
        chalk.green(`✅ Successfully processed and uploaded: "${title}"`)
      );
    } catch (error) {
      console.error(
        chalk.red(`❌ Failed to process entry ${videoData.id}:`),
        error
      );
      await this.updateNotionStatus(videoData.id, "Error");
    }
  }

  private async scheduleEvent(data: VideoData): Promise<void> {
    console.log("  -> 📅 Scheduling event in Google Calendar...");
    const auth = this.authConfigManager.getAuthConfig();
    const startTime = new Date(data.publishDate);
    const endTime = new Date(
      startTime.getTime() +
        this.workflowConfig.defaultVideoDurationHours * 3600000
    );
    await this.composioClient.executeAction(
      "googlecalendar_create_event",
      {
        calendarId: "primary",
        summary: `📹 YouTube Upload: ${data.videoBrief}`,
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: endTime.toISOString() },
      },
      auth.googleCalendarConnectionId
    );
  }

  private async generateMetadata(
    data: VideoData
  ): Promise<{ title: string; description: string }> {
    console.log("  -> 🤖 Generating metadata with AI...");
    const auth = this.authConfigManager.getAuthConfig();
    const prompt = `Generate a YouTube title and description for a video with this brief: "${data.videoBrief}". Return a JSON object with "title" and "description" keys.`;

    const response: any = await this.composioClient.executeAction(
      "GEMINI_GENERATE_CONTENT",
      {
        model: "gemini-1.5-flash",
        prompt: prompt,
      },
      auth.geminiConnectionId
    );

    // Handle different possible response structures
    const responseText = response.text || response.data?.text || response;
    return JSON.parse(responseText);
  }

  private async uploadToYouTube(
    data: VideoData & { title: string; description: string }
  ): Promise<string> {
    console.log("  -> 📺 Uploading video to YouTube...");
    const auth = this.authConfigManager.getAuthConfig();
    const response: any = await this.composioClient.executeAction(
      "youtube_upload_video_from_url",
      {
        title: data.title,
        description: data.description,
        video_url: data.driveLink,
        privacy_status: this.workflowConfig.youtubePrivacyStatus,
      },
      auth.youtubeConnectionId
    );
    return `https://www.youtube.com/watch?v=${response.id}`;
  }

  private async updateNotionStatus(
    pageId: string,
    status: string
  ): Promise<void> {
    await this.updateNotionPage(pageId, {
      Status: { status: { name: status } },
    });
  }

  private async updateNotionWithMetadata(
    pageId: string,
    title: string,
    description: string
  ): Promise<void> {
    await this.updateNotionPage(pageId, {
      "Generated Title": { title: [{ text: { content: title } }] },
      "Generated Description": {
        rich_text: [{ text: { content: description } }],
      },
    });
  }

  private async updateNotionWithYoutubeLink(
    pageId: string,
    url: string
  ): Promise<void> {
    await this.updateNotionPage(pageId, { "YouTube Link": { url } });
  }

  private async updateNotionPage(
    pageId: string,
    properties: any
  ): Promise<void> {
    console.log(`  -> 📝 Updating Notion page ${pageId}...`);
    const auth = this.authConfigManager.getAuthConfig();
    await this.composioClient.executeAction(
      "notion_update_page",
      { page_id: pageId, properties },
      auth.notionConnectionId
    );
  }

  private extractVideoData(page: NotionPage): VideoData {
    const props = page.properties;
    return {
      id: page.id,
      videoBrief: props["Video Brief"]?.title[0]?.plain_text || "",
      driveLink: props["Drive Link"]?.url || "",
      publishDate:
        props["Publish Date"]?.date?.start || new Date().toISOString(),
    };
  }
}
