import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { waitForBackConfirm } from './ui.js';

/**
 * 通知管理工具类
 * 负责Claude Code的通知功能开启和关闭
 */
class NotificationManager {
  constructor() {
    this.claudeDir = path.join(os.homedir(), '.claude');
    this.claudeSettingsFile = path.join(this.claudeDir, 'settings.json');
    this.notifyCommand = 'cc notify-hook'; // 通知命令
  }

  /**
   * 检查通知状态
   * @returns {boolean} true表示已开启，false表示未开启
   */
  async checkNotificationStatus() {
    try {
      // 如果配置文件不存在，认为未开启
      if (!await fs.pathExists(this.claudeSettingsFile)) {
        return false;
      }

      // 读取配置文件内容
      const settingsContent = await fs.readFile(this.claudeSettingsFile, 'utf8');
      const settings = JSON.parse(settingsContent);

      // 检查 Stop 和 Notification 钩子是否存在
      const hasStopHook = settings.hooks?.Stop?.some(hook =>
        hook.hooks?.some(h =>
          h.type === 'command' &&
          h.command?.includes('cc notify-hook')
        )
      );

      const hasNotificationHook = settings.hooks?.Notification?.some(hook =>
        hook.hooks?.some(h =>
          h.type === 'command' &&
          h.command?.includes('cc notify-hook')
        )
      );

      return (hasStopHook && hasNotificationHook) || false;

    } catch (error) {
      // 发生错误时认为未开启
      return false;
    }
  }

  /**
   * 开启或关闭通知功能
   * @param {Object} options 选项
   * @param {boolean} options.showConfirm 是否显示完成确认，默认true
   */
  async toggleNotificationMode(options = { showConfirm: true }) {
    try {
      // 检查当前通知状态
      const currentStatus = await this.checkNotificationStatus();

      // 确保Claude配置目录存在
      await fs.ensureDir(this.claudeDir);

      if (currentStatus) {
        // 当前已开启，关闭通知功能
        console.log(chalk.yellow('\n🔕 关闭通知...'));
        console.log(chalk.gray('将移除Claude Code通知hooks配置'));

        await this.removeNotificationHooks();

        console.log(chalk.green('✅ 通知已关闭！'));
        console.log(chalk.blue('ℹ️  Claude Code完成响应时将不再弹出系统通知'));
      } else {
        // 当前未开启，开启通知功能
        console.log(chalk.yellow('\n🔔 开启通知...'));
        console.log(chalk.gray('将设置Claude Code通知hooks配置'));
        console.log(chalk.gray(`使用命令: ${this.notifyCommand}`));

        // 添加hooks配置
        await this.addNotificationHooks();

        console.log(chalk.green('✅ 通知已开启！'));
        console.log(chalk.cyan('📢 Claude Code完成响应时将弹出系统通知'));
        console.log(chalk.cyan('🔔 等待输入时也会弹出系统通知'));
      }

      console.log(chalk.gray(`配置文件: ${this.claudeSettingsFile}`));

      // 可选的用户确认
      if (options.showConfirm) {
        await waitForBackConfirm('通知操作完成');
      }

      return !currentStatus; // 返回新状态

    } catch (error) {
      console.error(chalk.red('❌ 操作通知功能失败:'), error.message);

      // 错误情况下也可选确认
      if (options.showConfirm) {
        await waitForBackConfirm('操作完成');
      }

      throw error;
    }
  }

  /**
   * 添加通知hooks配置
   * @private
   */
  async addNotificationHooks() {
    let settings = {};

    // 读取现有配置
    if (await fs.pathExists(this.claudeSettingsFile)) {
      const settingsContent = await fs.readFile(this.claudeSettingsFile, 'utf8');
      settings = JSON.parse(settingsContent);
    }

    // 确保hooks结构存在
    if (!settings.hooks) {
      settings.hooks = {};
    }

    // 添加 Stop 钩子（响应完成时通知）
    if (!settings.hooks.Stop) {
      settings.hooks.Stop = [];
    }

    const hasStopHook = settings.hooks.Stop.some(hook =>
      hook.hooks?.some(h => h.command?.includes('cc notify-hook stop'))
    );

    if (!hasStopHook) {
      settings.hooks.Stop.push({
        hooks: [
          {
            type: "command",
            command: "cc notify-hook stop"
          }
        ]
      });
    }

    // 添加 Notification 钩子（等待输入时通知）
    if (!settings.hooks.Notification) {
      settings.hooks.Notification = [];
    }

    const hasNotificationHook = settings.hooks.Notification.some(hook =>
      hook.hooks?.some(h => h.command?.includes('cc notify-hook notification'))
    );

    if (!hasNotificationHook) {
      settings.hooks.Notification.push({
        hooks: [
          {
            type: "command",
            command: "cc notify-hook notification"
          }
        ]
      });
    }

    // 写入配置文件
    await fs.writeFile(this.claudeSettingsFile, JSON.stringify(settings, null, 2), 'utf8');
  }

  /**
   * 移除通知hooks配置
   * @private
   */
  async removeNotificationHooks() {
    if (!await fs.pathExists(this.claudeSettingsFile)) {
      return;
    }

    // 读取现有配置
    const settingsContent = await fs.readFile(this.claudeSettingsFile, 'utf8');
    const settings = JSON.parse(settingsContent);

    // 移除 Stop 钩子
    if (settings.hooks?.Stop) {
      settings.hooks.Stop = settings.hooks.Stop.filter(hook =>
        !(hook.hooks?.some(h =>
          h.type === 'command' &&
          h.command?.includes('cc notify-hook')
        ))
      );

      // 如果钩子数组为空，删除该事件节点
      if (settings.hooks.Stop.length === 0) {
        delete settings.hooks.Stop;
      }
    }

    // 移除 Notification 钩子
    if (settings.hooks?.Notification) {
      settings.hooks.Notification = settings.hooks.Notification.filter(hook =>
        !(hook.hooks?.some(h =>
          h.type === 'command' &&
          h.command?.includes('cc notify-hook')
        ))
      );

      // 如果钩子数组为空，删除该事件节点
      if (settings.hooks.Notification.length === 0) {
        delete settings.hooks.Notification;
      }
    }

    // 如果hooks为空，删除hooks节点
    if (settings.hooks && Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    // 写入配置文件
    await fs.writeFile(this.claudeSettingsFile, JSON.stringify(settings, null, 2), 'utf8');
  }

  /**
   * 获取通知相关配置文件路径
   * @returns {Object} 配置文件路径信息
   */
  getConfigPaths() {
    return {
      claudeDir: this.claudeDir,
      settingsFile: this.claudeSettingsFile,
      notifyCommand: this.notifyCommand
    };
  }
}

// 导出单例实例
export default new NotificationManager();
