use once_cell::sync::Lazy;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

static API_CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .build()
        .expect("failed to build HTTP client")
});

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(default)]
struct PlacenameQueryPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<u32>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    year: Option<u32>,
}

#[tauri::command]
async fn search_placenames(query: PlacenameQueryPayload) -> Result<Value, String> {
    let response = API_CLIENT
        .post("http://timespace-china.fudan.edu.cn/gateway/geom-name/placename-object/home/placename")
        .json(&query)
        .send()
        .await
        .map_err(|err| format!("网络请求失败: {err}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "<无法读取响应正文>".to_string());
        return Err(format!("查询失败 ({status}): {body}"));
    }

    response
        .json::<Value>()
        .await
        .map_err(|err| format!("解析响应失败: {err}"))
}

#[tauri::command]
async fn get_placename(sys_id: String) -> Result<Value, String> {
    let trimmed = sys_id.trim();
    if trimmed.is_empty() {
        return Err("sysId 不能为空".to_string());
    }

    let url = format!(
        "http://timespace-china.fudan.edu.cn/gateway/geom-name/placename-object/home/placename/json/{}",
        urlencoding::encode(trimmed)
    );

    let response = API_CLIENT
        .get(url)
        .send()
        .await
        .map_err(|err| format!("网络请求失败: {err}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "<无法读取响应正文>".to_string());
        return Err(format!("获取详情失败 ({status}): {body}"));
    }

    response
        .json::<Value>()
        .await
        .map_err(|err| format!("解析响应失败: {err}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![search_placenames, get_placename])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
