# 呼啦圈 Parkson（parkson）迁移记录

- AppID：`wx89a714fb03b61b99`
- 最新缓存包：`43`（2026-11-16 抓取；主包 + packageActivities/packageComponents/packageIntegral/packageProduct）
- 解包目录：`analysis/packages/parkson/unpacked`；原始代码：`analysis/packages/parkson/raw/app-service.js`

## 接口

- `POST /appLogin`：`{ appType: 1, principal: code }`，返回 `accessToken` / `authorization` / `userId`。
- `PUT /user/registerOrBindUser`：`{ appType:1, encryptedData, ivStr, img, nickName, distributionCardNo, validateType:2, registerOrBind:2, platform:1 }`。
- `GET /p/user/userInfo`、`GET /pointsSign/user/pointsInfo/query`、`GET /pointsSign/user/sign/list`、签到接口。

## 阻塞

最新包仍使用 legacy `encryptedData/ivStr` 注册。YYB `getPhoneAuth` 返回的密文请求 `PUT /user/registerOrBindUser` 仍返回 HTTP 400（空 body），判断为目标服务端按微信会话/水印校验手机号授权数据，YYB 取到的密文不同会话，无法解密。脚本保持停用，需真实客户端授权或目标服务端支持新版手机号 code。
