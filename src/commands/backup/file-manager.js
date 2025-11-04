import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 文件路径管理器
 * 负责管理各类配置文件的路径检测和验证
 */
class FileManager {
  constructor() {
    this.homeDir = os.homedir();
    this.configPaths = this.initConfigPaths();
  }

  /**
   * 初始化配置文件路径
   * @returns {Object} 配置文件路径映射
   */
  initConfigPaths() {
    return {
      // CC-CLI配置 (第一类) - 备份整个.cc-cli目录
      ccCli: {
        name: 'CC-CLI配置',
        directories: {
          '.cc-cli': path.join(this.homeDir, '.cc-cli')
        }
      },

      // Claude Code配置 (第二类) - 移除.claude.json
      claudeCode: {
        name: 'Claude Code配置',
        files: {
          'settings.json': path.join(this.homeDir, '.claude', 'settings.json'),
          'CLAUDE.md': path.join(this.homeDir, '.claude', 'CLAUDE.md')
        },
        directories: {
          'agents': path.join(this.homeDir, '.claude', 'agents'),
          'commands': path.join(this.homeDir, '.claude', 'commands'),
          'skills': path.join(this.homeDir, '.claude', 'skills')
        }
      },

      // Codex配置 (第三类) - 包含完整的codex配置文件
      codex: {
        name: 'Codex配置',
        files: {
          'config.toml': this.findCodexFile('config.toml'),
          'auth.json': this.findCodexFile('auth.json'),
          'AGENTS.md': this.findCodexFile('AGENTS.md')
        }
      }
    };
  }

  /**
   * 查找CC配置文件路径
   * @returns {string} CC配置文件路径
   */
  findCCConfigPath() {
    // 可能的CC配置位置，优先.cc-cli目录
    const possiblePaths = [
      path.join(this.homeDir, '.cc-cli', 'api_configs.json'),
      path.join(this.homeDir, '.claude', 'api_configs.json'),
      path.join(this.homeDir, '.config', 'cc-cli', 'api_configs.json'),
      path.join(process.cwd(), 'api_configs.json'),
      path.join(__dirname, '../../../config/api_configs.json')
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    // 如果都不存在，返回默认路径（.cc-cli目录）
    return path.join(this.homeDir, '.cc-cli', 'api_configs.json');
  }

  /**
   * 查找Codex配置文件
   * @param {string} filename 文件名
   * @returns {string} 文件路径
   */
  findCodexFile(filename) {
    // 可能的Codex配置位置
    const possiblePaths = [
      path.join(this.homeDir, '.codex', filename),
      path.join(this.homeDir, '.config', 'codex', filename),
      path.join(process.cwd(), filename),
      path.join(this.homeDir, 'Documents', 'codex', filename)
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    // 如果都不存在，返回默认路径
    return path.join(this.homeDir, '.codex', filename);
  }

  /**
   * 检查配置类别的文件存在性
   * @param {string} category 配置类别 (ccCli, claudeCode, codex)
   * @returns {Object} 文件存在性检查结果
   */
  async checkCategoryFiles(category) {
    const config = this.configPaths[category];
    if (!config) {
      throw new Error(`未知的配置类别: ${category}`);
    }

    const result = {
      category,
      name: config.name,
      files: {},
      directories: {},
      totalExists: 0,
      totalCount: 0
    };

    // 检查文件
    if (config.files) {
      for (const [name, filePath] of Object.entries(config.files)) {
        const exists = await fs.pathExists(filePath);
        result.files[name] = {
          path: filePath,
          exists,
          size: exists ? (await fs.stat(filePath)).size : 0
        };
        result.totalCount++;
        if (exists) result.totalExists++;
      }
    }

    // 检查目录
    if (config.directories) {
      for (const [name, dirPath] of Object.entries(config.directories)) {
        const exists = await fs.pathExists(dirPath);
        result.directories[name] = {
          path: dirPath,
          exists,
          fileCount: 0
        };

        if (exists) {
          try {
            const files = await fs.readdir(dirPath);
            result.directories[name].fileCount = files.length;
            result.totalCount++;
            result.totalExists++;
          } catch (error) {
            // 目录存在但无法读取
            result.directories[name].error = error.message;
          }
        } else {
          result.totalCount++;
        }
      }
    }

    return result;
  }

  /**
   * 检查所有配置文件的存在性
   * @returns {Object} 完整的文件存在性报告
   */
  async checkAllFiles() {
    const results = {};

    for (const category of Object.keys(this.configPaths)) {
      try {
        results[category] = await this.checkCategoryFiles(category);
      } catch (error) {
        results[category] = {
          category,
          error: error.message
        };
      }
    }

    return results;
  }

  /**
   * 格式化文件检查结果显示
   * @param {Object} checkResult 检查结果
   * @returns {string} 格式化的显示文本
   */
  formatCheckResult(checkResult) {
    let output = '';

    for (const [category, result] of Object.entries(checkResult)) {
      if (result.error) {
        output += chalk.red(`❌ ${category}: ${result.error}\n`);
        continue;
      }

      const statusIcon = result.totalExists === result.totalCount ? '✅' :
                        result.totalExists > 0 ? '⚠️' : '❌';

      output += chalk.white(`${statusIcon} ${result.name} (${result.totalExists}/${result.totalCount})\n`);

      // 显示文件状态
      if (result.files) {
        for (const [name, info] of Object.entries(result.files)) {
          const icon = info.exists ? '📄' : '❌';
          const size = info.exists ? `(${(info.size / 1024).toFixed(1)}KB)` : '';
          output += chalk.gray(`  ${icon} ${name} ${size}\n`);
        }
      }

      // 显示目录状态
      if (result.directories) {
        for (const [name, info] of Object.entries(result.directories)) {
          const icon = info.exists ? '📁' : '❌';
          const count = info.exists ? `(${info.fileCount} files)` : '';
          output += chalk.gray(`  ${icon} ${name}/ ${count}\n`);
        }
      }

      output += '\n';
    }

    return output;
  }

  /**
   * 获取指定类别的配置路径
   * @param {string} category 配置类别
   * @returns {Object} 配置路径信息
   */
  getCategoryPaths(category) {
    return this.configPaths[category];
  }

  /**
   * 获取所有配置类别
   * @returns {Array} 配置类别列表
   */
  getCategories() {
    return Object.keys(this.configPaths);
  }
}

export default FileManager;