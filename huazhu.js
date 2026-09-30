/*
 * 华住会微信小程序签到（Surge iOS）
 *
 * 运行方式：
 * 1. http-request：从 appgw.huazhu.com 请求的 Cookie 中提取 userToken。
 * 2. cron：使用本地保存的 userToken 调用微信小程序签到接口。
 *
 * 安全边界：
 * - Token 只写入 Surge $persistentStore。
 * - 日志和通知不会输出 Token。
 * - 脚本只主动访问 https://appgw.huazhu.com/game/sign_in。
 */

(function () {
  "use strict";

  var TOKEN_KEY = "huazhu_mini_user_token";
  var USER_AGENT_KEY = "huazhu_mini_user_agent";
  var SAVED_AT_KEY = "huazhu_mini_token_saved_at";
  var SIGN_ENDPOINT = "https://appgw.huazhu.com/game/sign_in";
  var DEFAULT_USER_AGENT =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
    "AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.0 MiniProgram";

  if (typeof $request !== "undefined") {
    captureToken();
  } else {
    runCheckin();
  }

  function captureToken() {
    var headers = $request.headers || {};
    var cookie = getHeader(headers, "cookie");
    var token = extractCookie(cookie, "userToken");

    if (!token) {
      console.log("[华住会] 本次请求未发现 userToken，继续进入小程序签到页面后再试。");
      $done({});
      return;
    }

    var previous = $persistentStore.read(TOKEN_KEY);
    var saved = $persistentStore.write(token, TOKEN_KEY);
    var userAgent = getHeader(headers, "user-agent");

    if (userAgent) {
      $persistentStore.write(userAgent, USER_AGENT_KEY);
    }
    $persistentStore.write(new Date().toISOString(), SAVED_AT_KEY);

    if (!saved) {
      notify("华住会 Token 保存失败", "Surge 本地存储写入失败，请查看脚本日志。");
    } else if (previous === token) {
      notify("华住会 Token 已确认", "本地 Token 未变化，可以关闭临时抓取模块。");
    } else {
      notify("华住会 Token 获取成功", "Token 已保存在本机，请关闭临时抓取模块。");
    }

    $done({});
  }

  function runCheckin() {
    var token = $persistentStore.read(TOKEN_KEY);

    if (!token) {
      notify("华住会签到未执行", "尚未获取小程序 Token，请先启用临时抓取模块。");
      $done();
      return;
    }

    var userAgent = $persistentStore.read(USER_AGENT_KEY) || DEFAULT_USER_AGENT;
    var timestamp = Math.floor(Date.now() / 1000);
    var request = {
      url: SIGN_ENDPOINT + "?date=" + timestamp,
      headers: {
        Accept: "application/json, text/plain, */*",
        Cookie: "userToken=" + token,
        "User-Agent": userAgent,
        channel: "1"
      }
    };

    $httpClient.get(request, function (error, response, data) {
      if (error) {
        console.log("[华住会] 网络请求失败。");
        notify("华住会签到失败", "网络请求失败，请稍后手动重试。");
        $done();
        return;
      }

      var status = Number((response && (response.status || response.statusCode)) || 0);
      var result = parseJson(data);

      if (status === 401 || isUnauthorized(result)) {
        console.log("[华住会] Token 已失效或未获授权，HTTP " + status + "。");
        notify("华住会登录已失效", "请重新启用临时抓取模块，并打开微信华住会小程序。");
        $done();
        return;
      }

      if (!result) {
        console.log("[华住会] 接口返回非 JSON 内容，HTTP " + status + "。");
        notify("华住会签到失败", "接口返回格式发生变化，请查看脚本日志。");
        $done();
        return;
      }

      var message = responseMessage(result);
      if (isSuccess(result)) {
        var point = result.content && result.content.point;
        var body = point === undefined || point === null
          ? "签到成功。"
          : "签到成功，本次获得 " + point + " 积分。";
        console.log("[华住会] " + body);
        notify("华住会签到成功", body);
      } else if (isAlreadySigned(message)) {
        console.log("[华住会] 今日已签到。");
        notify("华住会今日已签到", message || "无需重复签到。");
      } else {
        console.log("[华住会] 签到失败，HTTP " + status + "，返回码 " + responseCode(result) + "。");
        notify("华住会签到失败", message || "接口未返回明确原因，请查看脚本日志。");
      }

      $done();
    });
  }

  function getHeader(headers, targetName) {
    var target = String(targetName).toLowerCase();
    var names = Object.keys(headers || {});
    for (var i = 0; i < names.length; i += 1) {
      if (String(names[i]).toLowerCase() === target) {
        return String(headers[names[i]] || "");
      }
    }
    return "";
  }

  function extractCookie(cookie, name) {
    if (!cookie) return "";
    var escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var match = String(cookie).match(new RegExp("(?:^|;\\s*)" + escapedName + "=([^;]+)", "i"));
    return match ? match[1].trim() : "";
  }

  function parseJson(data) {
    try {
      return JSON.parse(data || "");
    } catch (_) {
      return null;
    }
  }

  function responseCode(result) {
    if (!result) return "unknown";
    if (result.code !== undefined && result.code !== null) return String(result.code);
    if (result.businessCode !== undefined && result.businessCode !== null) {
      return String(result.businessCode);
    }
    return "unknown";
  }

  function responseMessage(result) {
    if (!result) return "";
    var value = result.message || result.responseDes || result.error || "";
    return safeMessage(value);
  }

  function isSuccess(result) {
    return Number(result && result.code) === 200;
  }

  function isUnauthorized(result) {
    var code = responseCode(result);
    var message = responseMessage(result);
    return code === "401" || code === "1003" ||
      /unauthorized|token.{0,8}(失效|过期|错误)|请.{0,6}登录|重新登录|未登录|未授权/i.test(message);
  }

  function isAlreadySigned(message) {
    return /已签到|已经签到|重复签到|请勿重复/i.test(message || "");
  }

  function safeMessage(value) {
    var text = String(value || "").replace(/[\r\n]+/g, " ").trim();
    var token = $persistentStore.read(TOKEN_KEY);
    text = text.replace(/(userToken\s*[=:]\s*)[^;,\s"']+/ig, "$1[REDACTED]");
    if (token) {
      text = text.split(token).join("[REDACTED]");
    }
    return text.length > 120 ? text.slice(0, 120) + "…" : text;
  }

  function notify(title, body) {
    $notification.post(title, "", body);
  }
})();
