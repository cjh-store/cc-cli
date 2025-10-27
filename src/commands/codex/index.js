import chalk from 'chalk';
import { program } from 'commander';

import switchCommand from './switch.js';
import editCommand from './edit.js';
import { showApiMenu, waitForBackConfirm, createBackChoice } from '../../utils/ui.js';

/**
 * Codex命令模块
 */
class CodexCommand {
  constructor() {
    this.subCommands = {
      switch: switchCommand,
      edit: editCommand
    };
  }

  /**
   * 注册方法已移除 - Codex功能只能通过主菜单 cc 进入
   * 不支持独立命令行调用
   */

  /**
   * 显示Codex命令帮助信息
   */
  showHelp() {
    console.log(chalk.cyan.bold('💻 CC Codex 配置管理工具帮助'));
    console.log();
    console.log(chalk.white('访问方式:'));
    console.log('  只能通过主菜单访问：运行 cc 选择 "💻 CodexAPI"');
    console.log();
    console.log(chalk.white('功能:'));
    console.log('  🔄 切换配置    选择不同的Codex服务提供商');
    console.log('  📋 查看配置    列出所有Codex配置');
    console.log('  📝 编辑配置    编辑Codex配置文件');
    console.log('  🔐 官方认证    切换到官方OAuth认证模式（OPENAI_API_KEY=null）');
    console.log('  🚀 YOLO模式    开启/关闭最宽松配置模式（approval_policy=never, sandbox_mode=danger-full-access）');
    console.log();
    console.log(chalk.white('配置文件:'));
    console.log(`  ${chalk.gray('~/.codex/config.toml')}     Codex主配置文件`);
    console.log(`  ${chalk.gray('~/.codex/auth.json')}       Codex认证文件`);
    console.log();
    console.log(chalk.white('使用流程:'));
    console.log(`  ${chalk.green('cc')}                     # 启动主菜单`);
    console.log(`  ${chalk.green('选择 💻 CodexAPI')}         # 进入Codex管理`);
    console.log(`  ${chalk.green('选择切换配置')}              # 配置Codex服务`);
    console.log(`  ${chalk.green('选择官方认证')}              # 切换OAuth认证`);
    console.log(`  ${chalk.green('选择YOLO模式')}              # 开启/关闭最宽松模式`);
  }

  /**
   * 列出所有Codex配置
   */
  async listCodexConfigs() {
    try {
      const { default: ConfigManager } = await import('../../core/ConfigManager.js');
      const configManager = new ConfigManager();
      const allConfigs = await configManager.getAllConfigs();

      console.log(chalk.cyan.bold('💻 Codex配置列表\n'));
      console.log(chalk.gray('═'.repeat(40)));

      let hasCodexConfigs = false;

      for (const [siteKey, siteConfig] of Object.entries(allConfigs.sites)) {
        // 检查是否有codex配置（新格式）
        if (siteConfig.codex) {
          hasCodexConfigs = true;
          console.log(chalk.white.bold(`🌐 ${siteKey}`));
          if (siteConfig.description) {
            console.log(chalk.gray(`   ${siteConfig.description}`));
          }
          console.log(chalk.cyan(`   📡 Model: ${siteConfig.codex.model || 'gpt-5'}`));
          // 使用与Claude Code API相同的token显示格式
          const { formatToken } = await import('../../utils/formatter.js');
          let tokenDisplay = '未配置';

          if (siteConfig.codex.OPENAI_API_KEY) {
            const rawApiKey = siteConfig.codex.OPENAI_API_KEY;
            if (typeof rawApiKey === 'string') {
              tokenDisplay = formatToken(rawApiKey);
            } else if (typeof rawApiKey === 'object') {
              const keyCount = Object.keys(rawApiKey).length;
              const firstKey = Object.values(rawApiKey)[0];
              tokenDisplay = `${formatToken(firstKey)} 等${keyCount}个`;
            }
          }
          console.log(chalk.green(`   🔑 Token: ${tokenDisplay}`));

          if (siteConfig.codex.model_providers) {
            console.log(chalk.yellow('   📋 服务提供商:'));
            for (const [providerKey, provider] of Object.entries(siteConfig.codex.model_providers)) {
              const providerName = provider.name || providerKey;
              console.log(chalk.gray(`      └─ ${providerName}: ${provider.base_url}`));
            }
          }
          console.log();
        }
      }

      if (!hasCodexConfigs) {
        console.log(chalk.yellow('⚠️  没有找到Codex配置'));
        console.log(chalk.gray('请在api_configs.json中添加带有"codex"字段的站点配置'));
      }

      // 等待用户确认后返回
      await waitForBackConfirm('配置信息显示完成');

    } catch (error) {
      console.error(chalk.red('❌ 获取Codex配置失败:'), error.message);

      // 错误情况下也等待用户确认
      await waitForBackConfirm('操作完成');
    }
  }

  /**
   * 显示交互式Codex菜单
   */
  async showInteractiveMenu() {
    const inquirer = (await import('inquirer')).default;

    while (true) {
      try {
        console.log(chalk.cyan.bold('\n💻 Codex配置管理'));
        console.log(chalk.gray('═'.repeat(40)));

        // 检查当前YOLO模式状态
        const yoloStatus = await this.checkYoloModeStatus();
        const yoloActionText = yoloStatus ?
          '🛑 关闭YOLO模式 - 禁用最宽松配置模式' :
          '🚀 开启YOLO模式 - 启用最宽松配置模式';
        const yoloStatusText = yoloStatus ?
          chalk.green('[已开启]') :
          chalk.gray('[已关闭]');

        const choices = [
          {
            name: '🔄 切换配置 - 切换Codex配置',
            value: 'switch',
            short: '切换配置'
          },
          {
            name: '📋 查看配置 - 列出所有Codex配置',
            value: 'list',
            short: '查看配置'
          },
          {
            name: '📝 编辑配置 - 编辑Codex配置文件',
            value: 'edit',
            short: '编辑配置'
          },
          {
            name: '🔐 使用官方认证 - 切换到官方OAuth认证模式',
            value: 'official',
            short: '官方认证'
          },
          {
            name: `${yoloActionText} ${yoloStatusText}`,
            value: 'yolo',
            short: 'YOLO模式'
          },
          createBackChoice('back')
        ];

        const { choice } = await inquirer.prompt([
          {
            type: 'list',
            name: 'choice',
            message: '请选择操作：',
            choices,
            pageSize: 10
          }
        ]);

        if (choice === 'back') {
          return; // 返回主菜单
        }

        switch (choice) {
          case 'switch':
            await this.subCommands.switch.execute([]);
            break;
          case 'list':
            await this.listCodexConfigs();
            break;
          case 'edit':
            await this.subCommands.edit.execute([]);
            break;
          case 'official':
            await this.useOfficialAuth();
            break;
          case 'yolo':
            await this.toggleYoloMode();
            break;
          default:
            console.log(chalk.red('❌ 无效选择'));
            continue;
        }

        // 操作完成后直接回到菜单循环
      } catch (error) {
        console.error(chalk.red('❌ Codex菜单操作失败:'), error.message);
        // 发生错误后也直接回到菜单循环，不询问
      }
    }
  }

  /**
   * 清除第三方服务提供商配置
   * @param {string} tomlContent TOML配置内容
   * @returns {string} 清理后的配置内容
   */
  removeThirdPartyProviders(tomlContent) {
    const lines = tomlContent.split('\n');
    const cleanedLines = [];
    let inModelProvidersSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // 跳过 model_provider = "xxx" 行
      if (trimmed.startsWith('model_provider =')) {
        continue;
      }

      // 检测进入 [model_providers.*] section
      if (trimmed.startsWith('[model_providers')) {
        inModelProvidersSection = true;
        continue;
      }

      // 检测进入其他 section（退出 model_providers section）
      if (trimmed.startsWith('[') && !trimmed.startsWith('[model_providers')) {
        inModelProvidersSection = false;
      }

      // 在 model_providers section 内，跳过所有行
      if (inModelProvidersSection) {
        continue;
      }

      // 保留其他行
      cleanedLines.push(line);
    }

    // 移除末尾多余的空行
    while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1].trim() === '') {
      cleanedLines.pop();
    }

    return cleanedLines.join('\n').trim() + '\n';
  }

  /**
   * 使用官方认证模式（将 OPENAI_API_KEY 设置为 null）
   */
  async useOfficialAuth() {
    try {
      const fs = (await import('fs-extra')).default;
      const path = (await import('path')).default;
      const os = (await import('os')).default;

      const codexConfigDir = path.join(os.homedir(), '.codex');
      const codexAuthFile = path.join(codexConfigDir, 'auth.json');

      console.log(chalk.yellow('\n🔐 切换到官方OAuth认证模式...'));

      // 确保目录存在
      await fs.ensureDir(codexConfigDir);

      // 读取现有认证配置
      let existingAuth = {};
      if (await fs.pathExists(codexAuthFile)) {
        try {
          const content = await fs.readFile(codexAuthFile, 'utf8');
          existingAuth = JSON.parse(content);
          console.log(chalk.gray('✓ 读取现有认证配置'));
        } catch (error) {
          console.log(chalk.gray('⚠️  无法读取现有配置，将创建新文件'));
        }
      }

      // 合并配置（保留其他字段，只更新 OPENAI_API_KEY 为 null）
      const authConfig = {
        ...existingAuth,
        OPENAI_API_KEY: null
      };

      // 写入配置文件
      await fs.writeFile(codexAuthFile, JSON.stringify(authConfig, null, 2), 'utf8');

      // 清理 config.toml 中的第三方服务提供商配置
      const codexConfigFile = path.join(codexConfigDir, 'config.toml');
      let configCleanedSuccess = false;

      if (await fs.pathExists(codexConfigFile)) {
        try {
          const existingTomlConfig = await fs.readFile(codexConfigFile, 'utf8');
          const cleanedConfig = this.removeThirdPartyProviders(existingTomlConfig);
          await fs.writeFile(codexConfigFile, cleanedConfig, 'utf8');
          configCleanedSuccess = true;
          console.log(chalk.gray('✓ 已清理 config.toml 中的第三方服务提供商配置'));
        } catch (error) {
          console.log(chalk.yellow(`⚠️  清理 config.toml 失败: ${error.message}`));
        }
      }

      console.log(chalk.green('\n✅ 已切换到官方OAuth认证模式！'));
      console.log(chalk.blue('ℹ️  配置变更：'));
      console.log(chalk.gray('  - auth.json: OPENAI_API_KEY → null'));
      if (configCleanedSuccess) {
        console.log(chalk.gray('  - config.toml: 已清除第三方服务提供商配置'));
      }

      // 如果存在 tokens 字段，提示用户
      if (authConfig.tokens) {
        console.log(chalk.cyan('ℹ️  将使用 Anthropic 官方 OAuth tokens 进行认证'));
      } else {
        console.log(chalk.yellow('⚠️  未检测到 OAuth tokens，请确保已完成 Anthropic 官方登录'));
      }

      console.log(chalk.gray(`配置文件: ${codexAuthFile}`));

      // 等待用户确认后返回
      await waitForBackConfirm('认证模式切换完成');

    } catch (error) {
      console.error(chalk.red('❌ 切换官方认证模式失败:'), error.message);

      // 错误情况下也等待用户确认
      await waitForBackConfirm('操作完成');
    }
  }

  /**
   * 检查YOLO模式状态
   * @returns {boolean} true表示已开启，false表示未开启
   */
  async checkYoloModeStatus() {
    try {
      const fs = (await import('fs-extra')).default;
      const path = (await import('path')).default;
      const os = (await import('os')).default;

      const codexConfigFile = path.join(os.homedir(), '.codex', 'config.toml');

      // 如果配置文件不存在，认为未开启
      if (!await fs.pathExists(codexConfigFile)) {
        return false;
      }

      // 读取配置文件内容
      const configContent = await fs.readFile(codexConfigFile, 'utf8');
      const lines = configContent.split('\n');

      let hasApprovalPolicy = false;
      let hasSandboxMode = false;

      // 检查是否包含YOLO模式的两个配置
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine === 'approval_policy = "never"') {
          hasApprovalPolicy = true;
        }
        if (trimmedLine === 'sandbox_mode = "danger-full-access"') {
          hasSandboxMode = true;
        }
      }

      // 两个配置都存在才认为YOLO模式已开启
      return hasApprovalPolicy && hasSandboxMode;

    } catch (error) {
      // 发生错误时认为未开启
      return false;
    }
  }

  /**
   * 开启或关闭YOLO模式
   */
  async toggleYoloMode() {
    try {
      const fs = (await import('fs-extra')).default;
      const path = (await import('path')).default;
      const os = (await import('os')).default;

      const codexConfigDir = path.join(os.homedir(), '.codex');
      const codexConfigFile = path.join(codexConfigDir, 'config.toml');

      // 检查当前YOLO模式状态
      const currentStatus = await this.checkYoloModeStatus();

      // 确保目录存在
      await fs.ensureDir(codexConfigDir);

      // 读取现有配置
      let existingConfig = '';
      if (await fs.pathExists(codexConfigFile)) {
        existingConfig = await fs.readFile(codexConfigFile, 'utf8');
      }

      let newConfig;
      if (currentStatus) {
        // 当前已开启，关闭YOLO模式
        console.log(chalk.yellow('\n🛑 关闭YOLO模式...'));
        console.log(chalk.gray('将移除YOLO模式配置：'));
        console.log(chalk.gray('  - 移除 approval_policy = "never"'));
        console.log(chalk.gray('  - 移除 sandbox_mode = "danger-full-access"'));

        newConfig = this.removeYoloConfig(existingConfig);

        // 写入配置文件
        await fs.writeFile(codexConfigFile, newConfig, 'utf8');

        console.log(chalk.green('✅ YOLO模式已关闭！'));
        console.log(chalk.blue('ℹ️  已恢复为安全模式'));
      } else {
        // 当前未开启，开启YOLO模式
        console.log(chalk.yellow('\n🚀 开启YOLO模式...'));
        console.log(chalk.gray('将设置最宽松的配置模式：'));
        console.log(chalk.gray('  - approval_policy = "never"'));
        console.log(chalk.gray('  - sandbox_mode = "danger-full-access"'));

        newConfig = this.generateYoloConfig(existingConfig);

        // 写入配置文件
        await fs.writeFile(codexConfigFile, newConfig, 'utf8');

        console.log(chalk.green('✅ YOLO模式已开启！'));
        console.log(chalk.yellow('⚠️  警告：当前为最宽松模式，请谨慎使用'));
      }

      console.log(chalk.gray(`配置文件: ${codexConfigFile}`));

      // 等待用户确认后返回
      await waitForBackConfirm('YOLO模式操作完成');

    } catch (error) {
      console.error(chalk.red('❌ 操作YOLO模式失败:'), error.message);

      // 错误情况下也等待用户确认
      await waitForBackConfirm('操作完成');
    }
  }

  /**
   * 移除YOLO模式配置
   * @param {string} existingConfig 现有配置内容
   * @returns {string} 移除YOLO配置后的内容
   */
  removeYoloConfig(existingConfig) {
    const lines = existingConfig.split('\n');
    const newConfig = [];

    // 过滤掉YOLO模式配置行
    for (const line of lines) {
      const trimmedLine = line.trim();

      // 跳过YOLO模式配置
      if (trimmedLine === 'approval_policy = "never"' ||
          trimmedLine === 'sandbox_mode = "danger-full-access"') {
        continue;
      }

      newConfig.push(line);
    }

    // 移除开头的空行
    while (newConfig.length > 0 && newConfig[0].trim() === '') {
      newConfig.shift();
    }

    return newConfig.join('\n').trim() + '\n';
  }

  /**
   * 生成YOLO模式配置
   * @param {string} existingConfig 现有配置内容
   * @returns {string} 新的配置内容
   */
  generateYoloConfig(existingConfig) {
    const lines = existingConfig.split('\n');
    const newConfig = [];
    let hasApprovalPolicy = false;
    let hasSandboxMode = false;

    // 首先添加YOLO模式配置到最上方
    newConfig.push('approval_policy = "never"');
    newConfig.push('sandbox_mode = "danger-full-access"');
    newConfig.push('');

    // 处理现有配置，跳过重复的YOLO模式配置
    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('approval_policy =')) {
        hasApprovalPolicy = true;
        continue; // 跳过，已在上方添加
      }

      if (trimmedLine.startsWith('sandbox_mode =')) {
        hasSandboxMode = true;
        continue; // 跳过，已在上方添加
      }

      // 保留其他配置
      newConfig.push(line);
    }

    return newConfig.join('\n').trim() + '\n';
  }

  /**
   * 执行Codex命令
   * @param {Array} args 参数
   */
  async execute(args = []) {
    await this.showInteractiveMenu();
  }
}

export default new CodexCommand();