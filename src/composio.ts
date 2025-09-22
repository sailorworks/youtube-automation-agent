import { Composio } from "@composio/core";
import { AuthConfigManager } from "./authConfig";
import chalk from "chalk";

interface ComposioResponse {
  data?: any;
  successful?: boolean;
  error?: string;
}

interface ConnectionsResponse {
  items: any[];
  nextCursor: string | null;
  totalPages: number;
}

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

  public async executeAction(
    actionName: string,
    parameters: any = {},
    connectionId: string
  ): Promise<any> {
    try {
      console.log(chalk.blue(`🔧 Executing action: ${actionName}`));

      // Direct API call to Composio backend
      const response = await fetch(
        "https://backend.composio.dev/api/v2/actions/execute",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.authConfigManager.getAuthConfig().composioApiKey,
          },
          body: JSON.stringify({
            actionName,
            params: parameters,
            connectedAccountId: connectionId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `API Error: ${response.status} - ${JSON.stringify(errorData)}`
        );
      }

      const result = (await response.json()) as ComposioResponse;
      console.log(
        chalk.green(`✅ Action ${actionName} completed successfully`)
      );

      // Return the data field from the response
      return result.data || result;
    } catch (error: any) {
      console.error(
        chalk.red(`❌ Action ${actionName} failed:`),
        error.message
      );
      throw error;
    }
  }

  public async getTools(userId: string, toolkits?: string[]): Promise<any[]> {
    try {
      const tools = await this.composio.tools.get(userId, {
        toolkits: toolkits || ["NOTION", "GOOGLECALENDAR", "GEMINI", "YOUTUBE"],
      });
      return Array.isArray(tools) ? tools : [];
    } catch (error: any) {
      console.error(chalk.red("❌ Failed to get tools:"), error.message);
      return [];
    }
  }

  public async listActions(appName?: string): Promise<any[]> {
    try {
      const response = await fetch(
        "https://backend.composio.dev/api/v1/actions",
        {
          method: "GET",
          headers: {
            "X-API-Key": this.authConfigManager.getAuthConfig().composioApiKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to list actions: ${response.status}`);
      }

      const result = (await response.json()) as { items?: any[] };
      return result.items || [];
    } catch (error: any) {
      console.error(chalk.red("❌ Failed to list actions:"), error.message);
      return [];
    }
  }

  public async getConnections(): Promise<any[]> {
    try {
      const connectionsResponse =
        (await this.composio.connectedAccounts.list()) as ConnectionsResponse;
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

  // Specific method for Gemini content generation
  public async generateGeminiContent(
    prompt: string,
    connectionId: string,
    options?: {
      model?: string;
      temperature?: number;
      maxOutputTokens?: number;
      systemInstruction?: string;
    }
  ): Promise<any> {
    const parameters = {
      prompt,
      model: options?.model || "gemini-1.5-flash",
      temperature: options?.temperature || 0.7,
      max_output_tokens: options?.maxOutputTokens || 1000,
      system_instruction: options?.systemInstruction,
    };

    return this.executeAction(
      "GEMINI_GENERATE_CONTENT",
      parameters,
      connectionId
    );
  }

  public getComposioInstance(): Composio {
    return this.composio;
  }
}
