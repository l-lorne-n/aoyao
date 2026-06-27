# Aoyao 轻量病历语音录入工具

这是一个面向诊所场景的本地轻量病历录入 MVP。当前目标不是建设完整诊所管理系统，而是先解决纸质病历中自由文本书写负担较重的问题：医生在病历页面中点击录音，口述内容经腾讯云语音识别转成文字，再由医生人工确认、追加或替换到对应字段。

## 当前功能

- 独立语音识别测试页：用于先验证真实口述识别效果。
- 病历录入页：参照现有纸质病历本结构设计。
- 本地 SQLite 数据库：保存病历记录，不依赖远程数据库。
- 病历新建、保存、搜索、打开修改、删除。
- 支持手动配置病历编号，编号唯一；搜索支持编号、姓名、电话、主诉等字段。
- 主诉、既往史、过敏史、舌脉象、复诊记录等自由文本字段支持语音录入。
- 复诊记录默认 4 次，可继续增加第 5 次、第 6 次等。
- 表单修改后顶部保存状态栏变淡黄色，提示“有未保存修改”；保存后恢复白色。
- 支持从左侧按钮批量选择病历并导出 PDF。
- 腾讯云密钥只在本地 Python 后端读取，不暴露到前端页面。

## 技术栈

- 后端：Python 标准库 HTTP 服务
- 数据库：SQLite
- 前端：原生 HTML/CSS/JavaScript
- 语音识别：腾讯云一句话识别，默认引擎 `16k_zh_medical`

当前实现刻意保持少依赖，方便在普通轻薄本上直接运行。PDF 导出需要 `reportlab`，已写入 `requirements.txt`。

## 目录结构

```text
asr_test_page/
  server.py                  本地 HTTP 服务、腾讯云 ASR 调用、SQLite API
  batch_transcribe_files.py  批量识别本地音频文件的辅助脚本
  static/
    index.html               独立语音识别测试页
    app.js
    styles.css
    records.html             病历录入页面
    records.js
    records.css
idea/
  轻量病历语音录入工具_MVP方案.md
.env.example                 环境变量示例
requirements.txt             Python 依赖，当前用于 PDF 导出
```

运行后会生成但不会提交：

```text
data/aoyao_records.sqlite3   本地病历数据库
output/pdf/                  导出的 PDF 文件
tecent_api_key.txt           本地腾讯云密钥文件
```

## 配置密钥

推荐复制 `.env.example` 为 `.env` 后填写：

```env
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
TENCENT_REGION=ap-guangzhou
TENCENT_ASR_ENGINE=16k_zh_medical
TENCENT_ASR_TRANSPORT=auto
```

也兼容根目录下的密钥文件：

```text
tecent_api_key.txt
```

格式：

```text
SecretId:你的 SecretId
SecretKey:你的 SecretKey
```

真实 `.env`、密钥文件、数据库、录音样本均已加入 `.gitignore`，不要提交。

## 启动

在项目根目录运行：

```powershell
python -m pip install -r requirements.txt
python .\asr_test_page\server.py --host 127.0.0.1 --port 8765
```

打开病历录入页：

```text
http://127.0.0.1:8765/records.html
```

打开语音识别测试页：

```text
http://127.0.0.1:8765/
```

## 数据保存策略

- 所有病历保存在本地 SQLite：`data/aoyao_records.sqlite3`
- 页面不会自动保存，必须点击“保存病历”才会写入数据库。
- 新病历保存时插入新记录；已有病历保存时更新原记录。
- 数据库内部 `id` 只给程序使用；页面上的“病历编号”是可手动配置的业务编号。
- 非空病历编号必须唯一；保存时如果重复，会提示已被哪条病历占用。
- 删除病历是硬删除，对应业务编号也会释放，可再次使用。
- 数据库中单独保存常用检索字段，同时完整病历 JSON 保存在 `data_json` 字段，便于保留动态复诊次数。
- 当前删除是硬删除，尚未实现回收站。

## 已完成工作总结

1. 梳理并确认 MVP 范围：只做语音转文字和病历录入，不做自动诊断、不做治疗方案生成。
2. 接入腾讯云一句话识别 HTTP 调用，并保留官方 SDK 可选通道。
3. 完成独立录音识别测试页，支持浏览器录音、16k WAV 转换、识别结果显示和复制。
4. 用真实录音样本完成腾讯云识别验证，并输出 Markdown 结果。
5. 搭建病历录入页面，字段结构参照纸质病历本。
6. 增加 SQLite 本地数据库和病历 CRUD API。
7. 支持自由文本字段语音录入，识别结果可追加、替换或取消。
8. 支持动态增加复诊次数。
9. 增加未保存状态提示，降低修改后忘记保存的风险。
10. 增加手动病历编号、编号唯一校验和编号检索。
11. 增加批量选择病历并导出 PDF。
12. 配置 `.gitignore`，避免提交密钥、数据库、录音样本、PDF 导出文件和患者信息。

## 后续建议

- 增加每日本地数据库备份，保留最近 30 天。
- 增加软删除/回收站，避免误删病历。
- 基于真实使用反馈补充热词表。
- 如多台电脑使用，再考虑局域网部署、账号权限和集中备份。
