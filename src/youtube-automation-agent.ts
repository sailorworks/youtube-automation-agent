import { ComposioClient } from "./composio";
import { ConnectionManager } from "./connection";
import { AuthConfigManager, WorkflowConfig } from "./authConfig";
import chalk from "chalk";
import { OpenAI } from "openai";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

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

      localVideoPath = await this.downloadVideoFromDrive(videoData.driveLink);

      // Pre-upload the file to Composio, providing the tool context
      const composioFileId = await this.composioClient.uploadFile(
        localVideoPath,
        "YOUTUBE_UPLOAD_VIDEO",
        "youtube"
      );

      await this.scheduleEvent(videoData);
      const { title, description } = await this.generateMetadata(videoData);
      await this.updateNotionWithMetadata(videoData.id, title, description);

      const youtubeUrl = await this.uploadToYouTube(
        {
          ...videoData,
          title,
          description,
        },
        composioFileId
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

  private async downloadVideoFromDrive(driveUrl: string): Promise<string> {
    if (!driveUrl) {
      throw new Error("Google Drive URL is empty.");
    }
    console.log(`  -> 📥 Downloading video from Drive...`);

    const tempDir = path.join(__dirname, "..", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const localFilePath = path.join(tempDir, `video-${Date.now()}.mp4`);
    const writer = fs.createWriteStream(localFilePath);

    try {
      const response = await axios({
        method: "get",
        url: driveUrl,
        responseType: "stream",
      });

      (response.data as NodeJS.ReadableStream).pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on("finish", () => {
          console.log(
            chalk.green(`  -> ✅ Video downloaded to ${localFilePath}`)
          );
          resolve(localFilePath);
        });
        writer.on("error", (err) => {
          console.error(chalk.red("  -> ❌ File download failed."), err);
          reject(err);
        });
      });
    } catch (error) {
      throw new Error(`Failed to download from Google Drive. Error: ${error}`);
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

    const formatDateTime = (date: Date) =>
      date.toISOString().split(".")[0] + "Z";

    await this.composioClient.executeAction(
      "GOOGLECALENDAR_CREATE_EVENT",
      {
        calendarId: "primary",
        summary: `📹 YouTube Upload: ${data.videoBrief}`,
        start_datetime: formatDateTime(startTime),
        end_datetime: formatDateTime(endTime),
      },
      calendarConnectionId,
      true
    );
  }

  private async generateMetadata(
    data: VideoData
  ): Promise<{ title: string; description: string }> {
    console.log("  -> 🤖 Generating metadata with AI...");
    if (!this.connections["openai"]) {
      throw new Error("OpenAI connection not found.");
    }
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
    composioFileId: string
  ): Promise<string> {
    console.log("  -> 📺 Uploading video to YouTube...");
    const youtubeConnectionId = this.connections["youtube"];
    if (!youtubeConnectionId) {
      throw new Error("YouTube connection not found");
    }

    const response: any = await this.composioClient.executeAction(
      "YOUTUBE_UPLOAD_VIDEO",
      {
        title: data.title,
        description: data.description,
        videoFilePath: composioFileId,
        privacyStatus: "public",
        categoryId: "22",
        tags: ["automated", "upload", "composio"],
      },
      youtubeConnectionId,
      true
    );

    const videoId = response?.data?.response_data?.id;
    return videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : "Could not get a valid YouTube URL.";
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

  private parseCustomDateTime(dateStr: string, timeStr: string): string {
    if (
      !dateStr ||
      !timeStr ||
      dateStr.length !== 6 ||
      !timeStr.includes(":")
    ) {
      throw new Error(
        `Invalid date/time format. Received date: '${dateStr}', time: '${timeStr}'`
      );
    }

    const month = parseInt(dateStr.substring(0, 2), 10);
    const day = parseInt(dateStr.substring(2, 4), 10);
    const year = 2000 + parseInt(dateStr.substring(4, 6), 10);
    const [hour, minute] = timeStr.split(":").map(Number);

    if (
      isNaN(month) ||
      isNaN(day) ||
      isNaN(year) ||
      isNaN(hour) ||
      isNaN(minute)
    ) {
      throw new Error("Date or time string is not a valid number.");
    }
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    return date.toISOString();
  }

  private transformGoogleDriveLink(originalUrl: string): string {
    if (!originalUrl) return "";
    const regex = /\/file\/d\/([a-zA-Z0-9_-]+)/;
    const match = originalUrl.match(regex);
    if (match && match[1]) {
      const fileId = match[1];
      return `https://drive.google.com/uc?export=download&id=${fileId}`;
    }

    if (originalUrl.includes("uc?export=download")) {
      return originalUrl;
    }

    console.warn(
      chalk.yellow(
        `⚠️ Could not parse Google Drive File ID. Using original URL.`
      )
    );
    return originalUrl;
  }

  private extractVideoData(page: NotionPage): VideoData {
    const props = page.properties;
    const dateStr = this.getTextFromProperty(props["Publish Date"]);
    const timeStr = this.getTextFromProperty(props["Publish Time"]);
    const originalDriveLink = props["Drive Link"]?.url || "";

    let finalPublishDate: string;
    try {
      finalPublishDate = this.parseCustomDateTime(dateStr, timeStr);
    } catch (error) {
      console.warn(
        chalk.yellow(
          `⚠️ Could not parse date/time from Notion. Defaulting to now. Error: ${
            (error as Error).message
          }`
        )
      );
      finalPublishDate = new Date().toISOString();
    }

    return {
      id: page.id,
      videoBrief: this.getTextFromProperty(props["Video Brief"]),
      driveLink: this.transformGoogleDriveLink(originalDriveLink),
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
