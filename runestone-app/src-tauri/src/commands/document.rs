use crate::document::{chunk_text, parse_document};
use crate::embedding::generate_embedding;
use crate::models::extraction::ExtractionNode;
use crate::models::node::Node;
use crate::path_guard::canonicalize_path;
use crate::router::dispatch;
use crate::services::graph_sync;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct AcquireDocumentRequest {
    pub doi: Option<String>,
    pub title: Option<String>,
    pub authors: Option<Vec<String>>,
    pub year: Option<i32>,
    pub isbn: Option<String>,
    pub url: Option<String>,
    pub keywords: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AcquireResponse {
    id: i32,
    status: String,
    doi: Option<String>,
    title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JobResponse {
    id: i32,
    status: String,
    file_path: Option<String>,
    error: Option<String>,
}

const ACQUIRE_POLL_TIMEOUT_SECS: u64 = 600;
const ACQUIRE_POLL_INTERVAL_SECS: u64 = 5;

#[tauri::command]
pub async fn import_document(
    state: tauri::State<'_, AppState>,
    vault_id: Uuid,
    file_path: String,
) -> Result<Node, String> {
    dispatch(
        &state,
        "import_document",
        serde_json::json!({ "vault_id": vault_id, "file_path": file_path }),
    )
    .await
}

#[tauri::command]
pub async fn acquire_document(
    state: tauri::State<'_, AppState>,
    vault_id: Uuid,
    request: AcquireDocumentRequest,
) -> Result<Node, String> {
    dispatch(
        &state,
        "acquire_document",
        serde_json::json!({ "vault_id": vault_id, "request": request }),
    )
    .await
}

pub async fn acquire_document_impl(
    state: &AppState,
    vault_id: Uuid,
    request: AcquireDocumentRequest,
) -> Result<Node, String> {
    if request.doi.is_none()
        && request.title.is_none()
        && request.isbn.is_none()
        && request.url.is_none()
    {
        return Err("At least one of doi, title, isbn, or url is required".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    log::info!(
        "Acquiring document via documentcrawler: doi={:?} title={:?}",
        request.doi,
        request.title,
    );

    let resp: AcquireResponse = client
        .post("http://localhost:8099/acquire")
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            format!(
                "documentcrawler unavailable at localhost:8099: {}. Is `documentcrawler serve` running?",
                e
            )
        })?
        .json()
        .await
        .map_err(|e| format!("Invalid response from documentcrawler: {}", e))?;

    let job_id = resp.id;
    let max_polls = ACQUIRE_POLL_TIMEOUT_SECS / ACQUIRE_POLL_INTERVAL_SECS;

    for poll in 0..max_polls {
        tokio::time::sleep(std::time::Duration::from_secs(ACQUIRE_POLL_INTERVAL_SECS)).await;

        match client
            .get(format!("http://localhost:8099/jobs/{}", job_id))
            .send()
            .await
        {
            Ok(r) => {
                let job: JobResponse = r
                    .json()
                    .await
                    .map_err(|e| format!("Invalid job response: {}", e))?;
                match job.status.as_str() {
                    "done" => {
                        let file_path = job
                            .file_path
                            .ok_or("documentcrawler job completed but returned no file_path")?;
                        log::info!(
                            "Document acquired, importing: job_id={} file_path={}",
                            job_id,
                            file_path,
                        );
                        return import_document_impl(state, vault_id, file_path).await;
                    }
                    "failed" => {
                        return Err(format!(
                            "Document acquisition failed: {}",
                            job.error.unwrap_or_default()
                        ));
                    }
                    _ => {
                        log::debug!(
                            "Waiting for document download: job_id={} status={} poll={}",
                            job_id,
                            job.status,
                            poll,
                        );
                    }
                }
            }
            Err(e) => {
                log::warn!(
                    "Poll request failed, retrying: job_id={} poll={} error={}",
                    job_id,
                    poll,
                    e,
                );
            }
        }
    }

    Err(format!(
        "Timed out after {} seconds waiting for document download (job {})",
        ACQUIRE_POLL_TIMEOUT_SECS, job_id
    ))
}

pub async fn import_document_impl(
    state: &AppState,
    vault_id: Uuid,
    file_path: String,
) -> Result<Node, String> {
    let safe_path = canonicalize_path(&file_path).map_err(|e| e.to_string())?;
    let file_path = safe_path.to_string_lossy().to_string();
    let text = parse_document(&file_path)?;

    let title = std::path::Path::new(&file_path)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let id = Uuid::new_v4();
    let wc = text.split_whitespace().count() as i32;

    let node = sqlx::query_as::<_, Node>(
        "INSERT INTO nodes (id, vault_id, title, content, content_type, file_path, word_count) VALUES ($1, $2, $3, $4, 'document', $5, $6) RETURNING id, vault_id, title, content, content_type, file_path, metadata, word_count, created_at, updated_at",
    )
    .bind(id)
    .bind(vault_id)
    .bind(&title)
    .bind(&text)
    .bind(&file_path)
    .bind(wc)
    .fetch_one(&state.pg()?)
    .await
    .map_err(|e| format!("Failed to insert document node: {}", e))?;

    graph_sync::create_node_with_pg_rollback(
        &state.neo4j()?,
        &state.pg()?,
        id,
        vault_id,
        &node.title,
        "document",
    )
    .await
    .map_err(|e| e.to_string())?;

    let chunks = chunk_text(&text, 1000, 50);
    for (i, chunk) in chunks.iter().enumerate() {
        let chunk_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO document_chunks (id, document_node_id, chunk_index, content, token_count) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(chunk_id)
        .bind(id)
        .bind(i as i32)
        .bind(chunk)
        .bind(chunk.split_whitespace().count() as i32)
        .execute(&state.pg()?)
        .await
        .map_err(|e| format!("Failed to insert document chunk: {}", e))?;
    }

    let pg = state.pg()?;
    let config = state.embed_config.clone();
    let embed_text = format!("{}: {}", node.title, node.content);
    let doc_id = id;
    tokio::spawn(async move {
        if let Ok(embedding) = generate_embedding(&embed_text, &config).await {
            let vector = pgvector::Vector::from(embedding);
            let _ = sqlx::query("UPDATE nodes SET embedding = $1 WHERE id = $2")
                .bind(vector)
                .bind(doc_id)
                .execute(&pg)
                .await;
        }
    });

    Ok(node)
}

#[tauri::command]
pub async fn extract_from_document(
    state: tauri::State<'_, AppState>,
    node_id: Uuid,
) -> Result<Vec<ExtractionNode>, String> {
    dispatch(
        &state,
        "extract_from_document",
        serde_json::to_value(node_id).map_err(|e| e.to_string())?,
    )
    .await
}
