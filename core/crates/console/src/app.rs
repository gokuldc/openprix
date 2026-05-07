use chrono::Local;
use ratatui::widgets::TableState;
use serde_json::Value;
use shared::{DaemonStatus, Region, Resource};
use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use std::str::FromStr;
use tui_input::Input;
use uuid::Uuid;

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

// 🔥 Universal Directory Resolver
pub fn get_openprix_dir() -> std::path::PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    let dir = std::path::Path::new(&home).join(".openprix");
    std::fs::create_dir_all(&dir).unwrap_or_default();
    dir
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

    pub regions_data: Vec<Region>,
    pub show_region_manager: bool,
    pub region_input: Input,
    pub region_table_state: TableState,
}

pub struct ServerRequest {
    pub timestamp: String,
    pub method: String,
    pub path: String,
    pub status: u16,
}

impl App {
    pub async fn new() -> Result<Self, Box<dyn std::error::Error>> {
        // 🔥 FIX: Connect to universal database
        let db_path = get_openprix_dir().join("database.sqlite");
        let db_url = format!("sqlite://{}", db_path.to_str().unwrap_or("database.sqlite"));

        let connect_options = SqliteConnectOptions::from_str(&db_url)?.create_if_missing(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect_with(connect_options)
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
            currency_symbol: "₹".to_string(),

            resources_data: Vec::new(),
            res_table_state: TableState::default(),
            res_edit_id: None,
            res_code: Input::default(),
            res_desc: Input::default(),
            res_unit: Input::default().with_value("nos".to_string()),
            res_rate: Input::default(),
            res_focus: ResourceFocus::Code,
            res_status_message: String::new(),

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
        Ok(app)
    }

    pub async fn refresh_data(&mut self) {
        let _ = self.fetch_counts().await;

        if let Ok(settings_json) = sqlx::query_scalar::<_, String>(
            "SELECT value FROM app_settings WHERE key = 'company_info'",
        )
        .fetch_one(&self.db_pool)
        .await
        {
            if let Ok(parsed) = serde_json::from_str::<Value>(&settings_json) {
                if let Some(symbol) = parsed.get("currencySymbol").and_then(|s| s.as_str()) {
                    self.currency_symbol = symbol.to_string();
                }
            }
        }

        self.resources_data =
            sqlx::query_as::<_, Resource>("SELECT * FROM resources ORDER BY code ASC")
                .fetch_all(&self.db_pool)
                .await
                .unwrap_or_default();
        self.regions_data = sqlx::query_as::<_, Region>("SELECT * FROM regions ORDER BY name ASC")
            .fetch_all(&self.db_pool)
            .await
            .unwrap_or_default();

        self.check_daemon_status().await;

        if self.server_logs.len() > 50 {
            self.server_logs.remove(0);
        }
    }

    async fn fetch_counts(&mut self) -> Result<(), sqlx::Error> {
        self.active_projects_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM projects WHERE status IN ('Active', 'In Progress')",
        )
        .fetch_one(&self.db_pool)
        .await?;
        self.total_staff = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM org_staff")
            .fetch_one(&self.db_pool)
            .await?;
        self.total_clients = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM crm_contacts WHERE type IN ('Client', 'Lead')",
        )
        .fetch_one(&self.db_pool)
        .await?;
        self.total_suppliers = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM crm_contacts WHERE type IN ('Supplier', 'Subcontractor')",
        )
        .fetch_one(&self.db_pool)
        .await?;
        Ok(())
    }

    async fn check_daemon_status(&mut self) {
        let status_path = get_openprix_dir().join(".daemon_status.json");
        if let Ok(contents) = std::fs::read_to_string(status_path) {
            if let Ok(daemon) = serde_json::from_str::<shared::DaemonStatus>(&contents) {
                self.daemon_raw = Some(daemon.clone());
                self.server_running = true;
                if self.server_port_input.value().is_empty() {
                    self.server_port_input = Input::default().with_value(daemon.port.to_string());
                }
                self.daemon_status_text = format!(
                    "DAEMON ONLINE | Port: {} | PID: {}",
                    daemon.port, daemon.pid
                );
                return;
            }
        }
        self.daemon_raw = None;
        self.server_running = false;
        self.daemon_status_text = "DAEMON OFFLINE".into();
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
        self.res_status_message = "Form cleared.".to_string();
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
                    if let Ok(parsed) =
                        serde_json::from_str::<serde_json::Map<String, Value>>(rates_json)
                    {
                        let entries: Vec<String> = parsed
                            .iter()
                            .map(|(k, v)| {
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
                self.res_status_message =
                    format!("EDITING: {}", res.code.as_deref().unwrap_or("Item"));
            }
        }
    }

    pub async fn submit_resource(&mut self) {
        let code = self.res_code.value().trim();
        let desc = self.res_desc.value().trim();
        let unit = self.res_unit.value().trim();
        let rate_str = self.res_rate.value().trim();

        if code.is_empty() || desc.is_empty() || rate_str.is_empty() {
            self.res_status_message = "ERROR: Required fields missing.".into();
            return;
        }

        let mut rates_map = serde_json::Map::new();
        if rate_str.contains(':') {
            for pair in rate_str.split(',') {
                let parts: Vec<&str> = pair.split(':').collect();
                if parts.len() == 2 {
                    if let Ok(val) = parts[1].trim().parse::<f64>() {
                        rates_map.insert(parts[0].trim().to_string(), serde_json::json!(val));
                    }
                }
            }
        } else if let Ok(val) = rate_str.parse::<f64>() {
            rates_map.insert("base".to_string(), serde_json::json!(val));
        }

        let rates_json = serde_json::to_string(&rates_map).unwrap_or_else(|_| "{}".to_string());
        let id = self
            .res_edit_id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        let q = "INSERT OR REPLACE INTO resources (id, code, description, unit, rates, rateHistory) VALUES (?, ?, ?, ?, ?, '[]')";
        let _ = sqlx::query(q)
            .bind(&id)
            .bind(code)
            .bind(desc)
            .bind(unit)
            .bind(&rates_json)
            .execute(&self.db_pool)
            .await;
        self.clear_resource_form();
        self.refresh_data().await;
    }

    pub async fn submit_region(&mut self) {
        let name = self.region_input.value().trim();
        if name.is_empty() {
            return;
        }
        let _ = sqlx::query("INSERT INTO regions (id, name) VALUES (?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(name)
            .execute(&self.db_pool)
            .await;
        self.region_input.reset();
        self.refresh_data().await;
    }

    pub async fn delete_selected_region(&mut self) {
        if let Some(i) = self.region_table_state.selected() {
            if let Some(reg) = self.regions_data.get(i) {
                let _ = sqlx::query("DELETE FROM regions WHERE id = ?")
                    .bind(&reg.id)
                    .execute(&self.db_pool)
                    .await;
                self.refresh_data().await;
            }
        }
    }

    pub async fn delete_selected_resource(&mut self) {
        if let Some(i) = self.res_table_state.selected() {
            if let Some(res) = self.resources_data.get(i) {
                let _ = sqlx::query("DELETE FROM resources WHERE id = ?")
                    .bind(&res.id)
                    .execute(&self.db_pool)
                    .await;
                self.refresh_data().await;
            }
        }
    }

    pub fn scroll_region_down(&mut self) { /* Focus scrolling omitted for brevity */
    }
    pub fn scroll_region_up(&mut self) {}

    pub async fn apply_server_config(&mut self) {
        let port = self.server_port_input.value();
        self.server_logs.push(format!(
            "[{}] CONFIG: Port set to {}.",
            Local::now().format("%H:%M:%S"),
            port
        ));
    }

    pub async fn toggle_server(&mut self) {
        if self.server_running {
            self.stop_server().await;
        } else {
            self.start_server().await;
        }
    }

    pub async fn start_server(&mut self) {
        let port = self
            .server_port_input
            .value()
            .parse::<u16>()
            .unwrap_or(3000);
        let config = serde_json::json!({ "port": port });

        let config_path = get_openprix_dir().join(".daemon_config.json");
        let _ = std::fs::write(config_path, config.to_string());

        let _ = std::process::Command::new("..\\..\\target\\debug\\daemon.exe")
            .current_dir("..\\daemon")
            .spawn();
        self.server_logs.push(format!(
            "[{}] START: Spawned daemon process.",
            Local::now().format("%H:%M:%S")
        ));
    }

    pub async fn stop_server(&mut self) {
        if let Some(d) = &self.daemon_raw {
            #[cfg(target_os = "windows")]
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &d.pid.to_string(), "/F"])
                .output();

            let status_path = get_openprix_dir().join(".daemon_status.json");
            let _ = std::fs::remove_file(status_path);

            self.server_logs.push(format!(
                "[{}] STOP: Terminated PID {}.",
                Local::now().format("%H:%M:%S"),
                d.pid
            ));
            self.refresh_data().await;
        }
    }
}
