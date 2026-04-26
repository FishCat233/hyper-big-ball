# 查询 QQ 信息

**分类：** 社交

通过 QQ 号查询用户资料，返回头像、昵称、个性签名、等级和 VIP 信息。

## 功能概述
这个接口适合用在用户资料展示、头像卡片、账号绑定结果展示等场景。若用户把 QQ 等级设为隐藏，`qq_level` 会返回 `null`。

## 数据字段说明
- **基础信息**: 昵称、个性签名、头像、年龄、性别
- **联系信息**: QQ 邮箱、个性域名（QID）
- **等级信息**: QQ 等级、VIP 状态和等级
- **时间信息**: 注册时间、最后更新时间

## API 端点

**方法：** GET
**路径：** /social/qq/userinfo
**完整API地址：** https://uapis.cn/api/v1/social/qq/userinfo
**文档页面：** https://uapis.cn/docs/api-reference/get-social-qq-userinfo

## 响应

### 200 / 请求成功

成功响应，返回QQ用户的详细信息

```json
{
  // QQ号
  "qq": "12519212",
  // 用户昵称
  "nickname": "小明",
  // 个性签名
  "long_nick": "今天天气真不错",
  // 头像URL
  "avatar_url": "http://q.qlogo.cn/g?b=qq&nk=12519212&s=640",
  // 年龄
  "age": 25,
  // 性别
  "sex": "男",
  // QQ个性域名
  "qid": "xiaoming2024",
  // QQ等级。用户隐藏时返回 null
  "qq_level": 64,
  // 地理位置（省市）
  "location": "广东 深圳",
  // QQ邮箱
  "email": "12519212@qq.com",
  // 是否为VIP用户
  "is_vip": true,
  // VIP等级
  "vip_level": 7,
  // 注册时间（ISO 8601格式）
  "reg_time": "2008-03-15T10:30:00Z",
  // 最后更新时间（ISO 8601格式）
  "last_updated": "2024-08-14T15:45:30Z"
}
```

### 400 / 错误的请求

缺少或无效的qq参数

```json
{
  "code": "INVALID_ARGUMENT",
  "details": {},
  "message": "Missing or invalid 'qq' parameter."
}
```

### 404 / 未找到

获取QQ用户信息失败或用户不存在

```json
{
  "code": "NOT_FOUND",
  "details": {},
  "message": "Failed to retrieve QQ user info, user may not exist."
}
```

## 查询参数

- **`qq`** (string) - 必填
  需要查询的QQ号
  示例：`10001`
  提示：纯数字的QQ号。