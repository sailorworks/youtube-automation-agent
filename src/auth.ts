import { Composio } from "@composio/core";
import chalk from "chalk";

export class AuthSetup {
  private composio: Composio;
  private userId: string;

  constructor(apiKey: string, userId: string = "youtube-automation-user") {
    this.composio = new Composio({ apiKey });
    this.userId = userId;
  }

  public async setupAuthentication() {
    console.log(
      chalk.blue("🔐 Setting up authentication for required services...")
    );

    const requiredToolkits = ["NOTION", "GOOGLECALENDAR", "OPENAI", "YOUTUBE"];
    const connections = await this.composio.connectedAccounts.list();
    const connectedToolkits =
      connections.items?.map((conn) => conn.toolkitSlug) || [];

    console.log(
      `Found ${connectedToolkits.length} existing connections:`,
      connectedToolkits
    );

    for (const toolkit of requiredToolkits) {
      if (!connectedToolkits.includes(toolkit)) {
        console.log(
          chalk.yellow(`⚠️ ${toolkit} not connected. Creating connection...`)
        );
        await this.createConnection(toolkit);
      } else {
        console.log(chalk.green(`✅ ${toolkit} already connected`));
      }
    }
  }

  private async createConnection(toolkit: string) {
    try {
      // This will create a connection request
      const connectionRequest = await this.composio.connectedAccounts.link(
        this.userId,
        toolkit // You'll need to replace this with actual auth config IDs
      );

      console.log(chalk.blue(`📎 Visit this URL to authenticate ${toolkit}:`));
      console.log(chalk.underline(connectionRequest.redirectUrl));
      console.log(chalk.yellow("Waiting for authentication..."));

      // Wait for user to complete authentication
      const connectedAccount = await connectionRequest.waitForConnection();
      console.log(chalk.green(`✅ ${toolkit} authenticated successfully!`));

      return connectedAccount;
    } catch (error) {
      console.error(
        chalk.red(`❌ Failed to create ${toolkit} connection:`),
        error
      );
      throw error;
    }
  }

  public async listAvailableActions(toolkit?: string) {
    try {
      const tools = await this.composio.tools.get(this.userId, {
        toolkits: toolkit
          ? [toolkit]
          : ["NOTION", "GOOGLECALENDAR", "OPENAI", "YOUTUBE"],
      });

      console.log(`Available actions${toolkit ? ` for ${toolkit}` : ""}:`);
      tools.forEach((tool) => {
        console.log(`- ${tool.slug}: ${tool.description}`);
      });

      return tools;
    } catch (error) {
      console.error(chalk.red("❌ Failed to list actions:"), error);
      return [];
    }
  }
}
