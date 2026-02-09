use axum::{extract::State as AxumState, http::StatusCode, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, watch, Mutex};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequest {
    pub tool_use_id: String,
    pub tool_name: String,
    pub input: serde_json::Value,
}

/// Response sent back to the MCP script. Claude Code expects either:
///   `{ "behavior": "allow", "updatedInput": {...} }`
///   `{ "behavior": "deny",  "message": "..." }`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionResponse {
    pub behavior: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "updatedInput")]
    pub updated_input: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Payload emitted to the frontend via Tauri event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionPromptEvent {
    pub prompt_id: String,
    pub session_id: String,
    pub tool_name: String,
    pub input: serde_json::Value,
}

/// One running permission HTTP server bound to a session.
pub struct PermissionServerEntry {
    pub port: u16,
    pub pending: Arc<Mutex<HashMap<String, oneshot::Sender<PermissionResponse>>>>,
    pub shutdown_tx: watch::Sender<bool>,
    pub mcp_config_path: PathBuf,
    pub mcp_script_path: PathBuf,
    /// Shared with the axum HttpState — updating this updates the session ID
    /// used in Tauri events emitted by the HTTP handler.
    pub session_id: Arc<Mutex<String>>,
}

/// Global registry managed as Tauri state.
#[derive(Default)]
pub struct PermissionServerRegistry {
    pub servers: Arc<Mutex<HashMap<String, PermissionServerEntry>>>,
}

// ---------------------------------------------------------------------------
// Shared state handed into each axum handler
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct HttpState {
    app: AppHandle,
    session_id: Arc<Mutex<String>>,
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<PermissionResponse>>>>,
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

/// Start a permission-prompt HTTP server on a random port for the given session.
/// Returns the port the server is listening on.
pub async fn start_server(
    app: AppHandle,
    session_id: &str,
    registry: &PermissionServerRegistry,
) -> Result<u16, String> {
    let pending: Arc<Mutex<HashMap<String, oneshot::Sender<PermissionResponse>>>> =
        Arc::new(Mutex::new(HashMap::new()));

    let (shutdown_tx, shutdown_rx) = watch::channel(false);

    let session_id_arc = Arc::new(Mutex::new(session_id.to_string()));

    let state = HttpState {
        app: app.clone(),
        session_id: session_id_arc.clone(),
        pending: pending.clone(),
    };

    let router = Router::new()
        .route("/permission-prompt", post(handle_permission_prompt))
        .with_state(state.clone());

    // Bind to random port on loopback
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind permission server: {}", e))?;

    let addr = listener
        .local_addr()
        .map_err(|e| format!("Failed to get local addr: {}", e))?;

    let port = addr.port();
    log::info!(
        "Permission prompt server for session '{}' listening on port {}",
        session_id,
        port
    );

    // Spawn the server with graceful shutdown
    let mut shutdown_rx_clone = shutdown_rx.clone();
    tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                // Wait until the shutdown signal is sent
                loop {
                    if *shutdown_rx_clone.borrow() {
                        break;
                    }
                    if shutdown_rx_clone.changed().await.is_err() {
                        break;
                    }
                }
            })
            .await
            .ok();
        log::info!("Permission prompt server on port {} shut down", port);
    });

    // Register in the global map (config/script paths will be filled after generate_mcp_files)
    {
        let mut servers = registry.servers.lock().await;
        servers.insert(
            session_id.to_string(),
            PermissionServerEntry {
                port,
                pending,
                shutdown_tx,
                mcp_config_path: PathBuf::new(),
                mcp_script_path: PathBuf::new(),
                session_id: session_id_arc,
            },
        );
    }

    Ok(port)
}

/// The single axum handler. Receives a permission request from the MCP script,
/// emits a Tauri event, then waits for the frontend to respond.
async fn handle_permission_prompt(
    AxumState(state): AxumState<HttpState>,
    Json(req): Json<PermissionRequest>,
) -> Result<Json<PermissionResponse>, StatusCode> {
    let prompt_id = Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel::<PermissionResponse>();

    // Store the sender so `resolve_prompt` can complete the request later
    {
        let mut pending = state.pending.lock().await;
        pending.insert(prompt_id.clone(), tx);
    }

    let session_id = state.session_id.lock().await.clone();

    let event = PermissionPromptEvent {
        prompt_id: prompt_id.clone(),
        session_id: session_id.clone(),
        tool_name: req.tool_name,
        input: req.input.clone(),
    };

    // Emit session-scoped event
    let _ = state
        .app
        .emit(&format!("permission-prompt:{}", session_id), &event);
    // Also emit a generic event
    let _ = state.app.emit("permission-prompt", &event);

    // Wait for the frontend to respond (timeout after 5 minutes → auto-deny)
    match tokio::time::timeout(std::time::Duration::from_secs(300), rx).await {
        Ok(Ok(resp)) => Ok(Json(resp)),
        _ => {
            // Timeout or channel closed → deny
            let mut pending = state.pending.lock().await;
            pending.remove(&prompt_id);
            Ok(Json(PermissionResponse {
                behavior: "deny".to_string(),
                updated_input: None,
                message: Some("Permission prompt timed out".to_string()),
            }))
        }
    }
}

// ---------------------------------------------------------------------------
// Lifecycle helpers
// ---------------------------------------------------------------------------

/// Stop and clean up the permission server for a session.
pub async fn stop_server(session_id: &str, registry: &PermissionServerRegistry) {
    let mut servers = registry.servers.lock().await;
    if let Some(entry) = servers.remove(session_id) {
        // Signal shutdown
        let _ = entry.shutdown_tx.send(true);

        // Drop all pending senders → auto-deny any waiting requests
        let mut pending = entry.pending.lock().await;
        pending.clear();

        // Clean up temp files
        cleanup_temp_files(&entry.mcp_config_path, &entry.mcp_script_path);

        log::info!(
            "Permission server for session '{}' stopped and cleaned up",
            session_id
        );
    }
}

/// Re-key a server entry from a placeholder ID to the real session ID.
/// Also updates the shared session_id Arc so the HTTP handler emits
/// events with the correct session ID.
pub async fn rekey_server(
    old_id: &str,
    new_id: &str,
    registry: &PermissionServerRegistry,
) {
    let mut servers = registry.servers.lock().await;
    if let Some(entry) = servers.remove(old_id) {
        // Update the shared session_id so the axum HTTP handler will emit
        // Tauri events with the real session ID (not the placeholder).
        {
            let mut sid = entry.session_id.lock().await;
            *sid = new_id.to_string();
        }
        servers.insert(new_id.to_string(), entry);
        log::info!(
            "Re-keyed permission server from '{}' to '{}'",
            old_id,
            new_id
        );
    }
}

/// Resolve a pending permission prompt with a response from the frontend.
pub async fn resolve_prompt(
    session_id: &str,
    prompt_id: &str,
    response: PermissionResponse,
    registry: &PermissionServerRegistry,
) -> Result<(), String> {
    let servers = registry.servers.lock().await;
    let entry = servers
        .get(session_id)
        .ok_or_else(|| format!("No permission server for session '{}'", session_id))?;

    let mut pending = entry.pending.lock().await;
    let tx = pending
        .remove(prompt_id)
        .ok_or_else(|| format!("No pending prompt '{}'", prompt_id))?;

    tx.send(response)
        .map_err(|_| "Receiver already dropped".to_string())
}

// ---------------------------------------------------------------------------
// MCP script & config generation
// ---------------------------------------------------------------------------

/// Write the Node.js MCP stdio server script and its config JSON to temp files.
/// Returns `(config_path, script_path)`.
pub fn generate_mcp_files(
    port: u16,
    session_id: &str,
    node_path: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let tmp = std::env::temp_dir();
    let script_path = tmp.join(format!("opcode-mcp-server-{}.js", session_id));
    let config_path = tmp.join(format!("opcode-mcp-{}.json", session_id));

    // --- Node.js MCP stdio server ---
    let script = MCP_SCRIPT_TEMPLATE;
    std::fs::write(&script_path, script)
        .map_err(|e| format!("Failed to write MCP script: {}", e))?;

    // --- MCP config JSON ---
    let config = serde_json::json!({
        "mcpServers": {
            "opcode": {
                "command": node_path,
                "args": [script_path.to_string_lossy()],
                "env": {
                    "PERMISSION_SERVER_PORT": port.to_string(),
                    "OPCODE_SESSION_ID": session_id
                }
            }
        }
    });
    std::fs::write(
        &config_path,
        serde_json::to_string_pretty(&config).unwrap(),
    )
    .map_err(|e| format!("Failed to write MCP config: {}", e))?;

    Ok((config_path, script_path))
}

/// Locate node / node.exe on the system PATH.
pub fn find_node() -> Result<String, String> {
    which::which("node")
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|_| {
            "Node.js is required for permission prompt support but was not found on PATH"
                .to_string()
        })
}

/// Best-effort removal of temp files.
pub fn cleanup_temp_files(config_path: &Path, script_path: &Path) {
    let _ = std::fs::remove_file(config_path);
    let _ = std::fs::remove_file(script_path);
}

/// Update the stored temp-file paths in the registry entry so cleanup works.
pub async fn set_mcp_paths(
    session_id: &str,
    config_path: PathBuf,
    script_path: PathBuf,
    registry: &PermissionServerRegistry,
) {
    let mut servers = registry.servers.lock().await;
    if let Some(entry) = servers.get_mut(session_id) {
        entry.mcp_config_path = config_path;
        entry.mcp_script_path = script_path;
    }
}

// ---------------------------------------------------------------------------
// Embedded MCP script template
// ---------------------------------------------------------------------------

const MCP_SCRIPT_TEMPLATE: &str = r#"#!/usr/bin/env node
"use strict";

const http = require("http");
const readline = require("readline");

const PORT = process.env.PERMISSION_SERVER_PORT;
const SESSION_ID = process.env.OPCODE_SESSION_ID || "";

if (!PORT) {
  process.stderr.write("PERMISSION_SERVER_PORT not set\n");
  process.exit(1);
}

// ---------- JSON-RPC helpers (newline-delimited JSON) ----------

function sendResponse(id, result) {
  const body = JSON.stringify({ jsonrpc: "2.0", id, result });
  process.stdout.write(body + "\n");
}

function sendError(id, code, message) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
  process.stdout.write(body + "\n");
}

// ---------- HTTP POST to OpCode permission server ----------

function postPermission(toolUseId, toolName, input) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      tool_use_id: toolUseId,
      tool_name: toolName,
      input: input,
    });
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: Number(PORT),
        path: "/permission-prompt",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("Invalid JSON from permission server"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ---------- Handle incoming JSON-RPC messages ----------

async function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      sendResponse(id, {
        protocolVersion: "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: { name: "opcode-permission-prompt", version: "1.0.0" },
      });
      break;

    case "notifications/initialized":
      // No response needed for notifications
      break;

    case "tools/list":
      sendResponse(id, {
        tools: [
          {
            name: "permission_prompt",
            description:
              "Handle permission requests from Claude Code. Returns whether the user allowed or denied the action.",
            inputSchema: {
              type: "object",
              properties: {
                tool_use_id: {
                  type: "string",
                  description: "Unique identifier for this tool invocation",
                },
                tool_name: {
                  type: "string",
                  description: "The name of the tool requesting permission",
                },
                input: {
                  description: "The input parameters for the tool",
                },
              },
              required: ["tool_use_id", "tool_name", "input"],
            },
          },
        ],
      });
      break;

    case "tools/call": {
      const toolName = params?.name;
      if (toolName !== "permission_prompt") {
        sendError(id, -32601, "Unknown tool: " + toolName);
        return;
      }

      const args = params?.arguments || {};
      try {
        const result = await postPermission(
          args.tool_use_id || "",
          args.tool_name || "unknown",
          args.input || {}
        );
        sendResponse(id, {
          content: [{ type: "text", text: JSON.stringify(result) }],
        });
      } catch (err) {
        // On error, deny by default
        sendResponse(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                behavior: "deny",
                message: "Permission server unavailable",
              }),
            },
          ],
        });
      }
      break;
    }

    default:
      if (id !== undefined) {
        sendError(id, -32601, "Method not found: " + method);
      }
      break;
  }
}

// ---------- Stdin reader (newline-delimited JSON) ----------

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    handleMessage(msg).catch((err) => {
      process.stderr.write("Error handling message: " + err.message + "\n");
    });
  } catch (e) {
    process.stderr.write("Failed to parse JSON-RPC message: " + e.message + "\n");
  }
});

rl.on("close", () => {
  process.exit(0);
});
"#;
