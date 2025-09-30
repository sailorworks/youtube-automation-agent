import * as readline from "readline";
import { AuthConfigManager } from "./src/authConfig";
import { ComposioClient } from "./src/composio";
import { ConnectionManager } from "./src/connection";
import { YouTubeAutomationAgent } from "./src/youtube-automation-agent";

import chalk from "chalk";

class AgentCLI {
  private agent: YouTubeAutomationAgent;
  private authConfigManager: AuthConfigManager;
  private connectionManager: ConnectionManager;
  private rl: readline.Interface;
  private composioClient: ComposioClient;

  constructor() {
    this.authConfigManager = new AuthConfigManager();
    this.composioClient = new ComposioClient(this.authConfigManager);
    this.connectionManager = new ConnectionManager(
      this.composioClient,
      this.authConfigManager
    );
    this.agent = new YouTubeAutomationAgent(
      this.composioClient,
      this.connectionManager,
      this.authConfigManager
    );
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  public async run(): Promise<void> {
    console.log(chalk.bold.yellow("========================================"));
    console.log(
      chalk.bold.yellow("🎬 Welcome to the YouTube Automation Agent")
    );
    console.log(chalk.bold.yellow("========================================"));
    this.authConfigManager.printConfig();
    this.displayMenu();
  }

  private displayMenu(): void {
    this.rl.question(
      chalk.bold.cyan(
        "\nMenu:\n1. Start Agent\n2. Stop Agent\n3. Check Connections\n4. Exit\n\nEnter your choice: "
      ),
      async (choice) => {
        switch (choice.trim()) {
          case "1":
            await this.agent.start();
            break;
          case "2":
            this.agent.stop();
            break;
          case "3":
            const debuggerInstance = new ConnectionManager(
              this.composioClient,
              this.authConfigManager
            );
            await debuggerInstance.debugConnections();
            await debuggerInstance.testSpecificConnection();
            break;
          case "4":
            console.log(chalk.yellow("\n👋 Goodbye!"));
            this.rl.close();
            return;

            break;
          default:
            console.log(chalk.red("\nInvalid choice. Please try again."));
            break;
        }
        this.displayMenu();
      }
    );
  }
}

const cli = new AgentCLI();
cli.run().catch((error) => {
  console.error("A fatal error occurred:", error);
  process.exit(1);
});
