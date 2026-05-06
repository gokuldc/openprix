use crate::app::App;
use ratatui::{
    Frame,
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    widgets::{Block, Borders, Gauge, Paragraph},
};

pub fn render(f: &mut Frame, app: &App, area: Rect) {
    let dash_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(5),
            Constraint::Length(5),
            Constraint::Min(0),
        ])
        .split(area);

    let top_kpis = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
        .split(dash_chunks[0]);

    let bot_kpis = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(33),
            Constraint::Percentage(33),
            Constraint::Percentage(33),
        ])
        .split(dash_chunks[1]);

    let proj_block = Paragraph::new(format!("\n {}", app.active_projects_count))
        .block(
            Block::default()
                .title(" ACTIVE PROJECTS ")
                .borders(Borders::ALL)
                .style(Style::default().fg(Color::Yellow)),
        )
        .style(
            Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        )
        .alignment(Alignment::Center);
    f.render_widget(proj_block, top_kpis[0]);

    let staff_block = Paragraph::new(format!("\n {}", app.total_staff))
        .block(
            Block::default()
                .title(" INTERNAL ORG STAFF ")
                .borders(Borders::ALL)
                .style(Style::default().fg(Color::Blue)),
        )
        .style(
            Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        )
        .alignment(Alignment::Center);
    f.render_widget(staff_block, top_kpis[1]);

    let client_block = Paragraph::new(format!("\n {}", app.total_clients))
        .block(
            Block::default()
                .title(" CRM CLIENTS ")
                .borders(Borders::ALL)
                .style(Style::default().fg(Color::Green)),
        )
        .style(
            Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        )
        .alignment(Alignment::Center);
    f.render_widget(client_block, bot_kpis[0]);

    let supp_block = Paragraph::new(format!("\n {}", app.total_suppliers))
        .block(
            Block::default()
                .title(" SUPPLY CHAIN ")
                .borders(Borders::ALL)
                .style(Style::default().fg(Color::Magenta)),
        )
        .style(
            Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        )
        .alignment(Alignment::Center);
    f.render_widget(supp_block, bot_kpis[1]);

    let gauge = Gauge::default()
        .block(
            Block::default()
                .title(" SYSTEM LOAD ")
                .borders(Borders::ALL),
        )
        .gauge_style(Style::default().fg(Color::Red))
        .percent(25)
        .label("25%");
    f.render_widget(gauge, bot_kpis[2]);

    let logs = Paragraph::new(">>> [SUCCESS] TUI Engine initialized.\n>>> [INFO] Database connection established natively.\n>>> [SYNC] Fetching metrics from SQLite...")
        .style(Style::default().fg(Color::DarkGray))
        .block(Block::default().title(" KERNEL LOGS ").borders(Borders::ALL));
    f.render_widget(logs, dash_chunks[2]);
}
