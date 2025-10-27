import notifier from 'node-notifier';
import path from 'path';
import os from 'os';

/**
 * 通知钩子处理器（内部命令，供 Claude Code hooks 调用）
 */
class NotifyHookCommand {
  /**
   * 获取项目名称
   */
  async getProjectName() {
    try {
      const homeDir = os.homedir();
      const projectDir = process.cwd();

      if (projectDir === homeDir || path.basename(projectDir) === path.basename(homeDir)) {
        return null;
      }

      return path.basename(projectDir);
    } catch (error) {
      return null;
    }
  }

  /**
   * 执行通知发送
   * @param {string} type - 事件类型: stop | notification
   */
  async execute(type = 'stop') {
    try {
      const projectName = await this.getProjectName();

      // 根据类型设置不同的通知内容
      const notifications = {
        stop: {
          message: '✅ 响应已完成',
          timeout: 3
        },
        notification: {
          message: '🔔 需要您的关注',
          timeout: 0 // 0表示不自动关闭，需要用户点击
        }
      };

      const config = notifications[type] || notifications.stop;

      // 立即输出，不等通知关闭
      console.log('✅');

      // 异步发送通知，不等待结果
      notifier.notify({
        title: config.message,
        message: ' ',
        sound: true,
        timeout: config.timeout,
        appID:projectName? `🗂️ ${projectName}` : '🤖 Claude Code',
        wait: false
      });

      // 给通知一个启动时间，然后强制退出进程
      setTimeout(() => {
        process.exit(0);
      }, 50);
    } catch (error) {
      // 静默处理错误，强制退出
      process.exit(0);
    }
  }
}

export default new NotifyHookCommand();
