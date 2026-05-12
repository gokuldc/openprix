use chrono::Local;
use ratatui::widgets::TableState;
use serde_json::Value;
use shared::{DaemonStatus, MasterBoq, Region, Resource};
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

#[derive(Clone, Copy, PartialEq)]
pub enum DatabookFocus {
    Code,
    Description,
    Unit,
    Margins,
    Components,
    Submit,
}

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

    pub databook_data: Vec<MasterBoq>,
    pub dbk_table_state: TableState,
    pub dbk_edit_id: Option<String>,
    pub dbk_code: Input,
    pub dbk_desc: Input,
    pub dbk_unit: Input,
    pub dbk_margins: Input,
    pub dbk_comps: Input,
    pub dbk_focus: DatabookFocus,
    pub dbk_status_message: String,
}

pub struct ServerRequest {
    pub timestamp: String,
    pub method: String,
    pub path: String,
    pub status: u16,
}

impl App {
    pub async fn new() -> Result<Self, Box<dyn std::error::Error>> {
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
            daemon_raw: None,
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

            databook_data: Vec::new(),
            dbk_table_state: TableState::default(),
            dbk_edit_id: None,
            dbk_code: Input::default(),
            dbk_desc: Input::default(),
            dbk_unit: Input::default().with_value("cum".to_string()),
            dbk_margins: Input::default().with_value("10:0".to_string()),
            dbk_comps: Input::default(),
            dbk_focus: DatabookFocus::Code,
            dbk_status_message: String::new(),

            server_focus: ServerFocus::PortInput,
            server_port_input: Input::default(),
            server_running: false,
            server_logs: Vec::new(),
            server_traffic: Vec::new(),
        };

        app.refresh_data().await;
        if !app.databook_data.is_empty() {
            app.dbk_table_state.select(Some(0));
        }
        Ok(app)
    }

    pub async fn refresh_data(&mut self) {
        self.active_projects_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM projects WHERE status IN ('Active', 'In Progress')",
        )
        .fetch_one(&self.db_pool)
        .await
        .unwrap_or(0);
        self.total_staff = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM org_staff")
            .fetch_one(&self.db_pool)
            .await
            .unwrap_or(0);
        self.total_clients = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM crm_contacts WHERE type IN ('Client', 'Lead')",
        )
        .fetch_one(&self.db_pool)
        .await
        .unwrap_or(0);
        self.total_suppliers = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM crm_contacts WHERE type IN ('Supplier', 'Subcontractor')",
        )
        .fetch_one(&self.db_pool)
        .await
        .unwrap_or(0);

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

        self.databook_data =
            sqlx::query_as::<_, MasterBoq>("SELECT * FROM master_boq ORDER BY itemCode ASC")
                .fetch_all(&self.db_pool)
                .await
                .unwrap_or_default();

        self.check_daemon_status().await;
        if self.server_logs.len() > 50 {
            self.server_logs.remove(0);
        }
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

    pub fn scroll_dbk_down(&mut self) {
        let i = match self.dbk_table_state.selected() {
            Some(i) => {
                if i >= self.databook_data.len().saturating_sub(1) {
                    0
                } else {
                    i + 1
                }
            }
            None => 0,
        };
        self.dbk_table_state.select(Some(i));
    }
    pub fn scroll_dbk_up(&mut self) {
        let i = match self.dbk_table_state.selected() {
            Some(i) => {
                if i == 0 {
                    self.databook_data.len().saturating_sub(1)
                } else {
                    i - 1
                }
            }
            None => 0,
        };
        self.dbk_table_state.select(Some(i));
    }

    pub fn clear_databook_form(&mut self) {
        self.dbk_edit_id = None;
        self.dbk_code.reset();
        self.dbk_desc.reset();
        self.dbk_comps.reset();
        self.dbk_unit = Input::default().with_value("cum".to_string());
        self.dbk_margins = Input::default().with_value("10:0".to_string());
        self.dbk_focus = DatabookFocus::Code;
        self.dbk_status_message = "Form cleared.".to_string();
    }

    pub fn load_selected_databook(&mut self) {
        if let Some(i) = self.dbk_table_state.selected() {
            if let Some(boq) = self.databook_data.get(i) {
                self.dbk_edit_id = Some(boq.id.clone());
                self.dbk_code =
                    Input::default().with_value(boq.item_code.clone().unwrap_or_default());
                self.dbk_desc =
                    Input::default().with_value(boq.description.clone().unwrap_or_default());
                self.dbk_unit = Input::default().with_value(boq.unit.clone().unwrap_or_default());
                self.dbk_margins = Input::default().with_value(format!(
                    "{}:{}",
                    boq.overhead.unwrap_or(10.0),
                    boq.profit.unwrap_or(0.0)
                ));

                let mut comp_strs = Vec::new();
                if let Some(comp_json) = &boq.components {
                    if let Ok(comps) = serde_json::from_str::<Vec<Value>>(comp_json) {
                        for c in comps {
                            let c_type =
                                c.get("type").and_then(|v| v.as_str()).unwrap_or("Material");
                            let c_qty = c.get("qty").and_then(|v| v.as_f64()).unwrap_or(0.0);
                            let r_id = c
                                .get("resourceId")
                                .or_else(|| c.get("id"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("?");

                            let mut c_code = r_id.to_string();
                            if let Some(r) = self.resources_data.iter().find(|x| x.id == r_id) {
                                c_code = r.code.clone().unwrap_or_default();
                            } else if let Some(m) = self.databook_data.iter().find(|x| x.id == r_id)
                            {
                                c_code = m.item_code.clone().unwrap_or_default();
                            }

                            comp_strs.push(format!("{}:{}:{}", c_code, c_qty, c_type));
                        }
                    }
                }
                self.dbk_comps = Input::default().with_value(comp_strs.join(", "));
                self.dbk_status_message =
                    format!("EDITING: {}", boq.item_code.as_deref().unwrap_or("Item"));
                self.dbk_focus = DatabookFocus::Code;
            }
        }
    }

    pub async fn delete_selected_databook(&mut self) {
        if let Some(i) = self.dbk_table_state.selected() {
            if let Some(boq) = self.databook_data.get(i).cloned() {
                let _ = sqlx::query("DELETE FROM master_boq WHERE id = ?")
                    .bind(&boq.id)
                    .execute(&self.db_pool)
                    .await;
                self.dbk_status_message =
                    format!("DELETED: {}", boq.item_code.as_deref().unwrap_or(""));
                self.refresh_data().await;
            }
        }
    }

    pub async fn submit_databook(&mut self) {
        let code = self.dbk_code.value().trim().to_string();
        let desc = self.dbk_desc.value().trim().to_string();
        let unit = self.dbk_unit.value().trim().to_string();
        let margins = self.dbk_margins.value().trim().to_string();
        let comps_str = self.dbk_comps.value().trim().to_string();

        if code.is_empty() || desc.is_empty() {
            self.dbk_status_message = "ERROR: Code and Description required.".into();
            return;
        }

        let mut oh = 10.0;
        let mut profit = 0.0;
        if margins.contains(':') {
            let parts: Vec<&str> = margins.split(':').collect();
            oh = parts[0].trim().parse().unwrap_or(0.0);
            profit = parts.get(1).unwrap_or(&"0").trim().parse().unwrap_or(0.0);
        } else if let Ok(val) = margins.parse::<f64>() {
            oh = val;
        }

        let mut comp_vec = Vec::new();
        if !comps_str.is_empty() {
            for pair in comps_str.split(',') {
                let parts: Vec<&str> = pair.split(':').collect();
                if parts.len() >= 2 {
                    let c_code = parts[0].trim();
                    let c_qty = parts[1].trim().parse::<f64>().unwrap_or(0.0);
                    let c_type = parts.get(2).unwrap_or(&"Material").trim().to_string();

                    let mut r_id = c_code.to_string();
                    if let Some(r) = self
                        .resources_data
                        .iter()
                        .find(|x| x.code.as_deref() == Some(c_code))
                    {
                        r_id = r.id.clone();
                    } else if let Some(m) = self
                        .databook_data
                        .iter()
                        .find(|x| x.item_code.as_deref() == Some(c_code))
                    {
                        r_id = m.id.clone();
                    }

                    comp_vec.push(serde_json::json!({ "id": r_id, "code": c_code, "qty": c_qty, "type": c_type }));
                }
            }
        }
        let comps_json = serde_json::to_string(&comp_vec).unwrap_or_else(|_| "[]".to_string());
        let id = self
            .dbk_edit_id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        let q = "INSERT OR REPLACE INTO master_boq (id, itemCode, description, unit, overhead, profit, components) VALUES (?, ?, ?, ?, ?, ?, ?)";
        let _ = sqlx::query(q)
            .bind(&id)
            .bind(&code)
            .bind(&desc)
            .bind(&unit)
            .bind(oh)
            .bind(profit)
            .bind(&comps_json)
            .execute(&self.db_pool)
            .await;

        self.dbk_status_message = format!("SUCCESS: Saved Assembly {}", code);
        self.clear_databook_form();
        self.refresh_data().await;
    }

    // --- FULLY IMPLEMENTED RESOURCE & REGION METHODS ---
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
                self.res_focus = ResourceFocus::Code;
            }
        }
    }

    pub async fn submit_resource(&mut self) {
        let code = self.res_code.value().trim().to_string();
        let desc = self.res_desc.value().trim().to_string();
        let unit = self.res_unit.value().trim().to_string();
        let rate_str = self.res_rate.value().trim().to_string();

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
            .bind(&code)
            .bind(&desc)
            .bind(&unit)
            .bind(&rates_json)
            .execute(&self.db_pool)
            .await;

        self.res_status_message = format!("SUCCESS: Resource '{}' saved.", code);
        self.clear_resource_form();
        self.refresh_data().await;
    }

    pub async fn delete_selected_resource(&mut self) {
        if let Some(i) = self.res_table_state.selected() {
            if let Some(res) = self.resources_data.get(i).cloned() {
                let _ = sqlx::query("DELETE FROM resources WHERE id = ?")
                    .bind(&res.id)
                    .execute(&self.db_pool)
                    .await;
                self.res_status_message = format!("DELETED: {}", res.code.as_deref().unwrap_or(""));
                self.refresh_data().await;
            }
        }
    }

    pub async fn submit_region(&mut self) {
        let name = self.region_input.value().trim().to_string();
        if name.is_empty() {
            return;
        }
        let _ = sqlx::query("INSERT INTO regions (id, name) VALUES (?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(&name)
            .execute(&self.db_pool)
            .await;
        self.region_input.reset();
        self.refresh_data().await;
    }

    pub async fn delete_selected_region(&mut self) {
        if let Some(i) = self.region_table_state.selected() {
            if let Some(reg) = self.regions_data.get(i).cloned() {
                let _ = sqlx::query("DELETE FROM regions WHERE id = ?")
                    .bind(&reg.id)
                    .execute(&self.db_pool)
                    .await;
                self.refresh_data().await;
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

    // --- FULLY IMPLEMENTED SERVER METHODS ---
    pub async fn apply_server_config(&mut self) {
        let port = self.server_port_input.value();
        self.server_logs.push(format!(
            "[{}] CONFIG: Port set to {}. Use Start/Stop button to apply.",
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
            .trim()
            .parse::<u16>()
            .unwrap_or(3000);
        let config = serde_json::json!({ "port": port });

        let config_path = get_openprix_dir().join(".daemon_config.json");
        let _ = std::fs::write(config_path, config.to_string());

        let exe_path = std::env::current_exe().unwrap_or_default();
        let daemon_path = exe_path.with_file_name(if cfg!(windows) {
            "daemon.exe"
        } else {
            "daemon"
        });

        match std::process::Command::new(&daemon_path).spawn() {
            Ok(_) => {
                self.server_logs.push(format!(
                    "[{}] START: Spawned daemon on port {}.",
                    Local::now().format("%H:%M:%S"),
                    port
                ));
            }
            Err(e) => {
                self.server_logs.push(format!(
                    "[{}] ERROR: Failed to launch daemon: {}",
                    Local::now().format("%H:%M:%S"),
                    e
                ));
                self.server_logs.push(format!(
                    "HINT: Ensure it is built. Tried looking at: {}",
                    daemon_path.display()
                ));
            }
        }
    }

    pub async fn stop_server(&mut self) {
        if let Some(d) = &self.daemon_raw {
            self.server_logs.push(format!(
                "[{}] STOP: Sending kill signal to PID {}...",
                Local::now().format("%H:%M:%S"),
                d.pid
            ));

            #[cfg(target_os = "windows")]
            let kill_cmd = std::process::Command::new("taskkill")
                .args(["/PID", &d.pid.to_string(), "/F"])
                .output();

            #[cfg(not(target_os = "windows"))]
            let kill_cmd = std::process::Command::new("kill")
                .args(["-9", &d.pid.to_string()])
                .output();

            match kill_cmd {
                Ok(output) => {
                    let err_str = String::from_utf8_lossy(&output.stderr);

                    if output.status.success() {
                        self.server_logs.push(format!(
                            "[{}] SUCCESS: Terminated PID {}.",
                            Local::now().format("%H:%M:%S"),
                            d.pid
                        ));
                    } else if err_str.to_lowercase().contains("not found")
                        || err_str.to_lowercase().contains("no such process")
                    {
                        // 🔥 FIX: The process is already dead! Log it, but don't treat it as a fatal error.
                        self.server_logs.push(format!(
                            "[{}] INFO: Process {} was already dead.",
                            Local::now().format("%H:%M:%S"),
                            d.pid
                        ));
                    } else {
                        self.server_logs.push(format!(
                            "[{}] ERROR: Process kill failed: {}",
                            Local::now().format("%H:%M:%S"),
                            err_str.trim()
                        ));
                    }

                    // 🔥 FIX: ALWAYS clean up the stale status file and reset the UI!
                    let status_path = get_openprix_dir().join(".daemon_status.json");
                    let _ = std::fs::remove_file(status_path);
                    self.daemon_raw = None;
                    self.server_running = false;
                    self.daemon_status_text = "DAEMON OFFLINE".to_string();
                }
                Err(e) => {
                    self.server_logs.push(format!(
                        "[{}] ERROR: Command execution failed: {}",
                        Local::now().format("%H:%M:%S"),
                        e
                    ));
                }
            }
            self.refresh_data().await;
        } else {
            self.server_logs.push(format!(
                "[{}] ERROR: Cannot stop. No daemon PID found in status file.",
                Local::now().format("%H:%M:%S")
            ));
        }
    }
}
