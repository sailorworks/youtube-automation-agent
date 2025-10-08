import { ComposioClient } from "./composio";
import { ConnectionManager } from "./connection";
import { AuthConfigManager, WorkflowConfig } from "./authConfig";
import chalk from "chalk";
import { OpenAI } from "openai";
import * as fs from "fs";
import * as path from "path";

interface InstaData {
  id: string;
  videoBrief: string;
  driveLink: string;
  publishDate: string;
}

interface NotionPage {
  id: string;
  properties: { [key: string]: any };
}

export class InstagramAutomationAgent {
  private composioClient: ComposioClient;
  private connectionManager: ConnectionManager;
  private authConfigManager: AuthConfigManager;
  private workflowConfig: WorkflowConfig;
  private isRunning: boolean = false;
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
    console.log(chalk.green("🚀 Starting Instagram Automation Agent..."));
    this.isRunning = true;
    this.runLoop();
  }

  private async runLoop(): Promise<void> {
    console.log(chalk.blue(`👂 Monitoring Notion...`));
    while (this.isRunning) {
      await this.findAndProcessNewEntries();
      await new Promise((resolve) =>
        setTimeout(resolve, this.workflowConfig.pollingIntervalMs)
      );
    }
  }

  private async initializeConnections(): Promise<void> {
    console.log(chalk.blue("🔗 Initializing connections..."));
    try {
      const allConnections = await this.composioClient.getConnections();
      const activeConnections = allConnections.filter(
        (conn) => conn.status === "ACTIVE"
      );
      if (activeConnections.length === 0)
        throw new Error("No active connections found.");

      for (const conn of activeConnections) {
        if (conn.toolkit?.slug)
          this.connections[conn.toolkit.slug.toLowerCase()] = conn.id;
      }

      const required = [
        "notion",
        // "googlecalendar", // CHANGE: Commented out Google Calendar connection requirement
        "openai",
        "instagram",
        "googledrive",
      ];
      const missing = required.filter((toolkit) => !this.connections[toolkit]);
      if (missing.length > 0)
        throw new Error(`Missing connections for: ${missing.join(", ")}`);

      console.log(chalk.green("✅ All required connections are active."));
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
    console.log(chalk.red("🛑 Stopping Instagram Automation Agent..."));
    this.isRunning = false;
  }

  private async findAndProcessNewEntries(): Promise<void> {
    try {
      console.log(chalk.gray("Checking for new entries..."));
      const response: any = await this.composioClient.executeAction(
        "NOTION_QUERY_DATABASE",
        { database_id: this.workflowConfig.notionDatabaseId },
        this.connections["notion"],
        true
      );
      const unprocessed = (response?.data?.response_data?.results || []).filter(
        (p: NotionPage) => p.properties?.Status?.status?.name === "Not started"
      );

      if (unprocessed.length > 0) {
        console.log(
          chalk.magenta(
            `📝 Found ${unprocessed.length} new entries to process.`
          )
        );
        for (const page of unprocessed) {
          await this.processEntry(page);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      console.error(chalk.red("❌ Error polling Notion:"), error);
    }
  }

  private async processEntry(page: NotionPage): Promise<void> {
    const instaData = this.extractInstaData(page);
    console.log(chalk.cyan(`\n🔄 Processing entry: "${instaData.videoBrief}"`));

    try {
      await this.updateNotionStatus(instaData.id, "In progress");
      const localVideoPath = await this.downloadVideoFromDrive(
        instaData.driveLink
      );
      // await this.scheduleEvent(instaData, instaData.videoBrief); // CHANGE: Commented out the call to schedule an event
      const caption = await this.generateCaption(instaData);
      await this.updateNotionWithCaption(instaData.id, caption);
      const permalink = await this.publishInstagramReel(
        localVideoPath,
        caption
      );
      await this.updateNotionWithLink(instaData.id, permalink);
      await this.updateNotionStatus(instaData.id, "Done");
      console.log(
        chalk.green.bold(`✅ Published successfully: "${instaData.videoBrief}"`)
      );
    } catch (error: any) {
      console.error(
        chalk.red(`❌ Failed to process entry ${instaData.id}:`),
        error.message || error
      );
      await this.updateNotionStatus(instaData.id, "Error");
    } finally {
      console.log(
        chalk.gray(
          "🧹 File processing complete. Cleanup is managed by the Composio SDK."
        )
      );
    }
  }

  private async publishInstagramReel(
    localVideoPath: string,
    caption: string
  ): Promise<string> {
    console.log("  -> 🚀 Uploading Reel to Instagram...");
    const instaConnectionId = this.connections["instagram"];

    const containerResponse: any = await this.composioClient.executeAction(
      "INSTAGRAM_CREATE_MEDIA_CONTAINER",
      {
        ig_user_id: this.workflowConfig.instagramUserId,
        caption: caption,
        video_file: localVideoPath,
        media_type: "REELS",
      },
      instaConnectionId,
      true
    );

    const creationId = containerResponse?.data?.id;
    if (!creationId) {
      throw new Error(
        "Failed to get creation_id from Instagram container response."
      );
    }

    console.log("     - ⏳ Waiting for media to be processed...");
    const isReady = await this.pollForMediaStatus(creationId);
    if (!isReady) throw new Error("Media processing failed or timed out.");

    console.log("     - 🚀 Publishing the post...");
    const publishResponse: any = await this.composioClient.executeAction(
      "INSTAGRAM_CREATE_POST",
      {
        ig_user_id: this.workflowConfig.instagramUserId,
        creation_id: creationId,
      },
      instaConnectionId,
      true
    );

    const postId = publishResponse?.data?.id;
    if (!postId) {
      throw new Error("Failed to get post ID after publishing.");
    }

    console.log(
      `     - ✅ Post created with ID: ${postId}. Fetching user media to find permalink...`
    );

    const userMediaResponse: any = await this.composioClient.executeAction(
      "INSTAGRAM_GET_USER_MEDIA",
      {
        ig_user_id: this.workflowConfig.instagramUserId,
        limit: 10, // Fetch recent media to find our post
      },
      instaConnectionId,
      true
    );

    // [FIX] Correctly access the nested array of media objects and ensure it is an array.
    const mediaArray =
      userMediaResponse?.data?.data ||
      userMediaResponse?.data?.response_data?.data;
    const mediaList = Array.isArray(mediaArray) ? mediaArray : [];

    const justPublishedPost = mediaList.find(
      (media: any) => media.id === postId
    );

    if (!justPublishedPost || !justPublishedPost.permalink) {
      console.warn(
        chalk.yellow(
          "     - Could not find permalink in recent media. Defaulting to base Instagram URL."
        )
      );
      console.log(
        "Full User Media Response:",
        JSON.stringify(userMediaResponse, null, 2)
      );
      return `https://www.instagram.com/`;
    }

    const permalink = justPublishedPost.permalink;
    console.log(
      chalk.green(`  -> ✅ Reel published successfully! Link: ${permalink}`)
    );
    return permalink;
  }

  private async pollForMediaStatus(creationId: string): Promise<boolean> {
    const maxRetries = 30;
    const delay = 8000;

    for (let i = 0; i < maxRetries; i++) {
      const statusResponse: any = await this.composioClient.executeAction(
        "INSTAGRAM_GET_POST_STATUS",
        { creation_id: creationId },
        this.connections["instagram"],
        true
      );

      const statusCode = statusResponse?.data?.status_code;
      if (statusCode === "FINISHED") {
        console.log(chalk.green("     - ✅ Media processing finished."));
        return true;
      }
      if (statusCode === "ERROR") {
        console.error(
          chalk.red("     - ❌ Media processing failed on Instagram's side.")
        );
        return false;
      }
      console.log(
        chalk.yellow(
          `     - (Attempt ${
            i + 1
          }/${maxRetries}) Status: ${statusCode}. Retrying in ${
            delay / 1000
          }s...`
        )
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    console.error(chalk.red("     - ❌ Media processing timed out."));
    return false;
  }

  private extractInstaData(page: NotionPage): InstaData {
    const props = page.properties;
    return {
      id: page.id,
      videoBrief: this.getTextFromProperty(props["Video Brief"]),
      driveLink: props["Drive Link"]?.url || "",
      publishDate:
        props["Publish Date"]?.date?.start || new Date().toISOString(),
    };
  }

  private getTextFromProperty(property: any): string {
    if (!property) return "";
    return (
      property.title?.[0]?.plain_text ||
      property.rich_text?.[0]?.plain_text ||
      ""
    );
  }

  private async generateCaption(data: InstaData): Promise<string> {
    console.log("  -> 🤖 Generating caption with AI...");
    const openai = new OpenAI();
    const prompt = `Generate a catchy Instagram Reel caption for a video about: "${data.videoBrief}". Include relevant hashtags.`;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are an expert social media manager." },
        { role: "user", content: prompt },
      ],
    });
    const caption =
      completion.choices[0]?.message?.content?.trim() || data.videoBrief;
    console.log(chalk.green("  -> ✅ Caption generated."));
    return caption;
  }

  /* CHANGE: Commented out the entire function block
  private async scheduleEvent(data: InstaData, title: string) {
    console.log("  -> 📅 Scheduling Google Calendar event...");
    const startTime = new Date(data.publishDate);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
    await this.composioClient.executeAction(
      "GOOGLECALENDAR_CREATE_EVENT",
      {
        calendarId: "primary",
        summary: `[Published] Reel: ${title.substring(0, 50)}...`,
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: endTime.toISOString() },
      },
      this.connections["googlecalendar"],
      true
    );
    console.log(chalk.green("  -> ✅ Calendar event created."));
  }
  */

  private async updateNotionStatus(
    pageId: string,
    status: string
  ): Promise<void> {
    await this.updateNotionPage(pageId, {
      Status: { status: { name: status } },
    });
  }

  private async updateNotionWithCaption(
    pageId: string,
    caption: string
  ): Promise<void> {
    await this.updateNotionPage(pageId, {
      "Generated Caption": { text: [{ text: { content: caption } }] },
    });
  }

  private async updateNotionWithLink(
    pageId: string,
    link: string
  ): Promise<void> {
    await this.updateNotionPage(pageId, { "Post Link": { url: link } });
  }

  private async updateNotionPage(
    pageId: string,
    properties: any
  ): Promise<void> {
    console.log(chalk.gray(`  -> 📝 Updating Notion page ${pageId}...`));
    await this.composioClient.executeAction(
      "NOTION_UPDATE_PAGE",
      { page_id: pageId, properties },
      this.connections["notion"],
      true
    );
  }

  private async downloadVideoFromDrive(driveLink: string): Promise<string> {
    console.log("  -> 📥 Downloading video via Google Drive...");
    if (!driveLink) throw new Error("Google Drive link missing.");
    const fileIdMatch = driveLink.match(/[-\w]{25,}/);
    if (!fileIdMatch) throw new Error(`Invalid Drive link: ${driveLink}`);
    const result: any = await this.composioClient.executeAction(
      "GOOGLEDRIVE_DOWNLOAD_FILE",
      { file_id: fileIdMatch[0] },
      this.connections["googledrive"],
      true
    );
    const localFilePath = result?.data?.downloaded_file_content?.uri;
    if (!localFilePath || !fs.existsSync(localFilePath)) {
      throw new Error(
        "Download failed — no valid local file path found in response."
      );
    }
    console.log(chalk.green(`  -> ✅ Video downloaded: ${localFilePath}`));
    return localFilePath;
  }
}
