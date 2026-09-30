# 华住会微信小程序签到（Surge iOS）

它从微信“华住会”小程序发往 `appgw.huazhu.com` 的请求中提取 `userToken`，并在每天 08:05 调用同一套小程序签到接口。

## 文件

- `huazhu.js`：Token 获取和签到逻辑。
- `huazhu-capture.sgmodule`：临时 Token 获取模块。
- `huazhu-checkin.sgmodule`：每日签到模块。

两个模块通过 GitHub Raw 地址加载 `huazhu.js`，无需手动复制脚本文件。

## 安全边界

- Token 只写入 Surge 的 `$persistentStore`，键名为 `huazhu_mini_user_token`。
- 日志和通知不会显示 Token。
- 脚本只主动访问 `https://appgw.huazhu.com/game/sign_in`。
- 临时抓取模块只对 `appgw.huazhu.com` 启用 MITM。
- 不使用 BoxJS，也不向第三方服务器上传账号信息。

请勿把 Surge 日志、配置目录或 Token 存储内容发给陌生人。

## 安装

1. 在 Surge 的模块页面选择“安装新模块”。
2. 先安装 Token 获取模块：
   `https://raw.githubusercontent.com/Yoyyyyp/surge-huazhu/main/huazhu-capture.sgmodule`
3. 再安装每日签到模块：
   `https://raw.githubusercontent.com/Yoyyyyp/surge-huazhu/main/huazhu-checkin.sgmodule`
4. 确认 Surge 已正确安装并信任 MITM CA 证书。
5. 暂时只启用“华住会小程序 Token 获取（临时）”。
6. 确认 Surge 的“脚本”“重写”和“MITM”开关已开启。

## 获取 Token

1. 保持临时抓取模块启用。
2. 打开微信中的“华住会”小程序。
3. 登录后进入会员或签到页面，并主动刷新或点击一次签到入口。
4. 等待 Surge 通知“华住会 Token 获取成功”或“华住会 Token 已确认”。
5. 获取成功后立即关闭临时抓取模块。

如果没有收到通知，先查看 Surge 最近请求中是否存在 `appgw.huazhu.com`。不要直接扩大到整个微信或 `*.huazhu.com` 的 MITM 范围。

## 测试签到

1. 启用“华住会小程序每日签到”模块。
2. 在 Surge 脚本列表中长按“华住会小程序每日签到”，手动执行一次。
3. 查看 Surge 通知和对应脚本日志。
4. 再打开华住会小程序，核对积分或签到状态。

可能出现的通知：

- `华住会签到成功`：接口返回成功，通知会显示本次积分。
- `华住会今日已签到`：当天无需重复执行。
- `华住会登录已失效`：重新启用临时抓取模块获取 Token。
- `接口返回格式发生变化`：华住会可能调整了接口，需要根据脱敏日志更新脚本。

## 定时规则

默认每天本地时间 08:05 执行：

```text
5 8 * * *
```

模块设置了 `wake-system=true`，但 iOS 后台唤醒仍不具备服务器 Cron 的绝对可靠性。

## 卸载

1. 在 Surge 中删除或停用两个模块。
2. Surge 没有面向用户的单键存储项删除界面时，可用一段本地清理脚本删除以下键：
   - `huazhu_mini_user_token`
   - `huazhu_mini_user_agent`
   - `huazhu_mini_token_saved_at`

如需清理脚本，请单独生成并仅运行一次。

## 说明

华住会可能随时调整登录、签到接口或活动规则。本包不会高频重试，也不会尝试绕过验证码、设备校验或风控。使用前请确认符合相关服务条款。
