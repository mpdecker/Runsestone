use crate::context::BackendContext;
use crate::error::{AppError, AppResult};
use crate::models::graph::{CypherResultRow, GraphQueryRequest, GraphQueryResponse};

const DESTRUCTIVE_CYPHER: &[&str] = &[
    "DELETE", "DETACH DELETE", "REMOVE", "SET", "CREATE", "MERGE", "DROP",
    "CALL", "LOAD CSV", "PERIODIC COMMIT", "USING PERIODIC COMMIT",
];
const MAX_CYPHER_ROWS: usize = 200;
const MAX_RESULT_CHARS: usize = 4000;

pub async fn run_cypher(
    ctx: &BackendContext,
    cypher: String,
) -> AppResult<Vec<CypherResultRow>> {
    let sanitized = sanitize_cypher(&cypher)?;

    log::debug!("Executing Cypher query: {}", sanitized);
    let query = neo4rs::query(&sanitized);
    let mut stream = ctx
        .neo4j
        .execute(query)
        .await
        .map_err(|e| AppError::Neo4j(format!("Cypher execution failed: {}", e)))?;

    let mut rows: Vec<CypherResultRow> = Vec::new();
    let expected_keys = [
        "pg_id", "title", "content_type", "name", "type(r)", "count",
        "n.pg_id", "m.pg_id", "m.title", "target.pg_id", "label",
    ];

    while let Ok(Some(row)) = stream.next().await {
        if rows.len() >= MAX_CYPHER_ROWS {
            break;
        }
        let mut pairs: Vec<(String, String)> = Vec::new();
        for key in &expected_keys {
            if let Ok(val) = row.get::<String>(key) {
                if !val.is_empty() {
                    pairs.push((key.to_string(), val));
                }
            }
        }
        if pairs.is_empty() {
            pairs.push(("result".to_string(), "1 match".to_string()));
        }
        rows.push(CypherResultRow { values: pairs });
    }

    Ok(rows)
}

fn sanitize_cypher(cypher: &str) -> AppResult<String> {
    let upper = cypher.to_uppercase();

    for keyword in DESTRUCTIVE_CYPHER {
        if upper.contains(keyword) {
            return Err(AppError::Validation(format!(
                "Cypher query contains disallowed keyword: '{}'. Only read-only queries are permitted.",
                keyword
            )));
        }
    }

    let trimmed = cypher.trim();
    let sanitized = if !upper.contains("LIMIT") {
        format!("{} LIMIT {}", trimmed, MAX_CYPHER_ROWS)
    } else {
        trimmed.to_string()
    };

    Ok(sanitized)
}

pub async fn graph_query(
    ctx: &BackendContext,
    request: GraphQueryRequest,
) -> AppResult<GraphQueryResponse> {
    let schema = r#"Node labels: Node (properties: pg_id, title, content_type).
Edge types: LINKS_TO, HAS_TAG, REFERENCES, CONTAINS, EXTRACTED_FROM, RELATES_TO.
pg_id is a UUID matching the PostgreSQL nodes.id column.
content_type values: note, concept, entity, document."#;

    let vault_nodes_hint = format!(
        "All nodes for this vault have pg_ids that match nodes with vault_id '{}' in PostgreSQL.",
        request.vault_id
    );

    let cypher_prompt = format!(
        "You are a Neo4j Cypher translator. Given the following graph schema and a user's question, output ONLY a valid Cypher query (no markdown, no explanation, no backticks) that answers the question. Use only read-only clauses (MATCH, RETURN, WHERE, ORDER BY, SKIP, LIMIT).\n\nSchema:\n{}\n\nAdditional context:\n{}\n\nUser's question: {}\n\nCypher query:",
        schema, vault_nodes_hint, request.question
    );

    let cypher = crate::handlers::ai::simple_chat(&cypher_prompt, &ctx.llm_config)
        .await
        .map_err(|e| AppError::Other(format!("LLM translation failed: {}", e)))?;

    let cleaned_cypher = clean_cypher(&cypher);
    log::info!("Generated Cypher from NL query: {}", cleaned_cypher);

    let results = run_cypher(ctx, cleaned_cypher.clone()).await?;
    log::info!("Cypher query completed: {} rows", results.len());

    let results_text = if results.is_empty() {
        "The query returned no results.".to_string()
    } else {
        let rows_text: Vec<String> = results
            .iter()
            .map(|r| {
                r.values
                    .iter()
                    .map(|(k, v)| format!("{}: {}", k, v))
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .collect();
        let joined = rows_text.join("\n");
        if joined.len() > MAX_RESULT_CHARS {
            format!(
                "{}...\n(truncated, {} total rows)",
                &joined[..MAX_RESULT_CHARS],
                results.len()
            )
        } else {
            joined
        }
    };

    let answer_prompt = format!(
        "Given these Cypher query results from a knowledge graph:\n{}\n\nAnswer the user's original question concisely: {}\n\nAnswer:",
        results_text, request.question,
    );

    let answer = crate::handlers::ai::simple_chat(&answer_prompt, &ctx.llm_config)
        .await
        .map_err(|e| AppError::Other(format!("LLM summarization failed: {}", e)))?;

    Ok(GraphQueryResponse {
        answer,
        cypher: cleaned_cypher,
        results,
    })
}

fn clean_cypher(raw: &str) -> String {
    let trimmed = raw.trim();
    let stripped = trimmed
        .trim_start_matches("```cypher")
        .trim_start_matches("```cypher\n")
        .trim_start_matches("```")
        .trim_start_matches("cypher")
        .trim_end_matches("```")
        .trim();
    if stripped.is_empty() {
        raw.trim().to_string()
    } else {
        stripped.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_allows_read_only() {
        assert!(sanitize_cypher("MATCH (n) RETURN n").is_ok());
        assert!(sanitize_cypher("MATCH (n:Node {pg_id: 'x'})-[r]-(m) RETURN n, m").is_ok());
    }

    #[test]
    fn sanitize_blocks_delete() {
        assert!(sanitize_cypher("MATCH (n) DELETE n").is_err());
        assert!(sanitize_cypher("MATCH (n) DETACH DELETE n").is_err());
    }

    #[test]
    fn sanitize_blocks_destructive_write() {
        assert!(sanitize_cypher("CREATE (n:Node {pg_id: 'x'})").is_err());
        assert!(sanitize_cypher("DROP CONSTRAINT ON (n:Node)").is_err());
        assert!(sanitize_cypher("MATCH (n) REMOVE n.title").is_err());
        assert!(sanitize_cypher("MATCH (n) SET n.title = 'x'").is_err());
    }

    #[test]
    fn sanitize_adds_limit_when_missing() {
        let result = sanitize_cypher("MATCH (n) RETURN n").unwrap();
        assert!(result.contains("LIMIT"));
    }

    #[test]
    fn sanitize_preserves_existing_limit() {
        let result = sanitize_cypher("MATCH (n) RETURN n LIMIT 10").unwrap();
        assert_eq!(result, "MATCH (n) RETURN n LIMIT 10");
    }

    #[test]
    fn clean_cypher_strips_markdown() {
        assert_eq!(clean_cypher("```cypher\nMATCH (n) RETURN n\n```"), "MATCH (n) RETURN n");
        assert_eq!(clean_cypher("MATCH (n) RETURN n"), "MATCH (n) RETURN n");
        assert_eq!(clean_cypher("  MATCH (n) RETURN n  "), "MATCH (n) RETURN n");
    }
}
