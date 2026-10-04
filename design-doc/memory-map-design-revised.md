# Memory Map 设计与高德地图接入说明

> 本文档独立描述应用第二屏「Memory Map」的产品设计与技术接入方式。  
> 当前推荐地图方案：**高德地图 JS API 2.0**。  
> 本文不替代主应用设计文档，主应用仍以 Memory Wall / Memory Map / Settings 三屏结构为准。

---

## 1. 目标

Memory Map 不是导航页，而是一个“从空间与时间两个维度回看生活”的页面。

核心体验：

- 地图上展示用户留下的记忆点。
- 通过时间轴筛选某一天、某一段时间或某个月的记忆。
- 搜索地点、文字与日期。
- 点击记忆点后查看对应记录。
- 同一位置出现多条记录时进行聚合。
- 后续可以扩展为轨迹回放，但第一版不做持续定位。

地图本身需要具有较高视觉质量。相比复杂 GIS 功能，更优先保证：

- 大陆地区底图、道路和 POI 数据质量。
- 中文标注自然。
- 地图视觉不过度抢占记忆内容。
- 移动端拖动、缩放足够流畅。
- 后续能叠加自定义记忆点、照片、轨迹等内容。

---

## 2. 页面结构

Memory Map 占据完整的一屏，以地图本身作为页面背景，不再额外放入大卡片容器。

### 顶部：搜索

默认状态只显示一个圆形搜索按钮。

点击后横向展开成长胶囊搜索框：

```text
○
↓
🔍 搜索记忆、地点、日期……
```

搜索框采用与首页一致的玻璃拟态风格：

- 半透明背景
- 轻微 backdrop blur
- 细边框
- 柔和阴影
- 不使用厚重实色输入框

搜索结果可以影响：

- 地图当前显示的记忆点
- 当前时间范围
- 地点聚合结果

搜索优先搜索用户自己的记录；未来如有需要，再结合地图服务做现实地点搜索。

---

## 3. 地图上的记忆点

记忆点不使用默认红色 Pin 作为主要视觉语言。

建议支持三类显示：

### 普通记忆点

小圆点或小型玻璃圆形 Marker。

适合：

- 无照片记录
- 远距离缩放状态
- 大量点位同时展示时

### 照片记忆点

如果记录包含照片，可以显示小型圆形或圆角缩略图。

建议：

- 缩略图边缘使用浅色描边
- 保持较小尺寸，避免遮挡地图
- 高缩放级别才显示照片
- 低缩放级别退化成普通点或聚合点

### 聚合点

多个相近记录在当前缩放级别下合并。

例如：

```text
  12
```

点击聚合点后：

1. 优先缩放到该区域；
2. 如果点位本身完全重合，则从底部展开该地点的记录列表。

---

## 4. 地点聚合

同一坐标附近可能存在大量重复记录，例如常去的奶茶店、学校、车站。

因此需要区分：

- 地图渲染层面的 Marker Cluster
- 产品层面的“熟悉地点”

前者只负责减少地图视觉拥挤。

后者可以在未来形成：

```text
每天去的奶茶店
27 条记忆
最早：2026/08/12
最近：2026/10/04
```

第一版只需要完成地图点位聚合，不必自动识别“熟悉地点”。

---

## 5. 时间轴

地图页最核心的自定义交互是时间筛选。

不建议直接使用普通 `<input type="range">`。

时间控件应作为地图底部的玻璃浮层存在。

基础状态示例：

```text
2026/09                2026/10
──────────────●──────────────
```

后续可逐渐演进为带缩略图的时间胶片：

```text
[photo] [photo] [·] [photo] [·] [photo]
                 ▲
              10/04
```

### 第一版支持两种模式

#### 单时间点 / 单时间段浏览

拖动时间轴时，地图只展示当前位置附近时间窗口中的记录。

例如：

- 当前日期 ± 1 天
- 当前周
- 当前月

具体粒度可以根据缩放级别自动调整。

#### 时间范围

后续增加双端范围：

```text
2026/08 ●────────────● 2026/10
```

地图只显示该时间范围内的记忆。

---

## 6. 与首页的关系

Memory Wall 和 Memory Map 是同一份数据的两种观察方式。

Memory Wall：

> 按时间向上翻过去。

Memory Map：

> 在地图上看这些时间发生在哪里。

任何记录只保存一次，不做独立地图数据副本。

点击地图记忆点后，可以展开该记录的简要卡片；如需完整编辑，复用首页记录卡片的内容与操作结构。

---

## 7. 未来轨迹

轨迹不是第一版功能。

第一版只保存离散记忆点：

```text
time + WGS84 latitude + WGS84 longitude
```

后续如果加入轨迹，可以支持：

- 某一天的移动轨迹
- 某段旅程
- 公交线路留下的路径
- 时间轴拖动时逐渐显示对应轨迹
- 轨迹上叠加照片和记忆点

持续后台定位会增加：

- 电量消耗
- PWA 权限限制
- iOS 后台限制
- 隐私风险
- 数据量

因此必须作为后续独立设计，不与第一版记忆点绑定。

---

# 技术方案

## 8. 地图提供方案

当前优先采用：

**高德地图 JS API 2.0**

原因：

- 中国大陆路网与 POI 数据质量高。
- 中文标注成熟。
- WebGL 渲染。
- PC 与移动端均支持。
- Vue 有官方接入示例。
- 支持 Marker、MarkerCluster、Polyline、自定义覆盖物等后续所需能力。
- 可使用浅色地图主题或自定义地图样式。

官方目前推荐 JS API 2.0，新项目不应使用旧版 1.x。

---

## 9. 数据坐标原则

### 永远保存 WGS84 原始坐标

应用数据库中的坐标统一保存为：

```ts
interface GeoPoint {
  latitude: number
  longitude: number
  source: 'exif' | 'current'
}
```

这里保存的是 **WGS84**。

原因：

- 照片 EXIF GPS 通常为 WGS84。
- 浏览器 Geolocation API 返回的位置也应按 WGS84 原始数据处理。
- 应用自身数据不应该绑定某一家地图供应商。
- 未来替换地图方案时无需迁移原始坐标。

### 显示到高德地图时转换

中国大陆高德地图使用 GCJ-02 坐标体系。

因此：

```text
数据库：WGS84
    ↓
地图适配层
    ↓
GCJ-02
    ↓
高德地图显示
```

不要把转换后的 GCJ-02 坐标覆盖回数据库。

建议把转换逻辑封装为：

```ts
toMapCoordinate(point, provider)
```

以后换地图提供商时，只修改 Adapter。

---


## 9.1 坐标转换边界

GCJ-02 偏移只适用于中国大陆相关区域。

地图适配层不能无条件对全球 WGS84 坐标执行偏移。对于中国大陆之外的记录，应保持正确的原始地理位置，并由 Provider Adapter 决定是否需要转换。

转换逻辑必须集中在 `coordinate.ts` / Provider Adapter 中，业务记录本身永远不存供应商坐标。

如果使用高德官方坐标转换能力，也应保持同样原则：转换结果只用于展示缓存，不写回原始记录。


## 10. 记录位置来源

位置获取规则：

### 有照片

1. 尝试读取照片 EXIF GPS；
2. 如果 EXIF 有 GPS，则使用照片位置；
3. 如果照片没有 GPS，则读取当前定位；
4. 用户可以关闭位置记录。

### 无照片

直接读取当前定位。

地点描述是独立字段：

```ts
locationText?: string
```

例如：

```text
每天去的奶茶店
公交上
学校旁边那个站
随便坐到这里了
```

地图坐标和地点描述不互相覆盖。

---


## 10.1 无位置记录

没有位置的 Memory 仍然是完整有效的记录。

它们：

- 正常出现在 Memory Wall；
- 正常参与文字 / 日期搜索；
- 不生成地图 Marker。

如果地图页搜索命中了无位置记录，搜索结果列表可以显示该记录，但不应伪造地图位置。

---

## 10.2 地图不可用时

地图服务加载失败、Key 未配置、网络不可用时，不能影响首页和本地记录功能。

Memory Map 应提供一个独立的错误 / 空状态，并允许用户稍后重试。

应用的数据层不能依赖地图 SDK 初始化成功。


# 高德开放平台配置

## 11. 注册与认证

进入高德开放平台并注册开发者账号。

随后完成个人开发者认证。

目前未认证开发者的多数基础服务配额为 0，因此正式使用前应完成认证。

---

## 12. 创建应用

在高德开放平台控制台：

```text
应用管理
→ 我的应用
→ 创建新应用
```

应用名称可以与项目名称一致。

例如：

```text
Memory Journal
```

---

## 13. 创建 Web Key

在应用中添加 Key：

```text
添加 Key
→ 服务平台：Web端（JS API）
```

创建成功后会获得：

```text
Key
securityJsCode
```

2021-12-02 之后创建的 JS API Key 必须搭配安全密钥使用。

---

## 14. 安全密钥策略

高德支持两种方式。

### 开发环境：直接使用 securityJsCode

适合本地开发。

必须在加载地图 API **之前**设置：

```ts
window._AMapSecurityConfig = {
  securityJsCode: 'YOUR_SECURITY_JS_CODE',
}
```

然后再加载高德 JS API。

优点：

- 配置简单

缺点：

- `securityJsCode` 会出现在浏览器代码中
- 不适合公开生产环境

---

### 生产环境：代理 securityJsCode

高德官方更推荐在生产环境中将安全密钥保存在服务端。

推荐结构：

```text
Vue PWA
  │
  ├── 用户记忆数据 → IndexedDB
  │
  └── 地图请求
         ↓
   lightweight proxy
         ↓
      高德服务
```

代理只用于高德安全密钥相关请求，不接触日记正文、照片等私人数据。

可以实现为：

- Cloudflare Worker
- Vercel Function
- 自己的 Node 服务
- Nginx

如果应用部署在 GitHub Pages，可以使用一个独立的轻量 Serverless endpoint 作为代理。

高德要求代理前缀保持：

```text
/_AMapService
```

前端配置：

```ts
window._AMapSecurityConfig = {
  serviceHost: 'https://your-proxy.example.com/_AMapService',
}
```

注意：该配置必须在地图 JS API 加载之前完成。

---

## 15. Vue 3 安装

官方推荐使用 Loader。

安装：

```bash
pnpm add @amap/amap-jsapi-loader
```

或：

```bash
npm install @amap/amap-jsapi-loader
```

---

## 16. 基础 Vue 组件结构

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import AMapLoader from '@amap/amap-jsapi-loader'

const map = shallowRef<any>(null)

onMounted(async () => {
  const AMap = await AMapLoader.load({
    key: import.meta.env.VITE_AMAP_KEY,
    version: '2.0',
    plugins: [],
  })

  map.value = new AMap.Map('memory-map', {
    zoom: 13,
    viewMode: '2D',
    mapStyle: 'amap://styles/whitesmoke',
  })
})

onBeforeUnmount(() => {
  map.value?.destroy()
  map.value = null
})
</script>

<template>
  <div id="memory-map" />
</template>

<style scoped>
#memory-map {
  width: 100%;
  height: 100%;
}
</style>
```

注意：

- 地图容器必须有明确高度。
- Vue 页面销毁时调用 `map.destroy()`。
- 地图实例不要使用深层响应式对象包装，建议 `shallowRef`。

---

## 17. 环境变量

开发环境：

```env
VITE_AMAP_KEY=your_web_key
VITE_AMAP_SECURITY_CODE=your_security_js_code
```

不要把真实密钥提交到公开 Git 仓库。

`.gitignore`：

```text
.env
.env.local
.env.*.local
```

如果生产环境使用服务代理，则前端不需要保存 `securityJsCode`：

```env
VITE_AMAP_KEY=your_web_key
VITE_AMAP_SERVICE_HOST=https://maps.example.com/_AMapService
```

---

## 18. security config 初始化

建议单独建立：

```text
src/map/amap-security.ts
```

示例：

```ts
export function configureAmapSecurity() {
  const serviceHost = import.meta.env.VITE_AMAP_SERVICE_HOST

  if (serviceHost) {
    window._AMapSecurityConfig = {
      serviceHost,
    }
    return
  }

  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_CODE

  if (securityJsCode) {
    window._AMapSecurityConfig = {
      securityJsCode,
    }
  }
}
```

必须：

```ts
configureAmapSecurity()

await AMapLoader.load(...)
```

不能反过来。

---

## 19. 推荐代码结构

```text
src/
├── map/
│   ├── amap-security.ts
│   ├── map-provider.ts
│   ├── coordinate.ts
│   ├── memory-marker.ts
│   └── time-filter.ts
│
├── components/
│   ├── MemoryMap.vue
│   ├── MapSearch.vue
│   ├── MapTimeline.vue
│   └── MemoryMarkerPopup.vue
│
└── stores/
    └── memories.ts
```

不要让页面组件直接承担：

- WGS84 / GCJ-02 转换
- 时间筛选
- Marker 数据转换
- Provider 适配

这样以后替换地图供应商比较容易。

---

## 20. 地图 Adapter

建议从第一版就做一个非常薄的 Provider Adapter。

例如：

```ts
interface MapProvider {
  setMemories(memories: Memory[]): void
  setTimeRange(start: Date, end: Date): void
  focusMemory(id: string): void
  setCenter(point: GeoPoint): void
  destroy(): void
}
```

不需要做复杂的通用 GIS 抽象。

目的只是防止业务层直接到处调用：

```ts
new AMap.Marker(...)
```

这样未来如果高德方案发生变化，影响范围会小很多。

---

# 地图视觉

## 21. 初始风格

建议先从：

```text
amap://styles/whitesmoke
```

或其它浅色官方样式开始。

随后再决定是否使用高德自定义地图平台制作专门样式。

视觉原则：

- 道路存在感适中
- POI 不过密
- 建筑尽量弱
- 水体保留柔和蓝色
- 绿地低饱和
- 地图文字清晰但不抢视觉
- 用户记忆点始终是最高视觉层级

不要为了模仿 Apple Maps 而逐项复制颜色。

目标应该是：

> 保留 Apple Maps 那种安静、清晰、层级自然的感觉，同时让地图风格和 Memory Wall 的浅色玻璃设计属于同一个应用。

---

## 22. UI Overlay

地图控件全部作为悬浮 UI：

### 顶部

```text
○
```

展开：

```text
┌───────────────────────────┐
│ 🔍 搜索记忆、地点、日期… │
└───────────────────────────┘
```

### 底部

```text
╭───────────────────────────╮
│ 2026/09 ─────●──── 2026/10 │
╰───────────────────────────╯
```

统一采用：

- 半透明
- backdrop blur
- 大圆角
- 极轻边框
- 柔和阴影

避免覆盖大面积地图。

---

# 性能设计

## 23. 时间筛选不要重复创建所有 Marker

时间轴快速拖动时，不应每一帧销毁并重新创建全部 Marker。

建议：

1. 时间轴 UI 本身实时移动；
2. 地图内容采用 requestAnimationFrame / debounce 更新；
3. 对现有 Marker 做增量增删；
4. 点位多时使用聚合或高性能图层。

第一版数据规模很小时可以先简单实现，但 API 层应避免和 UI frame 完全绑定。

---

## 24. 图片 Marker

不要直接把完整照片作为 Marker。

应使用：

- 小尺寸缩略图
- WebP / AVIF（按兼容性决定）
- Lazy decode
- 仅在较高 zoom 时显示

低 zoom 时全部退化为普通圆点或聚合点。

---

# 配额与使用范围

## 25. 当前个人认证额度参考

高德当前基础服务计费页面列出的个人认证开发者配额包括：

- JS 地图图面初始化：约 1,500,000 次/月
- 基础搜索：约 5,000 次/月
- 基础 LBS：约 150,000 次/月

具体额度、QPS 和计费规则以后以高德控制台实际显示为准。

这个应用的主要消耗是地图初始化，因此个人使用规模基本不会成为瓶颈。

搜索框应优先搜索本地 Memory 数据，不要把每次输入都直接发送给高德 POI 搜索接口。

---

# 第一版范围

## 26. Must Have

- 高德 JS API 2.0 加载
- WGS84 → 地图坐标适配
- 记忆点显示
- 照片 Marker / 普通 Marker
- 地图聚合
- 点击记忆点查看记录
- 顶部胶囊搜索 UI
- 搜索本地记录
- 底部时间轴
- 按时间范围过滤记忆点
- 地图状态在同一次应用生命周期内保持

---

## 27. 暂不实现

- 后台持续轨迹
- 路线规划
- 导航
- 自动识别“常去地点”
- 大规模地理分析
- 云同步
- 地图 Provider 动态切换
- 复杂地点推荐

---

# 官方资料

- 高德地图 JS API 2.0 概述  
  https://lbs.amap.com/api/javascript-api-v2/summary

- JS API 2.0 准备 / 创建 Key  
  https://lbs.amap.com/api/javascript-api-v2/prerequisites

- JS API Loader  
  https://lbs.amap.com/api/javascript-api-v2/guide/abc/load

- Vue 接入  
  https://lbs.amap.com/api/javascript-api-v2/guide/abc/amap-vue

- securityJsCode 与代理配置  
  https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode

- JS API 2.0 Reference  
  https://lbs.amap.com/api/javascript-api-v2/documentation

---

## 28. 核心原则

> 地图是记忆的空间索引，不是导航工具。

> 原始坐标属于用户数据，地图供应商只是展示层。

> 时间与空间共同决定 Memory Map 的交互，而不是让地图成为单独的功能页。

> 地图底图需要安静，让用户自己的照片、地点与记忆成为视觉主体。
