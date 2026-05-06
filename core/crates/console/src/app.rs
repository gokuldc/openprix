use ratatui::widgets::TableState;
use shared::{DaemonStatus, Region, Resource};
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use tui_input::Input; // 🔥 Added Region import

#[derive(Clone, Copy, PartialEq)]
pub enum Page {
    Dashboard,
    Resources,
    Databook,
    ProjectArchive,
    Directory,
    ServerManager,
}

#[derive(Clone, Copy, PartialEq)]
pub enum ResourceFocus {
    Code,
    Description,
    Unit,
    Rate,
    Submit,
}
#[derive(Clone, Copy, PartialEq)]
pub enum ServerFocus {
    PortInput,
    StartStop,
    TrafficTable,
    LogArea,
}

pub struct App {
    pub active_page: Page,
    pub should_quit: bool,
    pub db_pool: SqlitePool,

    pub active_projects_count: i64,
    pub total_staff: i64,
    pub total_clients: i64,
    pub total_suppliers: i64,
    pub daemon_status_text: String,
    pub daemon_raw: Option<DaemonStatus>,
    pub currency_symbol: String,

    pub server_focus: ServerFocus,
    pub server_port_input: Input,
    pub server_running: bool,
    pub server_logs: Vec<String>,
    pub server_traffic: Vec<ServerRequest>,

    pub resources_data: Vec<Resource>,
    pub res_table_state: TableState,
    pub res_edit_id: Option<String>,

    pub res_code: Input,
    pub res_desc: Input,
    pub res_unit: Input,
    pub res_rate: Input,
    pub res_focus: ResourceFocus,
    pub res_status_message: String,

    // 🔥 NEW: Region Manager State
    pub regions_data: Vec<Region>,
    pub show_region_manager: bool,
    pub region_input: Input,
    pub region_table_state: TableState,
}

// Simple struct for traffic monitoring
pub struct ServerRequest {
    pub timestamp: String,
    pub method: String,
    pub path: String,
    pub status: u16,
}

impl App {
    pub async fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect("sqlite://../database.sqlite")
            .await?;

        let mut app = Self {
            active_page: Page::Dashboard,
            should_quit: false,
            db_pool: pool,
            active_projects_count: 0,
            total_staff: 0,
            total_clients: 0,
            total_suppliers: 0,
            daemon_status_text: String::new(),
            currency_symbol: "$".to_string(),

            resources_data: Vec::new(),
            res_table_state: TableState::default(),
            res_edit_id: None,
            res_code: Input::default(),
            res_desc: Input::default(),
            res_unit: Input::default().with_value("nos".to_string()),
            res_rate: Input::default(),
            res_focus: ResourceFocus::Code,
            res_status_message: String::new(),

            // 🔥 Initialize Region Manager
            regions_data: Vec::new(),
            show_region_manager: false,
            region_input: Input::default(),
            region_table_state: TableState::default(),

            daemon_raw: None,
            server_focus: ServerFocus::PortInput,
            server_port_input: Input::default(),
            server_running: false,
            server_logs: Vec::new(),
            server_traffic: Vec::new(),
        };

        app.refresh_data().await;
        if !app.resources_data.is_empty() {
            app.res_table_state.select(Some(0));
        }
        if !app.regions_data.is_empty() {
            app.region_table_state.select(Some(0));
        }
        Ok(app)
    }

    pub async fn refresh_data(&mut self) {
        if let Ok(count) = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM projects WHERE status IN ('Active', 'In Progress')",
        )
        .fetch_one(&self.db_pool)
        .await
        {
            self.active_projects_count = count;
        }
        if let Ok(count) = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM org_staff")
            .fetch_one(&self.db_pool)
            .await
        {
            self.total_staff = count;
        }
        if let Ok(count) = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM crm_contacts WHERE type IN ('Client', 'Lead')",
        )
        .fetch_one(&self.db_pool)
        .await
        {
            self.total_clients = count;
        }
        if let Ok(count) = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM crm_contacts WHERE type IN ('Supplier', 'Subcontractor')",
        )
        .fetch_one(&self.db_pool)
        .await
        {
            self.total_suppliers = count;
        }

        self.currency_symbol = "₹".to_string();
        if let Ok(settings_rows) =
            sqlx::query_as::<_, shared::AppSetting>("SELECT * FROM app_settings")
                .fetch_all(&self.db_pool)
                .await
        {
            for row in settings_rows {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&row.value) {
                    if let Some(symbol) = parsed.get("currencySymbol").and_then(|s| s.as_str()) {
                        self.currency_symbol = symbol.to_string();
                        break;
                    }
                }
            }
        }

        if let Ok(res) = sqlx::query_as::<_, Resource>("SELECT * FROM resources ORDER BY code ASC")
            .fetch_all(&self.db_pool)
            .await
        {
            self.resources_data = res;
        }

        // 🔥 NEW: Fetch Regions
        if let Ok(regs) = sqlx::query_as::<_, Region>("SELECT * FROM regions ORDER BY name ASC")
            .fetch_all(&self.db_pool)
            .await
        {
            self.regions_data = regs;
        }

        self.daemon_status_text = match std::fs::read_to_string("../.daemon_status.json") {
            Ok(contents) => {
                if let Ok(daemon) = serde_json::from_str::<shared::DaemonStatus>(&contents) {
                    self.daemon_raw = Some(daemon.clone());
                    self.server_running = true; // daemon is up
                    if self.server_port_input.value().is_empty() {
                        self.server_port_input = Input::default().with_value(daemon.port.to_string());
                    }
                    format!(
                        "DAEMON ONLINE | Port: {} | PID: {}",
                        daemon.port, daemon.pid
                    )
                } else {
                    self.daemon_raw = None;
                    self.server_running = false;
                    "DAEMON OFFLINE | Status Unreadable".to_string()
                }
            }
            Err(_) => {
                self.daemon_raw = None;
                self.server_running = false;
                "DAEMON OFFLINE | Process Not Detected".to_string()
            }
        };

        // Mock some traffic/logs for now if not reading from a real socket
        if self.server_logs.len() > 100 { self.server_logs.remove(0); }
        self.server_logs.push(format!("[{}] INFO: Kernel polling database...", chrono::Local::now().format("%H:%M:%S")));
        
        // Mock traffic
        if self.server_traffic.len() > 20 { self.server_traffic.remove(0); }
        self.server_traffic.push(ServerRequest {
            timestamp: chrono::Local::now().format("%H:%M:%S").to_string(),
            method: "GET".into(),
            path: "/api/resources".into(),
            status: 200,
        });
    }

    pub fn next_page(&mut self) {
        self.active_page = match self.active_page {
            Page::Dashboard => Page::Resources,
            Page::Resources => Page::Databook,
            Page::Databook => Page::ProjectArchive,
            Page::ProjectArchive => Page::Directory,
            Page::Directory => Page::ServerManager,
            Page::ServerManager => Page::Dashboard,
        };
    }

    pub fn previous_page(&mut self) {
        self.active_page = match self.active_page {
            Page::Dashboard => Page::ServerManager,
            Page::Resources => Page::Dashboard,
            Page::Databook => Page::Resources,
            Page::ProjectArchive => Page::Databook,
            Page::Directory => Page::ProjectArchive,
            Page::ServerManager => Page::Directory,
        };
    }

    pub fn scroll_table_down(&mut self) {
        let i = match self.res_table_state.selected() {
            Some(i) => {
                if i >= self.resources_data.len().saturating_sub(1) {
                    0
                } else {
                    i + 1
                }
            }
            None => 0,
        };
        self.res_table_state.select(Some(i));
    }

    pub fn scroll_table_up(&mut self) {
        let i = match self.res_table_state.selected() {
            Some(i) => {
                if i == 0 {
                    self.resources_data.len().saturating_sub(1)
                } else {
                    i - 1
                }
            }
            None => 0,
        };
        self.res_table_state.select(Some(i));
    }

    pub fn clear_resource_form(&mut self) {
        self.res_edit_id = None;
        self.res_code.reset();
        self.res_desc.reset();
        self.res_unit = Input::default().with_value("nos".to_string());
        self.res_rate.reset();
        self.res_focus = ResourceFocus::Code;
        self.res_status_message = "Form cleared for new entry.".to_string();
    }

    pub fn load_selected_resource(&mut self) {
        if let Some(i) = self.res_table_state.selected() {
            if let Some(res) = self.resources_data.get(i) {
                self.res_edit_id = Some(res.id.clone());
                self.res_code = Input::default().with_value(res.code.clone().unwrap_or_default());
                self.res_desc =
                    Input::default().with_value(res.description.clone().unwrap_or_default());
                self.res_unit = Input::default().with_value(res.unit.clone().unwrap_or_default());

                let mut rate_display = String::new();
                if let Some(rates_json) = &res.rates {
                    if let Ok(parsed) = serde_json::from_str::<
                        serde_json::Map<String, serde_json::Value>,
                    >(rates_json)
                    {
                        let entries: Vec<String> = parsed
                            .iter()
                            .map(|(k, v)| {
                                // 🔥 FIX: Handle BOTH JSON Numbers and JSON Strings from React
                                let val = v.as_f64().unwrap_or_else(|| {
                                    v.as_str()
                                        .and_then(|s| s.parse::<f64>().ok())
                                        .unwrap_or(0.0)
                                });

                                if (k == "base" || k == "Base") && parsed.len() == 1 {
                                    format!("{}", val)
                                } else {
                                    format!("{}:{}", k, val)
                                }
                            })
                            .collect();
                        rate_display = entries.join(", ");
                    }
                }
                self.res_rate = Input::default().with_value(rate_display);
                self.res_focus = ResourceFocus::Code;
                self.res_status_message =
                    format!("EDITING: {}", res.code.as_deref().unwrap_or("Resource"));
            }
        }
    }

    pub async fn delete_selected_resource(&mut self) {
        if let Some(i) = self.res_table_state.selected() {
            if let Some(res) = self.resources_data.get(i).cloned() {
                if let Ok(_) = sqlx::query("DELETE FROM resources WHERE id = ?")
                    .bind(&res.id)
                    .execute(&self.db_pool)
                    .await
                {
                    self.res_status_message =
                        format!("DELETED: {}", res.code.as_deref().unwrap_or("Resource"));
                    if self.res_edit_id.as_deref() == Some(res.id.as_str()) {
                        self.clear_resource_form();
                    }
                    self.refresh_data().await;
                    let new_len = self.resources_data.len();
                    if new_len == 0 {
                        self.res_table_state.select(None);
                    } else if i >= new_len {
                        self.res_table_state.select(Some(new_len - 1));
                    }
                } else {
                    self.res_status_message = "ERROR: Failed to delete resource.".into();
                }
            }
        }
    }

    pub async fn submit_resource(&mut self) {
        let code = self.res_code.value().trim();
        let desc = self.res_desc.value().trim();
        let unit = self.res_unit.value().trim();
        let rate_str = self.res_rate.value().trim();

        if code.is_empty() || desc.is_empty() || rate_str.is_empty() {
            self.res_status_message =
                "ERROR: Code, Description, and Rate are required.".to_string();
            return;
        }

        let mut rates_map = serde_json::Map::new();
        if rate_str.contains(':') {
            for pair in rate_str.split(',') {
                let parts: Vec<&str> = pair.split(':').collect();
                if parts.len() == 2 {
                    let region = parts[0].trim().to_string();
                    if let Ok(val) = parts[1].trim().parse::<f64>() {
                        rates_map.insert(region, serde_json::json!(val));
                    }
                }
            }
        } else if let Ok(val) = rate_str.parse::<f64>() {
            // 🔥 FIX: Save as strict lowercase "base" to match React expectations
            rates_map.insert("base".to_string(), serde_json::json!(val));
        } else {
            self.res_status_message =
                "ERROR: Format as 'Region:Rate' or a single number.".to_string();
            return;
        }

        let rates_json = serde_json::to_string(&rates_map).unwrap_or_else(|_| "{}".to_string());
        let id = self
            .res_edit_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        let q = "INSERT OR REPLACE INTO resources (id, code, description, unit, rates, rateHistory) VALUES (?, ?, ?, ?, ?, '[]')";
        match sqlx::query(q)
            .bind(&id)
            .bind(code)
            .bind(desc)
            .bind(unit)
            .bind(&rates_json)
            .execute(&self.db_pool)
            .await
        {
            Ok(_) => {
                self.res_status_message = format!("SUCCESS: Resource '{}' saved.", code);
                self.clear_resource_form();
                self.refresh_data().await;
            }
            Err(e) => {
                self.res_status_message = format!("DB ERROR: {}", e);
            }
        }
    }

    // 🔥 NEW: Region Manager Methods
    pub async fn submit_region(&mut self) {
        let name = self.region_input.value().trim();
        if name.is_empty() {
            return;
        }

        let id = uuid::Uuid::new_v4().to_string();
        if let Ok(_) = sqlx::query("INSERT INTO regions (id, name) VALUES (?, ?)")
            .bind(&id)
            .bind(name)
            .execute(&self.db_pool)
            .await
        {
            self.region_input.reset();
            self.refresh_data().await;
        }
    }

    pub async fn delete_selected_region(&mut self) {
        if let Some(i) = self.region_table_state.selected() {
            if let Some(reg) = self.regions_data.get(i).cloned() {
                let _ = sqlx::query("DELETE FROM regions WHERE id = ?")
                    .bind(&reg.id)
                    .execute(&self.db_pool)
                    .await;
                self.refresh_data().await;
                let new_len = self.regions_data.len();
                if new_len == 0 {
                    self.region_table_state.select(None);
                } else if i >= new_len {
                    self.region_table_state.select(Some(new_len - 1));
                }
            }
        }
    }

    pub fn scroll_region_down(&mut self) {
        let i = match self.region_table_state.selected() {
            Some(i) => {
                if i >= self.regions_data.len().saturating_sub(1) {
                    0
                } else {
                    i + 1
                }
            }
            None => 0,
        };
        self.region_table_state.select(Some(i));
    }

    pub fn scroll_region_up(&mut self) {
        let i = match self.region_table_state.selected() {
            Some(i) => {
                if i == 0 {
                    self.regions_data.len().saturating_sub(1)
                } else {
                    i - 1
                }
            }
            None => 0,
        };
        self.region_table_state.select(Some(i));
    }

    // Apply port config without starting/stopping
    pub async fn apply_server_config(&mut self) {
        let new_port = self.server_port_input.value().parse::<u16>().unwrap_or(3000);
        self.server_logs.push(format!(">>> CONFIG: Port set to {}. Use Start/Stop button to apply.", new_port));
    }

    // Toggle server on/off
    pub async fn toggle_server(&mut self) {
        if self.server_running {
            self.stop_server().await;
        } else {
            self.start_server().await;
        }
    }

    pub async fn start_server(&mut self) {
        let port = self.server_port_input.value().trim().parse::<u16>().unwrap_or(3000);
        self.server_logs.push(format!(">>> START: Launching daemon on port {}...", port));

        // Write port config so daemon picks it up on boot
        let config_json = format!("{{\"port\":{}}}", port);
        if let Err(e) = std::fs::write("../.daemon_config.json", &config_json) {
            self.server_logs.push(format!(">>> ERROR: Could not write config: {}", e));
            return;
        }

        // The daemon exe lives in the Cargo workspace target dir.
        // The console runs from core/crates/, so the exe is ../../target/debug/daemon
        // We also set the working directory to core/crates/daemon/ so its relative
        // paths (../.daemon_status.json, ../database.sqlite) resolve correctly.
        let exe_path = "..\\..\\target\\debug\\daemon.exe";
        let work_dir = "..\\daemon";

        match std::process::Command::new(exe_path)
            .current_dir(work_dir)
            .spawn()
        {
            Ok(_child) => {
                // Give it a moment to write the status file, then refresh
                std::thread::sleep(std::time::Duration::from_millis(800));
                self.refresh_data().await;
                if self.server_running {
                    self.server_logs.push(format!(">>> START: Daemon is online on port {}.", port));
                } else {
                    self.server_logs.push(">>> START: Daemon spawned but status file not found yet.".to_string());
                }
            }
            Err(e) => {
                self.server_logs.push(format!(">>> ERROR: Failed to launch daemon: {}", e));
                self.server_logs.push(format!(">>> ERROR: Tried path: {}", exe_path));
                self.server_logs.push(">>> HINT: Run 'cargo build' in core/ first.".to_string());
            }
        }
    }

    pub async fn stop_server(&mut self) {
        self.server_logs.push(">>> STOP: Sending shutdown signal to daemon...".to_string());

        // Read PID from status file and kill it
        if let Ok(contents) = std::fs::read_to_string("../.daemon_status.json") {
            if let Ok(daemon) = serde_json::from_str::<shared::DaemonStatus>(&contents) {
                #[cfg(target_os = "windows")]
                let kill_result = std::process::Command::new("taskkill")
                    .args(["/PID", &daemon.pid.to_string(), "/F"])
                    .output();

                #[cfg(not(target_os = "windows"))]
                let kill_result = std::process::Command::new("kill")
                    .args(["-9", &daemon.pid.to_string()])
                    .output();

                match kill_result {
                    Ok(_) => {
                        self.server_running = false;
                        self.daemon_raw = None;
                        self.server_logs.push(format!(">>> STOP: Process {} terminated.", daemon.pid));
                        // Remove stale status file
                        let _ = std::fs::remove_file("../.daemon_status.json");
                    }
                    Err(e) => {
                        self.server_logs.push(format!(">>> ERROR: kill failed: {}", e));
                    }
                }
                return;
            }
        }
        self.server_logs.push(">>> STOP: No running daemon found (no PID file).".to_string());
        self.server_running = false;
    }
}
