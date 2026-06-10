use crate::embedding::generate_embedding;
use crate::models::node::{CreateNodeRequest, Node, NodeListItem, UpdateNodeRequest};
use crate::models::vault::Vault;
use crate::repositories::node_repo;
use crate::services::graph_sync;
use crate::state::AppState;
use uuid::Uuid;

#[tauri::command]
pub async fn create_node(
    state: tauri::State<'_, AppState>,
    request: CreateNodeRequest,
) -> Result<Node, String> {
    let id = Uuid::new_v4();
    let content_type = request.content_type.unwrap_or_else(|| "note".to_string());

    let row = sqlx::query_as::<_, Node>(
        "INSERT INTO nodes (id, vault_id, title, content, content_type, file_path) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, vault_id, title, content, content_type, file_path, metadata, word_count, created_at, updated_at",
    )
    .bind(id)
    .bind(request.vault_id)
    .bind(&request.title)
    .bind(&request.content)
    .bind(&content_type)
    .bind(&request.file_path)
    .fetch_one(state.pg()?)
    .await
    .map_err(|e| format!("Failed to insert node into PostgreSQL: {}", e))?;

    graph_sync::create_node_with_pg_rollback(
        state.neo4j()?,
        state.pg()?,
        id,
        request.vault_id,
        &row.title,
        &row.content_type,
    )
    .await
    .map_err(|e| e.to_string())?;

    if !row.content.is_empty() {
        let pg = state.pg()?.clone();
        let config = state.embed_config.clone();
        let node_id = id;
        let embed_text = format!("{}: {}", row.title, row.content);
        tokio::spawn(async move {
            match generate_embedding(&embed_text, &config).await {
                Ok(embedding) => {
                    let vector = pgvector::Vector::from(embedding);
                    let _ = sqlx::query("UPDATE nodes SET embedding = $1 WHERE id = $2")
                        .bind(vector)
                        .bind(node_id)
                        .execute(&pg)
                        .await;
                }
                Err(e) => {
                    log::warn!("Failed to generate embedding for node {}: {}", node_id, e);
                }
            }
        });
    }

    Ok(row)
}

#[tauri::command]
pub async fn update_node(
    state: tauri::State<'_, AppState>,
    request: UpdateNodeRequest,
) -> Result<Node, String> {
    let current = node_repo::get_by_id(state.pg()?, request.id)
        .await
        .map_err(|e| e.to_string())?;

    let new_title = request.title.unwrap_or(current.title.clone());
    let new_content = request.content.unwrap_or(current.content.clone());
    let new_content_type = request.content_type.unwrap_or(current.content_type.clone());
    let word_count = new_content.split_whitespace().count() as i32;

    let changed = current.content != new_content || current.title != new_title;
    if changed {
        let version_num = sqlx::query_as::<_, (Option<i32>,)>(
            "SELECT COALESCE(MAX(version_number), 0) + 1 FROM node_versions WHERE node_id = $1",
        )
        .bind(request.id)
        .fetch_one(state.pg()?)
        .await
        .map_err(|e| format!("Version query failed: {}", e))?
        .0
        .unwrap_or(1);

        sqlx::query(
            "INSERT INTO node_versions (node_id, version_number, title, content, word_count) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(request.id)
        .bind(version_num)
        .bind(&current.title)
        .bind(&current.content)
        .bind(current.word_count)
        .execute(state.pg()?)
        .await
        .map_err(|e| format!("Failed to save version: {}", e))?;
    }

    let row = sqlx::query_as::<_, Node>(
        "UPDATE nodes SET title = $2, content = $3, content_type = $4, word_count = $5, updated_at = NOW() WHERE id = $1 RETURNING id, vault_id, title, content, content_type, file_path, metadata, word_count, created_at, updated_at",
    )
    .bind(request.id)
    .bind(&new_title)
    .bind(&new_content)
    .bind(&new_content_type)
    .bind(word_count)
    .fetch_one(state.pg()?)
    .await
    .map_err(|e| format!("Failed to update node: {}", e))?;

    graph_sync::update_node(
        state.neo4j()?,
        request.id,
        &row.title,
        &row.content_type,
    )
    .await
    .map_err(|e| format!("Neo4j update failed: {}", e))?;

    let pg = state.pg()?.clone();
    let config = state.embed_config.clone();
    let node_id = request.id;
    let embed_text = format!("{}: {}", row.title, row.content);
    tokio::spawn(async move {
        match generate_embedding(&embed_text, &config).await {
            Ok(embedding) => {
                let vector = pgvector::Vector::from(embedding);
                let _ = sqlx::query("UPDATE nodes SET embedding = $1 WHERE id = $2")
                    .bind(vector)
                    .bind(node_id)
                    .execute(&pg)
                    .await;
            }
            Err(e) => {
                log::warn!("Failed to regenerate embedding for node {}: {}", node_id, e);
            }
        }
    });

    Ok(row)
}

#[tauri::command]
pub async fn delete_node(
    state: tauri::State<'_, AppState>,
    id: Uuid,
) -> Result<(), String> {
    graph_sync::delete_node_before_pg(state.neo4j()?, id)
        .await
        .map_err(|e| format!("Neo4j delete failed: {}", e))?;

    node_repo::delete_by_id(state.pg()?, id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_node(
    state: tauri::State<'_, AppState>,
    id: Uuid,
) -> Result<Node, String> {
    node_repo::get_by_id(state.pg()?, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_nodes(
    state: tauri::State<'_, AppState>,
    vault_id: Uuid,
) -> Result<Vec<NodeListItem>, String> {
    node_repo::list_by_vault(state.pg()?, vault_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn scan_vault(
    state: tauri::State<'_, AppState>,
    vault_id: Uuid,
) -> Result<Vec<NodeListItem>, String> {
    let vault = sqlx::query_as::<_, Vault>(
        "SELECT id, name, root_path, created_at, updated_at FROM vaults WHERE id = $1",
    )
    .bind(vault_id)
    .fetch_one(state.pg()?)
    .await
    .map_err(|e| format!("Vault not found: {}", e))?;

    let mut created_nodes: Vec<NodeListItem> = Vec::new();

    for entry in walkdir::WalkDir::new(&vault.root_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "md"))
    {
        let file_path = entry.path().to_string_lossy().to_string();
        let title = entry
            .path()
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        if node_repo::find_by_file_path(state.pg()?, vault_id, &file_path)
            .await
            .map_err(|e| e.to_string())?
            .is_some()
        {
            continue;
        }

        let content = std::fs::read_to_string(entry.path()).unwrap_or_default();
        let id = Uuid::new_v4();
        let wc = content.split_whitespace().count() as i32;

        let node = sqlx::query_as::<_, Node>(
            "INSERT INTO nodes (id, vault_id, title, content, content_type, file_path, word_count) VALUES ($1, $2, $3, $4, 'note', $5, $6) RETURNING id, vault_id, title, content, content_type, file_path, metadata, word_count, created_at, updated_at",
        )
        .bind(id)
        .bind(vault_id)
        .bind(&title)
        .bind(&content)
        .bind(&file_path)
        .bind(wc)
        .fetch_one(state.pg()?)
        .await
        .map_err(|e| format!("Failed to insert node: {}", e))?;

        graph_sync::create_node_with_pg_rollback(
            state.neo4j()?,
            state.pg()?,
            id,
            vault_id,
            &node.title,
            &node.content_type,
        )
        .await
        .map_err(|e| e.to_string())?;

        created_nodes.push(NodeListItem {
            id: node.id,
            title: node.title,
            content_type: node.content_type,
            file_path: Some(file_path.clone()),
            updated_at: node.updated_at,
        });
    }

    Ok(created_nodes)
}

#[tauri::command]
pub async fn get_random_node(
    state: tauri::State<'_, AppState>,
    vault_id: Uuid,
) -> Result<Node, String> {
    let node = sqlx::query_as::<_, Node>(
        "SELECT id, vault_id, title, content, content_type, file_path, metadata, word_count, created_at, updated_at FROM nodes WHERE vault_id = $1 ORDER BY RANDOM() LIMIT 1",
    )
    .bind(vault_id)
    .fetch_one(state.pg()?)
    .await
    .map_err(|e| format!("No nodes found: {}", e))?;

    Ok(node)
}
