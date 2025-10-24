import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import inquirer from 'inquirer';

import ConfigManager from '../../core/ConfigManager.js';
import { showSuccess, showError, showInfo, showWarning, createBackChoice } from '../../utils/ui.js';
import { formatCodexSwitchSuccess } from '../../utils/formatter.js';

/**
 * Codex配置切换命令
 */
class CodexSwitchCommand {
  constructor() {
    this.configManager = new ConfigManager();
    this.codexConfigDir = path.join(os.homedir(), '.codex');
    this.codexConfigFile = path.join(this.codexConfigDir, 'config.toml');
    this.codexAuthFile = path.join(this.codexConfigDir, 'auth.json');
  }

  /**
   * 执行切换命令
   * @param {Array} args 参数
   */
  async execute(args = []) {
    try {
      showInfo('🔄 开始切换Codex配置...');

      // 1. 读取配置，过滤支持codex的站点
      const codexSites = await this.getCodexSites();

      if (Object.keys(codexSites).length === 0) {
        showWarning('没有找到支持Codex的站点配置');
        showInfo('请在api_configs.json中添加带有"codex"字段的站点配置');
        return false; // 没有可用配置，操作未完成
      }

      // 2. 选择站点
      const selectedSite = await this.selectSite(codexSites);

      // 检查是否选择返回
      if (selectedSite === '__back__') {
        return false; // 操作被取消
      }

      const siteConfig = codexSites[selectedSite];

      // 3. 获取站点的codex配置（兼容老版本）
      const codexConfig = this.getCodexConfig(siteConfig);

      // 4. 选择服务提供商
      const selectedProvider = await this.selectProvider(codexConfig.model_providers);

      // 检查是否选择返回
      if (selectedProvider === '__back__') {
        return false; // 操作被取消
      }

      // 5. 选择API Key
      const selectedApiKey = await this.selectApiKey(codexConfig.OPENAI_API_KEY);

      // 检查是否选择返回
      if (selectedApiKey === '__back__') {
        return false; // 操作被取消
      }

      // 6. 生成并写入配置文件
      await this.writeCodexConfig(selectedSite, codexConfig, selectedProvider);

      // 使用选择的API Key
      await this.writeAuthConfig(selectedApiKey);

      // 7. 保存当前Codex配置到api_configs.json
      const selectedProviderConfig = codexConfig.model_providers[selectedProvider];
      const apiKeyName = typeof codexConfig.OPENAI_API_KEY === 'object'
        ? Object.keys(codexConfig.OPENAI_API_KEY).find(key => codexConfig.OPENAI_API_KEY[key] === selectedApiKey)
        : '默认API Key';

      const currentCodexConfig = {
        site: selectedSite,
        siteName: selectedSite,
        model: codexConfig.model || 'gpt-5',
        apiKey: selectedApiKey,
        apiKeyName: apiKeyName,
        provider: selectedProvider,
        providerName: selectedProviderConfig.name || selectedProvider,
        baseUrl: selectedProviderConfig.base_url
      };

      await this.configManager.saveCurrentCodexConfig(currentCodexConfig);

      // 输出美化的配置切换成功信息
      console.log(formatCodexSwitchSuccess(currentCodexConfig));
      showSuccess('配置切换完成！');

      // 退出程序
      process.exit(0);

    } catch (error) {
      showError(`切换Codex配置失败: ${error.message}`);
      return false; // 操作失败
    }
  }

  /**
   * 获取支持Codex的站点配置
   * @returns {Object} 支持Codex的站点配置
   */
  async getCodexSites() {
    try {
      const allConfigs = await this.configManager.getAllConfigs();
      const codexSites = {};

      for (const [siteKey, siteConfig] of Object.entries(allConfigs.sites)) {
        // 检查新格式（有codex字段）
        if (siteConfig.codex) {
          codexSites[siteKey] = siteConfig;
        }
        // 兼容老版本（config等于claudeCode配置）
        else if (siteConfig.config && !siteConfig.claudeCode) {
          // 老版本没有分离claudeCode和codex，默认作为claudeCode处理
          // 这里不包含在codex列表中
        }
      }

      return codexSites;
    } catch (error) {
      throw new Error(`读取配置失败: ${error.message}`);
    }
  }

  /**
   * 获取站点的Codex配置（兼容老版本）
   * @param {Object} siteConfig 站点配置
   * @returns {Object} Codex配置
   */
  getCodexConfig(siteConfig) {
    // 新格式：直接返回codex配置
    if (siteConfig.codex) {
      return siteConfig.codex;
    }

    // 理论上这里不会到达，因为getCodexSites已经过滤了
    throw new Error('站点不支持Codex配置');
  }

  /**
   * 选择站点
   * @param {Object} codexSites 支持Codex的站点
   * @returns {string} 选择的站点key
   */
  async selectSite(codexSites) {
    const choices = Object.entries(codexSites).map(([key, config]) => {
      return {
        name: `🌐 ${key}${config.description ? ` [${config.description}]` : ''}`,
        value: key,
        short: key
      };
    });

    // 添加返回选项
    choices.push(createBackChoice('__back__'));

    // 如果只有一个站点（不包括返回选项），自动选择
    if (choices.length === 2) {
      showInfo(`自动选择站点: ${chalk.cyan(choices[0].value)}`);
      return choices[0].value;
    }

    const { site } = await inquirer.prompt([
      {
        type: 'list',
        name: 'site',
        message: '选择Codex站点：',
        choices,
        pageSize: 10
      }
    ]);

    return site;
  }

  /**
   * 选择服务提供商
   * @param {Object} modelProviders 服务提供商配置
   * @returns {string} 选择的提供商key
   */
  async selectProvider(modelProviders) {
    if (!modelProviders || Object.keys(modelProviders).length === 0) {
      throw new Error('站点没有配置服务提供商');
    }

    const choices = Object.entries(modelProviders).map(([key, provider]) => {
      const providerName = provider.name || key;
      return {
        name: `💻 ${providerName} (${provider.base_url})`,
        value: key,
        short: providerName
      };
    });

    // 添加返回选项
    choices.push(createBackChoice('__back__'));

    // 如果只有一个提供商（不包括返回选项），自动选择
    if (choices.length === 2) {
      showInfo(`自动选择服务商: ${chalk.cyan(choices[0].short)}`);
      return choices[0].value;
    }

    const { provider } = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: '选择服务提供商：',
        choices,
        pageSize: 10
      }
    ]);

    return provider;
  }

  /**
   * 写入Codex配置文件（TOML格式）
   * @param {string} siteName 站点名称
   * @param {Object} codexConfig Codex配置
   * @param {string} selectedProvider 选择的提供商
   */
  async writeCodexConfig(siteName, codexConfig, selectedProvider) {
    try {
      // 确保目录存在
      await fs.ensureDir(this.codexConfigDir);

      // 读取现有配置以保留其他设置
      let existingConfig = '';
      if (await fs.pathExists(this.codexConfigFile)) {
        existingConfig = await fs.readFile(this.codexConfigFile, 'utf8');
      }

      // 获取选中的服务提供商配置
      const selectedProviderConfig = codexConfig.model_providers[selectedProvider];

      // 生成新的TOML配置
      const newTomlConfig = this.generateTomlConfig(codexConfig, selectedProvider, selectedProviderConfig, existingConfig);

      // 写入配置文件
      await fs.writeFile(this.codexConfigFile, newTomlConfig, 'utf8');

    } catch (error) {
      throw new Error(`写入Codex配置失败: ${error.message}`);
    }
  }

  /**
   * 生成TOML配置内容
   * @param {Object} codexConfig Codex配置
   * @param {string} providerKey 提供商key
   * @param {Object} providerConfig 提供商配置
   * @param {string} existingConfig 现有配置
   * @returns {string} TOML配置内容
   */
  generateTomlConfig(codexConfig, providerKey, providerConfig, existingConfig) {
    const lines = existingConfig.split('\n');
    const topLevelConfig = []; // 顶级配置行
    const sectionConfigs = []; // section配置行
    let inModelProvidersSection = false;
    let inOtherSection = false;
    let currentSection = [];

    // 获取新配置中的所有顶级配置项（排除OPENAI_API_KEY和model_providers）
    const newTopLevelKeys = [];
    Object.keys(codexConfig).forEach(key => {
      if (key !== 'OPENAI_API_KEY' && key !== 'model_providers' && key !== 'requires_openai_auth') {
        newTopLevelKeys.push(key);
      }
    });
    newTopLevelKeys.push('model', 'model_provider'); // 始终包含这两个

    // 添加必要的默认参数到覆盖列表
    const requiredDefaults = ['model_reasoning_effort', 'disable_response_storage'];
    requiredDefaults.forEach(key => {
      if (!newTopLevelKeys.includes(key)) {
        newTopLevelKeys.push(key);
      }
    });

    for (const line of lines) {
      const trimmedLine = line.trim();

      // 检查是否进入model_providers section
      if (trimmedLine.startsWith('[model_providers')) {
        inModelProvidersSection = true;
        continue; // 跳过model_providers相关的所有内容
      }

      // 检查是否进入其他section
      if (trimmedLine.startsWith('[') && !trimmedLine.startsWith('[model_providers')) {
        // 保存之前的section
        if (inOtherSection && currentSection.length > 0) {
          sectionConfigs.push(...currentSection);
          currentSection = [];
        }
        inModelProvidersSection = false;
        inOtherSection = true;
        currentSection.push(line);
        continue;
      }

      // 在model_providers section内，跳过所有内容
      if (inModelProvidersSection) {
        continue;
      }

      // 在其他section内
      if (inOtherSection) {
        currentSection.push(line);
        continue;
      }

      // 跳过OPENAI_API_KEY（它属于auth.json）
      if (trimmedLine.startsWith('OPENAI_API_KEY =')) {
        continue;
      }

      // 跳过所有与新配置同名的配置项（确保覆盖）
      let shouldSkip = false;
      for (const key of newTopLevelKeys) {
        if (trimmedLine.startsWith(`${key} =`)) {
          shouldSkip = true;
          break;
        }
      }
      if (shouldSkip) {
        continue;
      }

      // 其他顶级配置
      if (!trimmedLine.startsWith('[') && trimmedLine !== '') {
        topLevelConfig.push(line);
      }
    }

    // 保存最后一个section
    if (inOtherSection && currentSection.length > 0) {
      sectionConfigs.push(...currentSection);
    }

    // 移除末尾的空行
    while (topLevelConfig.length > 0 && topLevelConfig[topLevelConfig.length - 1].trim() === '') {
      topLevelConfig.pop();
    }

    // 构建新配置
    const newConfig = [];

    // 1. 添加model配置
    newConfig.push(`model = "${codexConfig.model || 'gpt-5'}"`);
    newConfig.push(`model_provider = "${providerKey}"`);

    // 2. 添加codex配置中的其他顶级配置项（排除OPENAI_API_KEY和model_providers）
    Object.entries(codexConfig).forEach(([key, value]) => {
      if (key !== 'OPENAI_API_KEY' && key !== 'model_providers' && key !== 'model') {
        if (typeof value === 'string') {
          newConfig.push(`${key} = "${value}"`);
        } else if (typeof value === 'number') {
          newConfig.push(`${key} = ${value}`);
        } else if (typeof value === 'boolean') {
          newConfig.push(`${key} = ${value}`);
        }
      }
    });

    // 3. 确保必要的默认参数存在
    const requiredDefaultValues = {
      'model_reasoning_effort': 'high',
      'disable_response_storage': true
    };

    // 检查现有配置和新配置中是否包含必要参数，如果没有则添加默认值
    const allConfigLines = [...newConfig, ...topLevelConfig];
    Object.entries(requiredDefaultValues).forEach(([key, defaultValue]) => {
      const hasConfig = allConfigLines.some(line =>
        line.trim().startsWith(`${key} =`)
      );

      if (!hasConfig) {
        if (typeof defaultValue === 'string') {
          newConfig.push(`${key} = "${defaultValue}"`);
        } else if (typeof defaultValue === 'boolean') {
          newConfig.push(`${key} = ${defaultValue}`);
        } else if (typeof defaultValue === 'number') {
          newConfig.push(`${key} = ${defaultValue}`);
        }
      }
    });

    // 4. 添加保留的其他顶级配置
    if (topLevelConfig.length > 0) {
      newConfig.push(...topLevelConfig);
    }

    newConfig.push(''); // 空行分隔

    // 5. 添加model_providers作为第一个table section
    newConfig.push(`[model_providers.${providerKey}]`);
    const providerName = providerConfig.name || providerKey;
    newConfig.push(`name = "${providerName}"`);
    newConfig.push(`base_url = "${providerConfig.base_url}"`);
    // wire_api 是必要参数，如果没有配置则默认为 "responses"
    const wireApi = providerConfig.wire_api || "responses";
    newConfig.push(`wire_api = "${wireApi}"`);
    const requires_openai_auth = providerConfig.requires_openai_auth || true
    newConfig.push(`requires_openai_auth = ${requires_openai_auth}`)

    // 写入其他自定义字段
    const handledFields = ['name', 'base_url', 'wire_api', 'requires_openai_auth'];
    Object.entries(providerConfig).forEach(([key, value]) => {
      if (!handledFields.includes(key) && ['string', 'number', 'boolean'].includes(typeof value)) {
        newConfig.push(`${key} = ${typeof value === 'string' ? `"${value}"` : value}`);
      }
    });

    // 6. 添加其他section配置
    if (sectionConfigs.length > 0) {
      newConfig.push(''); // 空行分隔
      newConfig.push(...sectionConfigs);
    }

    return newConfig.join('\n') + '\n';
  }

  /**
   * 写入认证配置文件（合并模式，保留现有字段）
   * @param {string} token API token
   */
  async writeAuthConfig(token) {
    try {
      // 确保目录存在
      await fs.ensureDir(this.codexConfigDir);

      // 读取现有配置（如果存在）
      let existingAuth = {};
      if (await fs.pathExists(this.codexAuthFile)) {
        try {
          const content = await fs.readFile(this.codexAuthFile, 'utf8');
          existingAuth = JSON.parse(content);
        } catch (error) {
          showWarning(`读取现有 auth.json 失败: ${error.message}，将创建新文件`);
        }
      }

      // 合并配置（保留现有字段，只更新 OPENAI_API_KEY）
      const authConfig = {
        ...existingAuth,
        OPENAI_API_KEY: token
      };

      // 写入合并后的认证文件
      await fs.writeFile(this.codexAuthFile, JSON.stringify(authConfig, null, 2), 'utf8');

    } catch (error) {
      throw new Error(`写入认证配置失败: ${error.message}`);
    }
  }

  /**
   * 选择API Key（支持字符串和对象格式）
   * @param {string|object} apiKey API Key配置
   * @returns {string} 选择的API Key
   */
  async selectApiKey(apiKey) {
    // 转换为统一的对象格式
    const rawApiKey = apiKey;
    const apiKeys = typeof rawApiKey === 'string' ? { '默认API Key': rawApiKey } : rawApiKey;

    // 智能选择逻辑
    if (Object.keys(apiKeys).length === 1) {
      const selectedKey = Object.values(apiKeys)[0];
      const keyName = Object.keys(apiKeys)[0];
      console.log(chalk.gray(`✓ API Key自动选择: ${keyName} (${selectedKey.substring(0, 10)}...)`));
      return selectedKey;
    } else {
      // 多个API Key时显示选择界面
      const { selectToken } = await import('../../utils/ui.js');
      console.log(chalk.white('\n🔑 请选择 API Key:'));
      const selectedKey = await selectToken(apiKeys);

      // 检查是否选择返回
      if (selectedKey === '__back__') {
        return '__back__';
      }

      const keyName = Object.keys(apiKeys).find(key => apiKeys[key] === selectedKey);
      console.log(chalk.gray(`✓ 选择API Key: ${keyName}`));
      return selectedKey;
    }
  }
}

export default new CodexSwitchCommand();