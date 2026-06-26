# 病历语音识别独立测试页

这个页面用于先验证真实口述的识别效果，不接入正式病历表单。

## 配置

复制根目录的 `.env.example` 为 `.env`，填写腾讯云密钥：

```env
TENCENT_SECRET_ID=你的 SecretId
TENCENT_SECRET_KEY=你的 SecretKey
TENCENT_REGION=ap-guangzhou
TENCENT_ASR_ENGINE=16k_zh_medical
TENCENT_ASR_TRANSPORT=auto
```

也兼容腾讯云 SDK 常用的环境变量名：

```env
TENCENTCLOUD_SECRET_ID=你的 SecretId
TENCENTCLOUD_SECRET_KEY=你的 SecretKey
```

如果根目录存在 `tecent_api_key.txt` 或 `tencent_api_key.txt`，程序也会自动读取：

```text
SecretId:你的 SecretId
SecretKey:你的 SecretKey
```

`TENCENT_ASR_TRANSPORT=auto` 会在当前 Python 环境安装了腾讯云 ASR SDK 时优先走 SDK，否则使用内置 HTTP 签名调用。你也可以显式设置为 `http` 或 `sdk`。

腾讯云 SDK 概览：<https://cloud.tencent.com/document/product/1093/52554>

如果已经在腾讯云配置了热词表，可以额外填写：

```env
TENCENT_ASR_HOTWORD_ID=热词表 ID
```

## 启动

在项目根目录运行：

```powershell
python .\asr_test_page\server.py --host 127.0.0.1 --port 8765
```

然后打开：

```text
http://127.0.0.1:8765
```

病历录入页面：

```text
http://127.0.0.1:8765/records.html
```

病历会保存在本地 SQLite 数据库：

```text
data/aoyao_records.sqlite3
```

## 测试建议

每次录音控制在 10 到 50 秒，最长不要超过 60 秒。页面会把浏览器录音转成 16 kHz、16 bit、单声道 WAV，再由本地 Python 服务调用腾讯云一句话识别。

重点记录：

* 否定词是否漏识别，例如“无头晕”“没有胸闷”“不伴发热”；
* 中医术语是否稳定，例如“舌质淡红”“苔薄白”“脉弦”；
* 数字和时间是否准确，例如“三天”“每天两次”“夜尿三次”；
* 每段识别后医生需要修改多少字。

页面不会长期保存录音。音频只在浏览器内生成，并通过本地服务直接发送到腾讯云。
