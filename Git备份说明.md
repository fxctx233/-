# 日常记账：项目备份到 Git

项目备份和账目备份是两件事。Git 保存程序源码；账目保存在浏览器，不会随源码上传。账目应在软件里单独导出，并保存在安全位置；建议不要提交到 Git，即使是私有仓库。

## 如果使用 GitHub

1. 在浏览器登录拥有目标仓库的 GitHub 账号。绑定另一个 Google 账号或 Gmail 地址没有关系，推送权限取决于 GitHub 账号。
2. 建议创建一个 Private（私有）空仓库，例如 daily-ledger。创建时不要添加 README、许可证或 .gitignore。如果已有仓库包含内容，不要使用下面的新仓库流程，也不要强制推送，应先克隆并检查内容。
3. 在本项目目录打开 PowerShell，按下面操作。将示例用户名、邮箱和仓库地址替换为自己的值。这些命令尚未替你执行。

```powershell
Set-Location 'E:\项目文件\存钱计划'
git init -b main
git config user.name '你的GitHub用户名'
git config user.email '你的GitHub提交邮箱'
git config credential.https://github.com.useHttpPath true
git config credential.https://github.com.username '拥有仓库权限的GitHub用户名'
git remote add origin 'https://github.com/你的用户名/daily-ledger.git'
git add .
git diff --cached --stat
git diff --cached
```

确认暂存内容仅包含源代码、说明和启动入口，没有密码、令牌、真实账目或其他私密内容，再执行：

```powershell
git commit -m 'Initial daily ledger app'
git push -u origin main
```

使用 Git Credential Manager 时，首次推送可能打开登录页面，请选择有仓库权限的 GitHub 账号。不要把密码或访问令牌发给聊天助手，也不要写到远程地址中。user.name 和 user.email 只标记提交者，不负责登录。上述 git config 不带 --global，只作用于这个项目，不改变其他项目的身份配置。

## 后续更新

```powershell
git status
git add .
git diff --cached
git commit -m 'Update daily ledger'
git push
```

不要提交 node_modules、dist、日志、.env 和账目备份；已配置常见忽略规则，但提交前仍需检查。任意改名后的敏感文件可能不在忽略范围内。

## 从备份恢复程序

克隆仓库后进入 pc-web，安装 Node.js（满足 package.json 要求），运行 npm ci 恢复依赖，再双击根目录的“启动日常记账.cmd”，服务就绪后打开“日常记账网页.url”。账目需另外导入之前导出的 JSON 文件。

参考：https://docs.github.com/en/account-and-profile/how-tos/account-management/managing-multiple-accounts?platform=windows
