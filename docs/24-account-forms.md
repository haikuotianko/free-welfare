# 24 账号表单与活动资料

用于保存活动/脚本需要的通用资料，例如手机号、生日、地址。管理员先定义表单，再给每个微信账号填写真实数据；活动页按当前账号展示这些资料。

## 1. 模型

```text
FormTemplate
  id, name, description
  fields: JSON [{ key, label, type, defaultValue, note, required, options }]

AccountForm
  id, wechatAccountId, templateId
  values: JSON { [fieldKey]: string }
```

关系：

- 一个表单模板可以被多个账号填写；
- 一个账号可以填写多套表单；
- 删除模板会级联删除账号填写的数据。

字段类型：

| type | 控件 |
| --- | --- |
| `text` | 单行文本 |
| `tel` | 手机号 |
| `number` | 数字 |
| `date` | 日期 |
| `textarea` | 多行文本 |
| `address` | 文本地址（当前使用文本框） |
| `select` | 下拉选择，需配置 `options` |

## 2. API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/forms` | 表单模板列表（含账号填写数量） |
| `POST` | `/api/v1/forms` | 新建模板 |
| `PATCH` | `/api/v1/forms/:id` | 修改模板 |
| `DELETE` | `/api/v1/forms/:id` | 删除模板及账号数据 |
| `GET` | `/api/v1/accounts/:id/forms` | 某账号的表单数据 |
| `PUT` | `/api/v1/accounts/:id/forms/:templateId` | 新建/更新账号表单值 |
| `DELETE` | `/api/v1/accounts/:id/forms/:templateId` | 删除账号的一套表单 |

`PUT` body：

```json
{
  "values": {
    "phone": "13800000000",
    "birthday": "1990-01-01",
    "address": "上海市..."
  }
}
```

服务端只保留模板里定义的字段，缺失字段用 `defaultValue` 补齐。

## 3. 页面

- `/forms`：表单配置页，定义字段、类型、默认值、备注、必填、下拉选项。
- `/accounts`：账号页的“表单资料”按钮，选择模板并编辑真实数据。
- `/activities`：显示当前账号的活动资料，链接到账号页编辑。

## 4. 活动表单（脚本定义）

除了账号级表单，活动也可以由脚本定义自己的参加表单。脚本通过 SDK 写入 `formSchema`：

```js
await ctx.activities.upsert({
  externalId: 'brand.lottery',
  name: '品牌抽奖',
  type: 'lottery',
  status: 'available',
  formSchema: {
    title: '填写抽奖信息',
    submitText: '提交抽奖',
    fields: [
      { key: 'phone', label: '手机号', type: 'tel', required: true },
      { key: 'address', label: '收货地址', type: 'textarea', required: true },
      { key: 'size', label: '尺码', type: 'select', options: ['S', 'M', 'L'] },
    ],
  },
});
```

说明：

- 字段结构与 `FormTemplate.fields` 一致：`key / label / type / defaultValue / note / required / options`。
- 带 `formSchema` 的活动会记录所属脚本 `scriptId`，活动页显示“参加”按钮。
- 点击“参加”会打开表单弹窗；当前账号已保存的账号表单值会按字段 `key` 自动带入，找不到同名字段时再按 `label` 匹配。
- 提交后平台排队运行所属脚本，并把 `{ source: 'activity', activityId, activityExternalId, activityName, values }` 写入 `Run.input`。
- 脚本通过 `ctx.input` 读取这些值，参见 `docs/20-script-development-guide.md` 的 3.2 与 6.4。
- 不带 `formSchema` 的活动只展示，不显示“参加”。

API：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/activities` | 活动列表，含应用、脚本与 `formSchema` |
| `POST` | `/api/v1/activities/:id/participate` | body `{ accountId, values }`，排队参与运行 |

服务端会校验账号已订阅活动所属应用、必填字段以及活动/脚本状态。

没有 `formSchema` 或没有关联参与脚本的可参与活动，页面会显示“手动参与”：提示到应用小程序内完成，并尝试显示应用小程序码。小程序码从以下位置读取：

- `site.metadata.qrCodeUrl` / `qrcode` / `qr_code`
- `site.config.qrCodeUrl` / `qrcode` / `qr_code`

没有配置时弹窗会提示到应用详情补充，不会用活动链接伪造小程序码。

## 5. 使用建议

- 需要手机号时建一个 `phone` 字段，类型 `tel`。
- 生日使用 `date`。
- 地址可以先用 `textarea`，后续可以增加省市区选择器。
- 不同活动差异较大时，建多套表单，例如“活动报名”“收货地址”“酒店信息”。
- 表单数据属于个人隐私，自托管实例请限制访问权限并做好备份。
