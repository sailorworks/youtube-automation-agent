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
  private connections: { [key: string]: string } = {}; // Cache connection IDs

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

    // Initialize connections first
    await this.initializeConnections();

    console.log(chalk.green("🚀 Starting YouTube Automation Agent..."));
    this.isRunning = true;
    this.pollNotion();
  }

  private async initializeConnections(): Promise<void> {
    console.log(chalk.blue("🔗 Initializing connections..."));

    try {
      const allConnections = await this.composioClient.getConnections();
      const activeConnections = allConnections.filter(
        (conn) => conn.status === "ACTIVE"
      );

      if (activeConnections.length === 0) {
        throw new Error(
          "No active connections found. Please authenticate your services in Composio dashboard."
        );
      }

      // Map toolkit names to connection IDs
      for (const conn of activeConnections) {
        if (conn.toolkit?.slug) {
          this.connections[conn.toolkit.slug.toLowerCase()] = conn.id;
          console.log(
            chalk.green(`✅ Found ${conn.toolkit.slug} connection: ${conn.id}`)
          );
        }
      }

      // Check required toolkits
      const required = ["notion", "googlecalendar", "openai", "youtube"];
      const missing = required.filter((toolkit) => !this.connections[toolkit]);

      if (missing.length > 0) {
        console.log(
          chalk.yellow(`⚠️ Missing connections for: ${missing.join(", ")}`)
        );
      }
    } catch (error: any) {
      console.error(
        chalk.red("❌ Failed to initialize connections:"),
        error.message
      );
      throw error;
    }
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

  // REPLACE the old findAndProcessNewEntries function with this new one.

  private async findAndProcessNewEntries(): Promise<void> {
    try {
      const notionConnectionId = this.connections["notion"];
      if (!notionConnectionId) {
        throw new Error("Notion connection not found");
      }

      const response: any = await this.composioClient.executeAction(
        "NOTION_QUERY_DATABASE",
        {
          database_id: this.workflowConfig.notionDatabaseId,
        },
        notionConnectionId,
        true
      );

      // --- vvv THIS IS THE CORRECTED LINE vvv ---
      // Point to the correct nested path to get the pages.
      const allPages = response?.data?.response_data?.results || [];
      // --- ^^^ THIS IS THE CORRECTED LINE ^^^ ---

      if (allPages.length === 0) {
        return; // No pages in the database.
      }

      // Manually filter the results in our code.
      const unprocessedPages = allPages.filter(
        (page: NotionPage) =>
          page.properties?.Status?.status?.name === "Not started"
      );

      if (unprocessedPages.length > 0) {
        console.log(
          chalk.magenta(
            `📝 Found ${unprocessedPages.length} new video entries to process.`
          )
        );
        for (const page of unprocessedPages) {
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
    const calendarConnectionId = this.connections["googlecalendar"];
    if (!calendarConnectionId) {
      throw new Error("Google Calendar connection not found");
    }

    const startTime = new Date(data.publishDate);
    const endTime = new Date(
      startTime.getTime() +
        this.workflowConfig.defaultVideoDurationHours * 3600000
    );

    await this.composioClient.executeAction(
      "GOOGLECALENDAR_CREATE_EVENT",
      {
        calendarId: "primary",
        summary: `📹 YouTube Upload: ${data.videoBrief}`,
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: endTime.toISOString() },
      },
      calendarConnectionId,
      true
    );
  }

  private async generateMetadata(
    data: VideoData
  ): Promise<{ title: string; description: string }> {
    console.log("  -> 🤖 Generating metadata with AI...");
    const openaiConnectionId = this.connections["openai"];
    if (!openaiConnectionId) {
      throw new Error("OpenAI connection not found");
    }

    const prompt = `Generate a YouTube title and description for a video with this brief: "${data.videoBrief}". 
    
    Return ONLY a valid JSON object with "title" and "description" keys. No additional text or formatting.
    
    Example:
    {"title": "Amazing Video Title", "description": "Detailed description here"}`;

    const response: any = await this.composioClient.executeAction(
      "OPENAI_CREATE_CHAT_COMPLETION",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      },
      openaiConnectionId,
      true
    );

    const responseText =
      response.choices?.[0]?.message?.content || response.content || response;

    try {
      return JSON.parse(responseText.trim());
    } catch (parseError) {
      console.warn("Failed to parse AI response as JSON, using fallback");
      return {
        title: `${data.videoBrief} - Automated Upload`,
        description: `Video about: ${data.videoBrief}`,
      };
    }
  }

  // --- vvv THIS IS THE UPDATED FUNCTION vvv ---
  private async uploadToYouTube(
    data: VideoData & { title: string; description: string }
  ): Promise<string> {
    console.log("  -> 📺 Uploading video to YouTube...");
    const youtubeConnectionId = this.connections["youtube"];
    if (!youtubeConnectionId) {
      throw new Error("YouTube connection not found");
    }

    // --- START: YouTube Scheduling Logic ---

    const publishDateTime = new Date(data.publishDate);
    const now = new Date();

    // Define a type for our status object for clarity
    let youtubeStatus: { privacyStatus: string; publishAt?: string };

    if (publishDateTime <= now) {
      // If the date is in the past, publish it immediately as public.
      console.log(
        "  -> ⏰ Publish time is in the past. Publishing immediately."
      );
      youtubeStatus = {
        privacyStatus: "public",
      };
    } else {
      // If the date is in the future, schedule it.
      // The video is uploaded as 'private' and will automatically go public at 'publishAt'.
      console.log(
        `  -> ⏰ Scheduling video to be published on ${publishDateTime.toLocaleString()}`
      );
      youtubeStatus = {
        privacyStatus: "private",
        publishAt: publishDateTime.toISOString(),
      };
    }
    // --- END: YouTube Scheduling Logic ---

    const response: any = await this.composioClient.executeAction(
      "YOUTUBE_UPLOAD_VIDEO",
      {
        snippet: {
          title: data.title,
          description: data.description,
        },
        status: youtubeStatus, // <-- Use our new dynamic status object
        media: {
          url: data.driveLink,
        },
      },
      youtubeConnectionId,
      true
    );

    return response.id
      ? `https://www.youtube.com/watch?v=${response.id}`
      : response.url;
  }
  // --- ^^^ THIS IS THE UPDATED FUNCTION ^^^ ---

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
      "Generated Title": {
        rich_text: [{ text: { content: title } }],
      },
      "Generated Description": {
        rich_text: [{ text: { content: description } }],
      },
    });
  }

  private async updateNotionWithYoutubeLink(
    pageId: string,
    url: string
  ): Promise<void> {
    await this.updateNotionPage(pageId, {
      "YouTube Link": { url },
    });
  }

  private async updateNotionPage(
    pageId: string,
    properties: any
  ): Promise<void> {
    console.log(`  -> 📝 Updating Notion page ${pageId}...`);
    const notionConnectionId = this.connections["notion"];
    if (!notionConnectionId) {
      throw new Error("Notion connection not found");
    }

    await this.composioClient.executeAction(
      "NOTION_UPDATE_PAGE",
      {
        page_id: pageId,
        properties,
      },
      notionConnectionId,
      true
    );
  }

  private extractVideoData(page: NotionPage): VideoData {
    const props = page.properties;

    const publishDateProperty = props["Publish Date"]?.date?.start;
    let finalPublishDate: string;

    if (publishDateProperty) {
      if (publishDateProperty.includes("T")) {
        finalPublishDate = publishDateProperty;
      } else {
        const defaultTime = this.workflowConfig.defaultPublishTime;
        finalPublishDate = `${publishDateProperty}T${defaultTime}:00`;
      }
    } else {
      finalPublishDate = new Date().toISOString();
    }

    return {
      id: page.id,
      videoBrief: this.getTextFromProperty(props["Video Brief"]),
      driveLink: props["Drive Link"]?.url || "",
      publishDate: finalPublishDate,
    };
  }

  private getTextFromProperty(property: any): string {
    if (!property) return "";

    if (property.title && property.title.length > 0) {
      return property.title[0]?.plain_text || "";
    }
    if (property.rich_text && property.rich_text.length > 0) {
      return property.rich_text[0]?.plain_text || "";
    }

    return "";
  }
}
