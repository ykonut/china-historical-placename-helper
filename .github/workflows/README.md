# GitHub Actions 工作流说明

## 自动编译发布

本项目使用 GitHub Actions 自动编译多平台版本。

### 支持的平台和架构

#### macOS
- **Apple Silicon (ARM64)**: M1/M2/M3 等芯片
- **Intel (x64)**: 英特尔芯片

#### Windows
- **x86-64 (x64)**: 64位 Intel/AMD 处理器
- **ARM64**: ARM 架构处理器（如 Surface Pro X）

### 如何触发编译

#### 方法 1: 创建标签（推荐）

```bash
# 创建版本标签
git tag v0.1.0

# 推送标签到 GitHub
git push origin v0.1.0
```

创建以 `v` 开头的标签（如 `v0.1.0`、`v1.0.0`）会自动触发编译流程。

#### 方法 2: 手动触发

1. 访问 GitHub 仓库页面
2. 点击 "Actions" 标签
3. 选择 "Release Build" 工作流
4. 点击 "Run workflow" 按钮
5. 选择分支并点击 "Run workflow"

### 编译产物

编译完成后，会自动创建一个 GitHub Release 草稿，包含以下文件：

- `地名助手_x.x.x_aarch64.dmg` - macOS Apple Silicon
- `地名助手_x.x.x_x64.dmg` - macOS Intel
- `地名助手_x.x.x_x64-setup.exe` - Windows x64 安装程序
- `地名助手_x.x.x_x64.msi` - Windows x64 MSI 安装包
- `地名助手_x.x.x_arm64-setup.exe` - Windows ARM64 安装程序
- `地名助手_x.x.x_arm64.msi` - Windows ARM64 MSI 安装包

### 发布流程

1. 编译完成后，前往 GitHub 的 Releases 页面
2. 找到自动创建的 Release 草稿
3. 检查编译产物是否完整
4. 编辑 Release 说明（如需要）
5. 点击 "Publish release" 发布

### 注意事项

- 编译过程需要约 15-30 分钟，取决于 GitHub Actions 的运行速度
- Release 默认创建为草稿状态，需要手动发布
- 确保在 `package.json` 和 `src-tauri/tauri.conf.json` 中的版本号保持一致
