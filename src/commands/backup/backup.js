import fs from "fs-extra";
import path from "path";
import os from "os";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import FileManager from "./file-manager.js";
import WebDAVClient from "./webdav-client.js";

/**
 * 备份功能实现
 */
class BackupManager {
  constructor() {
    this.fileManager = new FileManager();
    this.webdavClient = new WebDAVClient();
  }

  /**
   * 执行多选备份流程
   */
  async performBackup() {
    try {
      console.log(chalk.cyan.bold("\n📤 配置备份向导\n"));

      // 0. 检查是否需要迁移旧版本配置
      const shouldContinue = await this.checkAndMigrateOldConfig();
      if (!shouldContinue) {
        console.log(chalk.yellow("ℹ️ 备份已取消"));
        return;
      }

      // 1. 显示文件检查结果
      await this.showFileStatus();

      // 2. 选择备份类别
      const selectedCategories = await this.selectBackupCategories();
      if (selectedCategories.length === 0) {
        console.log(chalk.yellow("ℹ️ 未选择任何配置类别，备份已取消"));
        return;
      }

      // 3. 确认备份信息
      const confirmed = await this.confirmBackup(selectedCategories);
      if (!confirmed) {
        console.log(chalk.yellow("ℹ️ 用户取消备份"));
        return;
      }

      // 4. 收集和打包备份数据
      const backupData = await this.collectBackupData(selectedCategories);

      // 5. 上传到WebDAV
      await this.uploadToWebDAV(backupData, selectedCategories);

      console.log(chalk.green("\n✅ 备份完成！"));
    } catch (error) {
      console.error(chalk.red("\n❌ 备份失败:"), error.message);
      throw error;
    }
  }

  /**
   * 显示文件状态
   */
  async showFileStatus() {
    console.log(chalk.blue("🔍 正在检查配置文件..."));

    const spinner = ora("检查文件状态").start();
    try {
      const checkResult = await this.fileManager.checkAllFiles();
      spinner.succeed("文件状态检查完成");

      console.log("\n📋 配置文件状态：");
      console.log(this.fileManager.formatCheckResult(checkResult));
    } catch (error) {
      spinner.fail("文件状态检查失败");
      throw error;
    }
  }

  /**
   * 选择备份类别
   * @returns {Array} 选中的类别列表
   */
  async selectBackupCategories() {
    const categories = [
      {
        name: "🔧 CC-CLI配置 (.cc-cli/)",
        value: "ccCli",
        short: "CC-CLI配置",
        checked: true, // 默认选中
      },
      {
        name: "🎯 Claude Code配置 (settings.json, CLAUDE.md, agents/, commands/, skills/)",
        value: "claudeCode",
        short: "Claude Code配置",
      },
      {
        name: "⚙️ Codex配置 (config.toml, auth.json, AGENTS.md)",
        value: "codex",
        short: "Codex配置",
      },
    ];

    const { selectedCategories } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedCategories",
        message: "请选择要备份的配置类别：",
        choices: categories,
        validate: (input) => {
          if (input.length === 0) {
            return "请至少选择一个配置类别";
          }
          return true;
        },
      },
    ]);

    return selectedCategories;
  }

  /**
   * 确认备份信息
   * @param {Array} categories 选中的类别
   * @returns {boolean} 是否确认备份
   */
  async confirmBackup(categories) {
    console.log(chalk.white("\n📋 备份确认信息："));

    // 显示选中的类别和对应文件
    for (const category of categories) {
      const config = this.fileManager.getCategoryPaths(category);
      console.log(chalk.cyan(`\n${config.name}:`));

      // 显示文件
      if (config.files) {
        for (const [name, filePath] of Object.entries(config.files)) {
          const exists = await fs.pathExists(filePath);
          const icon = exists ? "✅" : "❌";
          console.log(chalk.gray(`  ${icon} ${name}`));
        }
      }

      // 显示目录
      if (config.directories) {
        for (const [name, dirPath] of Object.entries(config.directories)) {
          const exists = await fs.pathExists(dirPath);
          const icon = exists ? "✅" : "❌";
          let count = "";
          if (exists) {
            try {
              const files = await fs.readdir(dirPath);
              count = ` (${files.length} files)`;
            } catch (error) {
              count = " (读取错误)";
            }
          }
          console.log(chalk.gray(`  ${icon} ${name}/${count}`));
        }
      }
    }

    const timestamp = new Date().toLocaleString();
    console.log(chalk.gray(`\n备份时间: ${timestamp}`));
    console.log(chalk.gray("备份位置: 本地已收集，等待配置云端存储"));

    const { confirmed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmed",
        message: "确认执行备份？",
        default: true,
      },
    ]);

    return confirmed;
  }

  /**
   * 收集备份数据
   * @param {Array} categories 选中的类别
   * @returns {Object} 备份数据
   */
  async collectBackupData(categories) {
    const spinner = ora("收集备份数据").start();
    const backupData = {
      type: "cc-backup",
      version: "2.0.0",
      timestamp: new Date().toISOString(),
      categories: {},
    };

    try {
      for (const category of categories) {
        spinner.text = `收集 ${category} 配置数据`;

        const config = this.fileManager.getCategoryPaths(category);
        const categoryData = {
          name: config.name,
          files: {},
          directories: {},
          metadata: {
            collectedAt: new Date().toISOString(),
            platform: process.platform,
            nodeVersion: process.version,
          },
        };

        // 收集文件
        if (config.files) {
          for (const [name, filePath] of Object.entries(config.files)) {
            try {
              if (await fs.pathExists(filePath)) {
                const content = await fs.readFile(filePath, "utf8");
                const stat = await fs.stat(filePath);

                categoryData.files[name] = {
                  content: Buffer.from(content, "utf8").toString("base64"),
                  size: stat.size,
                  mtime: stat.mtime.toISOString(),
                  encoding: "base64",
                };
              } else {
                categoryData.files[name] = {
                  error: "文件不存在",
                };
              }
            } catch (error) {
              categoryData.files[name] = {
                error: error.message,
              };
            }
          }
        }

        // 收集目录
        if (config.directories) {
          for (const [name, dirPath] of Object.entries(config.directories)) {
            try {
              if (await fs.pathExists(dirPath)) {
                const dirData = await this.collectDirectoryData(dirPath);
                categoryData.directories[name] = dirData;
              } else {
                categoryData.directories[name] = {
                  error: "目录不存在",
                };
              }
            } catch (error) {
              categoryData.directories[name] = {
                error: error.message,
              };
            }
          }
        }

        backupData.categories[category] = categoryData;
      }

      spinner.succeed("备份数据收集完成");
      return backupData;
    } catch (error) {
      spinner.fail("备份数据收集失败");
      throw error;
    }
  }

  /**
   * 递归收集目录数据
   * @param {string} dirPath 目录路径
   * @returns {Object} 目录数据
   */
  async collectDirectoryData(dirPath) {
    const result = {
      files: {},
      subdirectories: {},
      fileCount: 0,
      totalSize: 0,
    };

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);

        if (item.isFile()) {
          try {
            const content = await fs.readFile(itemPath, "utf8");
            const stat = await fs.stat(itemPath);

            result.files[item.name] = {
              content: Buffer.from(content, "utf8").toString("base64"),
              size: stat.size,
              mtime: stat.mtime.toISOString(),
              encoding: "base64",
            };

            result.fileCount++;
            result.totalSize += stat.size;
          } catch (error) {
            result.files[item.name] = {
              error: error.message,
            };
          }
        } else if (item.isDirectory()) {
          // 递归收集子目录（限制深度避免过大）
          const subDirData = await this.collectDirectoryData(itemPath);
          result.subdirectories[item.name] = subDirData;
          result.fileCount += subDirData.fileCount;
          result.totalSize += subDirData.totalSize;
        }
      }
    } catch (error) {
      result.error = error.message;
    }

    return result;
  }

  /**
   * 上传备份到WebDAV
   * @param {Object} backupData 备份数据
   * @param {Array} selectedCategories 选择的类别
   */
  async uploadToWebDAV(backupData, selectedCategories) {
    try {
      // 1. 生成备份文件名
      const fileName = this.generateBackupFileName(selectedCategories);

      console.log(chalk.blue("\n📤 正在上传备份到云端存储..."));

      // 2. 初始化WebDAV客户端
      await this.webdavClient.initialize();

      // 3. 清理旧备份（保留最新5个）
      await this.cleanupOldBackups();

      // 4. 上传新备份
      const remotePath = await this.webdavClient.uploadBackup(
        fileName,
        backupData
      );

      // 5. 显示备份成功信息
      this.showUploadSuccess(fileName, backupData, selectedCategories);
    } catch (error) {
      console.error(chalk.red("\n❌ 上传备份失败:"), error.message);
      console.log(
        chalk.yellow("\n💡 备份数据已收集完成，但上传失败。您可以：")
      );
      console.log(chalk.gray("• 检查WebDAV配置是否正确"));
      console.log(chalk.gray("• 确认网络连接是否正常"));
      console.log(chalk.gray("• 稍后重新运行备份命令"));
      throw error;
    }
  }

  /**
   * 生成备份文件名
   * @param {Array} selectedCategories 选择的类别
   * @returns {string} 文件名
   */
  generateBackupFileName(selectedCategories) {
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[:\-]/g, "")
      .replace(/\..+/, "")
      .replace("T", "-");

    const categoryPrefix =
      selectedCategories.length === 1
        ? selectedCategories[0].toLowerCase().replace(/\s+/g, "-")
        : "multi-config";

    return `cc-cli-${categoryPrefix}-${timestamp}.json`;
  }

  /**
   * 清理旧备份文件
   */
  async cleanupOldBackups() {
    try {
      const maxBackups = 5; // 默认保留5个备份
      const backups = await this.webdavClient.listBackups();

      if (backups.length >= maxBackups) {
        const backupsToDelete = backups.slice(maxBackups - 1);
        console.log(
          chalk.blue(`🧹 清理旧备份文件 (保留最新${maxBackups}个)...`)
        );

        for (const backup of backupsToDelete) {
          await this.webdavClient.deleteBackup(backup.path);
        }

        console.log(
          chalk.green(`✅ 已清理 ${backupsToDelete.length} 个旧备份文件`)
        );
      }
    } catch (error) {
      console.warn(chalk.yellow("⚠️ 清理旧备份时出现问题:"), error.message);
    }
  }

  /**
   * 显示上传成功信息
   * @param {string} fileName 文件名
   * @param {Object} backupData 备份数据
   * @param {Array} selectedCategories 选择的类别
   */
  showUploadSuccess(fileName, backupData, selectedCategories) {
    console.log(chalk.green("\n🎉 备份上传成功！"));

    console.log(chalk.white("📋 备份详情："));
    console.log(
      chalk.gray(`备份时间: ${new Date(backupData.timestamp).toLocaleString()}`)
    );

    // 统计信息
    let totalFiles = 0;
    let totalSize = 0;
    const categoryNames = [];

    for (const [category, data] of Object.entries(backupData.categories)) {
      categoryNames.push(data.name);

      // 统计文件数量和大小
      if (data.files) {
        for (const fileInfo of Object.values(data.files)) {
          if (!fileInfo.error) {
            totalFiles++;
            totalSize += fileInfo.size || 0;
          }
        }
      }

      if (data.directories) {
        for (const dirInfo of Object.values(data.directories)) {
          if (!dirInfo.error) {
            totalFiles += dirInfo.fileCount || 0;
            totalSize += dirInfo.totalSize || 0;
          }
        }
      }
    }

    console.log(chalk.gray(`📁 备份文件: ${fileName}`));
    console.log(chalk.gray(`📦 备份类别: ${categoryNames.join(", ")}`));
    console.log(chalk.gray(`📄 文件数量: ${totalFiles}`));
    console.log(chalk.gray(`💾 总大小: ${this.formatFileSize(totalSize)}`));

    const serverInfo = this.webdavClient.getServerInfo();
    if (serverInfo) {
      console.log(chalk.gray(`☁️ 存储服务: ${serverInfo.serverType}`));
      console.log(chalk.gray(`👤 用户: ${serverInfo.username}`));
    }
  }

  /**
   * 显示备份结果
   * @param {Object} backupData 备份数据
   */
  showBackupResult(backupData) {
    console.log(chalk.green("\n🎉 备份数据收集完成！"));
    console.log(chalk.white("📋 备份详情："));
    console.log(
      chalk.gray(`备份时间: ${new Date(backupData.timestamp).toLocaleString()}`)
    );

    // 统计信息
    let totalFiles = 0;
    let totalSize = 0;
    const categoryNames = [];

    for (const [category, data] of Object.entries(backupData.categories)) {
      categoryNames.push(data.name);

      // 统计文件数量和大小
      if (data.files) {
        for (const fileInfo of Object.values(data.files)) {
          if (!fileInfo.error) {
            totalFiles++;
            totalSize += fileInfo.size || 0;
          }
        }
      }

      if (data.directories) {
        for (const dirInfo of Object.values(data.directories)) {
          if (!dirInfo.error) {
            totalFiles += dirInfo.fileCount || 0;
            totalSize += dirInfo.totalSize || 0;
          }
        }
      }
    }

    console.log(chalk.gray(`备份类别: ${categoryNames.join(", ")}`));
    console.log(chalk.gray(`文件数量: ${totalFiles}`));
    console.log(chalk.gray(`总大小: ${this.formatFileSize(totalSize)}`));

    console.log(
      chalk.yellow("\n💡 提示: 云端存储功能开发中，当前仅完成本地数据收集")
    );
  }

  /**
   * 格式化文件大小
   * @param {number} bytes 字节数
   * @returns {string} 格式化的大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * 检查并处理旧版本配置迁移
   * @returns {boolean} 是否继续备份流程
   */
  async checkAndMigrateOldConfig() {
    try {
      const oldConfigPath = path.join(
        os.homedir(),
        ".claude",
        "api_configs.json"
      );

      if (!(await fs.pathExists(oldConfigPath))) {
        return true; // 没有旧配置，直接继续
      }

      console.log(chalk.yellow("🔍 检测到旧版本配置文件"));
      console.log(chalk.gray(`发现: ${oldConfigPath}`));
      console.log("");

      return await this.showMigrationPrompt(oldConfigPath);
    } catch (error) {
      console.warn(chalk.yellow("⚠️ 检查旧配置时出现问题:"), error.message);
      return true; // 出错时继续备份
    }
  }

  /**
   * 显示迁移提醒和选项
   * @param {string} oldConfigPath 旧配置文件路径
   * @returns {boolean} 是否继续备份流程
   */
  async showMigrationPrompt(oldConfigPath) {
    console.log(chalk.cyan.bold("📢 版本更新提醒"));
    console.log("");
    console.log(chalk.white("检测到您使用的是旧版本的配置文件位置："));
    console.log(chalk.gray("• 旧位置: ~/.claude/api_configs.json"));
    console.log(chalk.gray("• 新位置: ~/.cc-cli/api_configs.json"));
    console.log("");
    console.log(
      chalk.yellow("为了更好的管理和组织，建议将配置文件迁移到新位置。")
    );
    console.log("");

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "请选择操作：",
        choices: [
          {
            name: "🚀 一键迁移配置文件 (推荐)",
            value: "migrate",
            short: "一键迁移",
          },
          {
            name: "⏭️ 跳过迁移，继续备份",
            value: "skip",
            short: "跳过迁移",
          },
          {
            name: "❌ 取消备份操作",
            value: "cancel",
            short: "取消备份",
          },
        ],
        default: 0,
      },
    ]);

    switch (action) {
      case "migrate":
        return await this.performMigration(oldConfigPath);
      case "skip":
        console.log(chalk.blue("ℹ️ 跳过迁移，继续使用现有配置进行备份"));
        return true;
      case "cancel":
        return false;
      default:
        return true;
    }
  }

  /**
   * 执行配置文件迁移
   * @param {string} oldConfigPath 旧配置文件路径
   * @returns {boolean} 是否继续备份流程
   */
  async performMigration(oldConfigPath) {
    const ora = (await import("ora")).default;
    const newConfigDir = path.join(os.homedir(), ".cc-cli");
    const newConfigPath = path.join(newConfigDir, "api_configs.json");

    const spinner = ora("正在迁移配置文件").start();

    try {
      // 1. 确保新目录存在
      await fs.ensureDir(newConfigDir);

      // 2. 检查新位置是否已有文件
      if (await fs.pathExists(newConfigPath)) {
        spinner.warn("新位置已存在配置文件");

        const { overwrite } = await inquirer.prompt([
          {
            type: "list",
            name: "overwrite",
            message: "新位置已存在配置文件，如何处理？",
            choices: [
              {
                name: "🔄 合并配置 (推荐)",
                value: "merge",
                short: "合并配置",
              },
              {
                name: "🗑️ 覆盖新配置文件",
                value: "overwrite",
                short: "覆盖文件",
              },
              {
                name: "❌ 取消迁移",
                value: "cancel",
                short: "取消迁移",
              },
            ],
            default: 0,
          },
        ]);

        if (overwrite === "cancel") {
          console.log(chalk.yellow("ℹ️ 迁移已取消"));
          return true;
        }

        if (overwrite === "merge") {
          return await this.mergeConfigs(oldConfigPath, newConfigPath, spinner);
        }
      }

      // 3. 复制文件
      spinner.text = "复制配置文件";
      await fs.copy(oldConfigPath, newConfigPath);

      // 4. 验证迁移
      spinner.text = "验证迁移结果";
      const isValid = await this.validateMigration(
        oldConfigPath,
        newConfigPath
      );

      if (!isValid) {
        spinner.fail("迁移验证失败");
        console.log(chalk.red("❌ 配置文件迁移失败，请检查文件完整性"));
        return true;
      }

      // 5. 备份旧文件
      const backupPath = oldConfigPath + ".backup";
      await fs.move(oldConfigPath, backupPath);

      spinner.succeed("配置文件迁移完成");

      console.log(chalk.green("\n✅ 迁移成功！"));
      console.log(chalk.gray(`• 新配置位置: ${newConfigPath}`));
      console.log(chalk.gray(`• 旧文件备份: ${backupPath}`));
      console.log(chalk.blue("• 现在可以安全地删除备份文件，或保留作为备份"));
      console.log("");

      return true;
    } catch (error) {
      spinner.fail("迁移过程中出现错误");
      console.error(chalk.red("❌ 迁移失败:"), error.message);

      const { continueAnyway } = await inquirer.prompt([
        {
          type: "confirm",
          name: "continueAnyway",
          message: "迁移失败，是否继续备份流程？",
          default: true,
        },
      ]);

      return continueAnyway;
    }
  }

  /**
   * 合并配置文件
   * @param {string} oldConfigPath 旧配置路径
   * @param {string} newConfigPath 新配置路径
   * @param {Object} spinner 加载器
   * @returns {boolean} 是否继续备份流程
   */
  async mergeConfigs(oldConfigPath, newConfigPath, spinner) {
    try {
      spinner.text = "读取配置文件";
      const oldConfig = await fs.readJSON(oldConfigPath);
      const newConfig = await fs.readJSON(newConfigPath);

      spinner.text = "合并配置数据";

      // 简单合并策略：新配置优先，旧配置补充
      const mergedConfig = { ...oldConfig, ...newConfig };

      // 如果都有sites字段，合并sites
      if (oldConfig.sites && newConfig.sites) {
        mergedConfig.sites = { ...oldConfig.sites, ...newConfig.sites };
      }

      spinner.text = "保存合并后的配置";
      await fs.writeJSON(newConfigPath, mergedConfig, { spaces: 2 });

      // 备份旧文件
      const backupPath = oldConfigPath + ".backup";
      await fs.move(oldConfigPath, backupPath);

      spinner.succeed("配置合并完成");

      console.log(chalk.green("\n✅ 配置合并成功！"));
      console.log(chalk.gray(`• 合并后配置: ${newConfigPath}`));
      console.log(chalk.gray(`• 旧文件备份: ${backupPath}`));
      console.log("");

      return true;
    } catch (error) {
      spinner.fail("配置合并失败");
      console.error(chalk.red("❌ 合并失败:"), error.message);
      return true;
    }
  }

  /**
   * 验证迁移结果
   * @param {string} oldConfigPath 旧配置路径
   * @param {string} newConfigPath 新配置路径
   * @returns {boolean} 验证是否通过
   */
  async validateMigration(oldConfigPath, newConfigPath) {
    try {
      const oldStat = await fs.stat(oldConfigPath);
      const newStat = await fs.stat(newConfigPath);

      // 检查文件大小
      if (oldStat.size !== newStat.size) {
        console.warn(chalk.yellow("⚠️ 文件大小不匹配"));
        return false;
      }

      // 检查文件内容
      const oldContent = await fs.readFile(oldConfigPath, "utf8");
      const newContent = await fs.readFile(newConfigPath, "utf8");

      if (oldContent !== newContent) {
        console.warn(chalk.yellow("⚠️ 文件内容不匹配"));
        return false;
      }

      // 尝试解析JSON
      try {
        JSON.parse(newContent);
      } catch (error) {
        console.warn(chalk.yellow("⚠️ 新配置文件JSON格式无效"));
        return false;
      }

      return true;
    } catch (error) {
      console.warn(chalk.yellow("⚠️ 验证过程出现错误:"), error.message);
      return false;
    }
  }
}

export default BackupManager;
