# 23 平台时间与下个任务倒计时

顶部全局时间默认按**本地时间**显示。时间不是简单读取浏览器本地时间，而是使用“服务器时间 + 平台时钟偏移”，并按本地时区展示；这样 NAS/服务器和浏览器时区一致时，页面、定时任务和倒计时可以直接对应。

## 1. 行为

- 默认模式：自动同步。
- 没有配置同步网址时，偏移为 0，等价于服务器时间。
- 自动同步：定时请求时间网址，计算 `offsetMs = 远程时间 - 服务器时间`。
- 手动设置：用户选择一个本地时间，平台按该时间继续走。
- 平台时间只影响平台显示和定时任务，不修改宿主机/NAS 系统时间。
- 顶部显示当前平台时间、模式（自动/手动）和“下一个脚本”剩余时间。
- 点击“下一个脚本”展开列表，按 `nextRunAt` 从近到远显示应用、脚本、运行时间和实时倒计时。

## 2. 配置页面

路径：`/time`，也可以点击顶部时间进入。

自动同步：

- 时间同步网址；
- 同步间隔（分钟）；
- 立即同步；
- 保存自动同步。

手动设置：

- 选择一个本地时间；
- 设为手动时间。

页面会显示：

- 当前平台时间；
- 自动/手动模式；
- 相对服务器偏移；
- 上次校时时间；
- 最近一次校时失败原因。

## 3. 时间同步网址

支持以下返回：

1. HTTP `Date` 响应头；
2. 纯数字时间戳：秒或毫秒；
3. ISO 时间或日期字符串；
4. 常见 JSON 字段：
   - `timestamp`
   - `unixtime`
   - `time`
   - `now`
   - `serverTime` / `server_time`
   - `currentTime` / `current_time`
   - `dateTime` / `datetime`
   - `utc_datetime`
   - `date`
   - 上述字段在 `data`、`result`、`server`、`payload` 下也支持。

示例：

```text
https://worldtimeapi.org/api/timezone/Etc/UTC
https://timeapi.io/api/Time/current/zone?timeZone=Etc/UTC
```

实际使用时把 `Etc/UTC` 换成页面显示的本地时区。

自建接口返回：

```json
{ "timestamp": 1700000000 }
```

或纯文本：

```text
1700000000
```

没有时区的日期字符串按服务器本地时区解释。

## 4. 调度器

Worker 计算 cron 时不再直接使用服务器时间，而是：

```text
平台时间 = new Date() + clock.state.offsetMs
```

因此：

- `nextRunAt` 与顶部时间一致；
- 修改手动时间或校时偏移超过 60 秒时，会把已启用脚本的 `nextRunAt` 清空，由 Worker 重新计算；
- 小幅自动校时不会重置所有任务，避免把即将运行的任务推迟。

## 5. 存储与 API

存储：`Setting` 表，key 为 `clock.state`，JSON 内容：

```json
{
  "mode": "auto",
  "offsetMs": 0,
  "sourceUrl": "https://...",
  "syncIntervalSeconds": 300,
  "lastSyncedAt": "2026-11-16T02:00:00.000Z",
  "lastAttemptAt": "2026-11-16T02:00:00.000Z",
  "lastError": null,
  "lastRemoteTime": "2026-11-16T02:00:00.000Z",
  "manualTime": null
}
```

API：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/clock` | 当前平台时间、设置、下一次运行列表 |
| `PATCH` | `/api/v1/clock` | 修改模式、同步网址、间隔、手动时间 |
| `POST` | `/api/v1/clock/sync` | 立即校时 |

`PATCH` 示例：

```json
{
  "mode": "auto",
  "sourceUrl": "https://worldtimeapi.org/api/timezone/Etc/UTC",
  "syncIntervalSeconds": 300
}
```

```json
{
  "mode": "manual",
  "manualTime": "2026-11-16T10:00:00.000Z"
}
```

## 6. 注意

- 时间同步地址由管理员填写，平台会主动请求该地址；只填写可信地址。
- 自动同步失败不会清空上一次偏移，只会记录 `lastError` 并继续使用旧偏移。
- 手动时间会影响定时任务，调整前请确认当前没有正在运行的任务。
- 平台时间不是安全时间源，不用于签名、证书或审计时间。
- 账号的 `timeOffsetMinutes` 是“执行偏移”，与平台时间偏移不同：定时任务仍按 `nextRunAt` 触发并显示，触发后写入 `Run.notBefore`，最多再延迟指定分钟执行，用来错开同一应用的多账号。
