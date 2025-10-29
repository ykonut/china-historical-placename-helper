# GitHub 仓库配置指南

## 1. 创建 GitHub 仓库

1. 访问 [GitHub](https://github.com) 并登录
2. 点击右上角的 "+" → "New repository"
3. 填写仓库信息：
   - **Repository name**: `china-historical-placename-helper`
   - **Description**: `A cross-platform application for querying Chinese historical placenames`
   - **Public/Private**: 选择 Public（公开仓库才能使用免费的 GitHub Actions）
   - **不要勾选** "Initialize this repository with a README"（因为本地已有）
4. 点击 "Create repository"

## 2. 连接本地仓库到 GitHub

在项目目录执行以下命令：

```bash
# 初始化 git 仓库（如果还没有）
git init

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit: 地名助手 v0.1.0"

# 添加远程仓库
git remote add origin https://github.com/ykonut/china-historical-placename-helper.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

## 3. 创建第一个 Release

GitHub Actions 会在你创建 tag 时自动编译并发布：

```bash
# 创建并推送 tag
git tag v0.1.0
git push origin v0.1.0
```

然后：
1. 访问 GitHub 仓库的 Actions 标签页
2. 等待编译完成（约 5-10 分钟）
3. 编译完成后，会自动在 Releases 页面创建草稿
3. 编辑草稿，点击 "Publish release" 发布

## 4. 手动触发编译（可选）

如果不想创建 tag，也可以手动触发编译：

1. 访问 GitHub 仓库的 Actions 标签页
2. 点击左侧的 "Release Build" 工作流
3. 点击右上角的 "Run workflow"
4. 选择分支并运行

## 注意事项

- GitHub Actions 对公开仓库免费，私有仓库有时长限制
- 每次编译大约需要 5-10 分钟
- 编译产物会自动上传到 Releases 页面
- macOS 和 Windows 版本会并行编译

## 后续更新

当你修改代码并想发布新版本时：

```bash
# 1. 更新版本号（在 package.json 和 src-tauri/Cargo.toml 中）
# 2. 提交更改
git add .
git commit -m "版本更新说明"
git push

# 3. 创建新版本 tag
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions 会自动开始编译并创建新的 Release。
