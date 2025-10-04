import { ComposioClient } from "./composio";
import { ConnectionManager } from "./connection";
import { AuthConfigManager, WorkflowConfig } from "./authConfig";
import chalk from "chalk";
import { OpenAI } from "openai";
import * as fs from "fs";
import * as path from "path";

interface VideoData {
  id: string;
  videoBrief: string;
  driveFileId: string;
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
  private connections: { [key: string]: string } = {};

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
      for (const conn of activeConnections) {
        if (conn.toolkit?.slug) {
          this.connections[conn.toolkit.slug.toLowerCase()] = conn.id;
          console.log(
            chalk.green(`✅ Found ${conn.toolkit.slug} connection: ${conn.id}`)
          );
        }
      }
      const required = [
        "notion",
        "googlecalendar",
        "openai",
        "youtube",
        "googledrive",
      ];
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

  private async findAndProcessNewEntries(): Promise<void> {
    try {
      const notionConnectionId = this.connections["notion"];
      if (!notionConnectionId) throw new Error("Notion connection not found");
      const response: any = await this.composioClient.executeAction(
        "NOTION_QUERY_DATABASE",
        { database_id: this.workflowConfig.notionDatabaseId },
        notionConnectionId,
        true
      );
      const allPages = response?.data?.response_data?.results || [];
      if (allPages.length === 0) return;
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
    let localVideoPath = "";
    try {
      await this.updateNotionStatus(videoData.id, "In progress");
      localVideoPath = await this.downloadVideoFromDrive(videoData.driveFileId);
      await this.scheduleEvent(videoData);
      const { title, description } = await this.generateMetadata(videoData);
      await this.updateNotionWithMetadata(videoData.id, title, description);
      const youtubeUrl = await this.uploadToYouTube(
        { ...videoData, title, description },
        localVideoPath
      );
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
    } finally {
      if (localVideoPath && fs.existsSync(localVideoPath)) {
        fs.unlinkSync(localVideoPath);
        console.log(`  -> 🗑️ Cleaned up temporary file: ${localVideoPath}`);
      }
    }
  }

  // FINAL DEBUGGING VERSION of downloadVideoFromDrive
  private async downloadVideoFromDrive(driveFileId: string): Promise<string> {
    if (!driveFileId) {
      throw new Error("Google Drive File ID is empty.");
    }
    console.log(`  -> 📥 Downloading video from Drive via Composio...`);

    const driveConnectionId = this.connections["googledrive"];
    if (!driveConnectionId) {
      throw new Error("Google Drive connection not found in Composio.");
    }

    const result = await this.composioClient.executeAction(
      "GOOGLEDRIVE_DOWNLOAD_FILE",
      { file_id: driveFileId },
      driveConnectionId,
      true
    );

    // --- THIS IS THE CRUCIAL ADDITION ---
    // We MUST see what the SDK is actually receiving.
    console.log(
      chalk.yellow("  -> RAW Download Response Received by SDK:"),
      JSON.stringify(result, null, 2)
    );

    const localFilePath = result.data?.downloaded_file_content?.uri;

    if (!localFilePath || typeof localFilePath !== "string") {
      // This error will now be much more informative because we logged the object above.
      throw new Error(
        "Download via Composio failed. Could not find a local file path in the RAW response printed above."
      );
    }

    console.log(chalk.green(`  -> ✅ Video downloaded to ${localFilePath}`));
    return localFilePath;
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

    const eventPayload = {
      calendarId: "primary",
      summary: `📹 YouTube Upload: ${data.videoBrief}`,
      start: {
        dateTime: startTime.toISOString(),
      },
      end: {
        dateTime: endTime.toISOString(),
      },
    };

    try {
      await this.composioClient.executeAction(
        "GOOGLECALENDAR_CREATE_EVENT",
        eventPayload,
        calendarConnectionId,
        true
      );
      console.log(chalk.green("  -> ✅ Event scheduled successfully."));
    } catch (error: any) {
      console.error(
        chalk.red("  -> ❌ Failed to schedule Google Calendar event:"),
        error.message
      );
      throw error;
    }
  }

  private async generateMetadata(
    data: VideoData
  ): Promise<{ title: string; description: string }> {
    console.log("  -> 🤖 Generating metadata with AI...");
    if (!this.connections["openai"])
      throw new Error("OpenAI connection not found.");
    const openai = new OpenAI();
    const prompt = `Generate a YouTube title and description for a video with this brief: "${data.videoBrief}". Return ONLY a valid JSON object with "title" and "description" keys. No additional text.`;
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are an expert YouTube content strategist. Return a single, valid JSON object with a 'title' and 'description'.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });
      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) throw new Error("Empty response from OpenAI.");
      return JSON.parse(responseText.trim());
    } catch (error) {
      console.error(chalk.red("❌ Error generating metadata:"), error);
      return {
        title: `${data.videoBrief} - Automated Upload`,
        description: `Video about: ${data.videoBrief}`,
      };
    }
  }

  private async uploadToYouTube(
    data: VideoData & { title: string; description: string },
    videoPath: string
  ): Promise<string> {
    console.log("  -> 📺 Uploading video to YouTube...");
    const youtubeConnectionId = this.connections["youtube"];
    if (!youtubeConnectionId) {
      throw new Error("YouTube connection not found");
    }

    const payload = {
      title: data.title,
      description: data.description,
      videoFilePath: videoPath,
      privacyStatus: "private",
      categoryId: "22",
      tags: ["composio", "automation", "wendys"],
    };

    const response: any = await this.composioClient.executeAction(
      "YOUTUBE_UPLOAD_VIDEO",
      payload,
      youtubeConnectionId,
      true
    );

    const videoId = response?.data?.response_data?.id;
    if (!videoId) {
      console.error(
        chalk.red("❌ Full upload response:"),
        JSON.stringify(response, null, 2)
      );
      throw new Error(
        `YouTube upload failed. Error from API: ${
          response.error || "No video ID returned."
        }`
      );
    }

    console.log(chalk.green(`  -> ✅ Video uploaded with ID: ${videoId}`));
    return `https://www.youtube.com/watch?v=${videoId}`;
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
      "Generated Title": { rich_text: [{ text: { content: title } }] },
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
    if (!properties || Object.keys(properties).length === 0) return;
    console.log(`  -> 📝 Updating Notion page ${pageId}...`);
    const notionConnectionId = this.connections["notion"];
    if (!notionConnectionId) throw new Error("Notion connection not found");
    await this.composioClient.executeAction(
      "NOTION_UPDATE_PAGE",
      { page_id: pageId, properties },
      notionConnectionId,
      true
    );
  }

  // --- THIS IS THE MISSING FUNCTION THAT HAS BEEN ADDED ---
  private extractFileIdFromDriveUrl(url: string): string {
    if (!url) {
      throw new Error("Google Drive URL is empty.");
    }
    const regex = /\/file\/d\/([a-zA-Z0-9_-]+)/;
    const match = url.match(regex);
    if (match && match[1]) {
      return match[1];
    }
    throw new Error(`Could not parse File ID from Google Drive URL: ${url}`);
  }

  private extractVideoData(page: NotionPage): VideoData {
    const props = page.properties;
    const originalDriveLink = props["Drive Link"]?.url || "";
    const publishDateStr = props["Publish Date"]?.date?.start;

    if (!publishDateStr) {
      console.warn(
        chalk.yellow(
          `⚠️ "Publish Date" is missing or invalid in Notion. Defaulting to now.`
        )
      );
    }

    const finalPublishDate = publishDateStr
      ? new Date(publishDateStr).toISOString()
      : new Date().toISOString();

    return {
      id: page.id,
      videoBrief: this.getTextFromProperty(props["Video Brief"]),
      driveFileId: this.extractFileIdFromDriveUrl(originalDriveLink),
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
