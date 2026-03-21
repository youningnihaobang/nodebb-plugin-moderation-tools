# 版主管理工具插件 (nodebb-plugin-moderation-tools)

## 1. 介绍

该插件是 NodeBB 的版主（Category）管理插件，为版主提供一个专门的前端管理页面，使其能够在无需进入 ACP（管理控制面板）的情况下，对自己有管理权限的版块进行日常管理操作。

### 1.1 核心价值

- **降低管理门槛**：版主无需进入 ACP 后台即可完成日常分类管理工作
- **权限精细化**：管理员通过 ACP 可配置版主可管理的具体字段，避免误操作
- **安全可控**：严格遵循 NodeBB 原生权限体系（`privileges.categories`），确保操作安全

### 1.2 目标用户

| 角色 | 使用场景 |
|------|----------|
| 管理员 (Administrator) | 在 ACP 中配置版主可管理的分类字段 |
| 全局版主 (Global Moderator) | 管理所有版块的已授权字段 |
| 版主 (Moderator) | 管理所辖版块的已授权字段 |
| 普通用户 | 通过 Widget 跳转到版主管理页（如有权限则可见） |

---

## 2. 需求说明

### 2.1 版主管理页面（前端页面）

#### 2.1.1 页面基本信息

- **URL**: `/extra-tools/moderation-tools`
- **访问控制**: 仅对具有管理权限的用户可见（管理员、全局版主、版主），无权限用户访问时重定向到首页或显示无权限提示
- **布局参考**: NodeBB ACP 的 `src/views/admin/manage/category.tpl`，但适配前端主题风格
- **页面结构**: 响应式两栏布局（左侧表单 + 右侧操作栏）

#### 2.1.2 页面功能

1. **版块选择器**
   - 页面顶部提供版块下拉选择器，列出当前用户有管理权限的所有版块
   - 版块列表通过 `privileges.categories.filterCids('moderate', allCids, uid)` 过滤获取
   - 管理员和全局版主可以看到所有版块
   - 普通版主仅显示其被授权管理的版块

2. **分类设置表单**（左侧主区域）

   根据 ACP 配置（参见 2.2），动态显示以下字段：

   | 字段名 | data-name | 类型 | 说明 |
   |--------|-----------|------|------|
   | 版块名称 | `name` | text | 版块显示名称 |
   | 版块句柄 | `handle` | text | URL 友好的唯一标识 |
   | 版块描述 | `description` | textarea | 版块描述文本 |
   | 主题模板 | `topicTemplate` | textarea | 新建主题时的模板内容 |
   | 父版块 | `parentCid` | select | 上级版块选择 |
   | 最近回复数 | `numRecentReplies` | number | 版块页显示的最近回复数 |
   | 子版块每页数量 | `subCategoriesPerPage` | number | 每页显示的子版块数 |
   | 主题最少标签数 | `minTags` | number | 发帖时最少标签数 |
   | 主题最多标签数 | `maxTags` | number | 发帖时最多标签数 |
   | 标签白名单 | `tagWhitelist` | text | 允许使用的标签列表 |
   | 外部链接 | `link` | text | 外部链接地址 |
   | 章节模式 | `isSection` | checkbox | 是否为章节（非独立版块） |
   | 帖子审核队列 | `postQueue` | checkbox | 是否启用帖子审核队列 |
   | 背景图片 | `backgroundImage` | text/upload | 版块背景图片 URL |
   | 背景颜色 | `bgColor` | color | 版块背景色 |
   | 文字颜色 | `color` | color | 版块文字颜色 |
   | 图片尺寸 | `imageClass` | select | 背景图片尺寸（auto/cover/contain） |
   | 自定义样式类 | `class` | text | 自定义 CSS 类名 |

   > 注意：以上字段并非全部开放给版主，管理员通过 ACP 配置具体开放哪些字段。

3. **操作栏**（右侧边栏）

   根据版主管理页面需求，提供以下操作入口（参考 `admin/partials/category/sidebar.tpl`）：

   - **查看版块**: 跳转到该版块的前端页面 `/category/{cid}`
   - **分析数据**: 跳转到版块分析页面（如版主有权限）
   - **保存按钮**: 页面顶部 sticky 保存栏，用于提交修改

   > 注意：以下 ACP 侧边栏功能**不开放**给版主管理页面：
   > - 启用/禁用版块（`toggle`）
   > - 清除版块（`purge`）
   > - 联邦设置（`federation`）
   > - 这些属于高风险操作，仅管理员在 ACP 中可执行

4. **保存逻辑**
   - 版主仅能保存 ACP 中已授权的字段
   - 未授权字段在提交时被过滤，不会被修改
   - 保存时需要验证数据的合法性（如 name 不能为空、handle 需唯一等）
   - 保存成功后显示成功提示

#### 2.1.3 页面交互

- 版块切换时，表单自动加载所选版块的当前数据
- 表单修改后，保存按钮高亮提示未保存更改
- 保存过程中显示加载状态，防止重复提交
- 保存失败时显示具体错误信息

### 2.2 ACP 管理配置页面

#### 2.2.1 页面基本信息

- **URL**: `/admin/plugins/moderation-tools`
- **访问控制**: 仅管理员可访问（NodeBB ACP 自带权限校验）
- **导航入口**: ACP 左侧导航栏 → 插件 → 版主管理工具

#### 2.2.2 配置内容

管理员可通过 ACP 配置以下内容：

**1. 可管理字段配置**

以多选框/开关列表的形式，选择版主在管理页面中可以编辑的字段：

```
[ ] 版块名称 (name)
[x] 版块描述 (description)
[ ] 版块句柄 (handle)
[x] 主题模板 (topicTemplate)
[ ] 父版块 (parentCid)
[x] 最近回复数 (numRecentReplies)
[ ] 子版块每页数量 (subCategoriesPerPage)
[ ] 主题最少标签数 (minTags)
[ ] 主题最多标签数 (maxTags)
[ ] 标签白名单 (tagWhitelist)
[ ] 外部链接 (link)
[ ] 章节模式 (isSection)
[x] 帖子审核队列 (postQueue)
[ ] 背景图片 (backgroundImage)
[ ] 背景颜色 (bgColor)
[ ] 文字颜色 (color)
[ ] 图片尺寸 (imageClass)
[ ] 自定义样式类 (class)
```

**2. 侧边栏功能配置**

以开关列表的形式，控制版主管理页面右侧操作栏中显示哪些操作：

```
[x] 查看版块
[ ] 分析数据
```

**3. 权限策略说明**

- 所有配置对所有版主角色统一生效（管理员、全局版主、版主）
- 不支持按用户或按版块单独配置（保持简洁，避免配置复杂度过高）
- 配置变更即时生效，无需重启

#### 2.2.3 配置存储

- 使用 NodeBB 的 `Settings` 类或数据库 `plugins:moderation-tools` 键存储配置
- 配置数据结构示例：

```json
{
  "enabledFields": {
    "name": false,
    "description": true,
    "handle": false,
    "topicTemplate": true,
    "parentCid": false,
    "numRecentReplies": true,
    "subCategoriesPerPage": false,
    "minTags": false,
    "maxTags": false,
    "tagWhitelist": false,
    "link": false,
    "isSection": false,
    "postQueue": true,
    "backgroundImage": false,
    "bgColor": false,
    "color": false,
    "imageClass": false,
    "class": false
  },
  "enabledSidebarActions": {
    "viewCategory": true,
    "analytics": false
  }
}
```

### 2.3 插件扩展机制（Hook）

#### 2.3.1 扩展字段 Hook

本插件提供一个 `filter` 类型 Hook，允许其他 NodeBB 插件向版主管理页面注册自定义管理字段，无需修改本插件源码。

**Hook 名称**: `filter:moderation-tools.fields`

**Hook 类型**: `filter`（修改并返回数据）

**触发时机**: ACP 获取可管理字段列表时，以及前端页面渲染表单时

**传入参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `fields` | `Array<FieldDefinition>` | 当前已注册的字段定义数组 |

**返回值**: 修改后的 `fields` 数组

**FieldDefinition 数据结构**:

```typescript
interface FieldDefinition {
  // 字段唯一标识，用于 data-name 属性和配置存储，必须全局唯一
  // 建议格式：{pluginId}:{fieldName}，如 "my-plugin:customField"
  key: string;

  // 字段显示名称（i18n key 或纯文本）
  label: string;

  // 字段类型：text | textarea | number | checkbox | select | color | custom
  type: string;

  // 字段分组（用于在 ACP 和前端页面中分组显示）
  group?: string;

  // 字段默认值
  defaultValue?: any;

  // 当 type 为 select 时的选项列表
  options?: Array<{ value: string; label: string }>;

  // 字段说明文本（i18n key 或纯文本）
  description?: string;

  // 字段占位符文本
  placeholder?: string;

  // 自定义渲染模板路径（仅 type 为 custom 时有效）
  // 模板中可通过 {field} 获取当前字段定义，通过 {value} 获取当前值
  template?: string;

  // 前端保存时的数据验证函数名称（可选）
  // 如提供，前端保存前会调用此函数验证数据
  validator?: string;

  // 前端保存后的回调函数名称（可选）
  // 如提供，保存成功后会调用此函数执行额外逻辑
  onSave?: string;

  // 字段排序权重（数值越小越靠前，默认按注册顺序排列）
  order?: number;
}
```

**其他插件使用示例**:

```javascript
// 在其他插件的 static:app.load 中注册
plugin.hooks = {};

plugin.hooks.registerFields = async function (hookData) {
  hookData.fields.push({
    key: 'my-plugin:customField',
    label: '[[my-plugin:custom-field-label]]',
    type: 'text',
    group: 'custom-fields',
    defaultValue: '',
    description: '[[my-plugin:custom-field-desc]]',
    placeholder: '请输入自定义内容',
    order: 100,
  });

  return hookData;
};

// 注册 hook
const { hooks } = require.main.require('./src/plugins');
hooks.register('filter:moderation-tools.fields', plugin.hooks.registerFields);
```

#### 2.3.2 扩展字段数据 Hook

除了注册字段定义外，本插件还提供数据读写 Hook，使其他插件能够在版主数据加载和保存时参与数据处理。

**1. 读取数据 Hook**

- **Hook 名称**: `filter:moderation-tools.category.load`
- **Hook 类型**: `filter`
- **触发时机**: 前端页面加载指定版块数据时
- **传入参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `data` | `object` | 当前版块的已加载数据 |
| `cid` | `number` | 当前版块 ID |
| `uid` | `number` | 当前操作用户 ID |

- **返回值**: 修改后的 `data` 对象

**使用示例**:

```javascript
plugin.hooks.loadCategoryData = async function (hookData) {
  // 为自定义字段加载额外数据
  const customValue = await db.getObjectField(`category:${hookData.cid}:custom`, 'customField');
  hookData.data['my-plugin:customField'] = customValue || '';
  return hookData;
};

hooks.register('filter:moderation-tools.category.load', plugin.hooks.loadCategoryData);
```

**2. 保存数据 Hook**

- **Hook 名称**: `action:moderation-tools.category.save`
- **Hook 类型**: `action`
- **触发时机**: 版主保存版块数据成功后
- **传入参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `data` | `object` | 版主提交的数据（已过滤，仅包含已授权字段） |
| `cid` | `number` | 当前版块 ID |
| `uid` | `number` | 当前操作用户 ID |

- **返回值**: 无（action 类型 Hook，不处理返回值）

**使用示例**:

```javascript
plugin.hooks.saveCategoryData = async function (hookData) {
  if (hookData.data['my-plugin:customField'] !== undefined) {
    await db.setObjectField(
      `category:${hookData.cid}:custom`,
      'customField',
      hookData.data['my-plugin:customField']
    );
  }
};

hooks.register('action:moderation-tools.category.save', plugin.hooks.saveCategoryData);
```

#### 2.3.3 扩展字段在 ACP 中的管理

- 通过 `filter:moderation-tools.fields` 注册的字段将自动出现在 ACP 配置页面的「可管理字段配置」列表中
- 管理员可以像内置字段一样，对这些扩展字段进行启用/禁用配置
- 扩展字段在配置列表中会显示其 `label` 和注册来源插件名称，便于管理员识别
- 扩展字段默认状态为**禁用**（`false`），管理员需手动启用

#### 2.3.4 扩展字段在前端页面中的渲染

- 已启用的扩展字段将渲染在版主管理页面的表单中
- 字段按照 `group` 分组显示，组名使用 i18n 翻译或显示原始文本
- `type` 为内置类型（text/textarea/number/checkbox/select/color）时，使用本插件的标准表单控件渲染
- `type` 为 `custom` 时，加载该字段 `template` 指定的模板进行自定义渲染
- 前端保存时，所有已启用的扩展字段数据一并提交到保存 API

#### 2.3.5 扩展字段安全说明

- 扩展字段数据的读取和写入由注册插件自行负责，本插件不提供持久化存储
- 扩展字段的保存 Hook（`action:moderation-tools.category.save`）仅在管理员已启用该字段时触发
- 扩展字段的数据验证建议在注册时通过 `validator` 指定，或在前端保存逻辑中进行
- 本插件仅负责传递数据，不验证扩展字段的值合法性，数据安全由注册插件保证

### 2.4 Widget（小部件）

#### 2.4.1 Widget 基本信息

- **Widget ID**: `moderation-tools-link`
- **显示名称**: 版主管理工具
- **描述**: 显示一个跳转到版主管理页面的链接，仅对有管理权限的用户可见

#### 2.4.2 Widget 功能

1. **权限验证**
   - 在 Widget 渲染时检查当前用户是否为管理员（`user.isAdministrator(uid)`）、全局版主（`user.isGlobalModerator(uid)`）或当前分类的版主（`user.isModerator(uid, cid)`）
   - 仅当用户对当前页面所在的分类具有管理权限时才显示 Widget
   - 使用 `privileges.categories.isAdminOrMod(cid, uid)` 进行权限判断

2. **显示内容**
   - 一个简洁的链接/按钮，文字为"版主管理工具"
   - 点击后跳转到 `/extra-tools/moderation-tools`
   - 如果用户在某个分类页面中，跳转时自动携带该分类的 cid 参数：`/extra-tools/moderation-tools?cid={currentCid}`

3. **Widget 配置**
   - 支持标准 Widget 配置：标题、容器 HTML、显示/隐藏组、日期范围、移动端隐藏
   - 不需要额外自定义配置项

#### 2.4.3 Widget 适用区域

适用于所有支持 Widget 的区域，推荐放置在：
- 全局侧边栏（Global Sidebar）
- 分类页面侧边栏

---

## 3. 技术设计

### 3.1 插件文件结构

```
nodebb-plugin-moderation-tools/
├── plugin.json              # 插件清单文件
├── package.json             # npm 包信息
├── library.js               # 插件入口文件（服务端逻辑）
├── templates/
│   ├── admin/
│   │   └── moderation-tools.tpl          # ACP 配置页面模板
│   └── moderation-tools.tpl              # 前端版主管理页面模板
├── public/
│   ├── js/
│   │   ├── admin.js                      # ACP 配置页客户端脚本
│   │   └── moderation-tools.js           # 前端管理页客户端脚本
│   └── scss/
│       └── moderation-tools.scss         # 前端页面样式
├── languages/
│   ├── en-GB.json                         # 英文语言包
│   └── zh-CN.json                         # 中文语言包
└── upgrades/                              # 数据库升级脚本（如需要）
```

### 3.2 关键 Hooks 注册

| Hook | 用途 |
|------|------|
| `static:app.load` | 初始化路由、注册 Socket 方法 |
| `filter:admin.header.build` | 在 ACP 导航栏添加插件入口 |
| `filter:widgets.getWidgets` | 注册 Widget 定义 |
| `filter:widget.render:moderation-tools-link` | 渲染 Widget 内容 |
| `filter:middleware.render` | 向前端模板注入版主权限数据 |
| `filter:moderation-tools.fields` | 允许其他插件注册自定义管理字段 |
| `filter:moderation-tools.category.load` | 允许其他插件在加载版块数据时注入自定义字段值 |
| `action:moderation-tools.category.save` | 允许其他插件在保存版块数据后处理自定义字段 |

### 3.3 路由设计

| 类型 | 路由 | 说明 |
|------|------|------|
| 前端页面 | `GET /extra-tools/moderation-tools` | 版主管理页面 |
| ACP 页面 | `GET /admin/plugins/moderation-tools` | ACP 配置页面 |
| API | `GET /api/extra-tools/moderation-tools/categories` | 获取用户有权限管理的版块列表 |
| API | `GET /api/extra-tools/moderation-tools/category/:cid` | 获取指定版块的已授权字段数据 |
| API | `PUT /api/extra-tools/moderation-tools/category/:cid` | 保存指定版块的修改（仅已授权字段） |
| API | `GET /api/extra-tools/moderation-tools/config` | 获取 ACP 配置（已授权字段列表） |
| Socket | `plugins.moderation-tools.save` | 通过 Socket 保存配置 |

### 3.4 权限校验逻辑

```
用户访问 /extra-tools/moderation-tools
  ├── 是否已登录？ → 否：重定向到登录页
  ├── 是否为管理员？ → 是：显示所有版块
  ├── 是否为全局版主？ → 是：显示所有版块
  └── 是否为版主？ → 是：通过 privileges.categories.filterCids('moderate', allCids, uid) 过滤显示
      └── 否：重定向到首页 / 显示无权限提示
```

### 3.5 数据保存安全策略

```
版主提交表单数据
  ├── 读取 ACP 配置中的 enabledFields
  ├── 遍历提交数据，仅保留 enabledFields 中为 true 的字段
  ├── 对保留字段进行数据验证（name 非空、handle 格式等）
  ├── 调用 NodeBB 原生 categories.update() 保存
  └── 返回保存结果
```

---

## 4. 开发说明

### 4.1 开发规范

- 严格按照 NodeBB 插件开发文档的规约进行开发：https://docs.nodebb.org/development/plugins/
- 使用 `require.main.require()` 引入 NodeBB 内部模块（如 `src/database`、`src/user`、`src/privileges` 等）
- 模板使用 NodeBB 模板引擎（Benchpress / templates.js）语法
- 前端脚本使用 AMD 模块规范（`define()` / `require()`）
- 服务端代码使用 `'use strict'` 严格模式
- 所有异步操作使用 `async/await` 语法

### 4.2 关键 NodeBB API 参考

**路由注册** (`src/routes/helpers.js`)：
- `routeHelpers.setupPageRoute(router, path, [middlewares], controller)` — 前端页面路由
- `routeHelpers.setupAdminPageRoute(router, path, [middlewares], controller)` — ACP 页面路由
- `routeHelpers.setupApiRoute(router, verb, path, [middlewares], controller)` — API 路由

**权限检查** (`src/privileges/`, `src/user/`)：
- `user.isAdministrator(uid)` — 判断是否为管理员
- `user.isGlobalModerator(uid)` — 判断是否为全局版主
- `user.isModerator(uid, cid)` — 判断是否为指定版块版主
- `privileges.categories.isAdminOrMod(cid, uid)` — 判断是否为版块管理员或版主
- `privileges.categories.filterCids('moderate', cids, uid)` — 过滤用户可管理的版块

**数据操作**：
- `categories.getCategoryData(cid)` — 获取版块数据
- `categories.update(cid, data)` — 更新版块数据
- `categories.getAllCids()` — 获取所有版块 ID 列表

**Widget 系统**：
- 通过 `filter:widgets.getWidgets` hook 注册 Widget 定义
- 通过 `filter:widget.render:{widgetId}` hook 渲染 Widget 内容
- Widget 数据中 `widget.uid` 为当前用户 ID，`widget.templateData` 为页面模板数据

**配置存储** (`src/settings.js`)：
- 使用 `Settings` 类管理 ACP 配置
- 或直接使用 `database` 模块的 `setObject`/`getObject` 方法

### 4.3 国际化 (i18n)

- 所有用户可见文本必须通过语言包定义，使用 `[[namespace:key]]` 模板语法引用
- 语言文件位于 `languages/` 目录下
- 至少提供 `en-GB`（英文）和 `zh-CN`（中文）两个语言包
- 语言键命名规范：`moderation-tools:{section}:{key}`

### 4.4 样式规范

- 使用 SCSS 编写样式，在 `plugin.json` 的 `scss` 字段中声明
- 样式应兼容 NodeBB 默认主题（Persona）和 Harmony 主题
- 使用 Bootstrap 5 的工具类进行布局
- 自定义样式使用 `#moderation-tools` 或 `.moderation-tools` 作为命名空间前缀，避免样式冲突

### 4.5 测试要点

- 验证不同角色（管理员、全局版主、版主、普通用户）的权限控制
- 验证 ACP 配置变更后的字段显隐是否正确
- 验证未授权字段的保存过滤是否生效
- 验证 Widget 在不同分类页面中的权限判断
- 验证并发保存时的数据一致性
- 验证边界情况：无版块权限时的空状态展示、版块删除后的处理
- 验证扩展字段 Hook：其他插件注册的字段能正确出现在 ACP 和前端页面
- 验证扩展字段的数据读写 Hook：加载和保存时自定义数据正确传递
- 验证扩展字段在禁用状态下的过滤：禁用的扩展字段不会在前端渲染，保存时不会触发 save Hook

### 4.6 安全注意事项

- 所有 API 端点必须进行权限校验（不能仅依赖前端隐藏）
- 保存接口必须严格过滤未授权字段
- 版块选择器 API 不能暴露用户无权管理的版块信息
- Widget 渲染时的权限检查不能依赖客户端判断
- 避免暴露敏感的系统配置信息
