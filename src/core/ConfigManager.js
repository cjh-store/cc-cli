import fs from "fs-extra";
import path from "path";
import os from "os";
import chalk from "chalk";

/**
 * 配置管理器
 * 负责读取、写入和管理Claude API配置
 */
class ConfigManager {
  constructor() {
    this.homeDir = os.homedir();
    this.claudeDir = path.join(this.homeDir, ".claude");
    this.ccCliDir = path.join(this.homeDir, ".cc-cli");
    this.settingsPath = path.join(this.claudeDir, "settings.json");
    this.claudeConfigPath = path.join(this.claudeDir, "config.json");

    // 查找配置文件路径，优先使用 .cc-cli，兼容 .claude
    this.configPath = this.findConfigPath();
  }

  /**
   * 查找API配置文件路径
   * @returns {string} 配置文件路径
   */
  findConfigPath() {
    const possiblePaths = [
      path.join(this.ccCliDir, "api_configs.json"), // 首选：.cc-cli目录
      path.join(this.claudeDir, "api_configs.json"), // 兼容：.claude目录
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    // 如果都不存在，返回默认路径（.cc-cli目录）
    return path.join(this.ccCliDir, "api_configs.json");
  }

  /**
   * 确保配置目录存在
   */
  async ensureConfigDir() {
    try {
      await fs.ensureDir(this.claudeDir);
      await fs.ensureDir(this.ccCliDir);
    } catch (error) {
      throw new Error(`创建配置目录失败: ${error.message}`);
    }
  }

  /**
   * 读取所有API配置
   * @returns {Object} 配置对象
   */
  async getAllConfigs() {
    try {
      await this.ensureConfigDir();

      if (!(await fs.pathExists(this.configPath))) {
        throw new Error("API配置文件不存在，请检查 ~/.claude/api_configs.json");
      }

      const configContent = await fs.readFile(this.configPath, "utf8");
      const config = JSON.parse(configContent);

      // 支持claude别名：自动将claude字段映射为config字段
      if (config.sites) {
        for (const siteKey in config.sites) {
          const site = config.sites[siteKey];
          if (site.claude && !site.config) {
            site.config = site.claude;
          }
        }
      }

      return config;
    } catch (error) {
      if (error.message.includes("API配置文件不存在")) {
        throw error;
      }
      throw new Error(`读取配置文件失败: ${error.message}`);
    }
  }

  /**
   * 获取当前使用的配置
   * @returns {Object} 当前配置
   */
  async getCurrentConfig() {
    try {
      const allConfigs = await this.getAllConfigs();
      return allConfigs.currentConfig || null;
    } catch (error) {
      console.warn(chalk.yellow("⚠️  读取当前配置失败:"), error.message);
      return null;
    }
  }

  /**
   * 获取当前使用的Codex配置
   * @returns {Object} 当前Codex配置
   */
  async getCurrentCodexConfig() {
    try {
      const allConfigs = await this.getAllConfigs();
      return allConfigs.currentCodexConfig || null;
    } catch (error) {
      console.warn(chalk.yellow("⚠️  读取当前Codex配置失败:"), error.message);
      return null;
    }
  }

  /**
   * 保存当前配置
   * @param {Object} config 配置对象
   */
  async saveCurrentConfig(config) {
    try {
      await this.ensureConfigDir();

      const configToSave = {
        site: config.site,
        siteName: config.siteName,
        url: config.url,
        urlName: config.urlName,
        token: config.token,
        tokenName: config.tokenName,
        updatedAt: new Date().toISOString(),
      };

      // 读取现有配置
      const allConfigs = await this.getAllConfigs();

      // 更新当前配置
      allConfigs.currentConfig = configToSave;

      // 规范化配置（清理冗余 + 迁移老格式）
      const normalizedConfig = this.normalizeConfig(allConfigs);

      // 保存到 api_configs.json
      await fs.writeFile(
        this.configPath,
        JSON.stringify(normalizedConfig, null, 2),
        "utf8"
      );
    } catch (error) {
      throw new Error(`保存当前配置失败: ${error.message}`);
    }
  }

  /**
   * 保存当前Codex配置
   * @param {Object} config Codex配置对象
   */
  async saveCurrentCodexConfig(config) {
    try {
      await this.ensureConfigDir();

      const configToSave = {
        site: config.site,
        siteName: config.siteName,
        model: config.model,
        apiKey: config.apiKey,
        apiKeyName: config.apiKeyName,
        provider: config.provider,
        providerName: config.providerName,
        baseUrl: config.baseUrl,
        updatedAt: new Date().toISOString(),
      };

      // 读取现有配置
      const allConfigs = await this.getAllConfigs();

      // 更新当前Codex配置
      allConfigs.currentCodexConfig = configToSave;

      // 规范化配置（清理冗余 + 迁移老格式）
      const normalizedConfig = this.normalizeConfig(allConfigs);

      // 保存到 api_configs.json
      await fs.writeFile(
        this.configPath,
        JSON.stringify(normalizedConfig, null, 2),
        "utf8"
      );
    } catch (error) {
      throw new Error(`保存当前Codex配置失败: ${error.message}`);
    }
  }

  /**
   * 读取config.json配置
   * @returns {Object} config配置对象
   */
  async getClaudeConfigJson() {
    try {
      if (!(await fs.pathExists(this.claudeConfigPath))) {
        return {};
      }
      const configContent = await fs.readFile(this.claudeConfigPath, "utf8");
      return JSON.parse(configContent);
    } catch (error) {
      console.warn(chalk.yellow("⚠️  读取~/.claude/config.json失败:"), error.message);
      return {};
    }
  }

  /**
   * 读取settings.json配置
   * @returns {Object} settings配置对象
   */
  async getSettings() {
    try {
      if (!(await fs.pathExists(this.settingsPath))) {
        return {};
      }
      const settingsContent = await fs.readFile(this.settingsPath, "utf8");
      return JSON.parse(settingsContent);
    } catch (error) {
      console.warn(chalk.yellow("⚠️  读取settings.json失败:"), error.message);
      return {};
    }
  }

  /**
   * 保存config.json配置
   * @param {Object} config config配置对象
   */
  async saveClaudeConfigJson(config) {
    try {
      await this.ensureConfigDir();
      await fs.writeFile(
        this.claudeConfigPath,
        JSON.stringify(config, null, 2),
        "utf8"
      );
    } catch (error) {
      throw new Error(`保存~/.claude/config.json失败: ${error.message}`);
    }
  }

  /**
   * 保存settings.json配置
   * @param {Object} settings settings配置对象
   */
  async saveSettings(settings) {
    try {
      await this.ensureConfigDir();
      await fs.writeFile(
        this.settingsPath,
        JSON.stringify(settings, null, 2),
        "utf8"
      );
    } catch (error) {
      throw new Error(`保存settings.json失败: ${error.message}`);
    }
  }

  /**
   * 深度合并对象
   * @param {Object} target 目标对象
   * @param {Object} source 源对象
   * @returns {Object} 合并后的对象
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (
          typeof source[key] === "object" &&
          source[key] !== null &&
          !Array.isArray(source[key])
        ) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * 切换API配置
   * @param {string} site 站点标识
   * @param {string} token Token值
   * @param {Object} siteConfig 站点配置对象
   */
  async switchConfig(site, token, siteConfig) {
    try {
      // 获取Claude配置（兼容老格式）
      const claudeConfig = this.getClaudeConfig(siteConfig);

      // 找到Token的名称
      const rawTokens = claudeConfig.env.ANTHROPIC_AUTH_TOKEN;
      const tokens =
        typeof rawTokens === "string" ? { 默认Token: rawTokens } : rawTokens;
      const tokenName = Object.keys(tokens).find(
        (key) => tokens[key] === token
      );

      const config = {
        site,
        siteName: site,
        ANTHROPIC_BASE_URL: claudeConfig.env.ANTHROPIC_BASE_URL,
        token,
        tokenName,
      };

      await this.saveCurrentConfig(config);

      // 读取当前settings.json 和 config.json
      const currentSettings = await this.getSettings();
      const currentConfigJson = await this.getClaudeConfigJson();

      // 清空现有的config.json的primaryApiKey配置
      if (currentConfigJson.primaryApiKey) {
        delete currentConfigJson.primaryApiKey;
      }

      // 为config.json添加站点名称的配置解决强制登陆问题：https://linux.do/t/topic/999263/13
      currentConfigJson.primaryApiKey = config.siteName;

      // 需要删除重置的配置项
      if (currentSettings.env) {
        // 清理认证相关字段
        delete currentSettings.env.ANTHROPIC_AUTH_TOKEN;
        delete currentSettings.env.ANTHROPIC_AUTH_KEY;
        delete currentSettings.env.ANTHROPIC_API_KEY;
        delete currentSettings.env.ANTHROPIC_MODEL;

        // 清理 URL 配置（避免 ANTHROPIC_BASE_URL 和 ANTHROPIC_VERTEX_BASE_URL 冲突）
        delete currentSettings.env.ANTHROPIC_BASE_URL;
        delete currentSettings.env.ANTHROPIC_VERTEX_BASE_URL;
        delete currentSettings.env.ANTHROPIC_VERTEX_PROJECT_ID;

        // 清理 Vertex AI 相关配置
        delete currentSettings.env.CLAUDE_CODE_USE_VERTEX;
        delete currentSettings.env.CLAUDE_CODE_SKIP_VERTEX_AUTH;
      }
      // 重置模型配置
      delete currentSettings.model;

      // 准备合并的配置
      const configToMerge = { ...claudeConfig };

      // 特殊处理：ANTHROPIC_AUTH_TOKEN使用选中的具体token值
      if (configToMerge.env && configToMerge.env.ANTHROPIC_AUTH_TOKEN) {
        configToMerge.env.ANTHROPIC_AUTH_TOKEN = token;
      }

      // 深度合并配置
      const mergedSettings = this.deepMerge(currentSettings, configToMerge);

      // 保存合并后的settings.json 和 config.json
      await this.saveSettings(mergedSettings);
      await this.saveClaudeConfigJson(currentConfigJson);

      return config;
    } catch (error) {
      throw new Error(`切换配置失败: ${error.message}`);
    }
  }

  /**
   * 验证配置格式
   * @param {Object} config 配置对象
   * @returns {boolean} 是否有效
   */
  validateConfig(config) {
    if (!config || typeof config !== "object") {
      return false;
    }

    if (!config.sites || typeof config.sites !== "object") {
      return false;
    }

    for (const [siteKey, siteConfig] of Object.entries(config.sites)) {
      if (!siteConfig.url) {
        return false;
      }

      // 尝试获取Claude配置
      let actualConfig;
      try {
        actualConfig = this.getClaudeConfig(siteConfig);
      } catch (error) {
        return false; // 没有claude或config字段
      }

      // 检查必需的env配置
      if (!actualConfig.env || !actualConfig.env.ANTHROPIC_AUTH_TOKEN) {
        return false;
      }

      const hasBaseUrl = actualConfig.env.ANTHROPIC_BASE_URL;
      const hasVertexBaseUrl = actualConfig.env.ANTHROPIC_VERTEX_BASE_URL;

      // BASE_URL和VERTEX_BASE_URL互斥,不能同时存在
      if (hasBaseUrl && hasVertexBaseUrl) {
        return false;
      }

      // 必须至少有一个URL配置
      if (!hasBaseUrl && !hasVertexBaseUrl) {
        return false;
      }

      // 验证BASE_URL类型
      if (hasBaseUrl && typeof actualConfig.env.ANTHROPIC_BASE_URL !== "string") {
        return false;
      }

      // 验证VERTEX_BASE_URL类型
      if (hasVertexBaseUrl && typeof actualConfig.env.ANTHROPIC_VERTEX_BASE_URL !== "string") {
        return false;
      }

      const authToken = actualConfig.env.ANTHROPIC_AUTH_TOKEN;
      if (typeof authToken === "string") {
        if (!authToken.trim()) return false;
      } else if (typeof authToken === "object" && authToken !== null) {
        if (Object.keys(authToken).length === 0) return false;
      } else {
        return false;
      }
    }

    return true;
  }

  /**
   * 检查配置文件是否存在
   * @returns {boolean} 文件是否存在
   */
  async configExists() {
    return await fs.pathExists(this.configPath);
  }

  /**
   * 获取Claude配置（兼容老格式）
   * @param {Object} siteConfig 站点配置对象
   * @returns {Object} Claude配置对象
   */
  getClaudeConfig(siteConfig) {
    // 优先使用新格式的claude字段
    if (siteConfig.claude) {
      return siteConfig.claude;
    }

    // 兼容老格式的config字段
    if (siteConfig.config) {
      return siteConfig.config;
    }

    // 都没有则抛出错误
    throw new Error("站点配置缺少claude或config字段");
  }

  /**
   * 规范化配置对象（清理冗余字段 + 迁移老格式）
   * @param {Object} config 配置对象
   * @returns {Object} 规范化后的配置对象
   */
  normalizeConfig(config) {
    if (!config.sites) {
      return config;
    }

    for (const siteKey in config.sites) {
      const site = config.sites[siteKey];

      // 情况1：只有config，没有claude -> 自动迁移为claude
      if (site.config && !site.claude) {
        site.claude = site.config;
        delete site.config;
      }

      // 情况2：同时存在claude和config，且内容相同 -> 删除冗余config
      else if (site.claude && site.config) {
        if (JSON.stringify(site.claude) === JSON.stringify(site.config)) {
          delete site.config;
        }
      }

      // 情况4：只有claude -> 无需处理
    }

    return config;
  }
}

export default ConfigManager;
