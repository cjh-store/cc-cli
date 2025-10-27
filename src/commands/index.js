import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 命令注册中心
 * 自动扫描和注册所有命令模块
 */
class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.commandsDir = path.join(__dirname);
  }

  /**
   * 注册所有命令到commander
   * @param {Object} program commander实例
   */
  async registerCommands(program) {
    try {
      // 注册API命令
      const { default: apiCommand } = await import('./claude/index.js');
      this.commands.set('api', apiCommand);
      await apiCommand.register(program);

      // 注册API快速使用命令
      const { default: apiUseCommand } = await import('./claude/apiuse.js');
      this.commands.set('apiuse', apiUseCommand);
      program
        .command('apiuse')
        .description('快速切换 Claude Code API 配置')
        .action(async () => {
          await this.executeCommand('apiuse', []);
        });

      // 注册Codex命令（仅用于交互式菜单，不注册独立命令）
      const { default: codexCommand } = await import('./codex/index.js');
      this.commands.set('codexapi', codexCommand);

      // 注册备份命令（仅用于交互式菜单，不注册独立命令）
      const { default: backupCommand } = await import('./backup/index.js');
      this.commands.set('backup', backupCommand);

      // 注册状态命令
      program
        .command('status')
        .description('查看当前配置状态')
        .action(async () => {
          await this.executeCommand('status', []);
        });

      // 注册Claude YOLO Hook命令（供Claude Code hooks内部调用）
      const { default: claudeYoloCommand } = await import('./claude/yolo.js');
      program
        .command('claude-yolo')
        .description('Claude Code YOLO模式钩子处理器（内部使用）')
        .option('-h, --help', '显示帮助信息')
        .action(async (options) => {
          if (options.help) {
            claudeYoloCommand.showHelp();
            return;
          }
          await claudeYoloCommand.execute();
        });

      // 注册通知Hook命令（供Claude Code hooks内部调用）
      const { default: notifyHookCommand } = await import('./notify-hook.js');
      program
        .command('notify-hook [type]')
        .description('Claude Code 通知钩子处理器（内部使用）')
        .action(async (type) => {
          await notifyHookCommand.execute(type);
        });

      // 注册帮助命令
      program
        .command('help')
        .description('显示帮助信息')
        .action(async () => {
          program.help();
        });

    } catch (error) {
      console.error(chalk.red('❌ 命令注册失败:'), error.message);
      throw error;
    }
  }

  /**
   * 执行指定命令
   * @param {string} commandName 命令名称
   * @param {Array} args 参数
   */
  async executeCommand(commandName, args = []) {
    try {
      if (commandName === 'status') {
        await this.showStatus();
        return;
      }

      if (commandName === 'help') {
        await this.showHelp();
        return;
      }

      if (commandName === 'apiuse') {
        const apiUseCommand = this.commands.get('apiuse');
        await apiUseCommand.execute(args);
        return;
      }

      const command = this.commands.get(commandName);
      if (!command) {
        throw new Error(`未找到命令: ${commandName}`);
      }

      if (typeof command.execute === 'function') {
        await command.execute(args);
      } else {
        throw new Error(`命令 ${commandName} 未实现execute方法`);
      }
    } catch (error) {
      console.error(chalk.red(`❌ 执行命令 ${commandName} 失败:`), error.message);
      throw error;
    }
  }

  /**
   * 显示帮助信息
   */
  async showHelp() {
    const { formatMainHelp } = await import('../utils/formatter.js');
    console.log(formatMainHelp());
  }

  /**
   * 显示当前状态
   */
  async showStatus() {
    const { default: ConfigManager } = await import('../core/ConfigManager.js');
    const configManager = new ConfigManager();

    try {
      const currentConfig = await configManager.getCurrentConfig();
      const currentCodexConfig = await configManager.getCurrentCodexConfig();
      const { formatStatus } = await import('../utils/formatter.js');

      console.log(formatStatus(currentConfig, currentCodexConfig));
    } catch (error) {
      console.log(chalk.yellow('⚠️  当前没有配置或配置文件不存在'));
    }
  }

  /**
   * 获取所有已注册的命令
   */
  getCommands() {
    return Array.from(this.commands.keys());
  }
}

export default CommandRegistry;