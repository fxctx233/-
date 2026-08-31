# 日常记账 Android 竖屏试用版

Android 8.0 及以上，使用系统 WebView 展示随 APK 打包的完整界面。没有 INTERNET 权限，首次启动也不依赖网页服务。请保持 Android System WebView 为较新版本。

## 界面与数据

- 默认竖屏，顶部支出/收入圆形按钮，底部总览、账单、计划、设置导航。
- 四列彩色分类、金额输入、备注与圆形确认；账单在手机上显示为列表，不需要横向滚动。
- 应用专属 SQLite 数据库保存账本 JSON 和配色；网页、PC 与 Android 各自独立，通过同一 JSON 备份格式转移。
- 导入导出使用安卓系统文件选择器，不需要整个存储空间的访问权限。
- 不申请网络权限、不启用系统云备份。卸载或清除应用数据前务必手动导出。
- 目前仅应用内进度提醒，尚未实现系统定时通知及逐笔存取历史。

## 试用 APK 注意

这是 debug 签名的测试安装包，不是应用商店正式发行版。GitHub Actions 每次全新构建可能使用不同测试签名；如果后续安装提示签名冲突，先导出备份，确认备份可用后再卸载旧版、安装并恢复。正式发行前需配置稳定的私有签名密钥，密钥不得提交仓库。

没有连接安卓真机时，只能报告构建和静态检查结果，不能声称已经完成真机安装、软键盘、文件选择或数据库持久化测试。

## 构建

要求 JDK 17、Gradle 8.7、Android SDK platform 35、build-tools 34.0.0。

1. 在 pc-web 运行 npm ci，再运行 npm run build:pages。
2. 在项目根目录运行 node android/prepare-assets.mjs。
3. 设置 ANDROID_HOME，或在 android/local.properties 设置 sdk.dir。
4. 在项目根目录运行 gradle -p android assembleDebug lintDebug。

APK：android/app/build/outputs/apk/debug/app-debug.apk。

也可在 GitHub 仓库 Actions → Build Android APK 运行并下载 daily-ledger-android-debug 产物。产物默认保留 30 天，源码长期保留。
