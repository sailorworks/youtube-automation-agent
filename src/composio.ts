import { Composio } from "@composio/core";
import { AuthConfigManager } from "./authConfig";
import chalk from "chalk";

export class ComposioClient {
  private composio: Composio;
  private authConfigManager: AuthConfigManager;

  constructor(authConfigManager: AuthConfigManager) {
    this.authConfigManager = authConfigManager;
    const authConfig = authConfigManager.getAuthConfig();

    this.composio = new Composio({
      apiKey: authConfig.composioApiKey,
    });

    console.log(chalk.green("✅ Composio client initialized"));
  }

  // --- CORRECTED METHOD TO MANUALLY UPLOAD FILES ---
  public async uploadFile(
    filePath: string,
    toolSlug: string,
    toolkitSlug: string
  ): Promise<string> {
    try {
      console.log(
        chalk.blue(`🌀 Uploading file to Composio's secure storage...`)
      );

      const fileUploadResponse = await this.composio.files.upload({
        file: filePath,
        toolSlug: toolSlug,
        toolkitSlug: toolkitSlug,
      });

      // --- THE FINAL FIX: Extract the 'name' property from the response object ---
      // Check if the response is an object and has the 'name' property.
      if (
        typeof fileUploadResponse === "object" &&
        fileUploadResponse !== null &&
        "name" in fileUploadResponse
      ) {
        const fileId = (fileUploadResponse as { name: string }).name;
        if (typeof fileId === "string" && fileId) {
          console.log(
            chalk.green(`✅ File securely uploaded. File ID: ${fileId}`)
          );
          return fileId;
        }
      }

      // If the structure is not what we expect, throw an error.
      console.error(
        "DEBUG: Unexpected response from composio.files.upload:",
        fileUploadResponse
      );
      throw new Error(
        "Composio did not return a valid file object with a 'name' property after upload."
      );
    } catch (error: any) {
      console.error(
        chalk.red(`❌ Composio file upload failed:`),
        error.message
      );
      throw error;
    }
  }

  public async executeAction(
    actionName: string,
    parameters: any = {},
    userIdOrConnectionId: string,
    useConnectionId: boolean = false
  ): Promise<any> {
    try {
      console.log(chalk.blue(`🔧 Executing action: ${actionName}`));

      const executeOptions = useConnectionId
        ? { connectedAccountId: userIdOrConnectionId, arguments: parameters }
        : { userId: userIdOrConnectionId, arguments: parameters };

      const result = await this.composio.tools.execute(
        actionName,
        executeOptions
      );

      console.log(
        chalk.green(`✅ Action ${actionName} completed successfully`)
      );
      return result;
    } catch (error: any) {
      console.error(
        chalk.red(`❌ Action ${actionName} failed:`),
        error.message
      );
      throw error;
    }
  }

  // ... rest of file is unchanged ...

  public async getTools(userId: string, toolkits?: string[]): Promise<any[]> {
    try {
      const tools = await this.composio.tools.get(userId, {
        toolkits: toolkits || ["NOTION", "GOOGLECALENDAR", "OPENAI", "YOUTUBE"],
      });
      return Array.isArray(tools) ? tools : [];
    } catch (error: any) {
      console.error(chalk.red("❌ Failed to get tools:"), error.message);
      return [];
    }
  }

  public async getConnections(): Promise<any[]> {
    try {
      const connectionsResponse = await this.composio.connectedAccounts.list();
      return connectionsResponse.items || [];
    } catch (error: any) {
      console.error(chalk.red("❌ Failed to get connections:"), error.message);
      return [];
    }
  }

  public async getConnectedAccount(connectionId: string): Promise<any> {
    try {
      const account = await this.composio.connectedAccounts.get(connectionId);
      return account;
    } catch (error: any) {
      console.error(
        chalk.red("❌ Failed to get connected account:"),
        error.message
      );
      throw error;
    }
  }

  public getComposioInstance(): Composio {
    return this.composio;
  }
}
