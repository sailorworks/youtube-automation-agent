import * as readline from "readline";
import { AuthConfigManager } from "./authConfig";
import { ComposioClient } from "./composio";
import { ConnectionManager } from "./connection";
import { YouTubeAutomationAgent } from "./youtube-automation-agent";
import chalk from "chalk";

class AgentCLI {
  private agent: YouTubeAutomationAgent;
  private authConfigManager: AuthConfigManager;
  private connectionManager: ConnectionManager;
  private rl: readline.Interface;

  constructor() {
    this.authConfigManager = new AuthConfigManager();
    const composioClient = new ComposioClient(this.authConfigManager);
    this.connectionManager = new ConnectionManager(
      composioClient,
      this.authConfigManager
    );
    this.agent = new YouTubeAutomationAgent(
      composioClient,
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
            await this.connectionManager.checkConnections();
            break;
          case "4":
            console.log(chalk.yellow("\n👋 Goodbye!"));
            this.rl.close();
            return;
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
